"""Safety boundaries for the imported host-changing fixture; no Docker or CA changes."""
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('fixture_https', Path(__file__).parents[1] / 'scripts/fixture_https.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)

class FixtureSafety(unittest.TestCase):
    def test_browser_tls_gate_rejects_unverified_or_unrelated_certificates(self):
        expected={'verification':'verified','issuer':'AccessLobby Fixture CA','protocol':'TLS 1.3','subjectName':'a.alwp.test'}
        fixture.assert_browser_tls(expected)
        for patch_value in [{'verification':'rejected'},{'issuer':'Unrelated CA'},
                            {'protocol':'TLS 1.1'},{'subjectName':'unrelated.example'}]:
            with self.assertRaises(RuntimeError):
                fixture.assert_browser_tls({**expected, **patch_value})
        self.assertEqual(fixture.browser_tls('TLS_BROWSER {"verification":"verified"}')['verification'],'verified')
        with self.assertRaises(RuntimeError):
            fixture.browser_tls('BROWSER_PASS')

    @unittest.skipUnless(shutil.which('node'), 'Generated JavaScript syntax needs Node')
    def test_generated_onboarding_runner_is_valid_javascript(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            with patch.object(fixture, 'run'), patch.object(fixture, 'wait_https'), \
                 patch.object(fixture, 'git_sha', return_value='synthetic-source'):
                fixture.prepare_api(root, root, 'synthetic-network', 'postgres://fixture',
                    'https://auth.alwp.test:8443/realms/accesslobby-first-party', [], root/'ca.crt', 'synthetic-only')
            result = subprocess.run(['node','--check',str(root/'api-seed.mjs')], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_api_diagnostics_allow_only_bounded_categorical_markers(self):
        self.assertTrue(fixture.safe_api_marker('API_FIXTURE_FAILURE operator-auth TypeError unclassified ENOTFOUND'))
        self.assertTrue(fixture.safe_api_marker('API_FIXTURE_PHASE iam-provision'))
        self.assertTrue(fixture.safe_api_marker('API_FIXTURE_HTTP 401'))
        for line in ['Bearer private-token', 'Error: postgres://user:secret@host/db',
                     'API_FIXTURE_PHASE operator-auth token=secret',
                     'API_FIXTURE_FAILURE iam-provision Error unclassified https://private/callback?code=secret']:
            self.assertFalse(fixture.safe_api_marker(line))

    def test_missing_explicit_authorization_has_no_side_effect(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(fixture, 'map_fixture_names') as mapping:
            with self.assertRaises(SystemExit):
                fixture.main(None, None, None, None)
            mapping.assert_not_called()

    def test_failed_preflight_never_removes_foreign_named_resources(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name); plugin = root / 'plugin'; plugin.mkdir()
            # Missing package is intentional: reporting must not mask preflight or run cleanup.
            args = SimpleNamespace(package=root / 'absent.zip', keep=False)
            with patch.dict(os.environ, {'ALWP_DISPOSABLE_FIXTURE':'1'}), \
                 patch.object(fixture, 'map_fixture_names'), \
                 patch.object(fixture, 'preflight', side_effect=SystemExit('Foreign resource refused')), \
                 patch.object(fixture.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='test-source')) as commands, \
                 patch.object(fixture.subprocess, 'check_output', return_value=''):
                with self.assertRaises(SystemExit):
                    fixture.main(args, plugin, root, root)
                for call in commands.call_args_list:
                    self.assertNotIn('docker', call.args[0])
                self.assertTrue((plugin / 'dist/https-qualification-report.json').exists())

if __name__ == '__main__':
    unittest.main()
