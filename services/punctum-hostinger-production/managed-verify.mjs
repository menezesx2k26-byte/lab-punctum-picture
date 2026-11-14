import { lstatSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { privateOriginals } from "./originals.mjs";
import { openProductionStageDatabase } from "./sqlite.mjs";
import { databaseInventory } from "./managed-import.mjs";
import { candidateConfig } from "./candidate-runtime.mjs";

export async function verifyManagedData(config, expectedSqlSha256) {
  if (!/^[a-f0-9]{64}$/.test(expectedSqlSha256 ?? "")) throw Error("MANAGED_EXPECTED_SOURCE_REQUIRED");
  openProductionStageDatabase(config.dbFile).close();
  const file = join(dirname(config.dbFile), "seed-manifest.json"), info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077) || info.size > 2_000_000) {
    throw Error("MANAGED_MANIFEST_UNSAFE");
  }
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest.sqlSha256 !== expectedSqlSha256 || !Array.isArray(manifest.objects) || manifest.objects.length > 1000) {
    throw Error("MANAGED_IMPORTED_SOURCE_MISMATCH");
  }
  const originals = privateOriginals(config.originals), keys = new Set();
  let bytes = 0;
  for (const item of manifest.objects) {
    if (keys.has(item.key)) throw Error("MANAGED_DUPLICATE_ORIGINAL");
    keys.add(item.key);
    const object = await originals.get(item.key);
    if (!object || object.size !== item.size || object.etag !== item.sha256) throw Error("MANAGED_ORIGINAL_PARITY_FAILED");
    bytes += object.size;
  }
  const db = new DatabaseSync(config.dbFile, { readOnly: true });
  try { return { integrity: "ok", sqlSha256: expectedSqlSha256, objects: keys.size, bytes, tables: databaseInventory(db), reused: true }; }
  finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyManagedData(candidateConfig(), process.env.PUNCTUM_MANAGED_EXPECTED_SQL_SHA256)
    .then((receipt) => console.log("PUNCTUM_MANAGED_VERIFY " + JSON.stringify(receipt)))
    .catch(() => { console.error("PUNCTUM_MANAGED_VERIFY_FAILED"); process.exitCode = 1; });
}
