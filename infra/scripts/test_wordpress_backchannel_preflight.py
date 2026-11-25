import json
import ssl
import unittest
from email.message import Message
from io import BytesIO
from unittest.mock import Mock
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs

from infra.scripts import wordpress_backchannel_preflight as preflight

ENDPOINT = "https://wp.example.test/gh/wp-json/accesslobby/v1/backchannel-logout"


def response(status, body=b'{"error":"invalid_logout"}', **headers):
    message = Message()
    for key, value in {"Content-Type": "application/json", "Cache-Control": "private, no-store", **headers}.items():
        message[key] = value
    return HTTPError(ENDPOINT, status, "fixture", message, BytesIO(body))


class WordPressBackchannelPreflightTests(unittest.TestCase):
    def run_probe(self, reply):
        opener = Mock()
        opener.open.side_effect = reply if isinstance(reply, URLError) else None
        if not isinstance(reply, URLError):
            opener.open.return_value = reply
        return preflight.probe(ENDPOINT, opener=opener), opener

    def test_malformed_token_rejection_is_not_signed_logout_qualification(self):
        result, opener = self.run_probe(response(400))
        self.assertTrue(result["passed"])
        self.assertFalse(result["signedLogoutQualified"])
        self.assertEqual(result["result"], "invalid_test_token_rejected")
        request = opener.open.call_args.args[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(parse_qs(request.data.decode()), {"logout_token": [preflight.TEST_TOKEN]})
        self.assertNotIn("Authorization", request.headers)
        self.assertNotIn("Cookie", request.headers)
        self.assertEqual(opener.open.call_count, 1)

    def test_detects_cloudflare_header_without_recording_sensitive_values(self):
        reply = response(
            403, b'{"verification":"https://example.test/?code=do-not-record"}',
            **{"cf-mitigated": "challenge", "cf-ray": "1234567890abcdef-ACC",
               "Set-Cookie": "cf_clearance=do-not-record", "Content-Type": "text/html"},
        )
        result, opener = self.run_probe(reply)
        self.assertFalse(result["passed"])
        self.assertEqual(result["result"], "cloudflare_challenge")
        self.assertEqual(result["cfRay"], "1234567890abcdef-ACC")
        self.assertNotIn("do-not-record", json.dumps(result))
        self.assertEqual(opener.open.call_count, 1)

    def test_cloudflare_proxy_header_alone_does_not_identify_a_challenge(self):
        result, _ = self.run_probe(response(403, b"denied", **{"cf-ray": "1234567890abcdef-ACC"}))
        self.assertEqual(result["result"], "unexpected_http_response")
        self.assertFalse(result["cloudflareChallenge"])

    def test_redirect_is_not_a_pass_and_its_location_is_never_reported(self):
        result, opener = self.run_probe(response(302, b"", Location="https://other.test/?code=do-not-record"))
        self.assertEqual(result["result"], "redirect_not_followed")
        self.assertNotIn("do-not-record", json.dumps(result))
        self.assertEqual(opener.open.call_count, 1)

    def test_accepting_a_malformed_token_or_caching_a_rejection_is_not_a_pass(self):
        for reply in (
            response(200),
            response(400, **{"cf-cache-status": "HIT"}),
            response(400, **{"Cache-Control": "public, max-age=60"}),
            response(400, b'{"code":"rest_no_route"}'),
        ):
            result, _ = self.run_probe(reply)
            self.assertFalse(result["passed"])

    def test_large_or_malformed_body_is_not_reported_or_accepted(self):
        for body in (b"not-json-do-not-record", b"x" * (preflight.MAX_BODY + 1)):
            result, _ = self.run_probe(response(400, body))
            self.assertFalse(result["passed"])
            self.assertNotIn("do-not-record", json.dumps(result))

    def test_tls_failure_is_not_retried_or_relaxed(self):
        result, opener = self.run_probe(URLError(ssl.SSLCertVerificationError(1, "do-not-record")))
        self.assertEqual(result["result"], "transport_failed")
        self.assertFalse(result["tlsVerified"])
        self.assertNotIn("do-not-record", json.dumps(result))
        self.assertEqual(opener.open.call_count, 1)

    def test_pretty_subdirectory_and_plain_wordpress_routes_are_supported(self):
        for endpoint in (ENDPOINT, "https://wp.example.test/gh/?rest_route=%2Faccesslobby%2Fv1%2Fbackchannel-logout"):
            self.assertEqual(preflight.checked_endpoint(endpoint), endpoint)

    def test_unrelated_or_sensitive_urls_are_rejected_without_echoing_them(self):
        for endpoint in (
            ENDPOINT.replace("https:", "http:"),
            ENDPOINT.replace("wp.example", "user:do-not-record@wp.example"),
            ENDPOINT.replace("wp.example", "@wp.example"),
            ENDPOINT + "?code=do-not-record",
            ENDPOINT + "#do-not-record",
            "https://wp.example.test/wp-login.php?action=al_callback&code=do-not-record",
            "https://wp.example.test/?rest_route=/accesslobby/v1/backchannel-logout&rest_route=do-not-record",
        ):
            with self.assertRaises(ValueError) as caught:
                preflight.checked_endpoint(endpoint)
            self.assertNotIn("do-not-record", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
