import importlib.util
import pathlib
import unittest

path = pathlib.Path(__file__).with_name('plan-onboarding.py')
spec = importlib.util.spec_from_file_location('plan_onboarding', path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
ISSUER = 'https://iam.example.test/realms/accesslobby-first-party'


class OnboardingBoundaryTests(unittest.TestCase):
    def test_person_and_organization_do_not_create_realms_or_app_grants(self):
        for action in ('register-person', 'create-organization'):
            with self.subTest(action=action):
                result = module.plan({'action': action, 'issuer': ISSUER})
                self.assertFalse(result['realmCreation'])
                self.assertEqual(result['applicationAdmission'], 'not-implied')

    def test_application_uses_client_in_existing_realm(self):
        result = module.plan({'action': 'register-application', 'issuer': ISSUER,
                              'clientId': 'sample-app',
                              'redirectUri': 'https://sample.example.test/callback',
                              'logoutUri': 'https://sample.example.test/'})
        self.assertFalse(result['realmCreation'])
        self.assertEqual(result['clientRepresentation']['clientId'], 'sample-app')
        self.assertEqual(result['clientRepresentation']['attributes']['pkce.code.challenge.method'], 'S256')
        self.assertEqual(result['applicationAdmission'], 'separate-policy-required')

    def test_new_trust_domain_never_auto_creates_realm(self):
        result = module.plan({'action': 'new-trust-domain', 'issuer': ISSUER})
        self.assertFalse(result['realmCreation'])
        self.assertEqual(result['realmAction'], 'review-trust-domain')

    def test_rejects_other_realms_and_unsafe_clients(self):
        with self.assertRaises(ValueError):
            module.plan({'action': 'create-organization', 'issuer': 'https://iam.example.test/realms/org-1'})
        with self.assertRaises(ValueError):
            module.plan({'action': 'register-application', 'issuer': ISSUER,
                         'clientId': 'sample-app', 'redirectUri': 'https://*.example.test/callback',
                         'logoutUri': 'https://sample.example.test/'})
        with self.assertRaisesRegex(ValueError, 'logoutUri'):
            module.plan({'action': 'register-application', 'issuer': ISSUER,
                         'clientId': 'sample-app', 'redirectUri': 'https://sample.example.test/callback'})


if __name__ == '__main__':
    unittest.main()
