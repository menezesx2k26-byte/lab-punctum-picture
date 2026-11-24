import { DatabaseSync } from "node:sqlite";
import {
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { productionStageApplicationId } from "./sqlite.mjs";

const moduleFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(moduleFile), "../..");
const migrationsDir = resolve(projectRoot, "migrations");

const forbiddenSegments = new Set([
  "hbuilds",
  "public_html",
  "public",
  "dist",
  "production-import",
  "d1-export",
  "r2-export",
]);

const clerkUserIdPattern = /^user_[a-zA-Z0-9_-]{3,180}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertSafePath(rawPath, { expectFile = false } = {}) {
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    throw Error("UNLIMITED_BOOTSTRAP_UNSAFE_PATH");
  }
  const trimmed = rawPath.trim();
  if (/[\x00-\x1f\x7f]/.test(trimmed) || !isAbsolute(trimmed)) {
    throw Error("UNLIMITED_BOOTSTRAP_UNSAFE_PATH");
  }

  const rawParts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (rawParts.includes("..") || rawParts.includes(".")) {
    throw Error("UNLIMITED_BOOTSTRAP_UNSAFE_PATH");
  }
  for (const part of rawParts) {
    if (forbiddenSegments.has(part.toLowerCase())) {
      throw Error("UNLIMITED_BOOTSTRAP_UNSAFE_PATH");
    }
  }

  const normalized = resolve(trimmed);
  if (normalized === projectRoot || normalized.startsWith(projectRoot + sep)) {
    throw Error("UNLIMITED_BOOTSTRAP_UNSAFE_PATH");
  }

  let current = sep;
  for (const segment of normalized.split(sep).filter(Boolean)) {
    current = join(current, segment);
    let st;
    try {
      st = lstatSync(current);
    } catch (error) {
      if (error && error.code === "ENOENT") break;
      throw error;
    }
    if (st.isSymbolicLink()) {
      throw Error("UNLIMITED_BOOTSTRAP_SYMLINK_FORBIDDEN");
    }
  }

  if (expectFile && existsSync(normalized)) {
    const st = lstatSync(normalized);
    if (st.isSymbolicLink()) {
      throw Error("UNLIMITED_BOOTSTRAP_SYMLINK_FORBIDDEN");
    }
    if (!st.isFile() || st.nlink !== 1) {
      throw Error("UNLIMITED_BOOTSTRAP_UNSAFE_PATH");
    }
  }

  return normalized;
}

function ensureSecureDir(rawPath) {
  const dirPath = assertSafePath(rawPath);
  mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  chmodSync(dirPath, 0o700);
  const st = lstatSync(dirPath);
  if (st.isSymbolicLink()) {
    throw Error("UNLIMITED_BOOTSTRAP_SYMLINK_FORBIDDEN");
  }
  if (!st.isDirectory()) {
    throw Error("UNLIMITED_BOOTSTRAP_UNSAFE_PATH");
  }
  if ((st.mode & 0o077) !== 0) {
    throw Error("UNLIMITED_BOOTSTRAP_PERMISSIONS_FAILED");
  }
  return dirPath;
}

function sortedMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(migrationsDir, name), "utf8"),
    }));
}

function cleanupFailedNewDatabase(dbFile) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      rmSync(`${dbFile}${suffix}`, { force: true });
    } catch {}
  }
}

function tableExists(db, name) {
  const row = db
    .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(name);
  return Boolean(row?.found);
}

