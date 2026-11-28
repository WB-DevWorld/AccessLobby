"""Read an exact existing local Docker manager bind through its pinned process.

No exec, mount, container creation, key stream or host-path trust exception.
"""
import json
import os
from pathlib import PurePosixPath
import re
import select
import stat
import subprocess
import time


MAX_BYTES = 4 * 1024 * 1024
ATTEMPTS = 3
DOCKER_SOCKET = "/run/docker.sock"
REASONS = frozenset({
    "manager_container_required", "manager_path_required", "manager_root_required",
    "manager_local_docker_required", "manager_unavailable", "manager_process_changed",
    "manager_proc_unavailable", "manager_cgroup_unconfirmed", "manager_mount_required",
    "manager_mount_changed", "manager_source_not_protected", "manager_source_changed",
    "manager_source_unavailable", "manager_source_unstable", "source_too_large",
})


class Refusal(ValueError):
    pass


def _container_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value):
        raise Refusal("manager_container_required")
    return value


def _storage_path(value):
    if (not isinstance(value, str) or not 2 <= len(value) <= 1024 or
            not re.fullmatch(r"/[A-Za-z0-9_./-]+", value)):
        raise Refusal("manager_path_required")
    path = PurePosixPath(value)
    if str(path) != value or ".." in path.parts or path == PurePosixPath("/"):
        raise Refusal("manager_path_required")
    return path


def _contains(parent, path):
    return path == parent or parent in path.parents


def _protected_directory(info):
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise Refusal("manager_source_not_protected")


