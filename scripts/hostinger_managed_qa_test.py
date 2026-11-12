import io
import shutil
import tempfile
import unittest
import zipfile
from pathlib import Path

import hostinger_managed_qa as qa


class RecoveryContractTests(unittest.TestCase):
    def test_recovery_archive_matches_the_verified_drive_backup(self):
        archive = qa.probe_archive(Path(__file__).resolve().parents[1])
        self.assertEqual(len(archive), 2384)
        self.assertEqual(qa.digest(archive), "918755f5d4c1ebb1064cafceb4dfbfc20491a309d47147c6fe6e57a2731a75ca")
        with zipfile.ZipFile(io.BytesIO(archive)) as source:
            self.assertEqual(source.namelist(), ["README.md", "app.mjs", "package.json", "server.mjs"])

    def test_changed_probe_cannot_be_mistaken_for_a_recovery_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "services/punctum-hostinger-qa"
            shutil.copytree(Path(__file__).resolve().parents[1] / "services/punctum-hostinger-qa", target)
            (target / "app.mjs").write_text("different probe")
            with self.assertRaisesRegex(ValueError, "backup digest"):
                qa.probe_archive(root)

    def test_upload_credentials_cannot_be_sent_to_an_unrelated_host(self):
        for url in ["http://srv2282-files.hstgr.io/upload", "https://hstgr.io.attacker.test/upload", "https://user:password@srv2282-files.hstgr.io/upload", "https://srv2282-files.hstgr.io/upload?token=secret"]:
            with self.assertRaises(ValueError):
                qa.upload_base(url)
        self.assertEqual(qa.upload_base("https://srv2282-files.hstgr.io/scope/upload/"), "https://srv2282-files.hstgr.io/scope/upload")

    def test_live_settings_must_still_describe_only_the_disposable_probe(self):
        qa.check_probe_settings(dict(qa.PROBE_SETTINGS), [])
        for field, value in [("entry_file", "other.mjs"), ("build_script", "deploy"), ("node_version", 22)]:
            settings = dict(qa.PROBE_SETTINGS)
            settings[field] = value
            with self.assertRaises(ValueError):
                qa.check_probe_settings(settings, [])
        with self.assertRaises(ValueError):
            qa.check_probe_settings(dict(qa.PROBE_SETTINGS), [{"name": "UNEXPECTED_ENV"}])


if __name__ == "__main__":
    unittest.main()
