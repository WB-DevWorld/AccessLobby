"""Manager-provider logic tests; actual root/Docker proof is a native fixture."""
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


DIRECTORY = Path(__file__).parent
spec = importlib.util.spec_from_file_location("private_iam_manager", DIRECTORY / "manager_source.py")
manager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manager)
spec = importlib.util.spec_from_file_location("private_iam_manager_materializer", DIRECTORY / "materialize-certificate.py")
materializer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(materializer)
CID = "a" * 64


def metadata():
    return {"Id": CID, "Image": "sha256:" + "b" * 64, "RestartCount": 0,
            "State": {"Running": True, "Pid": 123, "StartedAt": "2026-11-28T00:00:00Z"},
            "Mounts": [{"Type": "bind", "Source": "/unsafe-host/store", "Destination": "/run/manager",
                        "RW": True, "Propagation": "rprivate"}]}


class ManagerSourceTests(unittest.TestCase):
    def test_inspect_pins_local_socket_and_never_inherits_remote_context(self):
        result = subprocess.CompletedProcess([], 0, json.dumps(metadata()).encode(), b"SECRET")
        with patch.object(manager, "_local_socket"), patch.object(manager.subprocess, "run", return_value=result) as run:
            self.assertEqual(manager._inspect(CID), metadata())
        args, kwargs = run.call_args
        self.assertEqual(args[0][1:3], ["--host", "unix:///run/docker.sock"])
        self.assertEqual(kwargs["env"], {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin"})
        self.assertEqual(kwargs["stderr"], subprocess.DEVNULL)
        template = args[0][args[0].index("--format") + 1]
        self.assertNotIn(".Config", template)
        self.assertNotIn("json .State}}", template)
        self.assertIn(".RestartCount", template)

    def test_inspect_refuses_nonrunning_foreign_and_malformed_metadata(self):
        cases = []
        for field, value in [("Id", "c" * 64), ("Image", "unqualified"), ("RestartCount", True), ("Mounts", None)]:
            item = metadata()
            item[field] = value
            cases.append(item)
        for field, value in [("Running", False), ("Pid", 0), ("Pid", True), ("StartedAt", "")]:
            item = metadata()
            item["State"][field] = value
            cases.append(item)
        for item in cases:
            with self.subTest(item=item), patch.object(manager, "_local_socket"), patch.object(
                    manager.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(item).encode(), b"")):
                with self.assertRaisesRegex(manager.Refusal, "^manager_unavailable$"):
                    manager._inspect(CID)

    def test_root_only_mode_has_no_runtime_privilege_bypass(self):
        with patch.object(manager.os, "geteuid", return_value=1000), patch.object(manager, "_inspect") as inspect:
            with self.assertRaisesRegex(manager.Refusal, "^manager_root_required$"):
                manager.ManagerSource(CID, "/run/manager/acme.json")
        inspect.assert_not_called()

    def test_protected_leaf_properties_are_exact(self):
        safe = {"st_mode": stat.S_IFREG | 0o600, "st_uid": 0, "st_nlink": 1, "st_size": 100}
        for mode in [0o400, 0o600]:
            manager._properties(SimpleNamespace(**{**safe, "st_mode": stat.S_IFREG | mode}))
        for changes in [{"st_uid": 1000}, {"st_nlink": 2}, {"st_mode": stat.S_IFIFO | 0o600},
                        *[{"st_mode": stat.S_IFREG | mode} for mode in [0o640, 0o644, 0o601, 0o1600]]]:
            with self.subTest(changes=changes), self.assertRaisesRegex(manager.Refusal, "^manager_source_not_protected$"):
                manager._properties(SimpleNamespace(**{**safe, **changes}))
        with self.assertRaisesRegex(manager.Refusal, "^source_too_large$"):
            manager._properties(SimpleNamespace(**{**safe, "st_size": manager.MAX_BYTES + 1}))

    def test_cli_source_modes_are_exclusive_and_diagnostics_do_not_echo(self):
        common = ["--canonical-origin", "https://iam.example.test", "--output-directory", "/protected/new"]
        cases = [["--source", "/SECRET", "--manager-container-id", CID, "--manager-storage-path", "/run/manager/acme.json"],
                 ["--manager-container-id", CID], ["--source", "/SECRET", "--manager-storage-path", "/run/manager/acme.json"],
                 ["--manager-container-id", "SECRET", "--manager-storage-path", "/run/manager/acme.json"],
                 ["--manager-container-id", "", "--manager-storage-path", ""]]
        for args in cases:
            result = subprocess.run(["python3", str(DIRECTORY / "materialize-certificate.py"), *common, *args],
                                    capture_output=True, check=False, timeout=5)
            self.assertEqual(result.returncode, 1)
            self.assertEqual(result.stderr, b"")
            self.assertIn(json.loads(result.stdout)["reason"], ("invalid_arguments", "manager_container_required"))
            self.assertNotIn(b"SECRET", result.stdout)
            self.assertNotIn(CID.encode(), result.stdout)

    def reader(self, path):
        # Isolate FD snapshot logic from constructor provenance. No exported
        # runtime option bypasses root/daemon/cgroup/mount checks; the native
        # fixture exercises that real constructor and root-owned input.
        reader = object.__new__(manager.ManagerSource)
        reader.source_fd = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
        self.addCleanup(os.close, reader.source_fd)
        reader.source_identity = manager._identity(os.fstat(reader.source_fd))
        reader._fence = Mock()
        reader._current_file = lambda: os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW)
        return reader

    def test_snapshot_rechecks_current_inode_and_returns_only_bounded_bytes(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "store"
            path.write_bytes(b'{"fixture":true}')
            reader = self.reader(path)
            with patch.object(manager, "_properties"):
                self.assertEqual(reader.read(), path.read_bytes())
            self.assertEqual(reader._fence.call_count, 2)
            replacement = Path(td) / "replacement"
            replacement.write_bytes(path.read_bytes())
            os.replace(replacement, path)
            with patch.object(manager, "_properties"), self.assertRaisesRegex(manager.Refusal, "^manager_source_changed$"):
                reader.read()

    def test_atomic_identical_replacement_during_read_is_not_retried_as_success(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "store"
            path.write_bytes(b'{"fixture":true}')
            reader = self.reader(path)
            read = manager._read_fd
            calls = []
            def rotate(fd, limit):
                data = read(fd, limit)
                calls.append(1)
                if len(calls) == 1:
                    replacement = Path(td) / "new"
                    replacement.write_bytes(data)
                    os.replace(replacement, path)
                return data
            with patch.object(manager, "_properties"), patch.object(manager, "_read_fd", side_effect=rotate):
                with self.assertRaisesRegex(manager.Refusal, "^manager_source_changed$"):
                    reader.read()
            self.assertEqual(len(calls), 2)

    def test_in_place_writer_requires_two_stable_reads_with_bounded_retries(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "store"
            path.write_bytes(b'{"fixture":true}')
            reader = self.reader(path)
            read = manager._read_fd
            calls = []
            def writer(fd, limit):
                data = read(fd, limit)
                calls.append(1)
                if len(calls) == 1:
                    path.write_bytes(data + b" ")
                return data
            with patch.object(manager, "_properties"), patch.object(manager, "_read_fd", side_effect=writer):
                self.assertEqual(reader.read(), path.read_bytes())
            self.assertEqual(len(calls), 4)
            path.write_bytes(b"")
            reader._fence.reset_mock()
            with patch.object(manager, "_properties"), self.assertRaisesRegex(manager.Refusal, "^manager_source_unstable$"):
                reader.read()
            self.assertEqual(reader._fence.call_count, 2 * manager.ATTEMPTS)

    def test_manager_errors_still_clean_exclusively_owned_output(self):
        with tempfile.TemporaryDirectory() as td:
            output = Path(td) / "new-output"
            provider = Mock()
            provider.__enter__ = Mock(return_value=provider)
            provider.__exit__ = Mock(return_value=False)
            provider.read.side_effect = materializer.manager_source.Refusal("manager_process_changed")
            with patch.object(materializer.manager_source, "ManagerSource", return_value=provider):
                with self.assertRaisesRegex(materializer.Refusal, "^manager_process_changed$"):
                    materializer.materialize_manager(CID, "/run/manager/acme.json", "https://iam.example.test", str(output))
            self.assertFalse(output.exists())
            provider.__exit__.assert_called_once()


if __name__ == "__main__":
    unittest.main()
