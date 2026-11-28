"""Independent source-boundary negatives; synthetic metadata only, no daemon/keys."""
import importlib.util
import json
import os
import stat
import subprocess
import tempfile
from types import SimpleNamespace
from pathlib import Path, PurePosixPath
import unittest
from unittest.mock import Mock, patch


SPEC = importlib.util.spec_from_file_location("manager_source_adversarial_subject", Path(__file__).with_name("manager_source.py"))
manager = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(manager)
CID = "a1" * 32
OTHER = "b2" * 32
STORAGE = PurePosixPath("/etc/traefik/acme.json")


def stat_record(comm="traefik", start="987654321"):
    # After comm: state is field3, eighteen fields4..21, then starttime22.
    fields = ["S", *(["0"] * 18), start, "0", "0"]
    return ("4321 (" + comm + ") " + " ".join(fields) + "\n").encode()


class ManagerSourceAdversarialTests(unittest.TestCase):
    def refused(self, function, *args):
        with self.assertRaises(manager.Refusal):
            function(*args)

    def test_container_identity_is_full_canonical_id_never_an_option_or_prefix(self):
        self.assertEqual(manager._container_id(CID), CID)
        for value in [None, True, 4321, "", CID[:12], CID[:-1], CID + "a", CID.upper(), "g" * 64,
                      "--format", " " + CID, CID + "\n", CID + ";touch /tmp/never"]:
            with self.subTest(value=value):
                self.refused(manager._container_id, value)

    def test_storage_path_cannot_escape_or_select_an_ambiguous_relative_leaf(self):
        self.assertEqual(manager._storage_path(str(STORAGE)), STORAGE)
        for value in [None, True, "", "relative/acme.json", "../acme.json", "/", "/etc/../acme.json", "/etc/acme\x00.json"]:
            with self.subTest(value=value):
                self.refused(manager._storage_path, value)

    def test_cgroup_membership_requires_exact_docker_component_not_substring_coincidence(self):
        for payload in [f"0::/docker/{CID}\n", f"0::/system.slice/docker-{CID}.scope\n",
                        f"11:memory:/docker/{CID}\n10:cpu,cpuacct:/docker/{CID}\n"]:
            with self.subTest(payload=payload):
                self.assertTrue(manager._cgroup_matches(payload.encode(), CID))
        for payload in [f"0::/docker/{OTHER}\n", f"0::/docker/{CID}tail\n", f"0::/docker/{CID[:12]}\n",
                        f"0::/unrelated/{CID}\n", f"0::/system.slice/not-docker-{CID}.scope\n",
                        f"0::/system.slice/docker-{CID}.scope-extra\n", "0::/\n", ""]:
            with self.subTest(payload=payload):
                self.assertFalse(manager._cgroup_matches(payload.encode(), CID))

    def test_process_generation_parser_handles_spaces_and_parentheses_in_comm(self):
        self.assertEqual(manager._process_start(stat_record()), 987654321)
        self.assertEqual(manager._process_start(stat_record("worker ) with ( parentheses")), 987654321)
        for payload in [b"", b"4321 no-parentheses S 0\n", b"4321 (truncated) S 0\n", stat_record(start="not-an-integer"), stat_record(start="-1")]:
            with self.subTest(payload=payload):
                self.refused(manager._process_start, payload)

    def test_mount_selection_uses_path_components_and_refuses_nonbind_or_duplicate_claims(self):
        bind = {"Type": "bind", "Source": "/etc/dokploy/traefik", "Destination": "/etc/traefik", "RW": True, "Propagation": "rprivate"}
        # Selection must not traverse the unsafe host source. The actual
        # container mount-root/leaf proof is performed by the FD provider.
        with patch.object(manager.os, "stat", side_effect=AssertionError("Do not stat a host Source pathname")):
            self.assertIsNotNone(manager._selected_mount([bind], STORAGE))
        for mounts in [[], [{**bind, "Destination": "/etc/traef"}], [{**bind, "Destination": "/etc/traefik/acme"}],
                       [{**bind, "Type": "volume"}], [bind, dict(bind)]]:
            with self.subTest(mounts=mounts):
                self.refused(manager._selected_mount, mounts, STORAGE)

    def test_actual_namespace_mount_lookup_selects_the_most_specific_shadow(self):
        payload = (b"20 1 0:20 / / rw,relatime - overlay overlay rw\n"
                   b"31 20 0:31 /traefik /etc/traefik rw,relatime - ext4 /dev/synthetic rw\n"
                   b"44 31 0:44 /replacement /etc/traefik/acme.json rw,relatime - tmpfs tmpfs rw\n")
        rows = manager._mounts(payload)
        self.assertEqual(manager._covering_mount(rows, STORAGE), rows[2])
        self.assertEqual(manager._covering_mount(rows, PurePosixPath("/etc/traefik/other.json")), rows[1])
        self.assertEqual(manager._covering_mount(rows, PurePosixPath("/etc/traefik-other/acme.json")), rows[0])
        for invalid in [b"not mountinfo\n", b"20 1 0:20 / / rw no-separator overlay\n"]:
            with self.subTest(invalid=invalid):
                self.refused(manager._mounts, invalid)


    def test_protected_manager_roots_and_leaf_refuse_world_write_foreign_owners_and_hardlinks(self):
        directory = SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0)
        manager._protected_directory(directory)
        for info in [SimpleNamespace(st_mode=stat.S_IFDIR | 0o777, st_uid=0),
                     SimpleNamespace(st_mode=stat.S_IFDIR | 0o1777, st_uid=0),
                     SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=1000)]:
            self.refused(manager._protected_directory, info)
        regular = dict(st_mode=stat.S_IFREG | 0o600, st_uid=0, st_nlink=1, st_size=2)
        manager._properties(SimpleNamespace(**regular))
        for changes in [dict(st_mode=stat.S_IFREG | 0o644), dict(st_mode=stat.S_IFREG | 0o640),
                        dict(st_mode=stat.S_IFIFO | 0o600), dict(st_uid=1000), dict(st_nlink=2),
                        dict(st_size=manager.MAX_BYTES + 1)]:
            self.refused(manager._properties, SimpleNamespace(**{**regular, **changes}))

    def test_inspection_ignores_inherited_remote_context_and_never_execs_or_streams_container_data(self):
        metadata = {"Id": CID, "Image": "sha256:" + "c3" * 32, "RestartCount": 0,
                    "State": {"Running": True, "Pid": 4321, "StartedAt": "2026-11-28T12:00:00Z"}, "Mounts": []}
        reply = SimpleNamespace(returncode=0, stdout=json.dumps(metadata).encode())
        with patch.dict(os.environ, {"DOCKER_HOST": "tcp://remote.invalid:2375", "DOCKER_CONTEXT": "unapproved",
                                     "HOME": "/never-read-private-config"}), \
                patch.object(manager, "_local_socket"), patch.object(manager.subprocess, "run", return_value=reply) as run:
            self.assertEqual(manager._inspect(CID), metadata)
        command = run.call_args.args[0]
        options = run.call_args.kwargs
        self.assertEqual(command[command.index("--host") + 1], "unix:///run/docker.sock")
        self.assertEqual(command[-2:], ["--", CID])
        self.assertIn("inspect", command)
        for forbidden in ["exec", "run", "cp", "pull", "mount", "--privileged"]:
            self.assertNotIn(forbidden, command)
        self.assertNotIn(".Config", command[command.index("--format") + 1])
        self.assertEqual(set(options["env"]), {"PATH"})
        self.assertEqual(options["stdin"], subprocess.DEVNULL)
        self.assertEqual(options["stderr"], subprocess.DEVNULL)
        self.assertLessEqual(options["timeout"], 5)
        self.assertFalse(options.get("shell", False))

    def test_fence_refuses_current_namespace_and_manager_generation_changes_before_opening_data(self):
        source = object.__new__(manager.ManagerSource)
        source.pid_fd, source.proc_fd = 123, 456
        source.start, source.namespace, source.container_id = 987654321, "mnt:[100]", CID
        source.baseline = {"Id": CID, "Image": "sha256:" + "c3" * 32, "RestartCount": 0,
                           "State": {"Running": True, "Pid": 4321, "StartedAt": "2026-11-28T12:00:00Z"}}
        poll = Mock()
        poll.poll.return_value = []
        with patch.object(manager.select, "poll", return_value=poll), patch.object(manager, "_read_proc", return_value=stat_record()), \
                patch.object(manager, "_namespace", return_value="mnt:[101]"), \
                patch.object(manager, "_inspect", side_effect=AssertionError("No daemon read after namespace mismatch")):
            self.refused(source._fence)
        for changes in [{"RestartCount": 1}, {"Image": "sha256:" + "d4" * 32},
                        {"State": {**source.baseline["State"], "StartedAt": "2026-11-28T12:00:01Z"}}]:
            with self.subTest(changes=changes), patch.object(manager.select, "poll", return_value=poll), \
                    patch.object(manager, "_read_proc", return_value=stat_record()), patch.object(manager, "_namespace", return_value=source.namespace), \
                    patch.object(manager, "_cgroup_matches", return_value=True), \
                    patch.object(manager, "_inspect", return_value={**source.baseline, **changes}), \
                    patch.object(manager.os, "open", side_effect=AssertionError("No filesystem reopen after generation mismatch")):
                self.refused(source._fence)

    def test_same_byte_atomic_replacement_is_refused_before_reading_the_new_inode(self):
        with tempfile.TemporaryFile() as old, tempfile.TemporaryFile() as replacement:
            for file in (old, replacement):
                file.write(b'{"synthetic":true}'); file.flush()
            source = object.__new__(manager.ManagerSource)
            source.source_fd = old.fileno()
            source.source_identity = manager._identity(os.fstat(old.fileno()))
            with patch.object(source, "_fence"), patch.object(source, "_current_file", side_effect=lambda: os.dup(replacement.fileno())), \
                    patch.object(manager, "_read_fd", side_effect=AssertionError("Replacement must not become accepted source")):
                with self.assertRaisesRegex(manager.Refusal, "^manager_source_changed$"):
                    source.read()


if __name__ == "__main__":
    unittest.main()