function applyMissingAdditiveMigrations(db, migrations) {
  const pending = [];
  if (!tableExists(db, "clerk_pilot_identity_links")) {
    const m0014 = migrations.find((m) => m.name.startsWith("0014_"));
    if (m0014) pending.push(m0014);
  }
  if (!tableExists(db, "clerk_admin_identity_links")) {
    const m0015 = migrations.find((m) => m.name.startsWith("0015_"));
    if (m0015) pending.push(m0015);
  }
  const hasLayoutPreset = db
    .prepare("PRAGMA table_info(client_galleries)")
    .all()
    .some((col) => col.name === "layout_preset");
  if (!hasLayoutPreset) {
    const m0016 = migrations.find((m) => m.name.startsWith("0016_"));
    if (m0016) pending.push(m0016);
  }

  const hasDeletedAt = db.prepare("PRAGMA table_info(client_galleries)").all().some((col) => col.name === "deleted_at");
  if (!hasDeletedAt) {
    const m0017 = migrations.find((m) => m.name.startsWith("0017_"));
    if (!m0017) throw Error("UNLIMITED_BOOTSTRAP_MISSING_GALLERY_DELETE_MIGRATION");
    pending.push(m0017);
  }

  if (pending.length === 0) return;
  db.exec("BEGIN IMMEDIATE;");
  try {
    for (const migration of pending) {
      db.exec(migration.sql);
    }
    db.exec("COMMIT;");
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch {}
    throw error;
  }
}

