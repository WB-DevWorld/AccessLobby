#!/usr/bin/env python3
"""Read-only, environment-free inspection of the two Dokploy Compose projects."""

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SHA = re.compile(r"[0-9a-f]{40}\Z")
DIGEST_REF = re.compile(r"ghcr\.io/[a-z0-9._/-]+@sha256:[0-9a-f]{64}\Z")
PROJECT = re.compile(r"[a-z0-9][a-z0-9_-]*\Z")
MAIN_SERVICES = {
    "iam-db": None, "identity-db": None, "iam": "iam", "iam-config": "iam",
    "iam-gateway": "iam-gateway", "migrate": "api", "api": "api", "web": "web",
}
CONSUMER_SERVICES = {"consumer": "consumer"}
JOBS = {"iam-config", "migrate"}
PRIVATE = {"iam-db", "identity-db", "iam", "iam-config", "migrate"}
# Ask Docker for only these fields. A full container inspect includes secrets in Config.Env.
INSPECT_FORMAT = (
    '{"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
    '"service":{{json (index .Config.Labels "com.docker.compose.service")}},'
    '"imageRef":{{json .Config.Image}},"localImageId":{{json .Image}},'
    '"state":{{json .State.Status}},"exitCode":{{json .State.ExitCode}},'
    '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},'
    '"networks":{{json .NetworkSettings.Networks}},'
    '"ports":{{json .NetworkSettings.Ports}}}'
)


def load_manifest_data(data: dict) -> dict:
    if (not isinstance(data, dict) or not isinstance(data.get("sourceSha"), str)
            or not SHA.fullmatch(data["sourceSha"])):
        raise ValueError("Manifest needs a full sourceSha")
    images = data.get("images")
    if not isinstance(images, dict) or set(images) != {"iam", "iam-gateway", "api", "web", "consumer"}:
        raise ValueError("Manifest needs exactly the five qualified image references")
    if not all(isinstance(ref, str) and DIGEST_REF.fullmatch(ref) for ref in images.values()):
        raise ValueError("Manifest images must be qualified GHCR digest references")
    return data


def load_manifest(path: Path) -> dict:
    return load_manifest_data(json.loads(path.read_text()))


def docker(*args: str) -> str:
    try:
        result = subprocess.run(["docker", *args], capture_output=True, text=True, timeout=20, check=True)
    except (OSError, subprocess.SubprocessError) as error:
        # Docker errors can contain operator paths or remote daemon addresses.
        raise RuntimeError("Docker inventory unavailable; use the private operator shell") from error
    return result.stdout


def inventory(project: str) -> list[dict]:
    ids = docker("container", "ls", "--all", "--quiet", "--filter",
                 f"label=com.docker.compose.project={project}").split()
    if not ids:
        return []
    result = [json.loads(line) for line in docker("container", "inspect", "--format", INSPECT_FORMAT,
                                                 *ids).splitlines() if line.strip()]
    if len(result) != len(ids):
        raise ValueError("Docker inventory returned an incomplete container list")
    return result


def assess(manifest: dict, projects: dict[str, str], containers: dict[str, list[dict]]) -> dict:
    report = {"checkedAt": datetime.now(timezone.utc).isoformat(),
              "sourceSha": manifest["sourceSha"], "projects": projects,
              "services": [], "failures": [], "passed": False}

    def fail(code: str, role: str, service: str):
        report["failures"].append({"code": code, "projectRole": role, "service": service})

    for role, expected in (("main", MAIN_SERVICES), ("consumer", CONSUMER_SERVICES)):
        found = {}
        for container in containers[role]:
            if container.get("project") != projects[role]:
                fail("project_label_mismatch", role, "unknown")
                continue
            service = container.get("service")
            if service not in expected:
                fail("unexpected_service", role, service or "unknown")
                continue
            if service in found:
                fail("duplicate_service", role, service)
                continue
            found[service] = container

        for service, image_key in expected.items():
            container = found.get(service)
            if container is None:
                fail("missing_service", role, service)
                continue
            health = container.get("health")
            networks = sorted(container.get("networks") or {})
            ports = container.get("ports") or {}
            published = any(binding.get("HostPort") for bindings in ports.values()
                            for binding in (bindings or []))
            image_ref = container.get("imageRef")
            item = {"projectRole": role, "service": service, "state": container.get("state"),
                    "exitCode": container.get("exitCode"), "health": health, "imageRef": image_ref,
                    "localImageId": container.get("localImageId"), "networks": networks,
                    "hostPortPublished": published}
            report["services"].append(item)
            if image_key and image_ref != manifest["images"][image_key]:
                fail("image_ref_mismatch", role, service)
            if not image_key and image_ref != "postgres:17.11":
                fail("database_image_mismatch", role, service)
            if service in JOBS:
                if container.get("state") != "exited" or container.get("exitCode") != 0:
                    fail("job_not_completed", role, service)
            elif container.get("state") != "running":
                fail("service_not_running", role, service)
            if service in {"iam-db", "identity-db"} and health != "healthy":
                fail("database_not_healthy", role, service)
            elif health and health != "healthy":
                fail("service_unhealthy", role, service)
            if published:
                fail("host_port_published", role, service)
            if role == "main" and service in PRIVATE:
                allowed = {projects["main"] + "_backend"}
                if service == "iam":
                    allowed.add(projects["main"] + "_iam-edge")
                # Stopped one-shot containers may no longer retain a network attachment.
                if (service in JOBS and set(networks) - allowed) or (service not in JOBS and set(networks) != allowed):
                    fail("private_network_mismatch", role, service)
            if service in {"iam-gateway", "api", "web", "consumer"} and "dokploy-network" not in networks:
                fail("public_service_off_proxy_network", role, service)

    report["passed"] = not report["failures"]
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--main-project", required=True)
    parser.add_argument("--consumer-project", required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True,
                        help="A protected path outside the repository; written with mode 0600")
    args = parser.parse_args()
    if (not PROJECT.fullmatch(args.main_project) or not PROJECT.fullmatch(args.consumer_project)
            or args.main_project == args.consumer_project):
        parser.error("Supply two distinct Docker Compose project names")
    try:
        manifest = load_manifest(args.manifest)
        projects = {"main": args.main_project, "consumer": args.consumer_project}
        report = assess(manifest, projects, {role: inventory(project) for role, project in projects.items()})
        args.output.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as result:
            os.fchmod(result.fileno(), 0o600)
            result.write(json.dumps(report, indent=2) + "\n")
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(f"Inspection failed: {error}", file=sys.stderr)
        return 2
    print(f"Runtime inventory: {len(report['services'])} services, "
          f"{len(report['failures'])} findings; report written to {args.output}")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
