import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

// Independent, bounded, read-only D1 census. Never retrieves table row values.
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_D1_API_TOKEN;
const EXPECTED_ID = "22697f13-7484-41e3-9441-f7b902c6577a";
const EXPECTED_NAME = "punctum-picture";
const OUTPUT = "outputs/hostinger-d1-readonly/inventory.json";
if (!ACCOUNT || !TOKEN || !/^[a-f0-9]{32}$/i.test(ACCOUNT)) {
  throw new Error("CLOUDFLARE_READ_CREDENTIALS_UNAVAILABLE");
}
async function call(path, sql) {
  const response = await fetch("https://api.cloudflare.com/client/v4/accounts/" + ACCOUNT + path, {
    method: sql ? "POST" : "GET",
    headers: { Authorization: "Bearer " + TOKEN, Accept: "application/json",
      ...(sql ? { "Content-Type": "application/json" } : {}) },
    ...(sql ? { body: JSON.stringify({ sql }) } : {}),
    redirect: "error", signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error("CLOUDFLARE_D1_HTTP_" + response.status);
  const body = await response.json();
  if (!body.success) throw new Error("CLOUDFLARE_D1_REJECTED");
  return body.result;
}
async function query(sql) {
  if (!/^SELECT\b/i.test(sql) || /;\s*\S/.test(sql)) throw new Error("READ_ONLY_SQL_REQUIRED");
  const items = await call("/d1/database/" + EXPECTED_ID + "/query", sql);
  if (!Array.isArray(items) || items[0]?.success !== true || !Array.isArray(items[0].results)) {
    throw new Error("D1_QUERY_FAILED");
  }
  return items[0].results;
}
async function main() {
  const dbs = await call("/d1/database");
  const db = Array.isArray(dbs) ? dbs.find(x => x?.name === EXPECTED_NAME) : null;
  if (!db || (db.uuid || db.id) !== EXPECTED_ID) throw new Error("SOURCE_D1_IDENTITY_MISMATCH");
  const tables = (await query("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"))
    .filter(row => /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(row.name || ""));
  if (!tables.length || tables.length > 50) throw new Error("D1_SCHEMA_OUT_OF_BOUNDS");
  const tableCounts = {};
  for (const table of tables) {
    const result = await query("SELECT COUNT(*) AS count FROM " + table.name);
    const count = Number(result[0]?.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("INVALID_D1_COUNT");
    tableCounts[table.name] = count;
  }
  const required = ["albums", "images", "site_settings", "categories", "admin_credentials"];
  if (required.some(t => !Object.hasOwn(tableCounts, t))) throw new Error("D1_REQUIRED_SCHEMA_MISSING");
  // Aggregates only: never return image identifiers, customer fields or R2 keys.
  async function groupByStatus(table) {
    const rows = await query("SELECT status, COUNT(*) AS count FROM " + table + " GROUP BY status ORDER BY status");
    const output = {};
    for (const row of rows) {
      if (!/^[a-z_]{1,32}$/.test(row.status || "") ||
          !Number.isSafeInteger(Number(row.count)) || Number(row.count) < 0) {
        throw new Error("INVALID_STATUS_AGGREGATE");
      }
      output[row.status] = Number(row.count);
    }
    return output;
  }
  const imageStatuses = await groupByStatus("images");
  const albumStatuses = await groupByStatus("albums");
  const referenceTypes = await query(
    "SELECT CASE WHEN original_key LIKE 'static:%' THEN 'static_git' ELSE 'r2_reference' END AS storage, COUNT(*) AS count FROM images WHERE deleted_at IS NULL GROUP BY storage"
  );
  const referencedOriginals = {};
  for (const row of referenceTypes) {
    if (!["static_git", "r2_reference"].includes(row.storage) ||
        !Number.isSafeInteger(Number(row.count)) || Number(row.count) < 0) throw new Error("INVALID_REFERENCES");
    referencedOriginals[row.storage] = Number(row.count);
  }
  const imageDeleted = Number((await query("SELECT COUNT(*) AS count FROM images WHERE deleted_at IS NOT NULL"))[0]?.count);
  const albumDeleted = Number((await query("SELECT COUNT(*) AS count FROM albums WHERE deleted_at IS NOT NULL"))[0]?.count);
  const schemaHash = createHash("sha256")
    .update(JSON.stringify(tables.map(x => [x.name, x.sql]).sort((a,b) => a[0].localeCompare(b[0]))))
    .digest("hex");
  const report = {
    schema: "punctum-source-d1-readonly-inventory-v1",
    observedAt: new Date().toISOString(),
    databaseName: EXPECTED_NAME,
    databaseId: EXPECTED_ID,
    tableCounts,
    imageStatuses, albumStatuses,
    softDeleted: { images: imageDeleted, albums: albumDeleted },
    activeOriginalReferences: referencedOriginals,
    schemaSha256: schemaHash,
    sourceReadOnly: true,
    copiedPrivateRows: false,
    productionDataImported: false,
    r2OriginalsParity: "NOT_CHECKED",
    dnsTouched: false,
  };
  mkdirSync("outputs/hostinger-d1-readonly", { recursive: true, mode: 0o700 });
  writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n", { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify(report));
}
await main();
