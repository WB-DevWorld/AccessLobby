#!/usr/bin/env python3
"""CI-only production-Compose IAM namespace check; never reads credentials or bodies."""

import argparse
import copy
import ipaddress
import json
import os
import re
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

CURL_IMAGE = "curlimages/curl:8.16.0"  # Same fixture tool as the existing CI checks.
PUBLIC_PEER = "https://example.com/"


def docker(*args, env=None, check=True, timeout=90):
    result = subprocess.run(["docker", *args], env=env, capture_output=True, text=True, timeout=timeout)
    if check and result.returncode:
        raise RuntimeError("docker_command_failed")
    return result


def fixture_environment(image):
    env = dict(os.environ)
    env.update({
        "IAM_IMAGE": image, "IAM_GATEWAY_IMAGE": "accesslobby-iam-gateway:ci",
        "API_IMAGE": "accesslobby-api:ci", "WEB_IMAGE": "accesslobby-web:ci",
        "IAM_DB_PASSWORD": "ci-network-db-only", "IDENTITY_DB_PASSWORD": "ci-network-identity-only",
        "IAM_ADMIN_USERNAME": "ci-admin", "IAM_ADMIN_PASSWORD": "ci-network-admin-only",
        "IAM_PUBLIC_ORIGIN": "https://iam.example.test",
        "OIDC_ISSUER": "https://iam.example.test/realms/accesslobby-first-party",
        "WEB_BASE_URL": "https://web.example.test", "ALLOWED_CLIENT_IDS": "accesslobby-web",
        "SESSION_SECRET": "ci-network-session-only", "GIT_SHA": "0" * 40,
    })
    return env


def fixture_configs(source, runtime):
    """Keep the source topology. Only the test import directory and service subset differ."""
    desired = copy.deepcopy(source)
    desired["services"] = {name: desired["services"][name] for name in ("iam-db", "iam")}
    imports = runtime / "empty-import"
    imports.mkdir()
    desired["services"]["iam"]["volumes"] = [{
        "type": "bind", "source": str(imports), "target": "/opt/keycloak/data/import", "read_only": True,
    }]
    legacy = copy.deepcopy(desired)
    legacy["services"]["iam"]["networks"].pop("iam-egress", None)
    return legacy, desired


def route_gateways(text):
    gateways = []
    for row in text.splitlines()[1:]:
        fields = row.split()
        if len(fields) > 3 and fields[1] == "00000000" and int(fields[3], 16) & 1:
            gateways.append(str(ipaddress.IPv4Address(bytes.fromhex(fields[2])[::-1])))
    return gateways


def curl_probe(network, url):
    # No credentials, redirect following, proxy shortcut, retries or insecure TLS.
    result = docker(
        "run", "--rm", "--network", network, CURL_IMAGE, "--noproxy", "*",
        "--silent", "--output", "/dev/null", "--connect-timeout", "4",
        "--max-time", "12", "--write-out", "%{http_code}", url, check=False, timeout=25,
    )
    status = result.stdout.strip()
    reachable = result.returncode == 0 and bool(re.fullmatch(r"[1-5][0-9]{2}", status))
    return {"httpReached": reachable, "httpStatus": int(status) if reachable else None}


def wait_ready(container):
    for _ in range(45):
        if curl_probe("container:" + container,
                      "http://127.0.0.1:8080/realms/master/.well-known/openid-configuration")["httpStatus"] == 200:
            return
        time.sleep(2)
    raise RuntimeError("iam_not_ready")


def namespace_check(container, project):
    routes = docker("run", "--rm", "--network", "container:" + container,
                    "--entrypoint", "cat", CURL_IMAGE, "/proc/net/route").stdout
    networks = json.loads(docker("inspect", "--format", "{{json .NetworkSettings.Networks}}", container).stdout)
    egress = networks.get(project + "_iam-egress", {})
    gateways = route_gateways(routes)
    result = {
        "defaultRoutePresent": bool(gateways),
        "defaultRouteMatchesDeclaredEgress": bool(egress) and egress.get("Gateway") in gateways,
        "publicDnsTls": curl_probe("container:" + container, PUBLIC_PEER),
    }
    if egress:
        target = egress["IPAddress"]
        if curl_probe("container:" + container, "http://127.0.0.1:9000/health/ready")["httpStatus"] != 200:
            raise RuntimeError("private_management_listener_not_ready")
        result["privateHttpDeniedFromUnsharedNetwork"] = not curl_probe(
            project + "_public-probe", "http://" + target + ":8080/realms/master/.well-known/openid-configuration"
        )["httpReached"]
        result["managementDeniedFromUnsharedNetwork"] = not curl_probe(
            project + "_public-probe", "http://" + target + ":9000/health/ready"
        )["httpReached"]
    return result


