import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { stageOriginal, privateOriginals } from "./originals.mjs";
import { productionStageApplicationId } from "./sqlite.mjs";
import { databaseInventory } from "./managed-import.mjs";
import { createManagedBackup, homepageEvidence, proveManagedRestore, dailyManagedBackup } from "./managed-restore-check.mjs";

const linuxOnly = { skip: process.platform !== "linux" && "Requires Linux private storage permissions" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aEioAAAAASUVORK5CYII=", "base64");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const key = "originals/synthetic/pixel.png";

function fixture(t, count = 1) {
  const root = mkdtempSync(join(tmpdir(), "punctum-managed-restore-test-"));
  chmodSync(root, 0o700);
  t.after(() => {
    assert.ok(dirname(root) === tmpdir() && root.includes("punctum-managed-restore-test-"));
    rmSync(root, { recursive: true, force: true });
  });
  const originals = join(root, "originals");
  mkdirSync(originals, { mode: 0o700 });
  for (let i = 0; i < count; i++) stageOriginal(originals, i ? `originals/synthetic/${i}.png` : key, png, "image/png", sha(png));
  const dbFile = join(root, "application.sqlite"), db = new DatabaseSync(dbFile);
  try {
    db.exec(`PRAGMA application_id=${productionStageApplicationId}; CREATE TABLE albums(id TEXT PRIMARY KEY);
      CREATE TABLE images(id TEXT PRIMARY KEY, album_id TEXT REFERENCES albums(id), original_key TEXT, status TEXT);
      INSERT INTO albums VALUES('synthetic');`);
    db.prepare("INSERT INTO images VALUES('pixel','synthetic',?,'ready')").run(key);
  } finally { db.close(); }
  chmodSync(dbFile, 0o600);
  return { root, dbFile, originals };
}

test("import has no CLI work and relative storage is rejected without creating files", async () => {
  assert.equal(typeof createManagedBackup, "function");
  assert.equal(typeof proveManagedRestore, "function");
  const output = execFileSync(process.execPath, ["--input-type=module", "-e",
    `await import(${JSON.stringify(new URL("./managed-restore-check.mjs", import.meta.url).href)})`],
  { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] });
  assert.equal(output, "");
  await assert.rejects(createManagedBackup({ dbFile: "relative.sqlite", originals: "relative-originals" }), /MANAGED_BACKUP_RESTORE_FAILED/);
});

test("managed HTTP proof refuses unsupported process-group platforms", { skip: process.platform === "linux" }, async () => {
  await assert.rejects(proveManagedRestore({}), /MANAGED_RESTORE_LINUX_REQUIRED/);
});

test("homepage evidence ignores canonical origins, nonces and hydration but detects title, H1 and body changes", () => {
  const page = (origin, nonce) => `<!doctype html><html><head><title>Punctum Picture</title>
    <link rel="canonical" href="${origin}/"><style nonce="${nonce}">body { --request: '${nonce}'; }</style></head>
    <body><h1 class="${nonce}">Fotografia <em>com alma</em></h1><p>Memorias&nbsp;em imagens</p>
    <a href="${origin}/albuns">Ver albuns</a><!-- request ${nonce} -->
    <script nonce="${nonce}">const request = '${origin}/${nonce}'; const markup = '<h1>request data</h1>';</script></body></html>`;
  const live = page("https://punctumpicture.com", "live-nonce"), restored = page("http://127.0.0.1:45678", "restore-nonce");
  const evidence = homepageEvidence(live);
  assert.deepEqual(evidence, homepageEvidence(restored.replace("&nbsp;", "&#160;")));
  assert.notDeepEqual(evidence, homepageEvidence(restored.replace("Punctum Picture", "Changed title")));
  assert.notDeepEqual(evidence, homepageEvidence(restored.replace("Fotografia", "Changed heading")));
  assert.notDeepEqual(evidence, homepageEvidence(restored.replace("Memorias", "Changed content")));
  for (const invalid of ["", restored.replace("Punctum Picture", " "), restored.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, "")]) {
    assert.throws(() => homepageEvidence(invalid), /MANAGED_RESTORE_HTML_EVIDENCE_MISSING/);
  }
});

