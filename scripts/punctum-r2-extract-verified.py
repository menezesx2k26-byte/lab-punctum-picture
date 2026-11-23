#!/usr/bin/env python3
"""Fail-closed extraction of an authenticated R2 tar into a new private directory."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tarfile

EXPECTED_COUNT = 230
EXPECTED_BYTES = 372040548
IMAGE_MAX = 26214400
NAME = re.compile(r"objects/[0-9]{4}\.blob\Z")
DIGEST = re.compile(r"[0-9a-f]{64}\Z")


def extract_verified(archive_path, output_path, expected_count=EXPECTED_COUNT,
                     expected_bytes=EXPECTED_BYTES):
    source = Path(archive_path)
    root = Path(output_path)
    if not source.is_file() or source.is_symlink() or source.stat().st_size > 1073741824:
        raise ValueError("INVALID_PRIVATE_ARCHIVE")
    if not root.is_dir() or root.is_symlink() or (root.stat().st_mode & 0o077):
        raise ValueError("UNSAFE_PRIVATE_EXTRACT_TARGET")
    if any(root.iterdir()):
        raise ValueError("PRIVATE_EXTRACT_TARGET_NOT_EMPTY")

    with tarfile.open(source, "r:") as archive:
        names = {}
        for member in archive.getmembers():
            key = member.name.rstrip("/")
            if key in names or member.issym() or member.islnk():
                raise ValueError("UNSAFE_OR_DUPLICATE_TAR_ENTRY")
            if key == "objects" and member.isdir():
                names[key] = member
            elif key == "manifest.json" and member.isfile() and 50 <= member.size <= 1024 * 1024:
                names[key] = member
            elif NAME.fullmatch(key) and member.isfile() and 0 < member.size <= IMAGE_MAX:
                names[key] = member
            else:
                raise ValueError("UNEXPECTED_TAR_ENTRY")
        if "objects" not in names or "manifest.json" not in names:
            raise ValueError("INCOMPLETE_PRIVATE_ARCHIVE")
        raw = archive.extractfile(names["manifest.json"]).read(1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("MANIFEST_EXCEEDS_LIMIT")
        manifest = json.loads(raw)
        objects = manifest.get("objects")
        if (manifest.get("schema") != "punctum-r2-originals-private-v1" or
            manifest.get("bucket") != "punctum-picture-originals" or
            manifest.get("sourceReadOnly") is not True or
            manifest.get("objectCount") != expected_count or
            manifest.get("totalBytes") != expected_bytes or
            not isinstance(objects, list) or len(objects) != expected_count or
            len(names) != expected_count + 2):
            raise ValueError("SOURCE_PRIVATE_MANIFEST_MISMATCH")

        seen_keys = set()
        total = 0
        for index, obj in enumerate(objects):
            name = "objects/" + str(index).zfill(4) + ".blob"
            if (not isinstance(obj, dict) or obj.get("path") != name or
                not isinstance(obj.get("key"), str) or not obj["key"] or
                len(obj["key"].encode()) > 2048 or obj["key"] in seen_keys or
                not DIGEST.fullmatch(str(obj.get("sha256", ""))) or
                name not in names or not isinstance(obj.get("size"), int) or
                obj["size"] != names[name].size):
                raise ValueError("INVALID_PRIVATE_IMAGE_MANIFEST")
            seen_keys.add(obj["key"])
            total += obj["size"]
        if total != expected_bytes:
            raise ValueError("SOURCE_TOTAL_BYTES_MISMATCH")

        objects_dir = root / "objects"
        objects_dir.mkdir(mode=0o700)
        for index, obj in enumerate(objects):
            name = "objects/" + str(index).zfill(4) + ".blob"
            target = objects_dir / (str(index).zfill(4) + ".blob")
            hasher = hashlib.sha256()
            length = 0
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(fd, "wb") as dst, archive.extractfile(names[name]) as src:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        length += len(chunk)
                        if length > IMAGE_MAX:
                            raise ValueError("PRIVATE_OBJECT_SIZE_CAP")
                        hasher.update(chunk)
                        dst.write(chunk)
            except Exception:
                target.unlink(missing_ok=True)
                raise
            if length != obj["size"] or hasher.hexdigest() != obj["sha256"]:
                raise ValueError("PRIVATE_OBJECT_HASH_MISMATCH")
        manifest_path = root / "manifest.json"
        fd = os.open(manifest_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
        return {"status": "EXTRACTED_PRIVATE_ONLY", "objects": expected_count,
                "bytes": expected_bytes, "manifestSha256": hashlib.sha256(raw).hexdigest(),
                "productionReady": False, "dnsTouched": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--destination", required=True)
    arguments = parser.parse_args()
    try:
        print(json.dumps(extract_verified(arguments.archive, arguments.destination)))
    except Exception:
        print("PUNCTUM_R2_PRIVATE_EXTRACT_BLOCKED")
        raise SystemExit(1)
