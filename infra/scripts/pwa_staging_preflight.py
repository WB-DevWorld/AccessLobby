#!/usr/bin/env python3
"""Credential-free PWA HTTP gate; never evidence of installation or authentication."""

import argparse
import hashlib
import json
import re
import struct
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request

if __package__:
    from .staging_preflight import NoRedirect, checked_url
else:
    from staging_preflight import NoRedirect, checked_url
from urllib.request import build_opener

MAX_BODY = 1024 * 1024
SHA = re.compile(r"[0-9a-f]{40}\Z")
OPENER = build_opener(NoRedirect)
SAFE_HEADERS = ("content-type", "cache-control", "service-worker-allowed", "x-content-type-options")
PNG = b"\x89PNG\r\n\x1a\n"


def read_url(url):
    request = Request(url, headers={"Accept": "*/*", "Cache-Control": "no-store"})
    try:
        response = OPENER.open(request, timeout=8)
    except HTTPError as error:
        response = error
    with response:
        body = response.read(MAX_BODY + 1)
        if len(body) > MAX_BODY:
            raise ValueError("Response too large")
        headers = {name: response.headers.get(name, "") for name in SAFE_HEADERS}
        return response.code, body, headers


def run(web_origin, expected_web_sha):
    web = checked_url(web_origin, origin=True)
    if not isinstance(expected_web_sha, str) or not SHA.fullmatch(expected_web_sha):
        raise ValueError("Expected web SHA must be a full lowercase commit SHA")
    report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "webOrigin": web, "expectedWebSha": expected_web_sha,
        "evidenceScope": "public-http-only", "checks": [], "passed": False,
        "notProven": ["running-image-digest", "browser-worker-control", "installed-standalone",
                      "offline-cold-start", "installed-auth-logout", "installed-update-A-to-B"],
    }

    def check(name, path, statuses, validate):
        item = {"name": name, "passed": False}
        report["checks"].append(item)
        started = time.monotonic()
        try:
            status, body, headers = read_url(web + path)
            item["status"] = status
            if status not in statuses:
                item["reason"] = "unexpected_status"
                return
            details = validate(body, headers)
            if details:
                item.update(details)
            item["passed"] = True
        except (OSError, ValueError, KeyError, TypeError, UnicodeError):
            # Never emit HTML, cookies, callback parameters, arbitrary headers or exception text.
            item["reason"] = "invalid_or_unavailable_response"
        finally:
            item["durationMs"] = round((time.monotonic() - started) * 1000)

    def mime(headers, expected):
        if headers["content-type"].split(";", 1)[0].strip().lower() not in expected:
            raise ValueError("Unexpected content type")

    def manifest(body, headers):
        mime(headers, {"application/manifest+json", "application/json"})
        data = json.loads(body)
        if not isinstance(data, dict):
            raise ValueError("Expected manifest object")
        for key, value in {"id": "/", "name": "AccessLobby", "short_name": "AccessLobby",
                           "start_url": "/", "scope": "/", "display": "standalone"}.items():
            if data.get(key) != value:
                raise ValueError("Manifest contract mismatch")
        icons = data.get("icons")
        if not isinstance(icons, list):
            raise ValueError("Missing icons")
        for size in (192, 512):
            if not any(isinstance(icon, dict) and icon.get("src") == f"/icons/icon-{size}.png"
                       and icon.get("sizes") == f"{size}x{size}" and icon.get("type") == "image/png"
                       for icon in icons):
                raise ValueError("Missing install icon")
        if not any(isinstance(icon, dict) and icon.get("src") == "/icons/icon-512.png"
                   and "maskable" in str(icon.get("purpose", "")).split() for icon in icons):
            raise ValueError("Missing maskable icon")
        return {"bytes": len(body)}

    def icon(size):
        def validate(body, headers):
            mime(headers, {"image/png"})
            if len(body) < 33 or body[:8] != PNG or body[12:16] != b"IHDR":
                raise ValueError("Invalid PNG header")
            if struct.unpack(">II", body[16:24]) != (size, size):
                raise ValueError("Unexpected PNG dimensions")
            return {"width": size, "height": size, "bytes": len(body)}
        return validate

    def worker(body, headers):
        mime(headers, {"text/javascript", "application/javascript"})
        directives = {part.strip().lower() for part in headers["cache-control"].split(",")}
        if "no-store" not in directives or headers["service-worker-allowed"] != "/":
            raise ValueError("Worker cache/scope mismatch")
        if headers["x-content-type-options"].lower() != "nosniff":
            raise ValueError("Worker MIME protection absent")
        source = body.decode("utf-8")
        match = re.search(r'^const BUILD_ID = "([0-9a-f]{40})";', source)
        if not match or match.group(1) != expected_web_sha:
            raise ValueError("Unexpected worker build")
        return {"buildId": match.group(1), "sourceSha256": hashlib.sha256(body).hexdigest(),
                "bytes": len(body)}

    def offline(body, headers):
        mime(headers, {"text/html"})
        if not all(text in body for text in (b"AccessLobby", b"Connection required", b"Retry connection")):
            raise ValueError("Offline shell absent")
        return {"bytes": len(body)}

    def protected(_body, headers):
        directives = {part.strip().lower() for part in headers["cache-control"].split(",")}
        if not {"private", "no-store"}.issubset(directives):
            raise ValueError("Protected cache boundary missing")

    check("pwa.manifest", "/manifest.webmanifest", {200}, manifest)
    check("pwa.worker", "/sw.js", {200}, worker)
    check("pwa.offline_shell", "/offline.html", {200}, offline)
    for size in (192, 512):
        check(f"pwa.icon_{size}", f"/icons/icon-{size}.png", {200}, icon(size))
    check("pwa.apple_touch_icon", "/icons/apple-touch-icon.png", {200}, icon(180))
    for path in ("/account", "/identity", "/contexts", "/apps", "/recovery"):
        # Inspect redirects without following them; no IAM or credential request is made.
        check("pwa.private_headers." + path[1:], path, {200, 302, 303, 307, 308, 401, 403}, protected)
    report["passed"] = all(item["passed"] for item in report["checks"])
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-origin", required=True)
    parser.add_argument("--expected-web-sha", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = run(args.web_origin, args.expected_web_sha)
    except ValueError as error:
        parser.error(str(error))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    passed = sum(item["passed"] for item in report["checks"])
    print(f"PWA public HTTP gate: {passed}/{len(report['checks'])} PASS")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
