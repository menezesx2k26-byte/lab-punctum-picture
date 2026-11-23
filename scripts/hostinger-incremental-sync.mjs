import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

function parseArgs(argv) {
  const args = {
    sourceDb: "",
    sourceOriginals: "",
    targetDb: "/opt/punctum/private/production/db/application.sqlite",
    targetOriginals: "/opt/punctum/private/production/originals",
    apply: false,
    syncDb: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--source-db" && v) { args.sourceDb = resolve(v); i++; }
    else if (k === "--source-originals" && v) { args.sourceOriginals = resolve(v); i++; }
    else if (k === "--target-db" && v) { args.targetDb = resolve(v); i++; }
    else if (k === "--target-originals" && v) { args.targetOriginals = resolve(v); i++; }
    else if (k === "--apply") { args.apply = true; }
    else if (k === "--sync-db") { args.syncDb = true; }
  }
  if (!args.sourceDb || !args.sourceOriginals) {
    throw new Error("Usage: --source-db <sqlite> --source-originals <dir> [--target-db <sqlite>] [--target-originals <dir>] [--apply] [--sync-db]");
  }
  return args;
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function walkFiles(rootDir, baseDir = rootDir) {
  const results = [];
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const full = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, baseDir));
    } else if (entry.isFile()) {
      const rel = full.slice(baseDir.length + 1).replace(/\\/g, "/");
      results.push({ rel, full, size: statSync(full).size });
    }
  }
  return results;
}

function verifySqlite(dbPath, allowImmutable = false) {
  const runCheck = (uriOrPath) => {
    const db = new DatabaseSync(uriOrPath, { readOnly: true, enableForeignKeyConstraints: true });
    try {
      const quick = db.prepare("PRAGMA quick_check").all();
      const fk = db.prepare("PRAGMA foreign_key_check").all();
      const counts = {
        images: db.prepare("SELECT count(*) AS c FROM images").get().c,
        albums: db.prepare("SELECT count(*) AS c FROM albums").get().c,
        siteMedia: db.prepare("SELECT count(*) AS c FROM site_media").get().c,
        notReady: db.prepare("SELECT count(*) AS c FROM images WHERE status != 'ready'").get().c,
        incompleteIntents: db.prepare("SELECT count(*) AS c FROM upload_intents WHERE status != 'completed'").get().c,
      };
      if (quick[0]?.quick_check !== "ok") throw new Error("SQLITE_QUICK_CHECK_FAILED");
      if (fk.length !== 0) throw new Error(`SQLITE_FK_VIOLATIONS:${fk.length}`);
      return { quickCheck: "ok", foreignKeyViolations: 0, counts };
    } finally {
      db.close();
    }
  };
  try {
    return runCheck(dbPath);
  } catch (err) {
    if (allowImmutable && err?.errcode === 14) {
      return runCheck(`file:${dbPath}?immutable=1`);
    }
    throw err;
  }
}

export function runIncrementalSync(args) {
  const sourceSqlite = verifySqlite(args.sourceDb, true);
  const sourceFiles = walkFiles(args.sourceOriginals);

  let copiedOriginals = 0;
  let skippedExistingOriginals = 0;
  let updatedOriginals = 0;
  let verifiedBytes = 0;

  for (const file of sourceFiles) {
    const dst = join(args.targetOriginals, file.rel);
    const dstDir = dirname(dst);
    const srcSha = sha256File(file.full);

    if (existsSync(dst)) {
      const dstStat = statSync(dst);
      if (dstStat.size === file.size && sha256File(dst) === srcSha) {
        skippedExistingOriginals++;
        verifiedBytes += file.size;
        continue;
      }
      if (args.apply) {
        mkdirSync(dstDir, { recursive: true, mode: 0o700 });
        const tmp = `${dst}.tmp.${process.pid}`;
        copyFileSync(file.full, tmp);
        chmodSync(tmp, 0o600);
        renameSync(tmp, dst);
      }
      updatedOriginals++;
      verifiedBytes += file.size;
    } else {
      if (args.apply) {
        mkdirSync(dstDir, { recursive: true, mode: 0o700 });
        const tmp = `${dst}.tmp.${process.pid}`;
        copyFileSync(file.full, tmp);
        chmodSync(tmp, 0o600);
        renameSync(tmp, dst);
      }
      copiedOriginals++;
      verifiedBytes += file.size;
    }
  }

  let dbSynced = false;
  if (args.apply && args.syncDb) {
    mkdirSync(dirname(args.targetDb), { recursive: true, mode: 0o700 });
    const tmpDb = `${args.targetDb}.tmp.${process.pid}`;
    copyFileSync(args.sourceDb, tmpDb);
    chmodSync(tmpDb, 0o600);
    verifySqlite(tmpDb);
    renameSync(tmpDb, args.targetDb);
    dbSynced = true;
  }

  const targetSqlite = existsSync(args.targetDb) ? verifySqlite(args.targetDb, !args.apply) : null;

  return {
    schema: "punctum-hostinger-incremental-sync-v1",
    mode: args.apply ? "apply" : "dry-run",
    sourceFiles: sourceFiles.length,
    copiedOriginals,
    updatedOriginals,
    skippedExistingOriginals,
    verifiedBytes,
    dbSynced,
    sourceSqlite,
    targetSqlite,
  };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("hostinger-incremental-sync.mjs")) {
  const args = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(runIncrementalSync(args), null, 2));
}
