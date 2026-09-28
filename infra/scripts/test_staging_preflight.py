import json
import unittest
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


if __name__ == "__main__":
    unittest.main()
