import contextlib
import importlib.util
import io
import json
import shutil
import ssl
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SCRIPT = Path(__file__).with_name("private-iam-console-check.py")
SPEC = importlib.util.spec_from_file_location("private_iam_console_check", SCRIPT)
check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check)

PRIVATE = "https://console.example.test:9443"
PUBLIC = "https://iam.example.test"
ISSUER = PUBLIC + check.REALM_PATH


def metadata(issuer):
    return {"issuer": issuer, "authorization_endpoint": issuer + "/protocol/openid-connect/auth",
            "token_endpoint": issuer + "/protocol/openid-connect/token", "jwks_uri": issuer + "/protocol/openid-connect/certs"}


def json_reply(value, status=200):
    return check.Reply(status, {"content-type": "application/json"}, json.dumps(value).encode())


def console_document(**overrides):
    env = {"realm": "master", "clientId": "security-admin-console", "serverBaseUrl": PUBLIC,
           "authServerUrl": PRIVATE, "authUrl": PRIVATE, "adminBaseUrl": PRIVATE,
           "consoleBaseUrl": check.CONSOLE_PATH, **overrides}
    return ('<html><script id="environment" type="application/json">' + json.dumps(env) +
            '</script><script type="module" src="/resources/test/admin/keycloak.v2/main.js"></script>' +
            '<link rel="stylesheet" href="/resources/test/admin/keycloak.v2/main.css"></html>').encode()


