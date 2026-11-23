import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ensureUnlimitedCandidateStorage } from "./unlimited-bootstrap.mjs";
import { productionStageApplicationId } from "./sqlite.mjs";

const migrationsDir = new URL("../../migrations/", import.meta.url);

test("ensureUnlimitedCandidateStorage initializes fresh 0700/0600 storage with migrations 0001..0016 and Clerk admin link idempotently", (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-unlimited-bs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const storageRoot = join(root, "punctum-managed-storage", "punctum-unlimited-r4");
  const dbFile = join(storageRoot, "application.sqlite");
  const originals = join(storageRoot, "originals");
  const backups = join(storageRoot, "backups");

  const receipt1 = ensureUnlimitedCandidateStorage({
    PUNCTUM_CANDIDATE_DB_FILE: dbFile,
    PUNCTUM_CANDIDATE_ORIGINALS: originals,
    PUNCTUM_CANDIDATE_BACKUPS_ROOT: backups,
    PUNCTUM_CANDIDATE_ADMIN_EMAIL: "studio@punctumpicture.com",
    PUNCTUM_CANDIDATE_CLERK_ADMIN_USER_ID: "user_3M7epRZWjA3wg33n8xOk9ddeOzg",
    PUNCTUM_QA_SOURCE_SHA: "a".repeat(40),
  });

  assert.equal(receipt1.status, "PUNCTUM_UNLIMITED_BOOTSTRAP_VERIFIED");
  assert.equal(receipt1.createdDatabase, true);
  assert.equal(receipt1.hasLayoutPresetColumn, true);
  assert.equal(receipt1.adminClerkLinked, true);
  assert.equal(receipt1.integrity, "ok");
  assert.equal(receipt1.sourceSha, "a".repeat(40));

  for (const dir of [storageRoot, originals, backups]) {
    assert.equal(statSync(dir).mode & 0o077, 0, `${dir} must be 0700`);
  }
  assert.equal(statSync(dbFile).mode & 0o077, 0, "sqlite file must be 0600");

  // Seed a client + private gallery (cinema preset) and verify second bootstrap preserves data
  const db = new DatabaseSync(dbFile, { enableForeignKeyConstraints: true });
  const now = new Date().toISOString();
  const clientId = randomUUID();
  const galleryId = randomUUID();
  try {
    assert.equal(db.prepare("PRAGMA application_id").get().application_id, productionStageApplicationId);
    const cols = db.prepare("PRAGMA table_info(client_galleries)").all().map((r) => r.name);
    assert(cols.includes("layout_preset"));

    const link = db.prepare("SELECT clerk_user_id, admin_principal_id, role, disabled_at FROM clerk_admin_identity_links WHERE clerk_user_id=?").get("user_3M7epRZWjA3wg33n8xOk9ddeOzg");
    assert.deepEqual({ ...link }, {
      clerk_user_id: "user_3M7epRZWjA3wg33n8xOk9ddeOzg",
      admin_principal_id: "studio@punctumpicture.com",
      role: "admin",
      disabled_at: null,
    });

    db.prepare(
      `INSERT INTO client_accounts (id,name,email,password_hash,password_salt,password_iterations,must_change_password,session_version,created_at,updated_at)
       VALUES (?,?,?, 'ACCESS_ONLY', 'ACCESS_ONLY', 310000, 0, 1, ?, ?)`,
    ).run(clientId, "Cliente Persistencia", "persistencia@example.test", now, now);
    db.prepare(
      `INSERT INTO client_galleries (id,client_id,title,introduction,theme,layout_preset,cover_image_id,allow_downloads,status,created_at,updated_at)
       VALUES (?,?,?,?, 'ivory', 'cinema', NULL, 1, 'draft', ?, ?)`,
    ).run(galleryId, clientId, "Ensaio Cinema", "", now, now);
  } finally {
    db.close();
  }

  const receipt2 = ensureUnlimitedCandidateStorage({
    PUNCTUM_CANDIDATE_DB_FILE: dbFile,
    PUNCTUM_CANDIDATE_ORIGINALS: originals,
    PUNCTUM_CANDIDATE_BACKUPS_ROOT: backups,
    PUNCTUM_CANDIDATE_ADMIN_EMAIL: "studio@punctumpicture.com",
    PUNCTUM_CANDIDATE_CLERK_ADMIN_USER_ID: "user_3M7epRZWjA3wg33n8xOk9ddeOzg",
    PUNCTUM_QA_SOURCE_SHA: "b".repeat(40),
  });
  assert.equal(receipt2.createdDatabase, false);
  assert.equal(receipt2.adminClerkLinked, true);
  assert.equal(receipt2.hasLayoutPresetColumn, true);

  const dbAfter = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const row = dbAfter.prepare("SELECT title, layout_preset FROM client_galleries WHERE id=?").get(galleryId);
    assert.deepEqual({ ...row }, { title: "Ensaio Cinema", layout_preset: "cinema" });
  } finally {
    dbAfter.close();
  }
});

