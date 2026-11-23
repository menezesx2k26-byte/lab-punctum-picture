import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, dirname } from "node:path";
import { validatePrivateStageDb } from "./sqlite.mjs";

function privateJson(path) {
  if (typeof path !== "string" || !isAbsolute(path)) throw Error("STAGE_RECEIPT_ABSOLUTE_REQUIRED");
  const file = lstatSync(path);
  const parent = statSync(dirname(path));
  if (file.isSymbolicLink() || !file.isFile() || file.nlink !== 1 ||
      (file.mode & 0o077) || (parent.mode & 0o077)) throw Error("UNSAFE_STAGE_RECEIPT");
  return JSON.parse(readFileSync(path, "utf8"));
}

export function stageOrigin() {
  const url = new URL(process.env.PUNCTUM_STAGE_ORIGIN ?? "");
  const port = Number(url.port);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.pathname !== "/" || url.search || url.hash ||
      url.href !== url.origin + "/" ||
      !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw Error("STAGING_ORIGIN_MUST_BE_PRIVATE_LOOPBACK");
  }
  return url;
}

export function stageConfig() {
  const dbFile = validatePrivateStageDb(process.env.PUNCTUM_STAGE_DB_FILE);
  const d1 = privateJson(process.env.PUNCTUM_STAGE_D1_RECEIPT);
  const r2 = privateJson(process.env.PUNCTUM_STAGE_R2_RECEIPT);
  if (d1.schema !== "punctum-production-sqlite-preflight-v1" ||
      d1.stage !== "IMPORT_ONLY_NOT_PRODUCTION" ||
      d1.databaseId !== "22697f13-7484-41e3-9441-f7b902c6577a" ||
      d1.sqlIntegrity !== "ok" || d1.foreignKeys !== "ok" ||
      d1.sourceTableCounts?.images !== 339 ||
      d1.sourceTableCounts?.albums !== 20 ||
      d1.sourceTableCounts?.site_media !== 12 ||
      d1.exportSha256 !== "9b44bcb3cb46388654e9dd636f09f88adc2791e608382a3100b917dcb480a217" ||
      d1.productionReady !== false || d1.dnsTouched !== false ||
      r2.schema !== "punctum-r2-private-stage-receipt-v1" ||
      r2.status !== "STAGED_READ_ONLY_NOT_PRODUCTION" ||
      r2.objectsImported !== 230 || r2.bytesImported !== 372040548 ||
      r2.hashesVerified !== 230 ||
      r2.sourceManifestSha256 !== "0abeda19b5a151f311218b6876216e7e6d6976df83c9b89eb323908d462e00c9" ||
      r2.productionReady !== false || r2.dnsTouched !== false) {
    throw Error("STAGING_SOURCE_RECEIPTS_DIVERGE");
  }
  const root = process.env.PUNCTUM_STAGE_ORIGINALS_ROOT;
  if (!root || !isAbsolute(root) || realpathSync(root) !== root ||
      (statSync(root).mode & 0o077)) throw Error("INVALID_PRIVATE_ORIGINALS_ROOT");
  return { dbFile, originalsRoot: root, origin: stageOrigin() };
}
