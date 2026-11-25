import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("private_iam_render", Path(__file__).with_name("render.py"))
render = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render)


class PackageTests(unittest.TestCase):
    def test_origin_refuses_substitution_and_non_https(self):
        for value in ["http://iam.example.test", "https://user:secret@iam.example.test", "https://iam.example.test/admin/", "https://iam.example.test?password=x", "https://127.0.0.1", "https://iam.example.test:80", "https://iam.example.test:443", "https://IAM.example.test", "https://iam.example.test\n"]:
            with self.subTest(value=value), self.assertRaises(render.Refusal):
                render.origin(value)
        self.assertEqual(render.origin("https://iam.example.test"), ("iam.example.test", 443, "iam.example.test"))
        self.assertEqual(render.origin("https://iam.example.test:8443")[1], 8443)

    def test_network_requires_observed_internal_compose_iam_edge(self):
        n = {"Name": "al_iam-edge", "Driver": "bridge", "Scope": "local", "Internal": True,
             "Labels": {"com.docker.compose.network": "iam-edge", "com.docker.compose.project": "al"}}
        render.check_network([n], "al_iam-edge")
        for key, value in [("Internal", False), ("Driver", "overlay"), ("Name", "dokploy-network"), ("Scope", "swarm"), ("Labels", {})]:
            with self.subTest(key=key), self.assertRaises(render.Refusal):
                render.check_network([{**n, key: value}], "al_iam-edge")

    def test_compose_has_only_loopback_private_service_and_readonly_tls(self):
        d = render.compose_document("sha256:" + "a" * 64, "al_iam-edge", Path("/protected/package"), "/protected/cert", "/protected/key", 1001, 1002, 9443)
        s = d["services"]["iam-admin-private"]
        self.assertEqual(s["ports"], [{"target": 8443, "published": "9443", "host_ip": "127.0.0.1", "protocol": "tcp"}])
        self.assertEqual(s["networks"], ["existing-iam-edge", "host-ingress"])
        self.assertEqual(s["labels"], {"traefik.enable": "false"})
        self.assertTrue(s["read_only"])
        self.assertEqual(s["cap_drop"], ["ALL"])
        self.assertEqual(s["user"], "1001:1002")
        self.assertTrue(all(v["read_only"] for v in s["volumes"]))
        self.assertEqual(s["entrypoint"][:3], ["nginx", "-e", "stderr"])
        for value in ["nginx:latest", "nginx:1.31.6", "foo;anything"]:
            with self.assertRaises(render.Refusal):
                render.compose_document(value, "al_iam-edge", Path("/x"), "/cert", "/key", 0, 0, 9443)
        with self.assertRaises(render.Refusal):
            render.compose_document("sha256:" + "a" * 64, "al_iam-edge", Path("/x"), "/cert", "/key", 0, 0, 443)
        root = render.compose_document("sha256:" + "a" * 64, "al_iam-edge", Path("/x"), "/cert", "/key", 0, 0, 9443)["services"]["iam-admin-private"]
        self.assertEqual(root["cap_add"], ["SETUID", "SETGID"])
        self.assertNotIn("CHOWN", root["cap_add"])
        self.assertIn("uid=101,gid=101", root["tmpfs"][1])
        self.assertIn("master_process on;", render.nginx_config("https://iam.example.test", root_key=True))

    def test_normalized_proxy_paths_and_fixed_origin_headers(self):
        config = render.nginx_config("https://iam.example.test:8443")
        for path in ["/admin/", "/realms/master/", "/resources/"]:
            self.assertIn(f"proxy_pass http://iam:8080{path};", config)
        self.assertIn('X-Forwarded-Host "iam.example.test:8443"', config)
        self.assertIn("X-Forwarded-Port 8443", config)
        self.assertIn('if ($ssl_server_name != "iam.example.test")', config)
        self.assertIn("location / { return 404; }", config)
        self.assertNotIn("/realms/accesslobby-first-party/", config)
        self.assertNotIn("9000", config)
        self.assertIn("access_log off", config)
        self.assertIn("error_log stderr crit;", config)
        self.assertNotIn("/dev/stderr", config)

    def test_docker_local_log_compression_has_valid_bounded_retention(self):
        # Docker rejects local+compression when max-file=1 before NGINX starts.
        # Both key-access modes must satisfy the actual driver's constraint.
        for uid, gid in [(1001, 1002), (0, 0)]:
            with self.subTest(uid=uid):
                s = render.compose_document("sha256:" + "a" * 64, "al_iam-edge", Path("/protected/package"), "/cert", "/key", uid, gid, 9443)["services"]["iam-admin-private"]
                logging = s["logging"]
                self.assertEqual(logging["driver"], "local")
                opts = logging["options"]
                compression = opts.get("compress", "true") == "true"
                retention = int(opts["max-file"])
                self.assertFalse(compression and retention < 2)
                self.assertEqual(opts["max-size"], "1m")
                self.assertLessEqual(retention, 2)

    def test_loopback_publication_has_own_unshared_ingress_without_changing_iam_edge(self):
        for uid, gid in [(1001, 1002), (0, 0)]:
            with self.subTest(uid=uid):
                d = render.compose_document("sha256:" + "a" * 64, "existing_iam-edge", Path("/protected/package"), "/cert", "/key", uid, gid, 9443)
                self.assertEqual(d["networks"]["existing-iam-edge"], {"external": True, "name": "existing_iam-edge"})
                ingress = d["networks"]["host-ingress"]
                self.assertEqual(ingress["driver"], "bridge")
                self.assertFalse(ingress["internal"])
                self.assertNotIn("external", ingress)
                self.assertNotIn("name", ingress)  # Scoped/owned by separate Compose project.
                self.assertEqual(ingress["driver_opts"]["com.docker.network.bridge.host_binding_ipv4"], "127.0.0.1")
                self.assertEqual(list(d["services"]), ["iam-admin-private"])
                self.assertEqual(d["services"]["iam-admin-private"]["labels"], {"traefik.enable": "false"})
                self.assertEqual(d["services"]["iam-admin-private"]["ports"][0]["host_ip"], "127.0.0.1")

    def test_actual_certificate_trust_hostname_key_match_and_permissions(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td)
            def openssl(*args):
                subprocess.run(["openssl", *args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-keyout", str(p / "key"), "-out", str(p / "cert"), "-subj", "/CN=iam.example.test", "-addext", "subjectAltName=DNS:iam.example.test")
            os.chmod(p / "key", 0o600)
            render.validate_tls(str(p / "cert"), str(p / "key"), str(p / "cert"), "iam.example.test")
            with self.assertRaises(render.Refusal):
                render.validate_tls(str(p / "cert"), str(p / "key"), str(p / "cert"), "wrong.example.test")
            with self.assertRaises(render.Refusal):
                render.validate_tls(str(p / "cert"), str(p / "key"), None, "iam.example.test")
            openssl("genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", str(p / "wrong-key"))
            os.chmod(p / "wrong-key", 0o600)
            with self.assertRaises(render.Refusal):
                render.validate_tls(str(p / "cert"), str(p / "wrong-key"), str(p / "cert"), "iam.example.test")
            os.chmod(p / "key", 0o640)
            with self.assertRaises(render.Refusal):
                render.validate_tls(str(p / "cert"), str(p / "key"), str(p / "cert"), "iam.example.test")

    def test_errors_never_forward_command_stderr(self):
        with patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 1, b"", b"secret=value")):
            with self.assertRaisesRegex(render.Refusal, "^preflight_failed$"):
                render.run_checked(["anything"])


if __name__ == "__main__":
    unittest.main()
