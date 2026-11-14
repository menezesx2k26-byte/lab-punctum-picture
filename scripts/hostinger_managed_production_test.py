import json
import unittest
from hostinger_managed_production import import_receipt


class ManagedImportEvidenceTests(unittest.TestCase):
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
