#!/usr/bin/env python3
"""One credential-free malformed-token POST; never solves challenges or follows redirects."""

import argparse
import json
import re
import ssl
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

ROUTE = "/accesslobby/v1/backchannel-logout"
MAX_BODY = 8192
TEST_TOKEN = "accesslobby-preflight.invalid.signature"


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def checked_endpoint(value: str) -> str:
    try:
        parts = urlsplit(value)
        port = parts.port
        valid = (
            parts.scheme == "https" and parts.hostname
            and parts.username is None and parts.password is None and not parts.fragment
            and (port is None or 1 <= port <= 65535)
            and not any(ord(char) < 33 or ord(char) == 127 for char in value)
        )
        pretty = not parts.query and parts.path.endswith("/wp-json" + ROUTE)
        plain = parts.path.endswith("/") and parse_qsl(
            parts.query, keep_blank_values=True
        ) == [("rest_route", ROUTE)]
        if not valid or not (pretty or plain):
            raise ValueError
    except ValueError:
        # Never echo a rejected URL: it may accidentally contain credentials or a code.
        raise ValueError("Copy the exact HTTPS WordPress backchannel URL without credentials or unrelated parameters.") from None
    return value


def probe(endpoint: str, *, timeout: float = 10, opener=None) -> dict:
    endpoint = checked_endpoint(endpoint)
    parts = urlsplit(endpoint)
    result = {
        "evidenceType": "malformed-backchannel-machine-preflight",
        "recordedAt": datetime.now(timezone.utc).isoformat(),
        "host": parts.hostname,
        "path": parts.path,
        "routeKind": "plain" if parts.query else "pretty",
        "method": "POST",
        "passed": False,
        "signedLogoutQualified": False,
    }
    request = Request(
        endpoint,
        data=urlencode({"logout_token": TEST_TOKEN}).encode(),
        method="POST",
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "Cache-Control": "no-store",
            "User-Agent": "AccessLobby-WordPress-Preflight/0.1",
        },
    )
    if opener is None:
        opener = build_opener(NoRedirect(), HTTPSHandler(context=ssl.create_default_context()))
    try:
        try:
            response = opener.open(request, timeout=timeout)
        except HTTPError as error:
            response = error
        with response:
            status = response.code
            headers = response.headers
            body = response.read(MAX_BODY + 1)
        result["status"] = status
        result["tlsVerified"] = True
        challenged = headers.get("cf-mitigated", "").lower() == "challenge"
        result["cloudflareChallenge"] = challenged
        ray = headers.get("cf-ray", "")
        if re.fullmatch(r"[0-9a-fA-F]{16,32}(?:-[A-Z]{3})?", ray):
            result["cfRay"] = ray
        cache = headers.get("cf-cache-status", "").upper()
        result["cacheStatus"] = cache if cache in {
            "HIT", "MISS", "DYNAMIC", "BYPASS", "EXPIRED", "STALE", "UPDATING", "REVALIDATED"
        } else "unreported"
        result["noStore"] = "no-store" in {
            item.strip().lower() for item in headers.get("cache-control", "").split(",")
        }
        if challenged:
            result["result"] = "cloudflare_challenge"
            return result
        if 300 <= status < 400:
            result["result"] = "redirect_not_followed"
            return result
        if 200 <= status < 300:
            result["result"] = "unexpected_success_for_invalid_token"
            return result
        payload = None
        if len(body) <= MAX_BODY and headers.get("content-type", "").lower().startswith("application/json"):
            try:
                payload = json.loads(body)
            except (ValueError, UnicodeError):
                pass
        if status == 400 and isinstance(payload, dict) and payload.get("error") == "invalid_logout":
            result["result"] = "invalid_test_token_rejected"
            result["passed"] = result["noStore"] and cache not in {"HIT", "STALE", "UPDATING", "REVALIDATED"}
            if not result["passed"]:
                result["result"] = "cache_policy_unconfirmed"
        else:
            result["result"] = "unexpected_http_response"
    except (URLError, OSError, ValueError):
        # Network exception strings can include URLs or untrusted response text.
        result["result"] = "transport_failed"
        result["tlsVerified"] = False
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", required=True, help="Exact registered backchannel URL from plugin settings")
    parser.add_argument("--output", type=Path, help="Optional categorical JSON report; never contains response bodies")
    args = parser.parse_args()
    try:
        result = probe(args.endpoint)
    except ValueError:
        result = {"passed": False, "result": "invalid_endpoint"}
    output = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output)
    print(output, end="")
    return 0 if result["passed"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