class FakeRoutes:
    def __init__(self):
        self.calls = []
        self.overrides = {}

    def __call__(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url in self.overrides:
            value = self.overrides[url]
            if isinstance(value, Exception):
                raise value
            return value
        if url == ISSUER + "/.well-known/openid-configuration":
            return json_reply(metadata(ISSUER))
        if url == PRIVATE + "/realms/master/.well-known/openid-configuration":
            return json_reply(metadata(PRIVATE + "/realms/master"))
        if url == PRIVATE + check.CONSOLE_PATH:
            return check.Reply(200, {"content-type": "text/html;charset=utf-8"}, console_document())
        if url.startswith(PRIVATE + "/resources/"):
            return check.Reply(200, {"content-type": "text/css" if url.endswith(".css") else "application/javascript"}, b"fixture")
        if url in [PUBLIC + path for path in ("/admin/", check.CONSOLE_PATH, "/realms/master/", "/metrics", "/health")]:
            return check.Reply(404, {"content-type": "text/html"}, b"not found")
        raise AssertionError("Unexpected fixture route")


class ReadinessTests(unittest.TestCase):
    def probe(self, routes):
        return check.ReadinessChecker(PRIVATE, "127.0.0.1", ISSUER, getter=routes).run()

    def test_valid_readiness_keeps_private_tcp_and_public_probes_separate(self):
        routes = FakeRoutes()
        result = self.probe(routes)
        self.assertTrue(result["passed"])
        self.assertFalse(result["authenticatedConsoleQualified"])
        self.assertFalse(result["loginAttempted"])
        self.assertFalse(result["targetConfigurationChanged"])
        self.assertEqual(result["assetsChecked"], 2)
        for url, kwargs in routes.calls:
            self.assertEqual(kwargs["connect_loopback"], "127.0.0.1" if url.startswith(PRIVATE) else None)
            self.assertTrue(kwargs["context"].check_hostname)
            self.assertEqual(kwargs["context"].verify_mode, ssl.CERT_REQUIRED)
            self.assertLessEqual(kwargs["timeout"], 5)
        private_contexts = {id(kwargs["context"]) for url, kwargs in routes.calls if url.startswith(PRIVATE)}
        public_contexts = {id(kwargs["context"]) for url, kwargs in routes.calls if url.startswith(PUBLIC)}
        self.assertFalse(private_contexts & public_contexts)
        # No login flow is started, even though auth metadata is inspected.
        self.assertFalse(any("/protocol/openid-connect/auth" in url for url, _ in routes.calls))

    def test_public_master_reference_in_console_environment_is_a_blocker(self):
        routes = FakeRoutes()
        routes.overrides[PRIVATE + check.CONSOLE_PATH] = check.Reply(200, {"content-type": "text/html"}, console_document(authServerUrl=PUBLIC))
        result = self.probe(routes)
        self.assertFalse(result["passed"])
        self.assertEqual(result["checks"]["privateConsoleDocument"]["code"], "master_or_admin_reference_uses_public_origin")
        self.assertEqual(result["checks"]["privateAssets"]["result"], "BLOCKED")

    def test_public_master_redirect_with_transient_values_is_not_followed_or_logged(self):
        routes = FakeRoutes()
        routes.overrides[PRIVATE + check.CONSOLE_PATH] = check.Reply(302, {
            "location": PUBLIC + "/realms/master/protocol/openid-connect/auth?state=do-not-record&code=secret"}, b"")
        result = self.probe(routes)
        self.assertEqual(result["checks"]["privateConsoleDocument"]["code"], "master_or_admin_reference_uses_public_origin")
        self.assertNotIn("do-not-record", json.dumps(result))
        self.assertNotIn("secret", json.dumps(result))
        self.assertFalse(any("?" in url for url, _ in routes.calls))

    def test_arbitrary_redirect_and_external_assets_are_never_requested(self):
        for location in ("https://untrusted.test/secret", "https://user:do-not-record@untrusted.test/secret"):
            routes = FakeRoutes()
            routes.overrides[PRIVATE + check.CONSOLE_PATH] = check.Reply(302, {"location": location}, b"")
            result = self.probe(routes)
            self.assertFalse(result["passed"])
            self.assertNotIn("do-not-record", json.dumps(result))
            self.assertFalse(any("untrusted.test" in url for url, _ in routes.calls))
        routes = FakeRoutes()
        body = console_document().replace(b'/resources/test/admin/keycloak.v2/main.js', b'https://untrusted.test/main.js')
        routes.overrides[PRIVATE + check.CONSOLE_PATH] = check.Reply(200, {"content-type": "text/html"}, body)
        self.assertFalse(self.probe(routes)["passed"])
        self.assertFalse(any("untrusted.test" in url for url, _ in routes.calls))

    def test_master_metadata_and_public_issuer_must_stay_exact(self):
        for endpoint, wrong in ((PRIVATE + "/realms/master/.well-known/openid-configuration", metadata(PUBLIC + "/realms/master")),
                                (ISSUER + "/.well-known/openid-configuration", metadata(PUBLIC + "/realms/another"))):
            routes = FakeRoutes()
            routes.overrides[endpoint] = json_reply(wrong)
            result = self.probe(routes)
            self.assertFalse(result["passed"])
            self.assertTrue(any(value.get("code") == "issuer_mismatch" for value in result["checks"].values()))
        routes = FakeRoutes()
        wrong = metadata(ISSUER)
        wrong["token_endpoint"] = "https://untrusted.test/token"
        routes.overrides[ISSUER + "/.well-known/openid-configuration"] = json_reply(wrong)
        self.assertFalse(self.probe(routes)["passed"])

    def test_successful_public_admin_path_does_not_pass_as_private_readiness(self):
        routes = FakeRoutes()
        routes.overrides[PUBLIC + "/admin/"] = check.Reply(200, {"content-type": "text/html"}, b"admin")
        result = self.probe(routes)
        self.assertEqual(result["checks"]["publicRestrictedPaths"]["code"], "public_restriction_unconfirmed")
        self.assertFalse(result["passed"])

    def test_missing_or_invalid_environment_and_asset_failures_are_not_accepted(self):
        for body in (b"<html>Authentication is loading</html>", console_document(realm="another"), console_document(authUrl=PRIVATE + "/wrong")):
            routes = FakeRoutes()
            routes.overrides[PRIVATE + check.CONSOLE_PATH] = check.Reply(200, {"content-type": "text/html"}, body)
            self.assertFalse(self.probe(routes)["passed"])
        routes = FakeRoutes()
        routes.overrides[PRIVATE + "/resources/test/admin/keycloak.v2/main.js"] = check.Reply(404, {}, b"do-not-record")
        result = self.probe(routes)
        self.assertEqual(result["checks"]["privateAssets"]["code"], "admin_asset_unavailable")
        self.assertNotIn("do-not-record", json.dumps(result))

    def test_uncertain_transport_and_deadline_cannot_leak_exception_details_or_pass(self):
        routes = FakeRoutes()
        routes.overrides[PRIVATE + check.CONSOLE_PATH] = OSError("do-not-record https://user:secret@internal/")
        result = self.probe(routes)
        self.assertFalse(result["passed"])
        self.assertNotIn("do-not-record", json.dumps(result))
        self.assertNotIn("user:secret", json.dumps(result))
        instance = check.ReadinessChecker(PRIVATE, "127.0.0.1", ISSUER, getter=routes)
        instance.deadline = 0
        before = len(routes.calls)
        with self.assertRaises(check.ProbeFailure) as failure:
            instance.get(PRIVATE + check.CONSOLE_PATH, private=True)
        self.assertEqual(failure.exception.code, "readiness_deadline_exceeded")
        self.assertEqual(before, len(routes.calls))

    def test_invalid_target_and_accidentally_supplied_secret_arguments_are_not_echoed(self):
        for value in ("https://console.example.test/?code=do-not-record", "https://user:do-not-record@console.example.test", "http://localhost:9443", "https://console.example.test/admin/"):
            with self.assertRaises(check.ProbeFailure):
                check.ReadinessChecker(value, "127.0.0.1", ISSUER)
        for target in ("8.8.8.8", "192.168.1.2", "localhost", "::ffff:127.0.0.1"):
            with self.assertRaises(check.ProbeFailure):
                check.ReadinessChecker(PRIVATE, target, ISSUER)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(check.main(["--token", "do-not-record"]), 2)
        self.assertNotIn("do-not-record", output.getvalue())


@unittest.skipUnless(shutil.which("openssl"), "openssl required for actual loopback TLS transport checks")
class LoopbackTLSTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="al-private-iam-tls-")
        folder = Path(cls.temporary.name)
        cls.cert = folder / "cert.pem"
        cls.key = folder / "key.pem"
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
                        "-keyout", str(cls.key), "-out", str(cls.cert), "-subj", "/CN=console.example.test",
                        "-addext", "subjectAltName=DNS:console.example.test"], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.requests = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                cls.requests.append((self.command, self.path, dict(self.headers)))
                self.send_response(200)
                self.send_header("content-type", "application/json")
                body = b'x' * 100 if self.path == "/large" else b'{"status":"fixture"}'
                self.send_header("content-length", str(len(body)))
                self.send_header("set-cookie", "private-do-not-record")
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_args):
                pass

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain(str(cls.cert), str(cls.key))
        cls.server.socket = context.wrap_socket(cls.server.socket, server_side=True)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)
        cls.temporary.cleanup()

    def test_actual_tls_keeps_hostname_verification_host_header_and_loopback_pin(self):
        context = ssl.create_default_context(cafile=str(self.cert))
        reply = check.get_reply(f"https://console.example.test:{self.port}/metadata", context=context,
                                timeout=2, max_body=100, connect_loopback="127.0.0.1")
        self.assertEqual(reply.status, 200)
        self.assertNotIn("set-cookie", reply.headers)
        method, path, headers = self.requests[-1]
        self.assertEqual((method, path), ("GET", "/metadata"))
        self.assertEqual(headers["Host"], f"console.example.test:{self.port}")
        self.assertNotIn("Authorization", headers)
        self.assertNotIn("Cookie", headers)

    def test_unknown_ca_and_wrong_hostname_fail_without_relaxing_tls(self):
        for origin, context in ((f"https://console.example.test:{self.port}/metadata", ssl.create_default_context()),
                                (f"https://wrong.example.test:{self.port}/metadata", ssl.create_default_context(cafile=str(self.cert)))):
            with self.assertRaises(check.ProbeFailure) as result:
                check.get_reply(origin, context=context, timeout=2, max_body=100, connect_loopback="127.0.0.1")
            self.assertEqual(result.exception.code, "tls_validation_failed")

    def test_oversized_real_https_body_and_insecure_context_are_refused(self):
        context = ssl.create_default_context(cafile=str(self.cert))
        with self.assertRaises(check.ProbeFailure) as result:
            check.get_reply(f"https://console.example.test:{self.port}/large", context=context,
                            timeout=2, max_body=16, connect_loopback="127.0.0.1")
        self.assertEqual(result.exception.code, "response_too_large")
        insecure = ssl._create_unverified_context()
        with self.assertRaises(check.ProbeFailure) as result:
            check.get_reply(f"https://console.example.test:{self.port}/metadata", context=insecure,
                            timeout=2, max_body=100, connect_loopback="127.0.0.1")
        self.assertEqual(result.exception.code, "tls_verification_required")


if __name__ == "__main__":
    unittest.main()
