"""Reproduce 14 source-anchored R4 SQL sequencing properties in isolated SQLite.

NOT D1/Worker/HTTP security validation or R5 feature acceptance. Creates only temp DBs.
Default: run in owned checkout, verify five immutable Git blob pins.
Optional legacy-SQL path: standalone reproduction, Worker source pins NOT verified.
"""
import hashlib
import json
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EXPLICIT_MIGRATION = len(sys.argv) > 1
MIGRATION = Path(sys.argv[1]) if EXPLICIT_MIGRATION else ROOT / "migrations/0009_private_client_galleries.sql"
SOURCE_PINS = {
    "migrations/0001_init.sql": "2e14fe142c6532981a702be2d6effc9cc81626ea",
    "worker/api/client-admin.ts": "56e78e4b055ee8f66b7f642bf871ef5ad0b71dd4",
    "worker/client/repository.ts": "74e11bf42ca07b775e5663d21fffc169a7534f48",
    "worker/utils/audit.ts": "d469e32627eab8764c0438395b646c2e3bd491c9",
}
PIN_0009 = "5281fc9b99ed85bf6e7751ad7eb11f8b5482df23"

def canonical(path):
    # Git for Windows may check out tracked SQL/TS as CRLF; pins refer to Git blobs.
    return path.read_bytes().replace(b"\r\n", b"\n")

def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

ddl = canonical(MIGRATION)
migration_blob = git_blob(ddl)
if migration_blob != PIN_0009:
    raise SystemExit(f"0009_SOURCE_DRIFT {migration_blob} expected {PIN_0009}")
verified = {}
if not EXPLICIT_MIGRATION:
    for rel, pin in SOURCE_PINS.items():
        value = git_blob(canonical(ROOT / rel))
        if value != pin:
            raise SystemExit(f"SOURCE_DRIFT {rel}: {value} expected {pin}")
        verified[rel] = value

cases = []
def expect(label, observed, expected):
    cases.append({"id": label, "observed": observed, "expected": expected,
                  "matched": observed == expected})

AUDIT_SCHEMA = """CREATE TABLE audit_log (
id TEXT PRIMARY KEY, actor_email TEXT NOT NULL, action TEXT NOT NULL,
entity_type TEXT NOT NULL, entity_id TEXT, data_json TEXT,
created_at TEXT NOT NULL);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);"""

def seeded(dbfile):
    db = sqlite3.connect(dbfile, isolation_level=None)
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=5000")
    db.executescript(ddl.decode("utf-8"))
    db.executescript(AUDIT_SCHEMA)
    db.execute("INSERT INTO client_accounts(id,name,email,password_hash,password_salt,password_iterations,created_at,updated_at) VALUES('A','A','a@example.invalid','fake','fake',310000,'t','t')")
    db.execute("INSERT INTO client_galleries(id,client_id,title,created_at,updated_at) VALUES('GA','A','ready album','t','t')")
    db.execute("INSERT INTO client_gallery_images(id,gallery_id,storage_key,original_filename,mime_type,size_bytes,position,status,created_at,updated_at) VALUES('IA','GA','synthetic:IA','ia.jpg','image/jpeg',2,0,'ready','t','t')")
    return db

PUBLISH_SQL = """UPDATE client_galleries
SET status='published',published_at=COALESCE(published_at,?),updated_at=?
WHERE id=? AND length(trim(title))>0
AND EXISTS(SELECT 1 FROM client_accounts c WHERE c.id=client_galleries.client_id AND c.disabled_at IS NULL)
AND EXISTS(SELECT 1 FROM client_gallery_images i WHERE i.id=client_galleries.cover_image_id
  AND i.gallery_id=client_galleries.id AND i.status='ready' AND i.deleted_at IS NULL)
RETURNING id"""
AUDIT_INSERT = """INSERT INTO audit_log(id,actor_email,action,entity_type,entity_id,data_json,created_at)
VALUES(?,?,?,?,?,?,?)"""
TRIGGER = """CREATE TRIGGER synthetic_audit_failure BEFORE INSERT ON audit_log
BEGIN SELECT RAISE(ABORT,'AUDIT_STORAGE_DOWN'); END;"""

