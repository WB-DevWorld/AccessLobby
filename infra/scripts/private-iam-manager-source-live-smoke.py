#!/usr/bin/env python3
"""Disposable native Docker/proc qualification of the manager-source adapter.

Every certificate, store, bind and container belongs to this fixture. No actual
manager, certificate account, application service or host trust is consulted.
"""
import argparse
import base64
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "infra/private-iam/materialize-certificate.py"
REPORT = ROOT / "artifacts/private-iam-manager-source/report.json"
HOST = "iam.manager-source.example.test"
ORIGIN = "https://" + HOST
STORAGE = "/run/certificate-manager/acme.json"
LABEL = "accesslobby.private-manager-fixture"
SAFE_ENV = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C.UTF-8"}


class FixtureFailure(Exception):
    pass


def require(value, category="assertion_failed"):
    if not value:
        raise FixtureFailure(category)


def command(arguments, timeout=15, check=True):
    try:
        result = subprocess.run([str(value) for value in arguments], stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                env=SAFE_ENV, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise FixtureFailure("command_unavailable_or_timed_out") from None
    if check and result.returncode:
        raise FixtureFailure("command_failed")
    return result


def materializer():
    spec = importlib.util.spec_from_file_location("native_fixture_materializer", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def native(image):
    report = {"contract": "accesslobby.private-iam-manager-source-native.v1", "disposable": True,
              "syntheticManagerProcess": True, "stagingQualified": False, "productionQualified": False,
              "checks": {}, "cleanup": {}, "passed": False}
    work = None
    work_identity = None
    owned = []
    creation_intents = []
    token = secrets.token_hex(12)
    phase = "prerequisites"
    config = None
    try:
        require(os.geteuid() == 0, "root_child_required")
        require(sys.platform == "linux" and shutil.which("docker", path=SAFE_ENV["PATH"]) and
                shutil.which("openssl", path=SAFE_ENV["PATH"]), "native_dependencies_required")
        require(bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/@-]{0,250}", image)), "invalid_fixture_image")
        work = Path(tempfile.mkdtemp(prefix="al-manager-source-native-", dir="/tmp"))
        os.chmod(work, 0o700)
        work_identity = (work.stat().st_dev, work.stat().st_ino)
        config = work / "docker-config"
        config.mkdir(mode=0o700)

        def docker(*arguments, check=True, timeout=15):
            return command(["docker", "--host", "unix:///run/docker.sock", "--config", config, *arguments],
                           check=check, timeout=timeout)

        def inspect(cid, template):
            result = docker("inspect", "--type", "container", "--format", template, "--", cid)
            return json.loads(result.stdout)

        image_id = docker("image", "inspect", "--format", "{{.Id}}", "--", image).stdout.decode().strip()
        require(bool(re.fullmatch(r"sha256:[a-f0-9]{64}", image_id)), "local_fixture_image_required")
        world = work / "world-writable"
        world.mkdir(mode=0o777)
        os.chmod(world, 0o777)
        storage = world / "protected-storage"
        storage.mkdir(mode=0o700)
        outputs = work / "outputs"
        outputs.mkdir(mode=0o700)
        phase = "synthetic_certificate"

        def openssl(*arguments):
            return command(["openssl", *arguments], timeout=10)

        ca, ca_key = work / "fixture-ca.pem", work / "fixture-ca.key"
        leaf, private, csr, extension = [work / name for name in ("fixture-leaf.pem", "fixture-leaf.key", "fixture.csr", "fixture.ext")]
        for key in (ca_key, private):
            openssl("genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", key)
            os.chmod(key, 0o600)
        openssl("req", "-x509", "-new", "-key", ca_key, "-out", ca, "-days", "5", "-subj", "/CN=Synthetic native fixture CA",
                "-addext", "basicConstraints=critical,CA:TRUE", "-addext", "keyUsage=critical,keyCertSign,cRLSign")
        openssl("req", "-new", "-key", private, "-out", csr, "-subj", "/CN=" + HOST)
        extension.write_text("basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:" + HOST + "\n")
        openssl("x509", "-req", "-in", csr, "-CA", ca, "-CAkey", ca_key, "-set_serial", "37", "-days", "4",
                "-sha256", "-extfile", extension, "-out", leaf)
        os.chmod(ca, 0o600)
        os.chown(ca, 0, 0)
        certificate, key = leaf.read_bytes() + ca.read_bytes(), private.read_bytes()
        store = storage / "acme.json"
        payload = json.dumps({"fixture-resolver": {"Account": {"Email": "SYNTHETIC-ACCOUNT@example.test", "PrivateKey": "SYNTHETIC-ACCOUNT-SECRET"},
            "Certificates": [{"domain": {"main": HOST}, "certificate": base64.b64encode(certificate).decode(),
                              "key": base64.b64encode(key).decode(), "Store": "default"}]}}).encode()
        store.write_bytes(payload)
        os.chmod(store, 0o600)
        os.chown(store, 0, 0)

        def create(role, mount_race=False):
            name = "al-manager-native-" + token + "-" + role
            # Record uncertainty before contacting Docker. A timeout or malformed
            # response may follow daemon-side creation; without a verified full
            # ID we cannot claim cleanup or remove the backing synthetic tree.
            intent = {"name": name, "confirmed": False}
            creation_intents.append(intent)
            arguments = ["create", "--name", name, "--label", LABEL + "=" + token, "--network", "none", "--user", "0:0",
                         "--read-only", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                         "--mount", "type=bind,source=" + str(storage) + ",destination=/run/certificate-manager,readonly,bind-propagation=rprivate"]
            if mount_race:
                # Only this owned adversarial fixture can mount inside its own
                # private namespace. No host namespaces/socket/real stores bind.
                arguments += ["--cap-add", "SYS_ADMIN", "--security-opt", "seccomp=unconfined", "--security-opt", "apparmor=unconfined",
                              "--mount", "type=bind,source=" + str(storage) + ",destination=/run/manager-self-source,readonly,bind-propagation=rprivate"]
            arguments += ["--entrypoint", "/bin/sh", image_id, "-c", "exec sleep 600"]
            cid = docker(*arguments).stdout.decode().strip()
            require(bool(re.fullmatch(r"[a-f0-9]{64}", cid)), "fixture_identity_required")
            owned.append(cid)
            intent["confirmed"] = True
            value = inspect(cid, '{{json .}}')
            require(value["Id"] == cid and value["Config"]["Labels"].get(LABEL) == token, "fixture_identity_required")
            host_config = value["HostConfig"]
            require(host_config["NetworkMode"] == "none" and host_config["Privileged"] is False and host_config["CapDrop"] == ["ALL"], "fixture_isolation_required")
            capabilities = [item.removeprefix("CAP_") for item in (host_config["CapAdd"] or [])]
            require(capabilities == (["SYS_ADMIN"] if mount_race else []), "fixture_isolation_required")
            mounts = value["Mounts"]
            require(len(mounts) == (2 if mount_race else 1), "fixture_bind_scope_required")
            require(all(mount["Type"] == "bind" and mount["Source"] == str(storage) and mount["RW"] is False and
                        mount["Propagation"] == "rprivate" for mount in mounts), "fixture_bind_scope_required")
            docker("start", cid)
            for _attempt in range(50):
                current = inspect(cid, '{{json .State}}')
                if current["Running"] and current["Pid"] > 0 and Path("/proc/" + str(current["Pid"])).exists():
                    return cid
                time.sleep(0.1)
            raise FixtureFailure("fixture_process_unavailable")

        def cli(cid, destination, path=STORAGE, source=None):
            arguments = [sys.executable, SCRIPT]
            arguments += ["--source", source] if source else ["--manager-container-id", cid, "--manager-storage-path", path]
            arguments += ["--canonical-origin", ORIGIN, "--output-directory", destination, "--ca-file", ca]
            result = command(arguments, check=False, timeout=25)
            require(result.stderr == b"", "credential_free_cli_required")
            try:
                value = json.loads(result.stdout)
            except (ValueError, UnicodeError):
                raise FixtureFailure("categorical_cli_required") from None
            for forbidden in (payload, key, base64.b64encode(key), b"SYNTHETIC-ACCOUNT", str(work).encode(), cid.encode(), HOST.encode()):
                require(forbidden not in result.stdout, "credential_free_cli_required")
            return result.returncode, value

        def refuses(cid, name, path=STORAGE, reasons=None):
            destination = outputs / name
            code, value = cli(cid, destination, path)
            require(code == 1 and value.get("materialized") is False and value.get("reason") in adapter.REASONS and
                    value.get("reason") not in ("materialization_failed", "certificate_validation_failed"), "specific_source_refusal_required")
            if reasons is not None:
                require(value.get("reason") in reasons, "specific_source_refusal_required")
            require(not destination.exists(), "refused_output_cleanup_required")

        adapter = materializer()
        manager = create("source")
        phase = "positive_manager_anchor"
        destination = outputs / "positive"
        code, refused = cli(manager, outputs / "default-host-refused", source=store)
        require(code == 1 and refused.get("reason") == "protected_directory_required", "default_host_protection_required")
        require(not (outputs / "default-host-refused").exists(), "refused_output_cleanup_required")
        before = store.stat()
        code, materialized = cli(manager, destination)
        require(code == 0 and all(materialized.get(flag) is True for flag in
                ("materialized", "sourceReadOnly", "sourceUnchanged", "singleExactCertificate", "certificateValidated", "protectedDirectory", "protectedFiles")), "native_materialization_required")
        require(materialized.get("deployed") is False, "no_deployment_required")
        require(stat.S_IMODE(destination.stat().st_mode) == 0o700 and destination.stat().st_uid == 0, "protected_pair_required")
        for name, content in (("fullchain.pem", certificate), ("privkey.pem", key)):
            path = destination / name
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
            try:
                info = os.fstat(fd)
                require(stat.S_ISREG(info.st_mode) and stat.S_IMODE(info.st_mode) == 0o600 and info.st_uid == 0 and info.st_nlink == 1, "protected_pair_required")
                require(os.read(fd, len(content) + 1) == content, "exact_pair_required")
            finally:
                os.close(fd)
        after = store.stat()
        require((before.st_dev, before.st_ino, before.st_mode, before.st_uid) == (after.st_dev, after.st_ino, after.st_mode, after.st_uid) and
                store.read_bytes() == payload and stat.S_IMODE(world.stat().st_mode) == 0o777, "source_unchanged_required")
        report["checks"]["native_manager_anchor"] = {"passed": True, "defaultHostPathRefused": True, "realEcPairValidated": True,
                                                        "sourceBytesUnchanged": True, "rootOwned0700And0600": True, "fstatPairExact": True}

        phase = "negative_source_selection"
        refuses("f" * 64, "wrong-container", reasons={"manager_unavailable"})
        refuses(manager, "unbound-file", "/etc/passwd", reasons={"manager_mount_required"})
        docker("stop", "--time", "1", manager)
        refuses(manager, "nonrunning-container", reasons={"manager_unavailable"})
        docker("start", manager)
        with adapter.manager_source.ManagerSource(manager, STORAGE) as active_source:
            require(active_source.read() == payload, "restarted_source_proof_required")
        os.chmod(storage, 0o777)
        try:
            refuses(manager, "unsafe-bind-root", reasons={"manager_source_not_protected"})
        finally:
            os.chmod(storage, 0o700)
        original = storage / "original.json"
        store.rename(original)
        store.symlink_to(original.name)
        try:
            refuses(manager, "symlink-leaf")
        finally:
            store.unlink()
            original.rename(store)
        report["checks"]["unsafe_sources_refused"] = {"passed": True, "wrongFullId": True, "nonrunning": True,
                                                         "unboundFile": True, "unsafeBindRoot": True, "symlinkLeaf": True}

        def fenced(cid, name, callback, expected_reasons):
            destination = outputs / name
            original_validation = adapter.renderer.validate_tls
            state = {"called": False}

            def validated_then_changed(*arguments):
                value = original_validation(*arguments)
                require(not state["called"] and destination.exists(), "deterministic_hook_required")
                state["called"] = True
                callback()
                return value

            # Test-only wrapping of real validation. Production gets no flag,
            # injected assertion, namespace privilege or validation bypass.
            adapter.renderer.validate_tls = validated_then_changed
            refused = False
            try:
                adapter.materialize_manager(cid, STORAGE, ORIGIN, str(destination), str(ca))
            except adapter.Refusal as error:
                reason = str(error)
                if reason in adapter.REASONS:
                    fences.setdefault("observedReasons", {})[name] = reason
                require(reason in expected_reasons, "specific_source_fence_refusal_required")
                refused = True
            finally:
                adapter.renderer.validate_tls = original_validation
            require(state["called"] and refused and not destination.exists(), "post_validation_fence_required")

        phase = "atomic_leaf_race"
        fences = report["checks"]["post_crypto_generation_fences"] = {"passed": False}

        def replace_leaf():
            old = store.stat()
            replacement = storage / "next.json"
            replacement.write_bytes(payload)
            os.chmod(replacement, 0o600)
            os.replace(replacement, store)
            require(store.read_bytes() == payload and (old.st_dev, old.st_ino) != (store.stat().st_dev, store.stat().st_ino), "atomic_leaf_replacement_required")

        fenced(manager, "identical-leaf-race", replace_leaf, {"manager_source_changed"})
        fences["identicalByteLeafReplacement"] = True
        phase = "restart_race"
        def restarted_generation():
            template = '{"Id":{{json .Id}},"Running":{{json .State.Running}},"Pid":{{json .State.Pid}},"StartedAt":{{json .State.StartedAt}}}'
            before = inspect(manager, template)
            require(before["Id"] == manager and before["Running"] and before["Pid"] > 0, "restart_baseline_required")
            docker("restart", "--time", "1", manager)
            for _attempt in range(50):
                current = inspect(manager, template)
                if (current["Id"] == manager and current["Running"] and current["Pid"] > 0 and
                        (current["Pid"], current["StartedAt"]) != (before["Pid"], before["StartedAt"]) and
                        Path("/proc/" + str(current["Pid"])).exists()):
                    # Confirm that a new root/proc manager proof succeeds now;
                    # transient unavailability cannot qualify the old fence.
                    with adapter.manager_source.ManagerSource(manager, STORAGE) as fresh_source:
                        require(fresh_source.read() == payload, "restart_generation_source_required")
                    fences["restartRunningGenerationConfirmed"] = True
                    return
                time.sleep(0.1)
            raise FixtureFailure("restart_generation_unconfirmed")

        fenced(manager, "restart-race", restarted_generation, {"manager_process_changed"})
        fences["managerRestart"] = True
        phase = "mount_shadow_race"
        mount_manager = create("mount-race", mount_race=True)
        utility = docker("exec", mount_manager, "/bin/sh", "-c", "command -v mount >/dev/null", check=False)
        require(utility.returncode == 0, "fixture_mount_utility_required")

        def leaf_identity(cid):
            pid = inspect(cid, '{{json .State.Pid}}')
            fd = os.open("/proc/" + str(pid) + "/root" + STORAGE, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
            try:
                info = os.fstat(fd)
                metadata = Path("/proc/self/fdinfo/" + str(fd)).read_bytes()
                matched = re.search(rb"^mnt_id:\s+([0-9]+)$", metadata, re.MULTILINE)
                require(bool(matched), "kernel_mount_identity_required")
                return (info.st_dev, info.st_ino, os.read(fd, len(payload) + 1), int(matched[1]))
            finally:
                os.close(fd)

        def shadow_mount():
            template = '{"Id":{{json .Id}},"Running":{{json .State.Running}},"Pid":{{json .State.Pid}},"StartedAt":{{json .State.StartedAt}}}'
            manager_before = inspect(mount_manager, template)
            require(manager_before["Id"] == mount_manager and manager_before["Running"] and manager_before["Pid"] > 0,
                    "mount_process_baseline_required")
            manager_namespace = os.readlink("/proc/" + str(manager_before["Pid"]) + "/ns/mnt")
            before_leaf = leaf_identity(mount_manager)
            namespace = os.readlink("/proc/self/ns/mnt")
            mounts = Path("/proc/self/mountinfo").read_bytes()
            result = docker("exec", mount_manager, "/bin/sh", "-c", "mount --bind /run/manager-self-source /run/certificate-manager", check=False)
            require(result.returncode == 0, "fixture_private_mount_failed")
            manager_after = inspect(mount_manager, template)
            require(manager_before == manager_after and manager_namespace == os.readlink("/proc/" + str(manager_after["Pid"]) + "/ns/mnt"),
                    "mount_manager_generation_changed")
            after_leaf = leaf_identity(mount_manager)
            require(before_leaf[:3] == after_leaf[:3] and before_leaf[3] != after_leaf[3], "same_inode_covering_mount_required")
            require(namespace == os.readlink("/proc/self/ns/mnt") and mounts == Path("/proc/self/mountinfo").read_bytes(), "host_mount_namespace_changed")
            mounts = inspect(mount_manager, '{{json .Mounts}}')
            require(all(item["Propagation"] == "rprivate" and item["Source"] == str(storage) for item in mounts), "fixture_private_propagation_required")
            fences["sameManagerProcessAndNamespaceConfirmed"] = True

        fenced(mount_manager, "same-inode-mount-race", shadow_mount, {"manager_mount_changed", "manager_mount_required"})
        require(store.read_bytes() == payload and stat.S_IMODE(world.stat().st_mode) == 0o777, "source_unchanged_required")
        fences.update({"passed": True, "sameInodeCoveringMount": True, "ownedPartialOutputRemoved": True,
                       "hostMountNamespaceUnchanged": True, "privatePropagation": True})
        report["passed"] = True
    except BaseException as error:
        report["failedPhase"] = phase
        report["failureCategory"] = str(error) if isinstance(error, FixtureFailure) else "native_assertion_failed"
        report["passed"] = False
    finally:
        creation_confirmed = all(intent["confirmed"] for intent in creation_intents)
        removed = creation_confirmed
        if config is not None:
            for cid in reversed(owned):
                try:
                    result = command(["docker", "--host", "unix:///run/docker.sock", "--config", config,
                                      "inspect", "--type", "container", "--format", '{{json .}}', "--", cid], check=False)
                    if result.returncode:
                        removed = False
                        continue
                    value = json.loads(result.stdout)
                    require(value["Id"] == cid and value["Config"]["Labels"].get(LABEL) == token, "cleanup_identity_required")
                    command(["docker", "--host", "unix:///run/docker.sock", "--config", config, "rm", "--force", "--", cid])
                except BaseException:
                    removed = False
        report["cleanup"]["creationAccountingConfirmed"] = creation_confirmed
        report["cleanup"]["ownedContainersRemoved"] = removed
        files_removed = work is None
        if work is not None and removed:
            try:
                info = work.lstat()
                require(stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and (info.st_dev, info.st_ino) == work_identity,
                        "cleanup_identity_required")
                shutil.rmtree(work)
                files_removed = not work.exists()
            except BaseException:
                files_removed = False
        report["cleanup"]["ownedSyntheticFilesRemoved"] = files_removed
        if not removed or not files_removed:
            report["passed"] = False
            report["failureCategory"] = "owned_fixture_cleanup_incomplete"
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root-child", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--image", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.root_child:
        os.umask(0o077)
        report = native(args.image or "accesslobby-iam-gateway:ci")
    else:
        image = os.environ.get("GATEWAY_IMAGE", "accesslobby-iam-gateway:ci")
        arguments = [sys.executable, str(Path(__file__).resolve()), "--root-child", "--image", image]
        if os.geteuid() != 0:
            arguments = ["sudo", "-n", "--", *arguments]
        try:
            result = command(arguments, check=False, timeout=180)
            report = json.loads(result.stdout)
            require(result.stderr == b"" and report.get("contract") == "accesslobby.private-iam-manager-source-native.v1",
                    "categorical_root_report_required")
        except BaseException:
            report = {"contract": "accesslobby.private-iam-manager-source-native.v1", "passed": False,
                      "failureCategory": "root_fixture_unavailable", "stagingQualified": False, "productionQualified": False}
        report["completedAt"] = datetime.now(timezone.utc).isoformat()
        REPORT.parent.mkdir(parents=True, exist_ok=True)
        REPORT.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n")
    print(json.dumps(report, sort_keys=True))
    return 0 if report.get("passed") else 1


if __name__ == "__main__":
    sys.exit(main())