test("ensureUnlimitedCandidateStorage additively migrates pre-0016 database without losing rows", (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-unlimited-legacy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const storageRoot = join(root, "private");
  mkdirSync(storageRoot, { mode: 0o700 });
  const dbFile = join(storageRoot, "application.sqlite");
  const legacyDb = new DatabaseSync(dbFile, { enableForeignKeyConstraints: true });
  const clientId = randomUUID();
  const galleryId = randomUUID();
  const now = new Date().toISOString();
  try {
    legacyDb.exec(`PRAGMA application_id = ${productionStageApplicationId};`);
    for (const file of readdirSync(migrationsDir).filter((n) => /^\d{4}_/.test(n) && !n.startsWith("0016_")).sort()) {
      legacyDb.exec(readFileSync(new URL(file, migrationsDir), "utf8"));
    }
    legacyDb.prepare(
      `INSERT INTO client_accounts (id,name,email,password_hash,password_salt,password_iterations,must_change_password,session_version,created_at,updated_at)
       VALUES (?,?,?, 'ACCESS_ONLY', 'ACCESS_ONLY', 310000, 0, 1, ?, ?)`,
    ).run(clientId, "Legacy Client", "legacy@example.test", now, now);
    legacyDb.prepare(
      `INSERT INTO client_galleries (id,client_id,title,introduction,theme,cover_image_id,allow_downloads,status,created_at,updated_at)
       VALUES (?,?,?, '', 'noir', NULL, 0, 'published', ?, ?)`,
    ).run(galleryId, clientId, "Legacy Album", now, now);
  } finally {
    legacyDb.close();
  }
  chmodSync(dbFile, 0o600);

  const receipt = ensureUnlimitedCandidateStorage({
    PUNCTUM_CANDIDATE_DB_FILE: dbFile,
    PUNCTUM_CANDIDATE_ORIGINALS: join(storageRoot, "originals"),
    PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(storageRoot, "backups"),
  });
  assert.equal(receipt.createdDatabase, false);
  assert.equal(receipt.hasLayoutPresetColumn, true);

  const migrated = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const row = migrated.prepare("SELECT title, layout_preset, status FROM client_galleries WHERE id=?").get(galleryId);
    assert.deepEqual({ ...row }, { title: "Legacy Album", layout_preset: "classico", status: "published" });
  } finally {
    migrated.close();
  }
});

test("ensureUnlimitedCandidateStorage refuses unsafe paths, symlinks, and Clerk admin conflicts", (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-unlimited-unsafe-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  assert.throws(
    () =>
      ensureUnlimitedCandidateStorage({
        PUNCTUM_CANDIDATE_DB_FILE: join(root, "public_html", "application.sqlite"),
        PUNCTUM_CANDIDATE_ORIGINALS: join(root, "originals"),
        PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(root, "backups"),
      }),
    /UNLIMITED_BOOTSTRAP_UNSAFE_PATH/,
  );

  const realDir = join(root, "real");
  const symDir = join(root, "sym");
  mkdirSync(realDir, { mode: 0o700 });
  symlinkSync(realDir, symDir);
  assert.throws(
    () =>
      ensureUnlimitedCandidateStorage({
        PUNCTUM_CANDIDATE_DB_FILE: join(symDir, "application.sqlite"),
        PUNCTUM_CANDIDATE_ORIGINALS: join(root, "originals"),
        PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(root, "backups"),
      }),
    /UNLIMITED_BOOTSTRAP_SYMLINK_FORBIDDEN/,
  );

  const validRoot = join(root, "safe");
  const dbFile = join(validRoot, "application.sqlite");
  ensureUnlimitedCandidateStorage({
    PUNCTUM_CANDIDATE_DB_FILE: dbFile,
    PUNCTUM_CANDIDATE_ORIGINALS: join(validRoot, "originals"),
    PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(validRoot, "backups"),
    PUNCTUM_CANDIDATE_ADMIN_EMAIL: "studio@punctumpicture.com",
    PUNCTUM_CANDIDATE_CLERK_ADMIN_USER_ID: "user_admin_primary_1",
  });
  assert.throws(
    () =>
      ensureUnlimitedCandidateStorage({
        PUNCTUM_CANDIDATE_DB_FILE: dbFile,
        PUNCTUM_CANDIDATE_ORIGINALS: join(validRoot, "originals"),
        PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(validRoot, "backups"),
        PUNCTUM_CANDIDATE_ADMIN_EMAIL: "studio@punctumpicture.com",
        PUNCTUM_CANDIDATE_CLERK_ADMIN_USER_ID: "user_admin_different_2",
      }),
    /UNLIMITED_BOOTSTRAP_ADMIN_CONFLICT/,
  );

  assert.equal(existsSync(resolve(validRoot, "originals")), true);
});
