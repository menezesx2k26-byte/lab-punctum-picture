import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const productionStageId = 0x50554e50;
const project = fileURLToPath(new URL("../", import.meta.url));
const requiredTables = ["admin_credentials", "albums", "categories", "images", "inquiries", "site_settings"];

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw Error("MISSING_" + name);
  return value;
}
function validFile(value, label) {
  if (!isAbsolute(value) || !statSync(value).isFile() || lstatSync(value).isSymbolicLink()) {
    throw Error("UNSAFE_" + label);
  }
  return realpathSync(value);
}
function sha256(buffer) { return createHash("sha256").update(buffer).digest("hex"); }
function requireOutsideProject(path) {
  if (!isAbsolute(path)) throw Error("ABSOLUTE_PRIVATE_STAGE_REQUIRED");
  const parent = realpathSync(dirname(path));
  const fromProject = parent.startsWith(project) ? parent.slice(project.length) : null;
  if (fromProject !== null || /(?:^|[\\/])(?:public_html|public|dist|hbuilds)(?:[\\/]|$)/i.test(parent)) {
    throw Error("STAGE_MUST_BE_OUTSIDE_DEPLOYMENT");
  }
  const stat = statSync(parent);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0 || stat.isSymbolicLink?.()) {
    throw Error("PRIVATE_STAGE_PARENT_REQUIRED");
  }
  if (existsSync(path)) throw Error("STAGE_ALREADY_EXISTS");
  return path;
}
function schemaRows(db) {
  return db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all()
    .filter(row => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(row.name || ""));
}
function schemaHash(rows) {
  return sha256(Buffer.from(JSON.stringify(rows.map(r => [r.name, r.sql]).sort((a, b) => a[0].localeCompare(b[0])))));
}
function census(db) {
  const tables = schemaRows(db);
  if (!tables.length || tables.length > 50) throw Error("STAGING_SCHEMA_BOUNDS");
  const counts = {};
  for (const { name } of tables) {
    const c = Number(db.prepare("SELECT COUNT(*) AS c FROM " + name).get().c);
    if (!Number.isSafeInteger(c) || c < 0) throw Error("INVALID_STAGING_COUNT");
    counts[name] = c;
  }
  return { counts, schemaSha256: schemaHash(tables) };
}
export function validateSqlStage({ sqlPath, receiptPath, inventoryPath, stagePath }) {
  const sql = validFile(sqlPath, "SQL");
  const receipt = JSON.parse(readFileSync(validFile(receiptPath, "RECEIPT"), "utf8"));
  const inventory = JSON.parse(readFileSync(validFile(inventoryPath, "INVENTORY"), "utf8"));
  if (receipt.schema !== "punctum-encrypted-d1-stage-v1" ||
      receipt.database !== "punctum-picture" ||
      receipt.databaseId !== "22697f13-7484-41e3-9441-f7b902c6577a" ||
      inventory.schema !== "punctum-source-d1-readonly-inventory-v1" ||
      inventory.databaseId !== receipt.databaseId ||
      inventory.sourceReadOnly !== true ||
      receipt.productionDataImported !== false ||
      receipt.dnsTouched !== false) throw Error("STAGING_IDENTITY_NOT_VERIFIED");
  const bytes = readFileSync(sql);
  if (bytes.length < 100 || bytes.length > 512 * 1024 * 1024 ||
      bytes.length !== receipt.sqlBytes || sha256(bytes) !== receipt.sqlSha256) {
    throw Error("STAGING_SOURCE_SHA_MISMATCH");
  }
  const target = requireOutsideProject(resolve(stagePath));
  // The expected source D1 census must exactly match the export; if production
  // changed after the previous inventory, recapture rather than overriding.
  let created = false;
  let db;
  try {
    closeSync(openSync(target, "wx", 0o600));
    created = true;
    db = new DatabaseSync(target, { enableForeignKeyConstraints: false, timeout: 5000 });
    // Import is only from CMS-authenticated SQL whose digest is pinned by the
    // isolated encryption receipt. Never accept a raw arbitrary SQL command.
    db.exec(bytes.toString("utf8"));
    const id = db.prepare("PRAGMA application_id").get().application_id;
    if (id === 0x50554e51 || (id !== 0 && id !== productionStageId)) {
      throw Error("STAGING_CANNOT_REUSE_QA_OR_UNKNOWN_DB");
    }
    const checks = census(db);
    if (!requiredTables.every(table => Object.hasOwn(checks.counts, table)) ||
        checks.schemaSha256 !== inventory.schemaSha256 ||
        JSON.stringify(checks.counts) !== JSON.stringify(inventory.tableCounts)) {
      throw Error("STAGING_PARITY_FAILED");
    }
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
        db.prepare("PRAGMA foreign_key_check").all().length > 0) {
      throw Error("STAGING_INTEGRITY_FAILED");
    }
    db.exec("PRAGMA application_id = " + productionStageId);
    if (db.prepare("PRAGMA application_id").get().application_id !== productionStageId) {
      throw Error("STAGING_APP_ID_FAILED");
    }
    db.close(); db = undefined;
    const written = statSync(target);
    if (written.mode & 0o077 || !written.isFile()) throw Error("STAGING_PERMISSIONS_FAILED");
    const proof = {
      schema: "punctum-production-sqlite-preflight-v1",
      stage: "IMPORT_ONLY_NOT_PRODUCTION",
      databaseId: receipt.databaseId,
      exportSha256: receipt.sqlSha256,
      sourceTableCounts: inventory.tableCounts,
      schemaSha256: checks.schemaSha256,
      stagingApplicationId: productionStageId,
      sqlIntegrity: "ok",
      foreignKeys: "ok",
      r2ObjectsImported: 0,
      adminLoginTested: false,
      productionReady: false,
      dnsTouched: false,
    };
    const report = target + ".manifest.json";
    if (existsSync(report)) throw Error("STAGING_REPORT_ALREADY_EXISTS");
    writeFileSync(report, JSON.stringify(proof, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    return proof;
  } catch (error) {
    db?.close();
    if (created) rmSync(target, { force: true });
    throw error;
  }
}
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const result = validateSqlStage({
      sqlPath: required("PUNCTUM_D1_STAGE_DECRYPTED_SQL"),
      receiptPath: required("PUNCTUM_D1_STAGE_RECEIPT"),
      inventoryPath: required("PUNCTUM_D1_STAGE_INVENTORY"),
      stagePath: required("PUNCTUM_D1_STAGE_NEW_DB"),
    });
    console.log(JSON.stringify(result));
  } catch {
    // Do not print paths, raw SQL, customer information or credentials.
    console.error("PUNCTUM_D1_IMPORT_PREFLIGHT_BLOCKED");
    process.exitCode = 1;
  }
}
