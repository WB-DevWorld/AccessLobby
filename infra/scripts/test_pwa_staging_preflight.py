import json
import unittest
from email.message import Message
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import MagicMock, patch

from infra.scripts import pwa_staging_preflight as preflight

WEB = "https://accesslobby.example.test"
SHA = "a" * 40
PUBLIC = Path(__file__).resolve().parents[2] / "apps/web/public"


def fixture():
    headers = lambda mime, **extra: {
        "content-type": mime, "cache-control": "", "service-worker-allowed": "",
        "x-content-type-options": "", **extra,
    }
    manifest = {"id": "/", "name": "AccessLobby", "short_name": "AccessLobby",
                "scope": "/", "start_url": "/", "display": "standalone", "icons": [
                    {"src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
                    {"src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable"},
                ]}
    data = {
        WEB + "/manifest.webmanifest": (200, json.dumps(manifest).encode(), headers("application/manifest+json")),
        WEB + "/sw.js": (200, f'const BUILD_ID = "{SHA}";\n'.encode(), headers("text/javascript; charset=utf-8", **{
            "cache-control": "no-store, no-cache, must-revalidate", "service-worker-allowed": "/", "x-content-type-options": "nosniff"})),
        WEB + "/offline.html": (200, b"AccessLobby Connection required Retry connection", headers("text/html")),
    }
    for name in ("icon-192.png", "icon-512.png", "apple-touch-icon.png"):
        data[WEB + "/icons/" + name] = (200, (PUBLIC / "icons" / name).read_bytes(), headers("image/png"))
    for path in ("/account", "/identity", "/contexts", "/apps", "/recovery"):
        data[WEB + path] = (200, b"private body never reported", headers("text/html", **{"cache-control": "private, no-store, max-age=0"}))
    return data


class PwaStagingPreflightTests(unittest.TestCase):
    def run_fixture(self, data):
        with patch.object(preflight, "read_url", side_effect=lambda url: data[url]):
            return preflight.run(WEB, SHA)

    def test_http_contract_passes_but_does_not_claim_installed_acceptance(self):
        result = self.run_fixture(fixture())
        self.assertTrue(result["passed"])
        self.assertEqual(len(result["checks"]), 11)
        self.assertEqual(result["evidenceScope"], "public-http-only")
        self.assertIn("installed-auth-logout", result["notProven"])
        self.assertIn("running-image-digest", result["notProven"])
        self.assertNotIn("private body", json.dumps(result))

    def test_old_worker_or_cacheable_private_page_fails(self):
        data = fixture()
        status, body, headers = data[WEB + "/sw.js"]
        data[WEB + "/sw.js"] = (status, body.replace(SHA.encode(), b"b" * 40), headers)
        data[WEB + "/account"][2]["cache-control"] = "public, max-age=3600"
        result = self.run_fixture(data)
        self.assertFalse(result["passed"])
        self.assertEqual({x["name"] for x in result["checks"] if not x["passed"]},
                         {"pwa.worker", "pwa.private_headers.account"})

    def test_redirected_manifest_and_wrong_icon_dimensions_fail(self):
        data = fixture()
        status, body, headers = data[WEB + "/manifest.webmanifest"]
        data[WEB + "/manifest.webmanifest"] = (307, body, headers)
        data[WEB + "/icons/icon-192.png"] = data[WEB + "/icons/icon-512.png"]
        result = self.run_fixture(data)
        self.assertEqual({x["name"] for x in result["checks"] if not x["passed"]},
                         {"pwa.manifest", "pwa.icon_192"})

    def test_bad_scope_worker_headers_and_untrusted_icon_urls_fail(self):
        for header, value in (("content-type", "text/html"), ("cache-control", "no-cache"),
                              ("service-worker-allowed", "/other/"), ("x-content-type-options", "")):
            with self.subTest(header=header):
                data = fixture()
                data[WEB + "/sw.js"][2][header] = value
                self.assertFalse(self.run_fixture(data)["passed"])
        data = fixture()
        status, body, headers = data[WEB + "/manifest.webmanifest"]
        manifest = json.loads(body)
        manifest["icons"][0]["src"] = "https://untrusted.example/icon.png"
        data[WEB + "/manifest.webmanifest"] = (status, json.dumps(manifest).encode(), headers)
        self.assertFalse(self.run_fixture(data)["passed"])

    def test_transport_failure_is_redacted_and_remaining_checks_continue(self):
        data = fixture()
        def read(url):
            if url.endswith("/sw.js"):
                raise OSError("secret must not be reported")
            return data[url]
        with patch.object(preflight, "read_url", side_effect=read):
            result = preflight.run(WEB, SHA)
        self.assertFalse(result["passed"])
        self.assertEqual(len(result["checks"]), 11)
        self.assertNotIn("secret", json.dumps(result))

    def test_insecure_origin_credentials_path_and_missing_sha_rejected_before_fetch(self):
        with patch.object(preflight, "read_url") as read:
            for url in ("http://example.test", "https://user:secret@example.test", WEB + "/path"):
                with self.assertRaises(ValueError):
                    preflight.run(url, SHA)
            for sha in (None, "", "local-build", "a" * 39):
                with self.assertRaises(ValueError):
                    preflight.run(WEB, sha)
            read.assert_not_called()

    def test_http_errors_do_not_follow_redirects_or_return_sensitive_headers(self):
        headers = Message()
        headers["Content-Type"] = "text/html"
        headers["Set-Cookie"] = "secret-cookie"
        headers["Location"] = "https://iam.example.test/private"
        error = HTTPError(WEB + "/account", 307, "Redirect", headers, BytesIO(b"body"))
        with patch.object(preflight.OPENER, "open", side_effect=error) as opened:
            status, body, returned_headers = preflight.read_url(WEB + "/account")
        self.assertEqual(status, 307)
        self.assertEqual(body, b"body")
        self.assertNotIn("secret-cookie", json.dumps(returned_headers))
        self.assertNotIn("Location", returned_headers)
        request = opened.call_args.args[0]
        self.assertNotIn("Cookie", request.headers)
        self.assertNotIn("Authorization", request.headers)
        self.assertIsNone(preflight.NoRedirect().redirect_request(request, None, 307, "Redirect", headers, headers["Location"]))

    def test_oversized_response_rejected(self):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = b"x" * (preflight.MAX_BODY + 1)
        with patch.object(preflight.OPENER, "open", return_value=response):
            with self.assertRaises(ValueError):
                preflight.read_url(WEB + "/offline.html")
