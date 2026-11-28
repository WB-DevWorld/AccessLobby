#!/usr/bin/env python3
"""Materialize one validated IAM certificate pair on its existing operator host.

Read-only Traefik ACMEJSON adapter. Never deploys, requests a certificate, copies
an ACME account, changes the manager's files, or sends a key off the host.
"""
import argparse
import base64
import binascii
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import sys
import time


_spec = importlib.util.spec_from_file_location("accesslobby_private_iam_renderer", Path(__file__).with_name("render.py"))
renderer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(renderer)
Refusal = renderer.Refusal

CONTRACT = "accesslobby.private-iam-certificate.v1"
MAX_SOURCE_BYTES = 4 * 1024 * 1024
MAX_PEM_BYTES = 256 * 1024
SNAPSHOT_ATTEMPTS = 3
FILES = ("fullchain.pem", "privkey.pem")
REASONS = frozenset({
    "invalid_arguments", "unsafe_origin", "noncanonical_origin", "protected_absolute_path_required",
    "protected_regular_source_required", "protected_source_owner_required", "protected_source_permissions_required",
    "source_unavailable", "source_too_large", "source_snapshot_unstable", "source_changed",
    "invalid_acme_store", "certificate_not_found", "ambiguous_certificate", "wildcard_certificate_not_supported",
    "invalid_certificate_encoding", "invalid_certificate_pem", "invalid_private_key_pem", "certificate_san_required",
    "protected_ca_file_required", "new_protected_directory_required", "protected_directory_required",
    "output_outside_workspaces_required", "protected_output_unavailable", "certificate_validation_failed",
    "owned_partial_cleanup_incomplete", "materialization_failed", "interrupted",
})


class _UnstableSnapshot(Exception):
    pass


def _absolute(value):
    path = Path(value)
    if not path.is_absolute() or ".." in path.parts or path == Path("/"):
        raise Refusal("protected_absolute_path_required")
    return path


def _directory(path, output=False):
    """Walk directory FDs without following any symlink, including ancestors."""
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC
    fd = os.open("/", flags)
    try:
        for name in path.parts[1:]:
            child = os.open(name, flags, dir_fd=fd)
            os.close(fd)
            fd = child
            info = os.fstat(fd)
            # A shared root-owned sticky directory such as /tmp is safe as an
            # ancestor of the exclusively created, private output directory.
            sticky_root = info.st_uid == 0 and bool(info.st_mode & stat.S_ISVTX)
            if info.st_uid not in (0, os.geteuid()) or (info.st_mode & 0o022 and not sticky_root):
                raise Refusal("protected_directory_required")
            if output:
                try:
                    os.stat(".git", dir_fd=fd, follow_symlinks=False)
                except FileNotFoundError:
                    pass
                else:
                    raise Refusal("output_outside_workspaces_required")
        return fd
    except BaseException:
        os.close(fd)
        raise


def _source_properties(info):
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise Refusal("protected_regular_source_required")
    if info.st_uid not in (0, os.geteuid()):
        raise Refusal("protected_source_owner_required")
    if stat.S_IMODE(info.st_mode) not in (0o400, 0o600):
        raise Refusal("protected_source_permissions_required")
    if info.st_size > MAX_SOURCE_BYTES:
        raise Refusal("source_too_large")


def _stamp(info):
    return (info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns, info.st_uid, info.st_mode, info.st_nlink)


def _read_all(fd):
    chunks, length = [], 0
    while True:
        part = os.read(fd, min(65536, MAX_SOURCE_BYTES + 1 - length))
        if not part:
            return b"".join(chunks)
        chunks.append(part)
        length += len(part)
        if length > MAX_SOURCE_BYTES:
            raise Refusal("source_too_large")


