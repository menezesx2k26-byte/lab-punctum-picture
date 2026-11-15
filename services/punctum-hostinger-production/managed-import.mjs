import { createDecipheriv, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync, closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync,
  openSync, readFileSync, readSync, readdirSync, renameSync, rmSync,
  statSync, writeFileSync, createReadStream, createWriteStream,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { privateOriginals } from "./originals.mjs";
import { openProductionStageDatabase } from "./sqlite.mjs";

export function loadD1Snapshot(db, sql) {
  // D1 exports may insert dependent rows before their referenced table.
  db.exec("PRAGMA foreign_keys=OFF");
  try { db.exec(sql); } finally { db.exec("PRAGMA foreign_keys=ON"); }
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" ||
      db.prepare("PRAGMA foreign_key_check").all().length) throw Error("MANAGED_SOURCE_DATABASE_INVALID");
}

export function databaseInventory(db) {
  return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }) => {
    const rows = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map((row) => JSON.stringify(row)).sort();
    return [name, { rows: rows.length, sha256: createHash("sha256").update(rows.join("\n")).digest("hex") }];
  }));
}

export async function importManagedSeed({ bundle, key, digest, destination }) {
  if (!/^[a-f0-9]{64}$/.test(key ?? "") || !/^[a-f0-9]{64}$/.test(digest ?? "") ||
      !isAbsolute(destination) || /(?:^|[\\/])(?:public_html|hbuilds|public|dist)(?:[\\/]|$)/i.test(destination)) {
    throw Error("MANAGED_IMPORT_CONFIGURATION_INVALID");
  }
  const parent = lstatSync(dirname(destination));
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077)) {
    throw Error("MANAGED_IMPORT_PRIVATE_PARENT_REQUIRED");
  }
  if (existsSync(destination)) {
    const directory = lstatSync(destination);
    if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077)) {
      throw Error("MANAGED_IMPORT_DESTINATION_UNSAFE");
    }
    const receipt = JSON.parse(readFileSync(join(destination, "import-receipt.json"), "utf8"));
    if (receipt.cipherSha256 !== digest) throw Error("MANAGED_IMPORT_ALREADY_INITIALIZED");
    openProductionStageDatabase(join(destination, "application.sqlite")).close();
    return { ...receipt, reused: true };
  }
  const stage = mkdtempSync(join(dirname(destination), ".punctum-import-"));
  chmodSync(stage, 0o700);
  try {
    const hash = createHash("sha256");
    for await (const bytes of createReadStream(bundle)) hash.update(bytes);
    if (hash.digest("hex") !== digest) throw Error("MANAGED_IMPORT_CIPHERTEXT_MISMATCH");
    const size = statSync(bundle).size;
    if (size < 29 || size > 1_100_000_000) throw Error("MANAGED_IMPORT_SIZE_INVALID");
    const descriptor = openSync(bundle, "r");
    const iv = Buffer.alloc(12), tag = Buffer.alloc(16);
    try {
      readSync(descriptor, iv, 0, iv.length, 0);
      readSync(descriptor, tag, 0, tag.length, size - tag.length);
    } finally { closeSync(descriptor); }
    const cipher = createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
    cipher.setAuthTag(tag);
    const archive = join(stage, "seed.tar.gz");
    await pipeline(createReadStream(bundle, { start: 12, end: size - 17 }), cipher,
      createWriteStream(archive, { flags: "wx", mode: 0o600 }));
    const entries = execFileSync("tar", ["-tzf", archive], { encoding: "utf8", maxBuffer: 512_000 }).trim().split("\n");
    const paths = new Set();
    for (const name of entries) {
      if (!/^(?:application\.sqlite|seed-manifest\.json|originals\/(?:[a-f0-9]{2}\/(?:[a-f0-9]{64}\.(?:blob|json))?)?)$/.test(name) ||
          paths.has(name)) throw Error("MANAGED_IMPORT_ARCHIVE_PATH_INVALID");
      paths.add(name);
    }
    const types = execFileSync("tar", ["-tvzf", archive], { encoding: "utf8", maxBuffer: 512_000 }).trim().split("\n");
    if (types.some((line) => !["-", "d"].includes(line[0]))) throw Error("MANAGED_IMPORT_ARCHIVE_LINK_FORBIDDEN");
    execFileSync("tar", ["-xzf", archive, "--no-same-owner", "-C", stage]);
    rmSync(archive);
    for (const path of readdirSync(stage, { recursive: true })) {
      const full = join(stage, path), info = lstatSync(full);
      chmodSync(full, info.isDirectory() ? 0o700 : 0o600);
    }
    const manifest = JSON.parse(readFileSync(join(stage, "seed-manifest.json"), "utf8"));
    if (manifest.schema !== "punctum-managed-seed-v1" || !Array.isArray(manifest.objects) ||
        manifest.objects.length > 1000) throw Error("MANAGED_IMPORT_MANIFEST_INVALID");
    const dbFile = join(stage, "application.sqlite");
    openProductionStageDatabase(dbFile).close();
    const originals = privateOriginals(join(stage, "originals"));
    if (entries.filter((name) => name.endsWith(".blob")).length !== manifest.objects.length) {
      throw Error("MANAGED_IMPORT_ORIGINAL_COUNT_MISMATCH");
    }
    let bytes = 0;
    const keys = new Set();
    for (const item of manifest.objects) {
      if (keys.has(item.key)) throw Error("MANAGED_IMPORT_DUPLICATE_KEY");
      keys.add(item.key);
      const object = await originals.get(item.key);
      if (!object || object.size !== item.size || object.etag !== item.sha256) throw Error("MANAGED_IMPORT_ORIGINAL_MISMATCH");
      bytes += object.size;
    }
    const db = new DatabaseSync(dbFile, { readOnly: true });
    let missing = 0, tables;
    try {
      tables = databaseInventory(db);
      if (manifest.tables && JSON.stringify(tables) !== JSON.stringify(manifest.tables)) throw Error("MANAGED_IMPORT_TABLE_MISMATCH");
      for (const [table, column] of [["images", "original_key"], ["site_media", "storage_key"], ["client_gallery_images", "storage_key"]]) {
        const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
        if (!exists) continue;
        for (const row of db.prepare(`SELECT ${column} AS key FROM ${table} WHERE status='ready'`).all()) {
          if (!row.key?.startsWith("static:") && !keys.has(row.key)) missing++;
        }
      }
    } finally { db.close(); }
    if (missing) throw Error("MANAGED_IMPORT_READY_ORIGINAL_MISSING");
    mkdirSync(join(stage, "backups"), { mode: 0o700 });
    const receipt = { schema: manifest.schema, cipherSha256: digest, objects: keys.size, bytes, integrity: "ok", missingReady: missing, tables };
    writeFileSync(join(stage, "import-receipt.json"), JSON.stringify(receipt), { mode: 0o600, flag: "wx" });
    renameSync(stage, destination);
    return receipt;
  } finally { rmSync(stage, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const destination = "/home/u571409090/punctum-managed-private-20261114";
  const privateParent = dirname(destination);
  // The hosting account owns /home/u571409090; never alter its permissions.
  const wrapper = join(privateParent, "punctum-managed-storage");
  mkdirSync(wrapper, { mode: 0o700, recursive: true });
  importManagedSeed({
    bundle: fileURLToPath(new URL("./managed-seed.bin", import.meta.url)),
    key: process.env.PUNCTUM_MANAGED_IMPORT_KEY,
    digest: process.env.PUNCTUM_MANAGED_IMPORT_SHA256,
    destination: join(wrapper, basename(destination)),
  }).then((receipt) => console.log("PUNCTUM_MANAGED_IMPORT " + JSON.stringify(receipt)))
    .catch(() => { console.error("PUNCTUM_MANAGED_IMPORT_FAILED"); process.exitCode = 1; });
}
