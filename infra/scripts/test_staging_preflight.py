import json
import unittest
from email.message import Message
from io import BytesIO
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from infra.scripts import staging_preflight as preflight

WEB = "http://127.0.0.1:3000"
API = "http://127.0.0.1:3001"
ISSUER = "http://127.0.0.1:8080/realms/accesslobby-first-party"
CONSUMER = "http://127.0.0.1:4000"
SHA = "a" * 40


def fixture():
    jwks = ISSUER + "/protocol/openid-connect/certs"
    encoded = lambda obj: json.dumps(obj).encode()
    data = {
        WEB + "/": (200, b"<title>AccessLobby</title>", "text/html"),
        API + "/health/live": (200, encoded({"status": "ok", "version": SHA}), "application/json"),
        API + "/health/ready": (200, encoded({"status": "ready", "version": SHA}), "application/json"),
        API + "/v1/me": (401, b"", ""),
        ISSUER + "/.well-known/openid-configuration":
            (200, encoded({"issuer": ISSUER, "jwks_uri": jwks}), "application/json"),
        jwks: (200, encoded({"keys": [{"kid": "public-key", "kty": "RSA"}]}), "application/json"),
        CONSUMER + "/": (200, b"consumer", "text/html"),
        CONSUMER + "/private": (401, b"", ""),
        CONSUMER + "/callback?state=invalid&code=invalid": (400, b"", ""),
    }
    for path in ("/", "/admin/", "/realms/master/", "/metrics", "/health"):
        data["http://127.0.0.1:8080" + path] = (404, b"", "")
    return data