def _snapshot(path):
    parent = _directory(path.parent)
    fd = None
    try:
        # NONBLOCK also prevents a malicious FIFO input from waiting for a writer
        # before the regular-file check. It has no effect on ordinary files.
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=parent)
        before = os.fstat(fd)
        _source_properties(before)
        first = _read_all(fd)
        middle = os.fstat(fd)
        os.lseek(fd, 0, os.SEEK_SET)
        second = _read_all(fd)
        after = os.fstat(fd)
        current = os.stat(path.name, dir_fd=parent, follow_symlinks=False)
        if (len(first) < 2 or len(first) != before.st_size or first != second or
                any(_stamp(info) != _stamp(before) for info in (middle, after, current))):
            raise _UnstableSnapshot()
        return first
    finally:
        if fd is not None:
            os.close(fd)
        os.close(parent)


def read_source(value):
    path = _absolute(value)
    for attempt in range(SNAPSHOT_ATTEMPTS):
        try:
            return _snapshot(path)
        except _UnstableSnapshot:
            if attempt + 1 == SNAPSHOT_ATTEMPTS:
                raise Refusal("source_snapshot_unstable") from None
            time.sleep(0.025)
        except OSError:
            raise Refusal("source_unavailable") from None


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Refusal("invalid_acme_store")
        result[key] = value
    return result


def _dns_name(value):
    if not isinstance(value, str) or len(value) > 253:
        return False
    name = value[2:] if value.startswith("*.") else value
    return "." in name and all(re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in name.split("."))


def select_pair(payload, hostname):
    try:
        store = json.loads(payload.decode("utf-8"), object_pairs_hook=_object,
                           parse_constant=lambda _value: (_ for _ in ()).throw(Refusal("invalid_acme_store")))
    except (UnicodeError, ValueError, RecursionError):
        raise Refusal("invalid_acme_store") from None
    if not isinstance(store, dict) or not 1 <= len(store) <= 32:
        raise Refusal("invalid_acme_store")
    candidates, total = [], 0
    for resolver, data in store.items():
        if (not isinstance(resolver, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", resolver) or
                not isinstance(data, dict) or set(data) - {"Account", "Certificates"} or
                not (data.get("Account") is None or isinstance(data.get("Account"), dict)) or
                not isinstance(data.get("Certificates"), list)):
            raise Refusal("invalid_acme_store")
        for item in data["Certificates"]:
            total += 1
            if total > 256 or not isinstance(item, dict) or set(item) - {"domain", "certificate", "key", "Store"}:
                raise Refusal("invalid_acme_store")
            domain = item.get("domain")
            if (not isinstance(domain, dict) or set(domain) - {"main", "sans"} or not _dns_name(domain.get("main")) or
                    not isinstance(domain.get("sans", []), list) or len(domain.get("sans", [])) > 100 or
                    not all(_dns_name(name) for name in domain.get("sans", [])) or
                    ("Store" in item and (not isinstance(item["Store"], str) or len(item["Store"]) > 80))):
                raise Refusal("invalid_acme_store")
            names = [domain["main"], *domain.get("sans", [])]
            if len(set(names)) != len(names):
                raise Refusal("invalid_acme_store")
            if any(name.startswith("*.") and hostname.split(".", 1)[-1] == name[2:] for name in names):
                raise Refusal("wildcard_certificate_not_supported")
            if hostname in names:
                candidates.append(item)
    if not candidates:
        raise Refusal("certificate_not_found")
    if len(candidates) != 1:
        raise Refusal("ambiguous_certificate")
    # Decode ONLY the selected certificate/key. Account and unrelated keys are
    # never decoded, written, returned, logged or supplied to a subprocess.
    pair = []
    for key in ("certificate", "key"):
        value = candidates[0].get(key)
        if not isinstance(value, str) or not 1 <= len(value) <= 4 * ((MAX_PEM_BYTES + 2) // 3):
            raise Refusal("invalid_certificate_encoding")
        try:
            decoded = base64.b64decode(value, validate=True)
        except (ValueError, binascii.Error):
            raise Refusal("invalid_certificate_encoding") from None
        if len(decoded) > MAX_PEM_BYTES:
            raise Refusal("invalid_certificate_encoding")
        pair.append(decoded)
    _pem(pair[0], (b"CERTIFICATE",), "invalid_certificate_pem", maximum=8)
    _pem(pair[1], (b"PRIVATE KEY", b"RSA PRIVATE KEY", b"EC PRIVATE KEY"), "invalid_private_key_pem", maximum=1)
    return tuple(pair)


def _pem(data, labels, reason, maximum):
    remaining, count = data.strip(), 0
    label = b"|".join(re.escape(item) for item in labels)
    pattern = re.compile(rb"-----BEGIN (" + label + rb")-----\r?\n([A-Za-z0-9+/=\r\n]+)-----END \1-----")
    while remaining:
        match = pattern.match(remaining)
        if not match:
            raise Refusal(reason)
        try:
            if not base64.b64decode(re.sub(rb"[\r\n]", b"", match[2]), validate=True):
                raise ValueError()
        except (ValueError, binascii.Error):
            raise Refusal(reason) from None
        count += 1
        if count > maximum:
            raise Refusal(reason)
        remaining = remaining[match.end():].strip()
    if not count:
        raise Refusal(reason)


def _ca_file(value):
    if value is None:
        return None
    path, fd, parent = _absolute(value), None, None
    try:
        parent = _directory(path.parent)
        fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK, dir_fd=parent)
        info = os.fstat(fd)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid not in (0, os.geteuid()) or info.st_mode & 0o022 or
                not 1 <= info.st_size <= MAX_SOURCE_BYTES):
            raise Refusal("protected_ca_file_required")
        return str(path)
    except OSError:
        raise Refusal("protected_ca_file_required") from None
    finally:
        if fd is not None:
            os.close(fd)
        if parent is not None:
            os.close(parent)


