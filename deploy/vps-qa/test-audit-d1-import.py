import importlib.util
import io
import json
import sqlite3
import tempfile
import unittest
import zipfile
from pathlib import Path
import hashlib
import os
from contextlib import closing


module_spec = importlib.util.spec_from_file_location(
    "punctum_d1_audit",
    Path(__file__).with_name("audit-d1-import.py"),
)
audit = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(audit)


class D1SnapshotAuditTests(unittest.TestCase):
    def make_zip(self, path, *, bad_checksum=False, bad_counts=False):
        script = "CREATE TABLE albums (id TEXT PRIMARY KEY); INSERT INTO albums VALUES ('synthetic');"
        data = script.encode()
        manifest = {
            "sha256": hashlib.sha256(data if not bad_checksum else b"incorrect").hexdigest(),
            "bytes": len(data),
            "rowCounts": {"albums": 2 if bad_counts else 1},
            "format": "punctum-d1-drive-backup-v1",
        }
        with zipfile.ZipFile(path, "w") as source:
            source.writestr("punctum-d1-current.sql", data)
            source.writestr("punctum-d1-current-manifest.json", json.dumps(manifest))

    def test_restored_sqlite_matches_fresh_manifest_and_remains_private(self):
        with tempfile.TemporaryDirectory() as root:
            archive = Path(root) / "backup.zip"
            destination = Path(root) / "private" / "snapshot.sqlite"
            self.make_zip(archive)
            result = audit.restore_audit(archive, destination)
            self.assertEqual(result["status"], "VERIFIED")
            self.assertEqual(result["rowCounts"]["albums"], 1)
            self.assertEqual(result["integrity"], "ok")
            self.assertEqual(result["foreignKeyViolations"], 0)
            with closing(sqlite3.connect(destination)) as database:
                self.assertEqual(database.execute("SELECT COUNT(*) FROM albums").fetchone()[0], 1)
            if os.name == "posix":
                self.assertEqual(destination.stat().st_mode & 0o077, 0)
            with self.assertRaises(FileExistsError):
                audit.restore_audit(archive, destination)

    def test_does_not_create_database_if_manifest_checksum_is_invalid(self):
        with tempfile.TemporaryDirectory() as root:
            archive, target = Path(root)/"backup.zip", Path(root)/"snapshot.sqlite"
            self.make_zip(archive, bad_checksum=True)
            with self.assertRaisesRegex(ValueError, "checksum"):
                audit.restore_audit(archive, target)
            self.assertFalse(target.exists())

    def test_rejects_mismatching_counts_and_does_not_keep_partial_restore(self):
        with tempfile.TemporaryDirectory() as root:
            archive, target = Path(root)/"backup.zip", Path(root)/"snapshot.sqlite"
            self.make_zip(archive, bad_counts=True)
            with self.assertRaisesRegex(ValueError, "row count"):
                audit.restore_audit(archive, target)
            self.assertFalse(target.exists())

    def test_refuses_undocumented_zip_members(self):
        with tempfile.TemporaryDirectory() as root:
            archive, target = Path(root)/"backup.zip", Path(root)/"snapshot.sqlite"
            self.make_zip(archive)
            with zipfile.ZipFile(archive, "a") as item:
                item.writestr("../escape", b"unsafe")
            with self.assertRaisesRegex(ValueError, "members"):
                audit.restore_audit(archive, target)
            self.assertFalse(target.exists())


if __name__ == "__main__":
    unittest.main()