test("online backup includes committed WAL rows, restores all hashes, and cleanup preserves source and TAR", linuxOnly, async (t) => {
  const f = fixture(t), writer = new DatabaseSync(f.dbFile);
  try {
    writer.exec("PRAGMA journal_mode=WAL; CREATE TABLE wal_only(value TEXT); INSERT INTO wal_only VALUES('committed synthetic');");
    const sourceHash = sha(readFileSync(f.dbFile)), expectedTables = databaseInventory(writer);
    const saved = await createManagedBackup(f);
    t.after(saved.cleanup);
    assert.equal(saved.objects, 1);
    assert.equal(saved.bytes, png.length);
    assert.deepEqual(saved.tables, expectedTables);
    assert.equal(saved.archiveSha256, sha(readFileSync(saved.archiveFile)));
    assert.equal(sha(readFileSync(f.dbFile)), sourceHash);
    assert.equal(lstatSync(saved.archiveFile).mode & 0o777, 0o600);
    assert.equal(lstatSync(dirname(saved.archiveFile)).mode & 0o777, 0o700);
    assert.equal(lstatSync(saved.restoredRoot).mode & 0o777, 0o700);
    assert.ok(Number.isInteger(saved.restoreMs) && saved.restoreMs >= 0);
    const restoredDb = new DatabaseSync(join(saved.restoredRoot, "application.sqlite"), { readOnly: true });
    try {
      assert.equal(restoredDb.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.deepEqual(restoredDb.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(restoredDb.prepare("SELECT value FROM wal_only").get().value, "committed synthetic");
    } finally { restoredDb.close(); }
    const original = await privateOriginals(join(saved.restoredRoot, "originals")).get(key);
    assert.equal(sha(Buffer.from(await original.arrayBuffer())), sha(png));
    const entries = execFileSync("tar", ["-tf", saved.archiveFile], { encoding: "utf8" });
    assert.ok(entries.includes("application.sqlite"));
    assert.ok(!JSON.stringify({ ...saved, cleanup: undefined }).includes(key));
    assert.ok(!readdirSync(dirname(saved.archiveFile)).some((name) => name.startsWith(".snapshot-")));
    saved.cleanup();
    saved.cleanup();
    assert.equal(existsSync(saved.restoredRoot), false);
    assert.equal(existsSync(saved.archiveFile), true);
    assert.equal(existsSync(f.dbFile), true);
    assert.equal(sha(readFileSync(f.dbFile)), sourceHash);
    assert.equal((await privateOriginals(f.originals).get(key)).etag, sha(png));
    const second = await createManagedBackup(f);
    try { assert.notEqual(second.archiveFile, saved.archiveFile); } finally { second.cleanup(); }
  } finally { writer.close(); }
});

test("daily backup retention removes only old daily TARs and preserves golden snapshots", linuxOnly, async (t) => {
  const f = fixture(t), golden = await createManagedBackup(f);
  golden.cleanup();
  const root = dirname(golden.archiveFile);
  const old = join(root, "daily-2026-01-01-00000000-0000-0000-0000-000000000000.tar");
  writeFileSync(old, "old fixture", { mode: 0o600 });
  const result = await dailyManagedBackup(f, new Date("2026-01-10T03:00:00Z"));
  assert.equal(result.status, "MANAGED_DAILY_PHYSICAL_BACKUP_VERIFIED");
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(golden.archiveFile), true);
  assert.equal(existsSync(result.archiveFile), true);
  assert.equal(result.archiveSha256, sha(readFileSync(result.archiveFile)));
  assert.equal(result.objects, 1);
  assert.equal(result.retentionDays, 7);
});

test("original enumeration crosses the 1000-object page without omissions", linuxOnly, async (t) => {
  const f = fixture(t, 1001), saved = await createManagedBackup(f);
  try { assert.equal(saved.objects, 1001); assert.equal(saved.bytes, 1001 * png.length); }
  finally { saved.cleanup(); }
});

test("rejects public paths, links, hardlinks and unsafe storage modes", linuxOnly, async (t) => {
  const cases = ["public path", "DB symlink", "ancestor symlink", "root symlink", "partition symlink", "blob symlink", "metadata symlink",
    "WAL dangling symlink", "DB hardlink", "blob hardlink", "metadata hardlink", "DB permissions", "parent permissions", "root permissions", "partition permissions", "blob permissions", "metadata permissions"];
  for (const name of cases) await t.test(name, async (t) => {
    const f = fixture(t), id = sha(key), partition = join(f.originals, id.slice(0, 2));
    const blob = join(partition, id + ".blob"), meta = join(partition, id + ".json");
    if (name === "public path") {
      const publicDir = join(f.root, "public_html");
      mkdirSync(publicDir, { mode: 0o700 });
      renameSync(f.dbFile, join(publicDir, "application.sqlite"));
      f.dbFile = join(publicDir, "application.sqlite");
    } else if (name === "WAL dangling symlink") {
      symlinkSync(join(f.root, "absent"), f.dbFile + "-wal");
    } else if (name === "ancestor symlink") {
      const alias = join(f.root, "alias");
      symlinkSync(f.originals, alias, "dir");
      f.originals = join(alias, id.slice(0, 2));
    } else if (name.includes("symlink")) {
      const target = name.startsWith("DB") ? f.dbFile : name.startsWith("root") ? f.originals : name.startsWith("partition") ? partition : name.startsWith("metadata") ? meta : blob;
      const real = join(f.root, "real-storage");
      renameSync(target, real);
      symlinkSync(real, target);
    } else if (name.includes("hardlink")) {
      const target = name.startsWith("DB") ? f.dbFile : name.startsWith("metadata") ? meta : blob;
      linkSync(target, join(f.root, "extra-link"));
    } else {
      const target = name.startsWith("DB") ? f.dbFile : name.startsWith("parent") ? f.root : name.startsWith("root") ? f.originals : name.startsWith("partition") ? partition : name.startsWith("metadata") ? meta : blob;
      chmodSync(target, lstatSync(target).isDirectory() ? 0o755 : 0o644);
    }
    await assert.rejects(createManagedBackup(f), /MANAGED_BACKUP_RESTORE_FAILED/);
    assert.equal(existsSync(f.dbFile), true);
  });
});

test("rejects corrupt SQLite, broken FKs, missing originals and byte/hash corruption", linuxOnly, async (t) => {
  for (const kind of ["database", "foreign key", "missing original", "size", "sha256", "orphan blob"]) await t.test(kind, async (t) => {
    const f = fixture(t), id = sha(key), blob = join(f.originals, id.slice(0, 2), id + ".blob");
    if (kind === "database") writeFileSync(f.dbFile, "corrupt synthetic database");
    else if (kind === "foreign key" || kind === "missing original") {
      const db = new DatabaseSync(f.dbFile, { enableForeignKeyConstraints: false });
      try { db.exec(kind === "foreign key" ? "DELETE FROM albums" : "UPDATE images SET original_key='originals/missing.png'"); }
      finally { db.close(); }
    } else if (kind === "orphan blob") rmSync(join(f.originals, id.slice(0, 2), id + ".json"));
    else writeFileSync(blob, kind === "size" ? Buffer.from([0]) : Buffer.alloc(png.length));
    await assert.rejects(createManagedBackup(f), /MANAGED_BACKUP_RESTORE_FAILED/);
    const recovery = join(f.root, "managed-recovery");
    if (existsSync(recovery)) assert.ok(!readdirSync(recovery).some((name) => name.startsWith(".snapshot-") || name.startsWith(".restored-")));
  });
});

test("cleanup refuses a replaced restore directory and cannot delete the source", linuxOnly, async (t) => {
  const f = fixture(t), saved = await createManagedBackup(f), moved = saved.restoredRoot + ".moved";
  renameSync(saved.restoredRoot, moved);
  symlinkSync(f.root, saved.restoredRoot, "dir");
  assert.throws(saved.cleanup, /MANAGED_CLEANUP_OWNERSHIP_CHANGED/);
  assert.equal(existsSync(f.dbFile), true);
  assert.equal(existsSync(saved.archiveFile), true);
  rmSync(saved.restoredRoot);
  renameSync(moved, saved.restoredRoot);
  saved.cleanup();
});