class _OwnedOutput:
    def __init__(self, value):
        self.path = _absolute(value)
        repository = Path(__file__).resolve().parents[2]
        if self.path == repository or repository in self.path.parents or "workspace" in self.path.parts:
            raise Refusal("output_outside_workspaces_required")
        self.parent, self.fd, self.identity, self.files = None, None, None, {}

    def create(self):
        try:
            self.parent = _directory(self.path.parent, output=True)
            os.mkdir(self.path.name, 0o700, dir_fd=self.parent)
        except FileExistsError:
            raise Refusal("new_protected_directory_required") from None
        except OSError:
            raise Refusal("protected_output_unavailable") from None
        # Record precisely the directory we created before opening it, so even
        # an open failure can clean up our own empty directory, and no other.
        created = os.stat(self.path.name, dir_fd=self.parent, follow_symlinks=False)
        self.identity = (created.st_dev, created.st_ino)
        self.fd = os.open(self.path.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=self.parent)
        info = os.fstat(self.fd)
        if (info.st_dev, info.st_ino) != self.identity or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o700:
            raise Refusal("protected_directory_required")

    def write(self, name, value):
        fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600, dir_fd=self.fd)
        try:
            info = os.fstat(fd)
            self.files[name] = (info.st_dev, info.st_ino)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1:
                raise Refusal("protected_output_unavailable")
            view = memoryview(value)
            while view:
                written = os.write(fd, view)
                if written <= 0:
                    raise Refusal("protected_output_unavailable")
                view = view[written:]
            os.fsync(fd)
        finally:
            os.close(fd)

    def cleanup(self):
        if self.identity is None:
            return
        complete = True
        for name, identity in self.files.items():
            try:
                info = os.stat(name, dir_fd=self.fd, follow_symlinks=False)
                if (info.st_dev, info.st_ino) != identity or not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid():
                    complete = False
                    continue
                os.unlink(name, dir_fd=self.fd)
            except FileNotFoundError:
                pass
            except OSError:
                complete = False
        try:
            info = os.stat(self.path.name, dir_fd=self.parent, follow_symlinks=False)
            if (info.st_dev, info.st_ino) != self.identity or not stat.S_ISDIR(info.st_mode) or info.st_uid != os.geteuid():
                complete = False
            else:
                os.rmdir(self.path.name, dir_fd=self.parent)
        except FileNotFoundError:
            pass
        except OSError:
            complete = False
        if not complete:
            raise Refusal("owned_partial_cleanup_incomplete")

    def close(self):
        for fd in (self.fd, self.parent):
            if fd is not None:
                os.close(fd)