class StagingPreflightTests(unittest.TestCase):
    def run_fixture(self, data, *, sha=SHA):
        with patch.object(preflight, "read_url", side_effect=lambda url: data[url]):
            return preflight.run(WEB, API, ISSUER, CONSUMER, sha)

    def test_public_contract_passes_without_exposing_response_bodies(self):
        result = self.run_fixture(fixture())
        self.assertTrue(result["passed"])
        self.assertEqual(len(result["checks"]), 14)
        self.assertEqual(next(item for item in result["checks"] if item["name"] == "issuer.jwks")["keyCount"], 1)
        self.assertNotIn("public-key", json.dumps(result))
        self.assertNotIn("callback?", json.dumps(result))

    def test_sha_mismatch_and_gateway_exposure_fail(self):
        data = fixture()
        data[API + "/health/live"] = (200, b'{"status":"ok","version":"wrong"}', "application/json")
        data["http://127.0.0.1:8080/admin/"] = (200, b"oops", "text/html")
        result = self.run_fixture(data)
        self.assertFalse(result["passed"])
        failures = {item["name"] for item in result["checks"] if not item["passed"]}
        self.assertEqual(failures, {"api.live", "gateway.denies_admin"})

    def test_discovery_must_match_issuer_and_jwks_realm(self):
        data = fixture()
        data[ISSUER + "/.well-known/openid-configuration"] = (
            200, json.dumps({"issuer": ISSUER, "jwks_uri": "https://other.example/certs"}).encode(), "application/json")
        result = self.run_fixture(data)
        self.assertFalse(result["passed"])
        self.assertNotIn("issuer.jwks", {item["name"] for item in result["checks"]})

    def test_public_url_validation_rejects_insecure_and_embedded_credentials(self):
        for value in ("http://example.com", "https://user:secret@example.com", "https://example.com/path"):
            with self.assertRaises(ValueError):
                preflight.checked_url(value, origin=True)
        with self.assertRaises(ValueError):
            preflight.checked_url("https://example.com/realms/master/../private", origin=False)

    def test_http_error_page_is_inspected_without_reporting_raw_body(self):
        headers = Message()
        headers["Content-Type"] = "text/html; charset=utf-8"
        error = HTTPError(WEB + "/bad", 400, "Bad Request", headers,
                          BytesIO(b"We could not complete that request"))
        with patch.object(preflight.OPENER, "open", side_effect=error):
            status, body, content_type = preflight.read_url(WEB + "/bad")
        self.assertEqual((status, content_type), (400, "text/html"))
        self.assertEqual(body, b"We could not complete that request")

    def test_live_auth_pages_require_branded_forms_and_plain_language_errors(self):
        data = fixture()
        seen_urls = []

        def read(url, *, accept="application/json, text/html"):
            seen_urls.append(url)
            if not url.startswith(ISSUER + "/protocol/openid-connect/auth?"):
                return data[url]
            self.assertEqual(accept, "text/html")
            params = parse_qs(urlparse(url).query)
            self.assertEqual(params["client_id"], ["accesslobby-web"])
            self.assertEqual(params["code_challenge_method"], ["S256"])
            self.assertEqual(params["redirect_uri"],
                             [WEB + ("/unregistered" if "unregistered" in url else "/auth/callback")])
            if "unregistered" in url:
                return (400, b'<a href="/realms/accesslobby-first-party/login-actions">Back</a>'
                        b"We could not complete that request. "
                        b"This sign-in request is not valid. Return to the app and try again.", "text/html")
            if params.get("prompt") == ["create"]:
                return (200, b'<h1>Create your AccessLobby account</h1>'
                        b'<form id="kc-register-form" action="/realms/accesslobby-first-party/login-actions">',
                        "text/html")
            return (200, b'<h1>Sign in to AccessLobby</h1>'
                    b'<form id="kc-form-login" action="/realms/accesslobby-first-party/login-actions">',
                    "text/html")

        with patch.object(preflight, "read_url", side_effect=read):
            result = preflight.run(WEB, API, ISSUER, CONSUMER, SHA, check_auth_pages=True)
        self.assertTrue(result["passed"])
        self.assertEqual(len(result["checks"]), 17)
        serialized = json.dumps(result)
        auth_urls = [url for url in seen_urls if "/protocol/openid-connect/auth?" in url]
        for url in auth_urls:
            params = parse_qs(urlparse(url).query)
            self.assertNotIn(params["state"][0], serialized)
            self.assertNotIn(params["nonce"][0], serialized)
        self.assertEqual(len([url for url in seen_urls if "/auth?" in url]), 3)

    def test_technical_realm_name_in_visible_page_text_fails_auth_gate(self):
        data = fixture()

        def read(url, *, accept="application/json, text/html"):
            if "/protocol/openid-connect/auth?" not in url:
                return data[url]
            params = parse_qs(urlparse(url).query)
            if "unregistered" in url:
                return 400, (b"We could not complete that request. "
                             b"This sign-in request is not valid. Return to the app and try again. "
                             b"<p>ACCESSLOBBY-FIRST-PARTY</p>"), "text/html"
            if params.get("prompt") == ["create"]:
                return 200, (b'<h1>Create your AccessLobby account</h1>'
                             b'<p>ACCESSLOBBY-FIRST-PARTY</p><form id="kc-register-form">'), "text/html"
            return 200, (b'<h1>Sign in to AccessLobby</h1>'
                         b'<p>ACCESSLOBBY-FIRST-PARTY</p><form id="kc-form-login">'), "text/html"

        with patch.object(preflight, "read_url", side_effect=read):
            result = preflight.run(WEB, API, ISSUER, CONSUMER, SHA, check_auth_pages=True)
        self.assertEqual({check["name"] for check in result["checks"] if not check["passed"]},
                         {"auth.login_theme", "auth.registration_theme", "auth.rejects_bad_redirect"})

    def test_unbranded_login_and_disabled_registration_fail_auth_gate(self):
        data = fixture()

        def read(url, *, accept="application/json, text/html"):
            if "/protocol/openid-connect/auth?" not in url:
                return data[url]
            params = parse_qs(urlparse(url).query)
            if params.get("prompt") == ["create"]:
                return 400, b"Registration not allowed", "text/html"
            if "unregistered" in url:
                return 400, b"Invalid parameter: redirect_uri", "text/html"
            return 200, b'<h1>ACCESSLOBBY-FIRST-PARTY</h1><form id="kc-form-login">', "text/html"

        with patch.object(preflight, "read_url", side_effect=read):
            result = preflight.run(WEB, API, ISSUER, CONSUMER, SHA, check_auth_pages=True)
        self.assertFalse(result["passed"])
        self.assertEqual({check["name"] for check in result["checks"] if not check["passed"]},
                         {"auth.login_theme", "auth.registration_theme", "auth.rejects_bad_redirect"})

    def test_bounded_consumer_samples_report_intermittent_status_without_body(self):
        data = fixture()
        calls = 0

        def read(url):
            nonlocal calls
            if url == CONSUMER + "/":
                calls += 1
                if calls == 3:
                    return 502, b"private proxy detail", "text/plain"
            return data[url]

        with patch.object(preflight, "read_url", side_effect=read):
            result = preflight.run(WEB, API, ISSUER, CONSUMER, SHA, consumer_home_samples=5)
        self.assertFalse(result["passed"])
        self.assertEqual(calls, 5)
        self.assertEqual(len(result["checks"]), 18)
        self.assertEqual([item["name"] for item in result["checks"] if not item["passed"]],
                         ["consumer.home.sample_3"])
        self.assertTrue(all("durationMs" in item for item in result["checks"]))
        self.assertNotIn("private proxy detail", json.dumps(result))

    def test_extra_consumer_samples_require_consumer_origin(self):
        with self.assertRaises(ValueError):
            preflight.run(WEB, API, ISSUER, None, SHA, consumer_home_samples=2)
        with self.assertRaises(ValueError):
            preflight.run(WEB, API, ISSUER, CONSUMER, SHA, consumer_home_samples=11)


if __name__ == "__main__":
    unittest.main()