def _local_socket():
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW)
    try:
        _protected_directory(os.fstat(fd))
        child = os.open("run", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC | os.O_NOFOLLOW, dir_fd=fd)
        os.close(fd)
        fd = child
        _protected_directory(os.fstat(fd))
        info = os.stat("docker.sock", dir_fd=fd, follow_symlinks=False)
        if not stat.S_ISSOCK(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o002:
            raise Refusal("manager_local_docker_required")
    except OSError:
        raise Refusal("manager_local_docker_required") from None
    finally:
        os.close(fd)


def _inspect(container_id):
    _local_socket()
    template = ('{"Id":{{json .Id}},"Image":{{json .Image}},"RestartCount":{{json .RestartCount}},'
                '"State":{"Running":{{json .State.Running}},"Pid":{{json .State.Pid}},'
                '"StartedAt":{{json .State.StartedAt}}},"Mounts":{{json .Mounts}}}')
    try:
        result = subprocess.run(
            ["docker", "--host", "unix://" + DOCKER_SOCKET,
             "--config", "/run/accesslobby-unused-docker-config", "inspect", "--type", "container",
             "--format", template, "--", container_id], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=False,
            env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin"})
        if result.returncode or not 1 <= len(result.stdout) <= 1024 * 1024:
            raise Refusal("manager_unavailable")
        value = json.loads(result.stdout)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise Refusal("manager_unavailable") from None
    state = value.get("State") if isinstance(value, dict) else None
    if (not isinstance(state, dict) or value.get("Id") != container_id or state.get("Running") is not True or
            not isinstance(value.get("Image"), str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", value["Image"]) or
            type(value.get("RestartCount")) is not int or value["RestartCount"] < 0 or
            type(state.get("Pid")) is not int or not 1 <= state["Pid"] <= 2 ** 31 - 1 or
            not isinstance(state.get("StartedAt"), str) or not 1 <= len(state["StartedAt"]) <= 80 or
            not isinstance(value.get("Mounts"), list) or len(value["Mounts"]) > 256):
        raise Refusal("manager_unavailable")
    return value


def _selected_mount(mounts, path):
    candidates = []
    for item in mounts:
        if not isinstance(item, dict):
            raise Refusal("manager_mount_required")
        try:
            destination = _storage_path(item.get("Destination"))
        except Refusal:
            raise Refusal("manager_mount_required") from None
        if _contains(destination, path):
            candidates.append((len(destination.parts), item))
    if not candidates:
        raise Refusal("manager_mount_required")
    depth = max(value[0] for value in candidates)
    best = [item for length, item in candidates if length == depth]
    if len(best) != 1:
        raise Refusal("manager_mount_required")
    item = best[0]
    if (item.get("Type") != "bind" or not isinstance(item.get("Source"), str) or
            not item["Source"].startswith("/") or len(item["Source"]) > 4096 or
            any(ord(c) < 32 for c in item["Source"]) or type(item.get("RW")) is not bool or
            not isinstance(item.get("Propagation"), str)):
        raise Refusal("manager_mount_required")
    # The host Source is inspected as mapping metadata only, never reopened.
    return {key: item[key] for key in ("Type", "Source", "Destination", "RW", "Propagation")}


def _unescape(value):
    return re.sub(r"\\([0-7]{3})", lambda match: chr(int(match[1], 8)), value)


def _mounts(payload):
    try:
        rows = []
        for line in payload.decode("utf-8").splitlines():
            fields = line.split(" ")
            marker = fields.index("-")
            if marker < 6 or len(fields) != marker + 4:
                raise ValueError()
            row = {"id": int(fields[0]), "parent": int(fields[1]), "device": fields[2],
                   "root": _unescape(fields[3]), "point": PurePosixPath(_unescape(fields[4])),
                   "options": tuple(fields[5].split(",")), "optional": tuple(fields[6:marker]),
                   "filesystem": fields[marker + 1], "source": _unescape(fields[marker + 2]),
                   "super_options": tuple(fields[marker + 3].split(","))}
            if row["id"] < 1 or not row["point"].is_absolute() or not re.fullmatch(r"[0-9]+:[0-9]+", row["device"]):
                raise ValueError()
            rows.append(row)
        if not rows or len(rows) > 8192:
            raise ValueError()
        return rows
    except (UnicodeError, ValueError):
        raise Refusal("manager_mount_required") from None


def _covering_mount(rows, path):
    candidates = [row for row in rows if _contains(row["point"], path)]
    if not candidates:
        raise Refusal("manager_mount_required")
    depth = max(len(row["point"].parts) for row in candidates)
    best = [row for row in candidates if len(row["point"].parts) == depth]
    if len(best) != 1:
        raise Refusal("manager_mount_required")
    return best[0]


def _cgroup_matches(payload, container_id):
    try:
        for line in payload.decode("ascii").splitlines():
            pieces = line.split(":", 2)
            if len(pieces) != 3 or not pieces[2].startswith("/"):
                return False
            parts = pieces[2].split("/")
            if any(part == "docker-" + container_id + ".scope" or
                   (part == container_id and index > 0 and parts[index - 1] == "docker")
                   for index, part in enumerate(parts)):
                return True
    except UnicodeError:
        return False
    return False


def _process_start(payload):
    try:
        _, separator, tail = payload.rpartition(b") ")
        if not separator:
            raise ValueError()
        value = int(tail.split()[19])  # field22, after pid and parenthesized comm
        if value <= 0:
            raise ValueError()
        return value
    except (ValueError, IndexError):
        raise Refusal("manager_proc_unavailable") from None


def _namespace(proc_fd):
    value = os.readlink("ns/mnt", dir_fd=proc_fd)
    if not re.fullmatch(r"mnt:\[[0-9]+\]", value):
        raise Refusal("manager_proc_unavailable")
    return value


def _read_fd(fd, limit):
    chunks, length = [], 0
    while True:
        part = os.read(fd, min(65536, limit + 1 - length))
        if not part:
            return b"".join(chunks)
        chunks.append(part)
        length += len(part)
        if length > limit:
            raise Refusal("source_too_large")


def _read_proc(proc_fd, name, limit):
    fd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=proc_fd)
    try:
        return _read_fd(fd, limit)
    finally:
        os.close(fd)


def _mount_id(fd):
    # fdinfo is kernel metadata for our held descriptor, not a caller assertion.
    with open("/proc/self/fdinfo/" + str(fd), "rb") as source:
        data = source.read(8193)
    match = re.search(rb"^mnt_id:\s+([0-9]+)$", data, re.MULTILINE)
    if len(data) > 8192 or not match:
        raise Refusal("manager_proc_unavailable")
    return int(match[1])


def _identity(info):
    return (info.st_dev, info.st_ino)


def _properties(info):
    if (not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_nlink != 1 or
            stat.S_IMODE(info.st_mode) not in (0o400, 0o600)):
        raise Refusal("manager_source_not_protected")
    if info.st_size > MAX_BYTES:
        raise Refusal("source_too_large")


def _stamp(info):
    return (_identity(info), info.st_size, info.st_mtime_ns, info.st_ctime_ns,
            info.st_mode, info.st_uid, info.st_gid, info.st_nlink)


class ManagerSource:
    def __init__(self, container_id, storage_path):
        self.container_id, self.path = _container_id(container_id), _storage_path(storage_path)
        self.proc_fd = self.root_fd = self.pid_fd = self.source_fd = None
        self.mount_identity = None
        try:
            if os.geteuid() != 0:
                raise Refusal("manager_root_required")
            self.baseline = _inspect(self.container_id)
            self.mapping = _selected_mount(self.baseline["Mounts"], self.path)
            pid = self.baseline["State"]["Pid"]
            self.proc_fd = os.open("/proc/" + str(pid), os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
            self.pid_fd = os.pidfd_open(pid, 0)
            self.start = _process_start(_read_proc(self.proc_fd, "stat", 8192))
            self.namespace = _namespace(self.proc_fd)
            if not _cgroup_matches(_read_proc(self.proc_fd, "cgroup", 16384), self.container_id):
                raise Refusal("manager_cgroup_unconfirmed")
            # This single, kernel-defined magic link is intentional. Every
            # component below the resulting root uses no-follow directory FDs.
            self.root_fd = os.open("root", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC, dir_fd=self.proc_fd)
            _protected_directory(os.fstat(self.root_fd))
            self.root_identity = (_identity(os.fstat(self.root_fd)), _mount_id(self.root_fd))
            self.mount = _covering_mount(_mounts(_read_proc(self.proc_fd, "mountinfo", 1024 * 1024)), self.path)
            if str(self.mount["point"]) != self.mapping["Destination"]:
                raise Refusal("manager_mount_required")
            self.source_fd = self._current_file()
            self.source_identity = _identity(os.fstat(self.source_fd))
            self._fence()
        except Refusal:
            self.close()
            raise
        except (OSError, AttributeError):
            self.close()
            raise Refusal("manager_proc_unavailable") from None

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        self.close()

    def close(self):
        for name in ("source_fd", "root_fd", "proc_fd", "pid_fd"):
            fd = getattr(self, name)
            if fd is not None:
                os.close(fd)
                setattr(self, name, None)

    def _fence(self):
        poll = select.poll()
        poll.register(self.pid_fd, select.POLLIN)
        if (poll.poll(0) or _process_start(_read_proc(self.proc_fd, "stat", 8192)) != self.start or
                _namespace(self.proc_fd) != self.namespace):
            raise Refusal("manager_process_changed")
        if not _cgroup_matches(_read_proc(self.proc_fd, "cgroup", 16384), self.container_id):
            raise Refusal("manager_cgroup_unconfirmed")
        current = _inspect(self.container_id)
        if any(current[key] != self.baseline[key] for key in ("State", "Id", "Image", "RestartCount")):
            raise Refusal("manager_process_changed")
        if current["Mounts"] != self.baseline["Mounts"]:
            raise Refusal("manager_mount_changed")
        root = os.open("root", os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC, dir_fd=self.proc_fd)
        try:
            _protected_directory(os.fstat(root))
            if (_identity(os.fstat(root)), _mount_id(root)) != self.root_identity:
                raise Refusal("manager_process_changed")
        finally:
            os.close(root)
        if _covering_mount(_mounts(_read_proc(self.proc_fd, "mountinfo", 1024 * 1024)), self.path) != self.mount:
            raise Refusal("manager_mount_changed")

    def _current_file(self):
        current = os.dup(self.root_fd)
        root_identity = None
        try:
            for index, name in enumerate(self.path.parts[1:], 1):
                leaf = index == len(self.path.parts) - 1
                flags = os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC | os.O_NONBLOCK
                child = os.open(name, flags | (0 if leaf else os.O_DIRECTORY), dir_fd=current)
                os.close(current)
                current = child
                info = os.fstat(current)
                if leaf:
                    _properties(info)
                else:
                    _protected_directory(info)
                if PurePosixPath(*self.path.parts[:index + 1]) == self.mount["point"]:
                    root_identity = (_identity(info), info.st_mode, info.st_uid, info.st_gid, _mount_id(current))
            if root_identity is None or root_identity[-1] != self.mount["id"] or _mount_id(current) != self.mount["id"]:
                raise Refusal("manager_mount_changed")
            if f"{os.major(info.st_dev)}:{os.minor(info.st_dev)}" != self.mount["device"]:
                raise Refusal("manager_mount_changed")
            if self.mount_identity is None:
                self.mount_identity = root_identity
            elif self.mount_identity != root_identity:
                raise Refusal("manager_mount_changed")
            result, current = current, None
            return result
        finally:
            if current is not None:
                os.close(current)

    def read(self):
        try:
            for attempt in range(ATTEMPTS):
                self._fence()
                before_path = self._current_file()
                try:
                    if _identity(os.fstat(before_path)) != self.source_identity:
                        raise Refusal("manager_source_changed")
                finally:
                    os.close(before_path)
                before = os.fstat(self.source_fd)
                _properties(before)
                os.lseek(self.source_fd, 0, os.SEEK_SET)
                first = _read_fd(self.source_fd, MAX_BYTES)
                middle = os.fstat(self.source_fd)
                os.lseek(self.source_fd, 0, os.SEEK_SET)
                second = _read_fd(self.source_fd, MAX_BYTES)
                after = os.fstat(self.source_fd)
                self._fence()
                after_path = self._current_file()
                try:
                    current = os.fstat(after_path)
                    if _identity(current) != self.source_identity:
                        raise Refusal("manager_source_changed")
                finally:
                    os.close(after_path)
                if (len(first) >= 2 and len(first) == before.st_size and first == second and
                        all(_stamp(info) == _stamp(before) for info in (middle, after, current))):
                    return first
                if attempt + 1 < ATTEMPTS:
                    time.sleep(0.025)
            raise Refusal("manager_source_unstable")
        except OSError:
            raise Refusal("manager_source_unavailable") from None