def materialize(source, canonical_origin, output_directory, ca_file=None):
    hostname, _, _ = renderer.origin(canonical_origin)
    output = _OwnedOutput(output_directory)
    payload = read_source(source)
    certificate, key = select_pair(payload, hostname)
    ca = _ca_file(ca_file)
    try:
        output.create()
        for name, content in zip(FILES, (certificate, key)):
            output.write(name, content)
        try:
            # Keep the renderer's existing chain/current validity/hostname/key
            # checks. No trust-store write, certificate fetch or TLS bypass.
            renderer.validate_tls(str(output.path / FILES[0]), str(output.path / FILES[1]), ca, hostname)
            san = renderer.run_checked(["openssl", "x509", "-in", str(output.path / FILES[0]), "-noout", "-ext", "subjectAltName"])
        except renderer.Refusal:
            raise Refusal("certificate_validation_failed") from None
        # Consume the entire display, not DNS-looking substrings: a URI SAN can
        # contain arbitrary text and hostname verification can fall back to CN.
        # This DNS-only Traefik adapter deliberately refuses other SAN types.
        header, separator, body = san.partition(b"\n")
        names = []
        if not separator or header.strip() not in (b"X509v3 Subject Alternative Name:", b"X509v3 Subject Alternative Name: critical"):
            raise Refusal("certificate_san_required")
        for entry in body.strip().split(b","):
            match = re.fullmatch(rb"DNS:([a-z0-9.-]+)", entry.strip())
            if not match or not _dns_name(match[1].decode("ascii")):
                raise Refusal("certificate_san_required")
            names.append(match[1])
        if hostname.encode("ascii") not in names or len(set(names)) != len(names):
            raise Refusal("certificate_san_required")
        if read_source(source) != payload:
            raise Refusal("source_changed")
        os.fsync(output.fd)
        return {"contract": CONTRACT, "materialized": True, "sourceReadOnly": True, "sourceUnchanged": True,
                "singleExactCertificate": True, "certificateValidated": True, "protectedDirectory": True,
                "protectedFiles": True, "certificateFile": FILES[0], "privateKeyFile": FILES[1], "deployed": False}
    except BaseException:
        output.cleanup()
        raise
    finally:
        output.close()


class _Parser(argparse.ArgumentParser):
    def error(self, _message):
        # argparse's normal diagnostics echo user arguments. Paths, accidental
        # secret arguments and input contents never belong in this CLI's output.
        raise Refusal("invalid_arguments")


def main(argv=None):
    try:
        parser = _Parser(description=__doc__)
        parser.add_argument("--source", required=True)
        parser.add_argument("--canonical-origin", required=True)
        parser.add_argument("--output-directory", required=True)
        parser.add_argument("--ca-file")
        args = parser.parse_args(argv)
        result = materialize(args.source, args.canonical_origin, args.output_directory, args.ca_file)
        print(json.dumps(result, sort_keys=True))
        return 0
    except (Exception, KeyboardInterrupt) as error:
        reason = "interrupted" if isinstance(error, KeyboardInterrupt) else str(error) if isinstance(error, Refusal) else "materialization_failed"
        print(json.dumps({"contract": CONTRACT, "materialized": False,
                          "reason": reason if reason in REASONS else "materialization_failed"}, sort_keys=True))
        return 1


if __name__ == "__main__":
    sys.exit(main())
