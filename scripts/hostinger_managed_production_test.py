import json
import unittest
import io
import pathlib
import subprocess
import tempfile
import zipfile
from hostinger_managed_production import import_receipt
from hostinger_candidate_qa import candidate_archive


class ManagedImportEvidenceTests(unittest.TestCase):
    def test_recovery_archive_reads_exact_historical_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            entry = root / 'services/punctum-hostinger-node/server.mjs'
            entry.parent.mkdir(parents=True)
            entry.write_bytes(b'historical source\n')
            (root / '.env').write_bytes(b'private fixture\n')
            subprocess.run(['git', 'init', '-q', directory], check=True)
            subprocess.run(['git', '-c', 'core.autocrlf=false', 'add', '.'], cwd=root, check=True)
            subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
                'commit', '-qm', 'fixture'], cwd=root, check=True)
            revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip()
            entry.write_bytes(b'edited worktree\n')
            archive, _ = candidate_archive(root, ['.env', 'services/punctum-hostinger-node/server.mjs'], revision=revision)
            with zipfile.ZipFile(io.BytesIO(archive)) as package:
                self.assertEqual(package.read('services/punctum-hostinger-node/server.mjs'), b'historical source\n')
                self.assertNotIn('.env', package.namelist())
            with self.assertRaises(ValueError):
                candidate_archive(root, [], revision='HEAD')

    def test_receipt_requires_target_content_integrity(self):
        expected = {'objects': 2, 'bytes': 123, 'cipherSha256': 'a' * 64,
                    'tables': {'images': {'rows': 2, 'sha256': 'b' * 64}}}
        receipt = {**expected, 'integrity': 'ok', 'missingReady': 0}
        logs = {'items': [{'message': 'build: PUNCTUM_MANAGED_IMPORT ' + json.dumps(receipt)}]}
        self.assertEqual(import_receipt(logs, expected), receipt)
        with self.assertRaises(AssertionError):
            import_receipt(logs, {**expected, 'objects': 3})
        with self.assertRaises(AssertionError):
            import_receipt({'items': ['build completed']}, expected)


if __name__ == '__main__':
    unittest.main()
