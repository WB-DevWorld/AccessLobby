import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).with_name("render-client.py")
spec = importlib.util.spec_from_file_location("render_client", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ClientRegistrationTests(unittest.TestCase):
    def test_distinct_client_keeps_generic_contract(self):
        client = module.representation("sample-portal", "https://portal.example.test/auth/callback", "https://portal.example.test/")
        self.assertEqual(client["redirectUris"], ["https://portal.example.test/auth/callback"])
        self.assertEqual(client["attributes"]["pkce.code.challenge.method"], "S256")
        self.assertEqual(client["protocolMappers"][0]["config"]["included.client.audience"], "accesslobby-api")
        self.assertFalse(client["implicitFlowEnabled"])

    def test_rejects_wildcards_untrusted_http_and_cross_origin_logout(self):
        for callback, logout in [
            ("https://*.example.test/callback", "https://example.test/"),
            ("http://example.test/callback", "http://example.test/"),
            ("https://portal.example.test/callback", "https://other.example.test/"),
        ]:
            with self.subTest(callback=callback):
                with self.assertRaises(ValueError):
                    module.representation("sample-portal", callback, logout)

    def test_local_development_and_reserved_id(self):
        self.assertEqual(module.representation("sample-portal", "http://localhost:4000/callback", "http://localhost:4000/")["clientId"], "sample-portal")
        with self.assertRaises(ValueError):
            module.representation("accesslobby-api", "http://localhost:4000/callback", "http://localhost:4000/")


if __name__ == "__main__":
    unittest.main()
