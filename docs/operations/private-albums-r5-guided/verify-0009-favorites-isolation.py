"""Read-only, in-memory SQLite proof of the legacy 0009 favorite ownership gap.

Run on a verified clone: python docs/operations/private-albums-r5-guided/verify-0009-favorites-isolation.py
Run with an external pinned SQL copy: python verify-0009-favorites-isolation.py --migration /path/to/0009.sql
A reproduction of schema properties, never a D1/Worker R5 acceptance test.
"""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path

EXPECTED_GIT_BLOB = "5281fc9b99ed85bf6e7751ad7eb11f8b5482df23"


def execute(migration: Path) -> dict:
    sql_bytes = migration.read_bytes().replace(b"\r\n", b"\n")
    git_blob = hashlib.sha1(b"blob " + str(len(sql_bytes)).encode() + b"\0" + sql_bytes).hexdigest()
    if git_blob != EXPECTED_GIT_BLOB:
        raise RuntimeError(f"Migration blob drift: expected {EXPECTED_GIT_BLOB}, got {git_blob}")
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(sql_bytes.decode("utf-8"))
    for client in ("A", "B"):
        db.execute(
            "INSERT INTO client_accounts(id,name,email,password_hash,password_salt,password_iterations,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
            (client, client, client.lower()+"@example.invalid", "fake", "fake", 310000, "now", "now"),
        )
        db.execute(
            "INSERT INTO client_galleries(id,client_id,title,created_at,updated_at) VALUES (?,?,?,?,?)",
            ("G"+client, client, "Synthetic", "now", "now"),
        )
        db.execute(
            "INSERT INTO client_gallery_images(id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
            ("I"+client, "G"+client, "synthetic-"+client, "test.jpg", "image/jpeg", 2, 0, "now", "now"),
        )

    def insert(label: str, client: str, gallery: str, image: str) -> dict:
        try:
            db.execute(
                "INSERT INTO client_gallery_favorites(client_id,gallery_id,image_id,created_at) VALUES (?,?,?,?)",
                (client, gallery, image, "now"),
            )
            return {"name": label, "accepted": True}
        except sqlite3.IntegrityError as exc:
            return {"name": label, "accepted": False, "error": str(exc)}

    cases = [
        insert("owner_A_own_gallery", "A", "GA", "IA"),
        insert("cross_tenant_B_to_gallery_A", "B", "GA", "IA"),
        insert("mismatched_image_gallery", "B", "GA", "IB"),
        insert("unknown_account", "C", "GA", "IA"),
    ]
    def set_cover(label: str, image: str) -> dict:
        try:
            db.execute("UPDATE client_galleries SET cover_image_id=? WHERE id=?", (image, "GA"))
            return {"name": label, "accepted": True}
        except sqlite3.IntegrityError as exc:
            return {"name": label, "accepted": False, "error": str(exc)}

    cases.extend([
        set_cover("owner_A_cover_own_image", "IA"),
        set_cover("cross_gallery_cover_A_image_B", "IB"),
    ])
    expected = [True, True, False, False, True, True]
    fk_violations = db.execute("PRAGMA foreign_key_check").fetchall()
    success = [x["accepted"] for x in cases] == expected and not fk_violations
    return {
        "kind": "EXACT_LEGACY_DDL_SQLITE_MEMORY_PROBE_NOT_CLOUDFLARE_D1",
        "sqlGitBlob": git_blob,
        "sqlSha256": hashlib.sha256(sql_bytes).hexdigest(),
        "sqliteVersion": sqlite3.sqlite_version,
        "foreignKeysEnabled": bool(db.execute("PRAGMA foreign_keys").fetchone()[0]),
        "cases": cases,
        "checksMatched": sum(x["accepted"] == y for x, y in zip(cases, expected)),
        "checksTotal": len(expected),
        "foreignKeyViolations": fk_violations,
        "expectedLegacyCrossTenantFavoriteAccepted": cases[1]["accepted"],
        "expectedLegacyCrossGalleryCoverAccepted": cases[5]["accepted"],
        "result": "REPRODUCED_EXPECTED_LEGACY_SCHEMA_GAP" if success else "UNEXPECTED_SCHEMA_BEHAVIOR",
        "productTestsRun": 0,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--migration", type=Path, default=None)
    args = parser.parse_args()
    migration = args.migration if args.migration is not None else Path(__file__).resolve().parents[3] / "migrations/0009_private_client_galleries.sql"
    result = execute(migration)
    print(json.dumps(result, indent=2))
    return 0 if result["result"] == "REPRODUCED_EXPECTED_LEGACY_SCHEMA_GAP" else 1


if __name__ == "__main__":
    raise SystemExit(main())