function ensureAdminClerkLink(db, adminEmail, clerkUserId) {
  db.exec("BEGIN IMMEDIATE;");
  try {
    const byClerk = db
      .prepare(
        "SELECT clerk_user_id, admin_principal_id, role, disabled_at FROM clerk_admin_identity_links WHERE clerk_user_id = ?",
      )
      .get(clerkUserId);
    const byPrincipal = db
      .prepare(
        "SELECT clerk_user_id, admin_principal_id, role, disabled_at FROM clerk_admin_identity_links WHERE admin_principal_id = ?",
      )
      .get(adminEmail);

    if (byClerk) {
      if (byClerk.admin_principal_id !== adminEmail || byClerk.role !== "admin" || byClerk.disabled_at !== null) {
        throw Error("UNLIMITED_BOOTSTRAP_ADMIN_CONFLICT");
      }
    } else if (byPrincipal) {
      throw Error("UNLIMITED_BOOTSTRAP_ADMIN_CONFLICT");
    } else {
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO clerk_admin_identity_links (clerk_user_id, admin_principal_id, role, session_version, disabled_at, created_at, updated_at)
         VALUES (?, ?, 'admin', 1, NULL, ?, ?)`,
      ).run(clerkUserId, adminEmail, now, now);
      db.prepare(
        `INSERT INTO audit_log (id, actor_email, action, entity_type, entity_id, data_json, created_at)
         VALUES (?, ?, 'admin_clerk_link.bootstrap', 'clerk_admin_identity_link', ?, ?, ?)`,
      ).run(
        randomUUID(),
        adminEmail,
        clerkUserId,
        JSON.stringify({ role: "admin", source: "unlimited-bootstrap" }),
        now,
      );
    }

    db.exec("COMMIT;");
  } catch (error) {
    try {
      db.exec("ROLLBACK;");
    } catch {}
    throw error;
  }
}

export function ensureUnlimitedCandidateStorage(env = process.env) {
  const rawDbFile = env.PUNCTUM_CANDIDATE_DB_FILE;
  const rawOriginals = env.PUNCTUM_CANDIDATE_ORIGINALS;
  const rawBackups = env.PUNCTUM_CANDIDATE_BACKUPS_ROOT;
  if (!rawDbFile || !rawOriginals || !rawBackups) {
    throw Error("UNLIMITED_BOOTSTRAP_MISSING_CONFIG");
  }

  const rawEmail = typeof env.PUNCTUM_CANDIDATE_ADMIN_EMAIL === "string"
    ? env.PUNCTUM_CANDIDATE_ADMIN_EMAIL.trim().toLowerCase()
    : "";
  const rawClerkId = typeof env.PUNCTUM_CANDIDATE_CLERK_ADMIN_USER_ID === "string"
    ? env.PUNCTUM_CANDIDATE_CLERK_ADMIN_USER_ID.trim()
    : "";

  if ((rawClerkId && !rawEmail) || (rawClerkId && (!clerkUserIdPattern.test(rawClerkId) || !emailPattern.test(rawEmail)))) {
    throw Error("UNLIMITED_BOOTSTRAP_INVALID_ADMIN_CONFIG");
  }

  const dbFile = assertSafePath(rawDbFile, { expectFile: true });
  ensureSecureDir(dirname(dbFile));
  ensureSecureDir(rawOriginals);
  ensureSecureDir(rawBackups);
  assertSafePath(dbFile, { expectFile: true });

  const migrations = sortedMigrationFiles();
  let createdDatabase = false;
  let db = null;
  let hasLayoutPresetColumn = false;
  let adminClerkLinked = false;

  try {
    if (!existsSync(dbFile)) {
      createdDatabase = true;
      const fd = openSync(dbFile, "wx", 0o600);
      closeSync(fd);
      chmodSync(dbFile, 0o600);

      db = new DatabaseSync(dbFile, { enableForeignKeyConstraints: true });
      db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
      db.exec(`PRAGMA application_id = ${productionStageApplicationId};`);
      db.exec("BEGIN IMMEDIATE;");
      try {
        for (const migration of migrations) {
          db.exec(migration.sql);
        }
        db.exec("COMMIT;");
      } catch (error) {
        try {
          db.exec("ROLLBACK;");
        } catch {}
        throw error;
      }
    } else {
      chmodSync(dbFile, 0o600);
      db = new DatabaseSync(dbFile, { enableForeignKeyConstraints: true });
      db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
      const appIdRow = db.prepare("PRAGMA application_id").get();
      if (appIdRow?.application_id !== productionStageApplicationId) {
        throw Error("UNLIMITED_BOOTSTRAP_INVALID_DATABASE");
      }
      applyMissingAdditiveMigrations(db, migrations);
    }

    const quickCheck = db.prepare("PRAGMA quick_check").get();
    if (!quickCheck || quickCheck.quick_check !== "ok") {
      throw Error("UNLIMITED_BOOTSTRAP_INTEGRITY_FAILED");
    }
    const fkIssues = db.prepare("PRAGMA foreign_key_check").all();
    if (fkIssues.length > 0) {
      throw Error("UNLIMITED_BOOTSTRAP_FOREIGN_KEY_FAILED");
    }

    hasLayoutPresetColumn = db
      .prepare("PRAGMA table_info(client_galleries)")
      .all()
      .some((col) => col.name === "layout_preset");
    if (!hasLayoutPresetColumn) {
      throw Error("UNLIMITED_BOOTSTRAP_MISSING_LAYOUT_PRESET");
    }

    if (rawClerkId && rawEmail) {
      ensureAdminClerkLink(db, rawEmail, rawClerkId);
      adminClerkLinked = true;
    } else {
      const existingLink = db
        .prepare("SELECT 1 AS found FROM clerk_admin_identity_links WHERE disabled_at IS NULL LIMIT 1")
        .get();
      adminClerkLinked = Boolean(existingLink?.found);
    }
  } catch (error) {
    if (db) {
      try {
        db.close();
      } catch {}
      db = null;
    }
    if (createdDatabase) {
      cleanupFailedNewDatabase(dbFile);
    }
    throw error;
  } finally {
    if (db) {
      db.close();
    }
  }

  chmodSync(dbFile, 0o600);
  if ((statSync(dbFile).mode & 0o077) !== 0) {
    throw Error("UNLIMITED_BOOTSTRAP_PERMISSIONS_FAILED");
  }

  return {
    status: "PUNCTUM_UNLIMITED_BOOTSTRAP_VERIFIED",
    createdDatabase,
    dbFileExists: true,
    hasLayoutPresetColumn,
    adminClerkLinked,
    integrity: "ok",
    sourceSha: typeof env.PUNCTUM_QA_SOURCE_SHA === "string" && env.PUNCTUM_QA_SOURCE_SHA.trim()
      ? env.PUNCTUM_QA_SOURCE_SHA.trim()
      : null,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === moduleFile) {
  if (
    process.argv.includes("--if-configured") &&
    (!process.env.PUNCTUM_CANDIDATE_DB_FILE ||
      !process.env.PUNCTUM_CANDIDATE_ORIGINALS ||
      !process.env.PUNCTUM_CANDIDATE_BACKUPS_ROOT)
  ) {
    console.log(JSON.stringify({ status: "PUNCTUM_UNLIMITED_BOOTSTRAP_DEFERRED_TO_RUNTIME" }));
    process.exit(0);
  }
  const receipt = ensureUnlimitedCandidateStorage(process.env);
  console.log(JSON.stringify(receipt));
}
