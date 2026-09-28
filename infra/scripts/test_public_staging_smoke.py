import importlib.util
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


MODULE_PATH = Path(__file__).with_name("public-staging-smoke.py")
SPEC = importlib.util.spec_from_file_location("public_staging_smoke", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class PublicStagingSmokeTests(unittest.TestCase):
    def test_public_https_origins_are_normalised(self) -> None:
        self.assertEqual(
            MODULE._normalise_origin("https://accesslobby.example.test/", "web"),
            "https://accesslobby.example.test",
        )
        self.assertEqual(
            MODULE._normalise_origin(
                "https://iam.example.test/realms/accesslobby-first-party/",
                "issuer",
                allow_path=True,
            ),
            "https://iam.example.test/realms/accesslobby-first-party",
        )

    def test_insecure_or_private_literal_origins_are_rejected(self) -> None:
        for value in (
            "http://accesslobby.example.test",
            "https://127.0.0.1",
            "https://10.0.0.4",
            "https://[::1]",
            "https://user:secret@example.test",
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                MODULE._normalise_origin(value, "origin")

    def test_discovery_requires_exact_issuer_and_https_endpoints(self) -> None:
        issuer = "https://iam.example.test/realms/accesslobby-first-party"
        document = {
            "issuer": issuer,
            "authorization_endpoint": f"{issuer}/protocol/openid-connect/auth",
            "token_endpoint": f"{issuer}/protocol/openid-connect/token",
            "jwks_uri": f"{issuer}/protocol/openid-connect/certs",
            "end_session_endpoint": f"{issuer}/protocol/openid-connect/logout",
        }
        MODULE.validate_discovery(document, issuer)
        with self.assertRaises(MODULE.SmokeFailure):
            MODULE.validate_discovery({**document, "issuer": "https://wrong.example.test"}, issuer)
        with self.assertRaises(MODULE.SmokeFailure):
            MODULE.validate_discovery({**document, "jwks_uri": "http://iam.example.test/certs"}, issuer)

    def test_jwks_requires_an_identifiable_rsa_key(self) -> None:
        MODULE.validate_jwks({"keys": [{"kty": "RSA", "kid": "signing-key"}]})
        for invalid in ({}, {"keys": []}, {"keys": [{"kty": "EC", "kid": "other"}]}, {"keys": [{"kty": "RSA"}]}):
            with self.subTest(invalid=invalid), self.assertRaises(MODULE.SmokeFailure):
                MODULE.validate_jwks(invalid)

    def test_registration_auth_url_uses_pkce_and_prompt_create(self) -> None:
        issuer = "https://iam.example.test/realms/accesslobby-first-party"
        url = MODULE._auth_url(
            issuer,
            "accesslobby-web",
            "https://accesslobby.example.test/auth/callback",
            register=True,
        )
        query = parse_qs(urlsplit(url).query)
        self.assertEqual(query["client_id"], ["accesslobby-web"])
        self.assertEqual(query["prompt"], ["create"])
        self.assertEqual(query["code_challenge_method"], ["S256"])
        self.assertEqual(len(query["code_challenge"][0]), 43)


if __name__ == "__main__":
    unittest.main()
