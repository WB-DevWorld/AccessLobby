#!/usr/bin/env python3
"""Public, credential-free AccessLobby staging smoke checks.

This script intentionally verifies only public endpoints and negative unauthenticated
behaviour. It never accepts or records passwords, tokens, cookies or private IDs.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import ssl
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen


class SmokeFailure(RuntimeError):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        return None


@dataclass
class HttpResult:
    url: str
    status: int
    headers: dict[str, str]
    body: bytes


@dataclass
class Check:
    name: str
    ok: bool
    status: int | None = None
    detail: str = ""


def _normalise_origin(value: str, name: str, *, allow_path: bool = False) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme != "https":
        raise ValueError(f"{name} must use https")
    if not parsed.hostname or parsed.username or parsed.password:
        raise ValueError(f"{name} must contain a public hostname and no credentials")
    if parsed.query or parsed.fragment:
        raise ValueError(f"{name} must not contain a query or fragment")
    if not allow_path and parsed.path not in ("", "/"):
        raise ValueError(f"{name} must be an origin without a path")
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        address = None
    if address and (address.is_private or address.is_loopback or address.is_link_local or address.is_reserved):
        raise ValueError(f"{name} must not use a private, loopback or reserved address")
    path = parsed.path.rstrip("/") if allow_path else ""
    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def _fetch(url: str, *, follow_redirects: bool = True, timeout: float = 20.0) -> HttpResult:
    request = Request(
        url,
        headers={
            "Accept": "application/json,text/html;q=0.9,*/*;q=0.1",
            "User-Agent": "AccessLobby-public-staging-smoke/1",
        },
    )
    context = ssl.create_default_context()
    opener = build_opener() if follow_redirects else build_opener(NoRedirect())
    try:
        response = opener.open(request, timeout=timeout, context=context) if hasattr(opener, "open") else urlopen(request, timeout=timeout, context=context)
        with response:
            return HttpResult(
                url=response.geturl(),
                status=response.status,
                headers={key.lower(): value for key, value in response.headers.items()},
                body=response.read(1_000_000),
            )
    except TypeError:
        # OpenerDirector.open does not accept an SSL context on some Python builds.
        try:
            response = opener.open(request, timeout=timeout)
            with response:
                return HttpResult(
                    url=response.geturl(),
                    status=response.status,
                    headers={key.lower(): value for key, value in response.headers.items()},
                    body=response.read(1_000_000),
                )
        except HTTPError as error:
            return HttpResult(
                url=error.geturl(),
                status=error.code,
                headers={key.lower(): value for key, value in error.headers.items()},
                body=error.read(1_000_000),
            )
    except HTTPError as error:
        return HttpResult(
            url=error.geturl(),
            status=error.code,
            headers={key.lower(): value for key, value in error.headers.items()},
            body=error.read(1_000_000),
        )
    except URLError as error:
        raise SmokeFailure(f"Request failed for {url}: {error.reason}") from error


def _json(result: HttpResult, name: str) -> dict[str, Any]:
    try:
        payload = json.loads(result.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SmokeFailure(f"{name} did not return valid JSON") from error
    if not isinstance(payload, dict):
        raise SmokeFailure(f"{name} did not return a JSON object")
    return payload


def _text(result: HttpResult) -> str:
    return result.body.decode("utf-8", errors="replace")


def _auth_url(issuer: str, client_id: str, redirect_uri: str, *, register: bool = False) -> str:
    query = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid",
        "state": "public-staging-smoke",
        "nonce": "public-staging-smoke",
        "code_challenge_method": "S256",
        "code_challenge": "A" * 43,
    }
    if register:
        query["prompt"] = "create"
    return f"{issuer}/protocol/openid-connect/auth?{urlencode(query)}"


def _record(checks: list[Check], name: str, condition: bool, *, status: int | None = None, detail: str = "") -> None:
    checks.append(Check(name=name, ok=condition, status=status, detail=detail))
    if not condition:
        raise SmokeFailure(f"{name} failed: {detail or 'condition was false'}")


def validate_discovery(document: dict[str, Any], issuer: str) -> None:
    if document.get("issuer") != issuer:
        raise SmokeFailure(f"Discovery issuer mismatch: {document.get('issuer')!r}")
    required = ("authorization_endpoint", "token_endpoint", "jwks_uri", "end_session_endpoint")
    for field in required:
        value = document.get(field)
        if not isinstance(value, str) or not value.startswith("https://"):
            raise SmokeFailure(f"Discovery field {field} is missing or not HTTPS")


def validate_jwks(document: dict[str, Any]) -> None:
    keys = document.get("keys")
    if not isinstance(keys, list) or not keys:
        raise SmokeFailure("JWKS has no signing keys")
    if not any(isinstance(key, dict) and key.get("kty") == "RSA" and key.get("kid") for key in keys):
        raise SmokeFailure("JWKS has no identifiable RSA signing key")


def run_smoke(args: argparse.Namespace) -> dict[str, Any]:
    web_origin = _normalise_origin(args.web_origin, "web origin")
    api_origin = _normalise_origin(args.api_origin, "API origin")
    issuer = _normalise_origin(args.issuer, "issuer", allow_path=True)
    consumer_origin = _normalise_origin(args.consumer_origin, "consumer origin") if args.consumer_origin else None
    checks: list[Check] = []
    started = time.time()

    home = _fetch(f"{web_origin}/")
    home_text = _text(home)
    _record(checks, "web.home", home.status == 200 and "AccessLobby" in home_text, status=home.status, detail="expected HTTP 200 and AccessLobby branding")

    for endpoint, expected_status, expected_value in (
        ("health/live", 200, "ok"),
        ("health/ready", 200, "ready"),
    ):
        result = _fetch(f"{api_origin}/{endpoint}")
        payload = _json(result, endpoint)
        valid = result.status == expected_status and payload.get("status") == expected_value
        if args.expected_sha:
            valid = valid and payload.get("version") == args.expected_sha
        _record(
            checks,
            f"api.{endpoint.replace('/', '.')}",
            valid,
            status=result.status,
            detail=f"status={payload.get('status')!r} version={payload.get('version')!r}",
        )

    me = _fetch(f"{api_origin}/v1/me")
    me_payload = _json(me, "unauthenticated /v1/me")
    _record(checks, "api.v1.me.unauthenticated", me.status == 401 and me_payload.get("error") == "unauthorized", status=me.status, detail="expected a safe unauthorized response")

    discovery_result = _fetch(f"{issuer}/.well-known/openid-configuration")
    discovery = _json(discovery_result, "OIDC discovery")
    validate_discovery(discovery, issuer)
    _record(checks, "iam.discovery", discovery_result.status == 200, status=discovery_result.status, detail="exact HTTPS issuer and required endpoints")

    jwks_result = _fetch(discovery["jwks_uri"])
    jwks = _json(jwks_result, "JWKS")
    validate_jwks(jwks)
    _record(checks, "iam.jwks", jwks_result.status == 200, status=jwks_result.status, detail=f"keys={len(jwks['keys'])}")

    callback = args.redirect_uri or f"{web_origin}/auth/callback"
    login = _fetch(_auth_url(issuer, args.client_id, callback))
    login_text = _text(login)
    login_ok = login.status == 200 and "AccessLobby" in login_text and issuer.rsplit("/", 1)[-1].upper() not in login_text.upper()
    _record(checks, "iam.login.surface", login_ok, status=login.status, detail="expected branded login page without technical realm heading")

    invalid = _fetch(_auth_url(issuer, args.client_id, f"{web_origin}/auth/unregistered"))
    invalid_text = _text(invalid)
    invalid_ok = invalid.status == 400 and ("We could not complete that request" in invalid_text or "Invalid parameter" in invalid_text)
    _record(checks, "iam.invalid_redirect", invalid_ok, status=invalid.status, detail="expected safe HTTP 400 error surface")

    registration = _fetch(_auth_url(issuer, args.client_id, callback, register=True))
    registration_text = _text(registration)
    if args.registration_enabled == "true":
        registration_ok = registration.status == 200 and "Create your AccessLobby account" in registration_text
    elif args.registration_enabled == "false":
        registration_ok = registration.status == 400 and "Registration not allowed" in registration_text
    else:
        registration_ok = registration.status in (200, 400)
    _record(
        checks,
        "iam.registration.gate",
        registration_ok,
        status=registration.status,
        detail=f"expected={args.registration_enabled}",
    )

    iam_origin = urlunsplit((*urlsplit(issuer)[:2], "", "", ""))
    for denied_path in ("/", "/admin/", "/realms/master/", "/metrics", "/health"):
        denied = _fetch(urljoin(iam_origin, denied_path), follow_redirects=False)
        _record(
            checks,
            f"iam.gateway.denied.{denied_path.strip('/').replace('/', '.') or 'root'}",
            denied.status in (400, 403, 404),
            status=denied.status,
            detail="gateway must not expose Keycloak management/root paths",
        )

    if consumer_origin:
        consumer_home = _fetch(f"{consumer_origin}/")
        _record(checks, "consumer.home", consumer_home.status == 200 and "AccessLobby reference app" in _text(consumer_home), status=consumer_home.status, detail="expected independent consumer home")
        consumer_private = _fetch(f"{consumer_origin}/private")
        _record(checks, "consumer.private.unauthenticated", consumer_private.status == 401, status=consumer_private.status, detail="consumer resource remains locally protected")
        consumer_register = _fetch(f"{consumer_origin}/register", follow_redirects=False)
        location = consumer_register.headers.get("location", "")
        _record(checks, "consumer.registration.redirect", consumer_register.status in (302, 303, 307, 308) and location.startswith(issuer), status=consumer_register.status, detail="registration entry must redirect to the exact issuer")

    return {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "durationSeconds": round(time.time() - started, 3),
        "webOrigin": web_origin,
        "apiOrigin": api_origin,
        "issuer": issuer,
        "consumerOrigin": consumer_origin,
        "expectedSha": args.expected_sha or None,
        "registrationExpected": args.registration_enabled,
        "checks": [asdict(check) for check in checks],
        "passed": all(check.ok for check in checks),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-origin", required=True)
    parser.add_argument("--api-origin", required=True)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--consumer-origin", default="")
    parser.add_argument("--client-id", default="accesslobby-web")
    parser.add_argument("--redirect-uri", default="")
    parser.add_argument("--expected-sha", default="")
    parser.add_argument("--registration-enabled", choices=("true", "false", "skip"), default="skip")
    parser.add_argument("--output", default="artifacts/staging-public-smoke.json")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        report = run_smoke(args)
    except (SmokeFailure, ValueError) as error:
        report = {
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "passed": False,
            "error": str(error),
        }
        output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(report, indent=2), file=sys.stderr)
        return 1
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
