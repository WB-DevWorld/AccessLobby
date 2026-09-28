#!/usr/bin/env python3
"""Read-only, credential-free checks of the public AccessLobby staging boundary."""

import argparse
import json
import re
import secrets
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

MAX_BODY = 256 * 1024
SHA = re.compile(r"[0-9a-f]{40}\Z")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


OPENER = build_opener(NoRedirect)


class PageText(HTMLParser):
    """Read body text, excluding metadata and scripts."""

    def __init__(self):
        super().__init__()
        self.ignored = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in {"head", "script", "style", "template"}:
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag in {"head", "script", "style", "template"}:
            self.ignored -= 1

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def visible_text(html: str) -> str:
    page = PageText()
    page.feed(html)
    return " ".join(" ".join(page.parts).split())


def checked_url(value: str, *, origin: bool) -> str:
    parsed = urlparse(value)
    local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if (parsed.scheme != "https" and not (local and parsed.scheme == "http")) or not parsed.hostname:
        raise ValueError("Public endpoints require HTTPS (loopback HTTP is permitted for tests)")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or (origin and parsed.path not in {"", "/"}):
        raise ValueError("Endpoints must not contain credentials, a query, a fragment or an origin path")
    if not origin and not re.fullmatch(r"/realms/[a-zA-Z0-9_-]+/?", parsed.path):
        raise ValueError("The issuer must identify exactly one realm")
    return value.rstrip("/")


def read_url(url: str, *, accept: str = "application/json, text/html",
             request_id: str | None = None) -> tuple[int, bytes, str]:
    headers = {"Accept": accept, "Cache-Control": "no-store"}
    if request_id:
        headers["X-Request-Id"] = request_id
    request = Request(url, headers=headers)
    for attempt in range(2):
        try:
            response = OPENER.open(request, timeout=8)
            break
        except HTTPError as error:
            # A redirect is an unexpected status; never follow it to a different origin.
            with error:
                body = error.read(MAX_BODY + 1)
                if len(body) > MAX_BODY:
                    raise ValueError("Response exceeds the public preflight size limit")
                return error.code, body, error.headers.get_content_type()
        except OSError:
            if attempt:
                raise
            time.sleep(0.5)
    with response:
        content_type = response.headers.get_content_type()
        body = response.read(MAX_BODY + 1)
        if len(body) > MAX_BODY:
            raise ValueError("Response exceeds the public preflight size limit")
        return response.status, body, content_type


def json_object(body: bytes) -> dict:
    value = json.loads(body)
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object")
    return value


