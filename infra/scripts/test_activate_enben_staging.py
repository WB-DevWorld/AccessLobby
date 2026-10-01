import importlib.util
import io
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('enben_activation', Path(__file__).with_name('activate-enben-staging.py'))
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


class ActivationBoundaries(unittest.TestCase):
    def test_bad_or_missing_review_never_reads_credentials(self):
        for reference in ['x', 'review with spaces', '$(print-secret)']:
            with patch.object(tool.os, 'geteuid', return_value=0), patch.object(tool.subprocess, 'run') as runner:
                with self.assertRaisesRegex(ValueError, 'recorded first-party review'):
                    tool.main(['--activate', '--review-reference', reference, '--backup', '/not-used'])
                runner.assert_not_called()

    def test_explicit_activation_and_root_are_required_before_docker(self):
        with patch.object(tool.subprocess, 'run') as runner:
            with self.assertRaisesRegex(ValueError, '--activate'):
                tool.main(['--review-reference', 'actual-review', '--backup', '/not-used'])
            with patch.object(tool.os, 'geteuid', return_value=1000):
                with self.assertRaisesRegex(ValueError, 'root VPS'):
                    tool.main(['--activate', '--review-reference', 'actual-review', '--backup', '/not-used'])
            runner.assert_not_called()

    def test_backup_must_be_current_private_regular_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'identity.dump'
            archive.write_bytes(b'PGDMPtest')
            archive.chmod(0o600)
            with patch.object(tool.os, 'geteuid', return_value=0):
                # The test runner may be unprivileged; patch only recorded ownership.
                original = archive.lstat()
                from types import SimpleNamespace
                metadata = SimpleNamespace(st_mode=original.st_mode, st_uid=0, st_size=original.st_size, st_mtime=time.time())
                with patch.object(tool.Path, 'lstat', return_value=metadata):
                    tool.private_backup(str(archive))
                    metadata.st_mode |= 0o040
                    with self.assertRaisesRegex(ValueError, 'root-only'):
                        tool.private_backup(str(archive))
                    metadata.st_mode = original.st_mode
                    metadata.st_mtime -= 90000
                    with self.assertRaisesRegex(ValueError, 'current backup'):
                        tool.private_backup(str(archive))


if __name__ == '__main__':
    unittest.main()
