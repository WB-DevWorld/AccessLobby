"""Local, synthetic cryptographic qualification; never reads a host certificate."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("materialize-certificate.py")
spec = importlib.util.spec_from_file_location("private_iam_materializer", SCRIPT)
adapter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(adapter)
HOST = "iam.example.test"
ORIGIN = "https://" + HOST


class MaterializerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not shutil.which("openssl"):
            raise RuntimeError("OpenSSL is required for certificate qualification")
        cls.crypto = tempfile.TemporaryDirectory(prefix="al-certificate-fixture-")
        cls.fixture = Path(cls.crypto.name)

        def openssl(*args):
            subprocess.run(["openssl", *map(str, args)], stdin=subprocess.DEVNULL,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, timeout=5)

        def key(path):
            openssl("genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", path)
            path.chmod(0o600)

        cls.ca = cls.fixture / "ca.pem"
        ca_key = cls.fixture / "ca.key"
        key(ca_key)
        openssl("req", "-x509", "-new", "-key", ca_key, "-out", cls.ca, "-days", "4",
                "-subj", "/CN=Local synthetic fixture CA", "-addext", "basicConstraints=critical,CA:TRUE",
                "-addext", "keyUsage=critical,keyCertSign,cRLSign")
        (cls.fixture / "index").write_text("")
        (cls.fixture / "serial").write_text("20\n")
        ca_config = cls.fixture / "ca.conf"
        ca_config.write_text("[ca]\ndefault_ca=local\n[local]\n" +
                             f"database={cls.fixture / 'index'}\nserial={cls.fixture / 'serial'}\nnew_certs_dir={cls.fixture}\n" +
                             f"certificate={cls.ca}\nprivate_key={ca_key}\n" +
                             "default_md=sha256\npolicy=names\n[names]\ncommonName=supplied\n")
        cls.pairs = {}
        for number, (label, hostname, days, san) in enumerate([
            ("valid", HOST, 3, "DNS:" + HOST), ("other", "other.example.test", 3, "DNS:other.example.test"),
            ("expired", HOST, -1, "DNS:" + HOST), ("wildcard", "*.example.test", 3, "DNS:*.example.test"),
            ("cnonly", HOST, 3, None), ("uri", HOST, 3, "URI:urn:test DNS:" + HOST),
        ], 1):
            private, csr, certificate, extensions = [cls.fixture / (label + suffix) for suffix in (".key", ".csr", ".pem", ".ext")]
            key(private)
            openssl("req", "-new", "-key", private, "-out", csr, "-subj", "/CN=" + hostname)
            extensions.write_text("basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\n" +
                                  ("subjectAltName=" + san + "\n" if san else ""))
            if days < 0:
                openssl("ca", "-batch", "-notext", "-config", ca_config, "-in", csr,
                        "-startdate", "20000101000000Z", "-enddate", "20000102000000Z",
                        "-extfile", extensions, "-out", certificate)
            else:
                openssl("x509", "-req", "-in", csr, "-CA", cls.ca, "-CAkey", ca_key,
                        "-set_serial", number, "-days", days, "-sha256", "-extfile", extensions, "-out", certificate)
            cls.pairs[label] = (certificate.read_bytes() + cls.ca.read_bytes(), private.read_bytes())

    @classmethod
    def tearDownClass(cls):
        cls.crypto.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="al-materialize-test-")
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.source = self.path / "acme.json"
        self.output = self.path / "new-certificate"
        self.store = {"existing-resolver": {
            "Account": {"Email": "ACCOUNT-EMAIL-CANARY@example.test", "PrivateKey": "ACCOUNT-PRIVATE-KEY-CANARY"},
            "Certificates": [self.item("valid"), self.item("other", "other.example.test")],
        }}
        self.save()

    def item(self, label, hostname=HOST):
        certificate, key = self.pairs[label]
        return {"domain": {"main": hostname}, "certificate": base64.b64encode(certificate).decode(),
                "key": base64.b64encode(key).decode(), "Store": "default"}

    def save(self, store=None):
        self.source.write_bytes(json.dumps(self.store if store is None else store).encode())
        self.source.chmod(0o600)

    def run_adapter(self, ca=True):
        return adapter.materialize(str(self.source), ORIGIN, str(self.output), str(self.ca) if ca else None)

    def refusal(self, reason=None, ca=True):
        with self.assertRaises(adapter.Refusal) as raised:
            self.run_adapter(ca)
        if reason:
            self.assertEqual(str(raised.exception), reason)
        self.assertFalse(self.output.exists())

    def test_real_exact_pair_protected_and_source_unchanged(self):
        before = self.source.read_bytes()
        result = self.run_adapter()
        self.assertTrue(result["materialized"])
        self.assertFalse(result["deployed"])
        self.assertEqual(self.source.read_bytes(), before)
        self.assertEqual(set(p.name for p in self.output.iterdir()), set(adapter.FILES))
        self.assertEqual(stat.S_IMODE(self.output.stat().st_mode), 0o700)
        for name, content in zip(adapter.FILES, self.pairs["valid"]):
            file = self.output / name
            self.assertEqual(file.read_bytes(), content)
            self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o600)
            self.assertEqual(file.stat().st_uid, os.geteuid())
            self.assertNotIn(b"ACCOUNT-", file.read_bytes())
            self.assertNotEqual(file.read_bytes(), self.pairs["other"][1])

    def test_cli_has_categorical_credential_free_output(self):
        args = ["python3", str(SCRIPT), "--source", str(self.source), "--canonical-origin", ORIGIN,
                "--output-directory", str(self.output), "--ca-file", str(self.ca)]
        result = subprocess.run(args, capture_output=True, check=False, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stderr, b"")
        self.assertTrue(json.loads(result.stdout)["materialized"])
        for secret in [HOST.encode(), b"ACCOUNT", b"PRIVATE KEY", str(self.path).encode(), self.store["existing-resolver"]["Certificates"][0]["key"].encode()]:
            self.assertNotIn(secret, result.stdout + result.stderr)
        failed = subprocess.run(["python3", str(SCRIPT), "--accidental-secret=DO-NOT-ECHO"], capture_output=True, check=False, timeout=5)
        self.assertEqual(failed.returncode, 1)
        self.assertEqual(json.loads(failed.stdout)["reason"], "invalid_arguments")
        self.assertNotIn(b"DO-NOT-ECHO", failed.stdout + failed.stderr)

    def test_public_trust_is_default_private_ca_requires_explicit_file(self):
        self.refusal("certificate_validation_failed", ca=False)
        self.run_adapter()

    def test_source_permission_owner_regular_file_and_size_rules(self):
        for mode in [0o644, 0o640, 0o601, 0o1600]:
            with self.subTest(mode=mode):
                self.source.chmod(mode)
                self.refusal("protected_source_permissions_required")
        self.source.chmod(0o400)
        self.run_adapter()
        info = self.source.stat()
        values = {name: getattr(info, name) for name in ("st_mode", "st_nlink", "st_uid", "st_size")}
        from types import SimpleNamespace
        with self.assertRaisesRegex(adapter.Refusal, "^protected_source_owner_required$"):
            adapter._source_properties(SimpleNamespace(**{**values, "st_uid": max(os.geteuid(), 1000) + 1}))
        with self.assertRaisesRegex(adapter.Refusal, "^source_too_large$"):
            adapter._source_properties(SimpleNamespace(**{**values, "st_size": adapter.MAX_SOURCE_BYTES + 1}))

    def test_source_symlinks_hardlinks_fifo_and_parent_symlinks_refused(self):
        original = self.path / "original.json"
        self.source.rename(original)
        self.source.symlink_to(original)
        self.refusal("source_unavailable")
        self.source.unlink()
        os.link(original, self.source)
        self.refusal("protected_regular_source_required")
        self.source.unlink()
        os.mkfifo(self.source, 0o600)
        self.refusal("protected_regular_source_required")
        self.source.unlink()
        original.rename(self.source)
        link = self.path / "linked-parent"
        link.symlink_to(self.path, target_is_directory=True)
        with self.assertRaises(adapter.Refusal):
            adapter.read_source(str(link / "acme.json"))

    def test_exact_single_selection_and_no_wildcards(self):
        cases = [("missing", [self.item("other", "other.example.test")], "certificate_not_found"),
                 ("duplicate", [self.item("valid"), self.item("valid")], "ambiguous_certificate"),
                 ("wildcard", [self.item("wildcard", "*.example.test")], "wildcard_certificate_not_supported"),
                 ("exact-plus-wildcard", [self.item("valid"), self.item("wildcard", "*.example.test")], "wildcard_certificate_not_supported")]
        for label, certificates, reason in cases:
            with self.subTest(label=label):
                self.save({"resolver": {"Certificates": certificates}})
                self.refusal(reason)
        self.save({"one": {"Certificates": [self.item("valid")]}, "two": {"Certificates": [self.item("valid")]}})
        self.refusal("ambiguous_certificate")

    def test_invalid_json_schema_encoding_and_pem_refused(self):
        invalid_payloads = [b"{", b"[]", b'{"resolver":{},"resolver":{}}', b'{"resolver":{"Certificates":NaN}}', b"\xff"]
        for payload in invalid_payloads:
            with self.subTest(payload=payload):
                self.source.write_bytes(payload)
                self.refusal("source_snapshot_unstable" if len(payload) < 2 else "invalid_acme_store")
        for mutate in [lambda item: item.update(domain={"main": HOST.upper()}),
                       lambda item: item.update(domain={"main": HOST, "sans": [HOST]}),
                       lambda item: item.update(key="not base64!"),
                       lambda item: item.update(certificate=base64.b64encode(b"not a PEM").decode()),
                       lambda item: item.update(key=base64.b64encode(self.pairs["valid"][1] * 2).decode()),
                       lambda item: item.update(certificate=base64.b64encode(self.pairs["valid"][0] + self.pairs["valid"][1]).decode())]:
            item = self.item("valid")
            mutate(item)
            self.save({"resolver": {"Certificates": [item]}})
            self.refusal()

    def test_real_wrong_hostname_mismatched_key_expiry_and_cn_only_refused(self):
        for label in ["other", "expired", "cnonly"]:
            with self.subTest(label=label):
                self.save({"resolver": {"Certificates": [self.item(label)]}})
                self.refusal("certificate_san_required" if label == "cnonly" else "certificate_validation_failed")
        item = self.item("valid")
        item["key"] = self.item("other")["key"]
        self.save({"resolver": {"Certificates": [item]}})
        self.refusal("certificate_validation_failed")

    def test_real_uri_san_cannot_impersonate_a_dns_san_through_cn_fallback(self):
        certificate = self.fixture / "uri.pem"
        private = self.fixture / "uri.key"
        # The baseline verifier legitimately uses CN fallback when SAN has no
        # DNS entry. Our additional DNS-only requirement must still refuse it.
        adapter.renderer.validate_tls(str(certificate), str(private), str(self.ca), HOST)
        self.save({"resolver": {"Certificates": [self.item("uri")]}})
        self.refusal("certificate_san_required")

    def test_ca_file_must_be_existing_protected_regular_file(self):
        unsafe_ca = self.path / "unsafe-ca"
        unsafe_ca.write_bytes(self.ca.read_bytes())
        unsafe_ca.chmod(0o666)
        for path in [unsafe_ca, self.path / "missing"]:
            with self.subTest(path=path), self.assertRaisesRegex(adapter.Refusal, "^protected_ca_file_required$"):
                adapter.materialize(str(self.source), ORIGIN, str(self.output), str(path))
            self.assertFalse(self.output.exists())
        unsafe_ca.unlink()
        unsafe_ca.symlink_to(self.ca)
        with self.assertRaises(adapter.Refusal):
            adapter.materialize(str(self.source), ORIGIN, str(self.output), str(unsafe_ca))

    def test_existing_output_paths_never_changed(self):
        self.output.mkdir()
        sentinel = self.output / "sentinel"
        sentinel.write_bytes(b"keep")
        with self.assertRaisesRegex(adapter.Refusal, "^new_protected_directory_required$"):
            self.run_adapter()
        self.assertEqual(sentinel.read_bytes(), b"keep")
        sentinel.unlink()
        self.output.rmdir()
        self.output.write_bytes(b"keep-file")
        with self.assertRaises(adapter.Refusal):
            self.run_adapter()
        self.assertEqual(self.output.read_bytes(), b"keep-file")
        self.output.unlink()
        self.output.symlink_to(self.source)
        with self.assertRaises(adapter.Refusal):
            self.run_adapter()
        self.assertTrue(self.output.is_symlink())

    def test_untrusted_output_parent_and_repository_are_refused(self):
        self.path.chmod(0o777)
        self.refusal("protected_directory_required")
        self.path.chmod(0o700)
        (self.path / ".git").write_text("repository marker")
        self.refusal("output_outside_workspaces_required")
        for path in ["relative", "/workspace/private-certificate", str(self.path / ".." / "escape")]:
            with self.assertRaises(adapter.Refusal):
                adapter.materialize(str(self.source), ORIGIN, path, str(self.ca))

    def test_second_write_failure_removes_only_owned_partial(self):
        unrelated = self.path / "keep"
        unrelated.write_bytes(b"keep")
        write = adapter._OwnedOutput.write
        def fail_second(output, name, value):
            if name == "privkey.pem":
                raise OSError("CANARY-NEVER-LOG")
            return write(output, name, value)
        with patch.object(adapter._OwnedOutput, "write", fail_second), self.assertRaises(OSError):
            self.run_adapter()
        self.assertFalse(self.output.exists())
        self.assertEqual(unrelated.read_bytes(), b"keep")

    def test_directory_open_failure_cleans_own_empty_directory(self):
        real_open = os.open
        def fail_output_open(path, flags, *args, **kwargs):
            if path == self.output.name and flags & os.O_DIRECTORY:
                raise OSError("CANARY-NEVER-LOG")
            return real_open(path, flags, *args, **kwargs)
        with patch.object(adapter.os, "open", side_effect=fail_output_open), self.assertRaises(OSError):
            self.run_adapter()
        self.assertFalse(self.output.exists())

    def test_unknown_output_file_is_not_deleted_during_cleanup(self):
        def fail_validation(*_args):
            (self.output / "not-created-by-adapter").write_bytes(b"keep")
            raise adapter.Refusal("preflight_failed")
        with patch.object(adapter.renderer, "validate_tls", side_effect=fail_validation):
            with self.assertRaisesRegex(adapter.Refusal, "^owned_partial_cleanup_incomplete$"):
                self.run_adapter()
        self.assertEqual([p.name for p in self.output.iterdir()], ["not-created-by-adapter"])

    def test_source_changes_after_validation_refuse_and_clean_output(self):
        validate = adapter.renderer.validate_tls
        def changed_source(*args):
            result = validate(*args)
            self.source.write_bytes(self.source.read_bytes() + b" ")
            return result
        with patch.object(adapter.renderer, "validate_tls", side_effect=changed_source):
            self.refusal("source_changed")

    def test_in_place_source_write_is_retried_only_as_bounded_consistent_snapshot(self):
        original = self.source.read_bytes()
        read_all = adapter._read_all
        calls = []
        def writer(fd):
            result = read_all(fd)
            calls.append(1)
            if len(calls) == 1:
                self.source.write_bytes(original + b" ")
            return result
        with patch.object(adapter, "_read_all", side_effect=writer):
            self.assertEqual(adapter.read_source(str(self.source)), original + b" ")
        self.assertEqual(len(calls), 4)
        with patch.object(adapter, "_snapshot", side_effect=adapter._UnstableSnapshot()) as snapshots:
            with self.assertRaisesRegex(adapter.Refusal, "^source_snapshot_unstable$"):
                adapter.read_source(str(self.source))
        self.assertEqual(snapshots.call_count, adapter.SNAPSHOT_ATTEMPTS)
        self.source.write_bytes(b'{"partial":')
        self.refusal("invalid_acme_store")


if __name__ == "__main__":
    unittest.main()
