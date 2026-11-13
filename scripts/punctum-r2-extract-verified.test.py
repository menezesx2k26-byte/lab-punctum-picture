import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("r2_extract", HERE / "punctum-r2-extract-verified.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class R2TarExtractionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="punctum-r2-extract-")
        self.root = Path(self.tmp.name)
        self.tar = self.root / "encrypted-receiver-test.tar"
        self.output = self.root / "unpacked"
        self.output.mkdir(mode=0o700)
        self.jpeg = bytes.fromhex("ffd8ffe000000000")
        self.digest = hashlib.sha256(self.jpeg).hexdigest()
        self.manifest = {
            "schema": "punctum-r2-originals-private-v1",
            "bucket": "punctum-picture-originals",
            "sourceReadOnly": True, "objectCount": 1,
            "totalBytes": len(self.jpeg),
            "objects": [{
                "key": "originals/synthetic/id.jpg",
                "path": "objects/0000.blob",
                "size": len(self.jpeg),
                "sha256": self.digest,
                "contentType": "image/jpeg",
            }],
        }

    def tearDown(self):
        self.tmp.cleanup()

    def make_tar(self, extras=(), manifest=None, blob=None):
        private_manifest = json.dumps(manifest or self.manifest).encode()
        private_blob = self.jpeg if blob is None else blob
        with tarfile.open(self.tar, "w") as tar:
            obj = tarfile.TarInfo("objects")
            obj.type = tarfile.DIRTYPE
            obj.mode = 0o700
            tar.addfile(obj)
            for name, data in [("manifest.json", private_manifest),
                               ("objects/0000.blob", private_blob), *extras]:
                entry = tarfile.TarInfo(name)
                entry.mode = 0o600
                entry.size = len(data)
                tar.addfile(entry, io.BytesIO(data))

    def test_valid_fixture_extracted_owner_only_with_exact_digest(self):
        self.make_tar()
        outcome = module.extract_verified(self.tar, self.output, 1, len(self.jpeg))
        self.assertEqual(outcome["objects"], 1)
        self.assertEqual(outcome["bytes"], len(self.jpeg))
        self.assertFalse(outcome["productionReady"])
        self.assertEqual((self.output / "objects/0000.blob").read_bytes(), self.jpeg)
        self.assertEqual((self.output / "objects/0000.blob").stat().st_mode & 0o077, 0)
        with self.assertRaisesRegex(ValueError, "TARGET_NOT_EMPTY"):
            module.extract_verified(self.tar, self.output, 1, len(self.jpeg))

    def test_rejects_modified_payload(self):
        self.make_tar(blob=b"12345678")
        with self.assertRaisesRegex(ValueError, "HASH_MISMATCH"):
            module.extract_verified(self.tar, self.output, 1, len(self.jpeg))

    def test_rejects_path_traversal(self):
        self.make_tar(extras=[("../danger", b"x")])
        with self.assertRaisesRegex(ValueError, "UNEXPECTED_TAR_ENTRY"):
            module.extract_verified(self.tar, self.output, 1, len(self.jpeg))
        self.assertFalse((self.root / "danger").exists())

    def test_rejects_missing_or_forged_manifest_entry(self):
        forged = dict(self.manifest)
        forged["objects"] = [{**self.manifest["objects"][0], "path": "objects/0001.blob"}]
        self.make_tar(manifest=forged)
        with self.assertRaisesRegex(ValueError, "INVALID_PRIVATE_IMAGE_MANIFEST"):
            module.extract_verified(self.tar, self.output, 1, len(self.jpeg))

    def test_rejects_symlink_and_non_private_directory(self):
        self.make_tar()
        os.chmod(self.output, 0o755)
        with self.assertRaisesRegex(ValueError, "UNSAFE_PRIVATE_EXTRACT_TARGET"):
            module.extract_verified(self.tar, self.output, 1, len(self.jpeg))

if __name__ == "__main__":
    unittest.main()
