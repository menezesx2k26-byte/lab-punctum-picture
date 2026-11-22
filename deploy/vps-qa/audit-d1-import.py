"""Validate a private D1 SQL export in a separate, never-served SQLite database.

This command does not copy data into the website's synthetic QA database.
It neither reads nor changes Cloudflare production.
"""
import hashlib
from contextlib import closing
import json
import os
import sqlite3
import sys
from pathlib import Path
import zipfile

EXPECTED_FILES = {"punctum-d1-current.sql", "punctum-d1-current-manifest.json"}


def restore_audit(archive: Path, destination: Path) -> dict:
    archive = Path(archive)
    destination = Path(destination)
    if destination.exists():
        raise FileExistsError("Refusing to overwrite an existing private snapshot")
    with zipfile.ZipFile(archive) as source:
        if set(source.namelist()) != EXPECTED_FILES or len(source.namelist()) != 2:
            raise ValueError("Unexpected artifact members")
        sql = source.read("punctum-d1-current.sql")
        manifest = json.loads(source.read("punctum-d1-current-manifest.json"))
    if (manifest.get("format") != "punctum-d1-drive-backup-v1"
            or not isinstance(manifest.get("rowCounts"), dict)
            or manifest.get("bytes") != len(sql)
            or hashlib.sha256(sql).hexdigest() != manifest.get("sha256")):
        raise ValueError("D1 SQL/manifest checksum, format or size mismatch")

    destination.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(destination.parent, 0o700)
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    try:
        with closing(sqlite3.connect(destination)) as connection:
            with connection:
                connection.executescript(sql.decode("utf-8-sig"))
                integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
                fk = connection.execute("PRAGMA foreign_key_check").fetchall()
                counts = {}
                for table, expected in manifest["rowCounts"].items():
                    if not isinstance(table, str) or not table.replace("_", "").isalnum():
                        raise ValueError("Unrecognized table name in the D1 manifest")
                    count = connection.execute('SELECT COUNT(*) FROM "' + table + '"').fetchone()[0]
                    if count != expected:
                        raise ValueError(f"D1 row count mismatch for {table}")
                    counts[table] = count
                if integrity != "ok" or fk:
                    raise ValueError("SQLite integrity or foreign-key verification failed")
        os.chmod(destination, 0o600)
        return {
            "status": "VERIFIED",
            "sqlSha256": manifest["sha256"],
            "sqlBytes": len(sql),
            "rowCounts": counts,
            "integrity": integrity,
            "foreignKeyViolations": len(fk),
            "snapshotPath": destination.name,
            "sourceTouched": False,
            "servedByWeb": False,
        }
    except BaseException:
        destination.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: audit-d1-import.py <private-artifact.zip> <unused-private-snapshot.sqlite>")
    output = restore_audit(Path(sys.argv[1]), Path(sys.argv[2]))
    print(json.dumps(output, sort_keys=True))