# Worker R4 client-admin.ts checks eligible image in repository.ts first,
# but its separate cover UPDATE does not recheck eligibility.
with tempfile.TemporaryDirectory(prefix="r5-worker-cover-") as tmp:
    file = Path(tmp) / "cover.sqlite"
    admin = seeded(file)
    rival = sqlite3.connect(file, isolation_level=None)
    rival.execute("PRAGMA foreign_keys=ON")
    row = admin.execute("SELECT id FROM client_gallery_images WHERE gallery_id=? AND id=? AND status='ready' AND deleted_at IS NULL", ("GA","IA")).fetchone()
    expect("precheck_sees_ready", row[0] if row else None, "IA")
    rival.execute("UPDATE client_gallery_images SET deleted_at='t' WHERE id='IA'")
    rows = admin.execute("UPDATE client_galleries SET cover_image_id=?,updated_at=? WHERE id=?", ("IA","t2","GA")).rowcount
    expect("unconditional_cover_update_after_concurrent_delete", rows, 1)
    n = admin.execute("""SELECT count(*) FROM client_galleries g LEFT JOIN client_gallery_images i
      ON i.id=g.cover_image_id AND i.gallery_id=g.id AND i.status='ready' AND i.deleted_at IS NULL
      WHERE g.id='GA' AND g.cover_image_id IS NOT NULL AND i.id IS NULL""").fetchone()[0]
    expect("cover_points_to_noneligible_image", n, 1)
    expect("fk_check_cannot_detect_noneligible_cover", len(admin.execute("PRAGMA foreign_key_check").fetchall()), 0)
    rows = admin.execute("""UPDATE client_galleries SET cover_image_id=?,updated_at=?
      WHERE id=? AND EXISTS(SELECT 1 FROM client_gallery_images i
      WHERE i.id=? AND i.gallery_id=client_galleries.id
      AND i.status='ready' AND i.deleted_at IS NULL)""", ("IA","t3","GA","IA")).rowcount
    expect("counterfactual_guarded_update_rejects_changed_eligibility", rows, 0)
    rival.close()
    admin.close()

# R4 publish UPDATE...RETURNING commits before the separate writeAudit() INSERT.
with tempfile.TemporaryDirectory(prefix="r5-worker-publish-") as tmp:
    file = Path(tmp) / "publish.sqlite"
    admin = seeded(file)
    admin.execute("UPDATE client_galleries SET cover_image_id='IA' WHERE id='GA'")
    admin.executescript(TRIGGER)
    result = admin.execute(PUBLISH_SQL, ("t2","t2","GA")).fetchone()
    expect("publish_returns_id", result[0] if result else None, "GA")
    try:
        admin.execute(AUDIT_INSERT, ("a1","shared-password@punctum.invalid","client_gallery.published","client_gallery","GA",None,"t2"))
        failure = "NO_ERROR"
    except sqlite3.IntegrityError as exc:
        failure = str(exc)
    expect("separate_audit_insert_injected_failure", failure, "AUDIT_STORAGE_DOWN")
    expect("published_stays_after_failed_audit", admin.execute("SELECT status FROM client_galleries WHERE id='GA'").fetchone()[0], "published")
    expect("missing_audit_row", admin.execute("SELECT count(*) FROM audit_log").fetchone()[0], 0)
    admin.close()
    check = sqlite3.connect(file)
    expect("publication_survives_new_connection", check.execute("SELECT status FROM client_galleries WHERE id='GA'").fetchone()[0], "published")
    check.close()

# Counterfactual explicit SQL transaction; D1.batch must be tested separately.
with tempfile.TemporaryDirectory(prefix="r5-worker-audit-tx-") as tmp:
    file = Path(tmp) / "atomic.sqlite"
    admin = seeded(file)
    admin.execute("UPDATE client_galleries SET cover_image_id='IA' WHERE id='GA'")
    admin.executescript(TRIGGER)
    admin.execute("BEGIN IMMEDIATE")
    result = admin.execute(PUBLISH_SQL, ("t2","t2","GA")).fetchone()
    expect("counterfactual_atomic_update_started", result[0] if result else None, "GA")
    try:
        admin.execute(AUDIT_INSERT, ("a1","verified-operator@example.invalid","client_gallery.published","client_gallery","GA",None,"t2"))
        failure = "NO_ERROR"
    except sqlite3.IntegrityError as exc:
        failure = str(exc)
        admin.execute("ROLLBACK")
    expect("counterfactual_audit_insert_failure", failure, "AUDIT_STORAGE_DOWN")
    expect("counterfactual_publication_rolled_back", admin.execute("SELECT status FROM client_galleries WHERE id='GA'").fetchone()[0], "draft")
    expect("counterfactual_audit_empty", admin.execute("SELECT count(*) FROM audit_log").fetchone()[0], 0)
    admin.close()

output = {
    "kind": "SOURCE_PINNED_SQLITE_WORKER_SEQUENCE_NOT_D1_OR_R5_HOMOLOGATION",
    "sourceMigrationGitBlob": migration_blob,
    "sourcePinsVerifiedInCheckout": not EXPLICIT_MIGRATION,
    "verifiedSourceBlobs": verified,
    "sqliteVersion": sqlite3.sqlite_version,
    "matched": sum(c["matched"] for c in cases),
    "total": len(cases),
    "failed": [c["id"] for c in cases if not c["matched"]],
    "cases": cases,
    "actualWorkerOrD1Tests": 0,
}
print(json.dumps(output, ensure_ascii=False, indent=2))
raise SystemExit(0 if not output["failed"] else 1)