def run(web: str, api: str, issuer: str, consumer: str | None, expected_sha: str | None,
        check_auth_pages: bool = False, consumer_home_samples: int = 1,
        check_consumer_health: bool = False) -> dict:
    web = checked_url(web, origin=True)
    api = checked_url(api, origin=True)
    issuer = checked_url(issuer, origin=False)
    consumer = checked_url(consumer, origin=True) if consumer else None
    if expected_sha and not SHA.fullmatch(expected_sha):
        raise ValueError("Expected SHA must be a full 40-character lowercase Git commit")
    if consumer_home_samples < 1 or consumer_home_samples > 10 or (consumer_home_samples > 1 and not consumer):
        raise ValueError("Consumer home samples must be 1–10 and require a consumer origin")
    if check_consumer_health and not consumer:
        raise ValueError("Consumer health checks require a consumer origin")

    report = {"checkedAt": datetime.now(timezone.utc).isoformat(), "expectedSha": expected_sha,
              "checks": [], "passed": False}

    def check(name: str, url: str, statuses: set[int], predicate=None, *, accept=None, correlate=False):
        entry = {"name": name, "passed": False}
        options = {}
        if accept:
            options["accept"] = accept
        if correlate:
            entry["requestId"] = secrets.token_urlsafe(18)
            options["request_id"] = entry["requestId"]
        report["checks"].append(entry)
        started = time.monotonic()
        try:
            status, body, content_type = read_url(url, **options)
            entry["status"] = status
            if status not in statuses:
                entry["reason"] = "unexpected_status"
                return
            if predicate:
                # No raw body, response headers, cookies or request URLs enter the report.
                entry.update(predicate(body, content_type))
            entry["passed"] = True
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
            entry["reason"] = "invalid_or_unavailable_response"
        finally:
            entry["durationMs"] = round((time.monotonic() - started) * 1000)

    def web_check(body, _content_type):
        if b"AccessLobby" not in body:
            raise ValueError("AccessLobby branding absent")
        return {}

    def health(body, _content_type):
        data = json_object(body)
        if data.get("status") not in {"ok", "ready"}:
            raise ValueError("Unexpected health state")
        version = data.get("version")
        if not isinstance(version, str) or (expected_sha and version != expected_sha):
            raise ValueError("Unexpected deployed source revision")
        return {"version": version}

    def consumer_health(expected: str):
        def validate(body, content_type):
            if content_type != "application/json" or json_object(body).get("status") != expected:
                raise ValueError("Unexpected consumer health state")
            return {}
        return validate

    def discovery(body, _content_type):
        data = json_object(body)
        if data.get("issuer") != issuer:
            raise ValueError("Issuer mismatch")
        jwks = data.get("jwks_uri")
        if not isinstance(jwks, str) or not jwks.startswith(issuer + "/protocol/openid-connect/"):
            raise ValueError("JWKS origin or realm mismatch")
        if urlparse(jwks).query or urlparse(jwks).fragment:
            raise ValueError("Unexpected JWKS URL")
        check("issuer.jwks", jwks, {200}, jwks_check)
        return {"issuerMatched": True}

    def jwks_check(body, _content_type):
        keys = json_object(body).get("keys")
        if not isinstance(keys, list) or not any(isinstance(key, dict) and key.get("kty") == "RSA" and key.get("kid") for key in keys):
            raise ValueError("No public RSA signing key")
        return {"keyCount": len(keys)}

    check("web.home", web + "/", {200}, web_check)
    check("api.live", api + "/health/live", {200}, health)
    check("api.ready", api + "/health/ready", {200}, health)
    check("api.unauthenticated_me", api + "/v1/me", {401})
    check("issuer.discovery", issuer + "/.well-known/openid-configuration", {200}, discovery)
    iam_origin = issuer.split("/realms/")[0]
    for name, path in (("root", "/"), ("admin", "/admin/"), ("master", "/realms/master/"),
                       ("metrics", "/metrics"), ("health", "/health")):
        check("gateway.denies_" + name, iam_origin + path, {400, 403, 404})
    if consumer:
        check("consumer.home", consumer + "/", {200}, correlate=True)
        for sample in range(2, consumer_home_samples + 1):
            check(f"consumer.home.sample_{sample}", consumer + "/", {200}, correlate=True)
        if check_consumer_health:
            check("consumer.live", consumer + "/health/live", {200},
                  consumer_health("ok"), correlate=True)
            check("consumer.ready", consumer + "/health/ready", {200},
                  consumer_health("ready"), correlate=True)
        check("consumer.private_unauthenticated", consumer + "/private", {401})
        check("consumer.rejects_bad_callback", consumer + "/callback?state=invalid&code=invalid", {400})

    if check_auth_pages:
        # A fresh, unprivileged OIDC request loads the actual staging realm theme.
        # No credentials, cookies, authorization code or response body enter the report.
        auth_path = issuer + "/protocol/openid-connect/auth"
        parameters = {
            "client_id": "accesslobby-web", "redirect_uri": web + "/auth/callback",
            "response_type": "code", "scope": "openid", "code_challenge_method": "S256",
            "code_challenge": "A" * 43, "state": secrets.token_urlsafe(24),
            "nonce": secrets.token_urlsafe(24),
        }

        def auth_url(**changes):
            return auth_path + "?" + urlencode(parameters | changes)

        def themed_page(heading: str, form_id: str):
            def inspect(body: bytes, content_type: str):
                if content_type != "text/html":
                    raise ValueError("Expected an HTML authentication page")
                html = body.decode("utf-8", "replace")
                visible = visible_text(html)
                if heading not in visible or form_id not in html or "ACCESSLOBBY-FIRST-PARTY" in visible.upper():
                    raise ValueError("Authentication page does not show the branded form")
                return {"branded": True}
            return inspect

        def themed_error(body: bytes, content_type: str):
            if content_type != "text/html":
                raise ValueError("Expected an HTML authentication error")
            visible = visible_text(body.decode("utf-8", "replace"))
            if ("We could not complete that request" not in visible
                    or "This sign-in request is not valid. Return to the app and try again." not in visible
                    or "Invalid parameter:" in visible
                    or "ACCESSLOBBY-FIRST-PARTY" in visible.upper()):
                raise ValueError("Authentication error is not branded and plain-language")
            return {"branded": True}

        check("auth.login_theme", auth_url(), {200},
              themed_page("Sign in to AccessLobby", 'id="kc-form-login"'), accept="text/html")
        check("auth.registration_theme", auth_url(prompt="create"), {200},
              themed_page("Create your AccessLobby account", 'id="kc-register-form"'), accept="text/html")
        check("auth.rejects_bad_redirect", auth_url(redirect_uri=web + "/unregistered"), {400},
              themed_error, accept="text/html")

    report["passed"] = all(entry["passed"] for entry in report["checks"])
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-origin", required=True)
    parser.add_argument("--api-origin", required=True)
    parser.add_argument("--issuer", required=True)
    parser.add_argument("--consumer-origin")
    parser.add_argument("--expected-sha")
    parser.add_argument("--check-auth-pages", action="store_true",
                        help="Check live branded login, registration and invalid-request pages without signing in")
    parser.add_argument("--consumer-home-samples", type=int, default=1,
                        help="Repeat the public consumer home check 1–10 times to detect intermittent failures")
    parser.add_argument("--check-consumer-health", action="store_true",
                        help="Check optional consumer health routes after deploying a compatible consumer image")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        report = run(args.web_origin, args.api_origin, args.issuer, args.consumer_origin, args.expected_sha,
                     args.check_auth_pages, args.consumer_home_samples, args.check_consumer_health)
    except ValueError as error:
        parser.error(str(error))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