def smoke(image):
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("CI") != "true":
        raise RuntimeError("ci_only")
    project = "accesslobby-egress-ci-" + uuid.uuid4().hex[:10]
    report = {
        "evidenceType": "production-compose-iam-network-namespace",
        "sourceRevision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
        "candidateRevision": os.environ.get("IAM_NETWORK_CANDIDATE_SHA", ""),
        "passed": False, "checks": [],
        "scope": "Disposable real IAM/DB; curl shares the IAM namespace. Not signed peer-logout acceptance.",
    }
    env = fixture_environment(image)
    for args in (
        ("container", "ls", "--all", "--quiet", "--filter", "name=^" + project + "[-_]"),
        ("network", "ls", "--quiet", "--filter", "name=^" + project + "[-_]"),
        ("volume", "ls", "--quiet", "--filter", "name=^" + project + "[-_]"),
    ):
        if docker(*args).stdout.strip():
            raise RuntimeError("fixture_resource_collision")
    with tempfile.TemporaryDirectory(prefix="accesslobby-iam-egress-") as directory:
        runtime = Path(directory)
        source = json.loads(docker("compose", "--project-name", project, "-f", "compose.dokploy.yaml",
                                   "config", "--format", "json", env=env).stdout)
        legacy, desired = fixture_configs(source, runtime)
        legacy_file, desired_file = runtime / "legacy.json", runtime / "desired.json"
        for path, config in ((legacy_file, legacy), (desired_file, desired)):
            path.write_text(json.dumps(config))
            path.chmod(0o600)

        def compose(path, *args, check=True):
            return docker("compose", "--project-name", project, "-f", str(path),
                          *args, env=env, check=check, timeout=180)

        def current_container(path):
            return compose(path, "ps", "--quiet", "iam").stdout.strip()

        try:
            report["phase"] = "public_control"
            docker("pull", CURL_IMAGE)
            report["control"] = curl_probe("bridge", PUBLIC_PEER)
            if not report["control"]["httpReached"]:
                raise RuntimeError("external_control_unavailable")
            docker("network", "create", "--label", "accesslobby.test.project=" + project,
                   project + "_public-probe")
            report["phase"] = "legacy"
            compose(legacy_file, "up", "--detach", "iam")
            old_container = current_container(legacy_file)
            wait_ready(old_container)
            result = namespace_check(old_container, project)
            report["checks"].append({"phase": "legacy", **result})
            if result["defaultRoutePresent"] or result["publicDnsTls"]["httpReached"]:
                raise RuntimeError("legacy_not_isolated")
            previous = old_container
            for phase in ("declared", "recreated"):
                report["phase"] = phase
                compose(desired_file, "up", "--detach", "--no-deps", "--force-recreate", "iam")
                container = current_container(desired_file)
                wait_ready(container)
                result = namespace_check(container, project)
                result["containerRecreated"] = container != previous
                report["checks"].append({"phase": phase, **result})
                if not all((
                    result["containerRecreated"], result["defaultRoutePresent"],
                    result["defaultRouteMatchesDeclaredEgress"], result["publicDnsTls"]["httpReached"],
                    result.get("privateHttpDeniedFromUnsharedNetwork"),
                    result.get("managementDeniedFromUnsharedNetwork"),
                )):
                    raise RuntimeError("declared_outbound_or_private_boundary_failed")
                previous = container
            report["passed"] = True
        except Exception as error:
            report["errorClass"] = type(error).__name__
        finally:
            report["cleanupPassed"] = compose(desired_file, "down", "--volumes", "--remove-orphans",
                                               check=False).returncode == 0
            removed = docker("network", "rm", project + "_public-probe", check=False).returncode == 0
            report["cleanupPassed"] = report["cleanupPassed"] and removed
            report["passed"] = report["passed"] and report["cleanupPassed"]
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--iam-image", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = smoke(args.iam_image)
    except Exception as error:
        result = {"passed": False, "errorClass": type(error).__name__}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
