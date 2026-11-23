import test from "node:test";
import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  createReadStream,
  createWriteStream,
  appendFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import { runUnlimitedImportIfPresent } from "./unlimited-import.mjs";
import { ensureUnlimitedCandidateStorage } from "./unlimited-bootstrap.mjs";
import { productionStageApplicationId } from "./sqlite.mjs";
import { stageOriginal } from "./originals.mjs";
import { databaseInventory } from "./managed-import.mjs";

const migrationsDir = new URL("../../migrations/", import.meta.url);

async function makeEncryptedSeed(workDir) {
  const srcRoot = join(workDir, "src");
  const origRoot = join(srcRoot, "originals");
  mkdirSync(origRoot, { mode: 0o700, recursive: true });

  const dbPath = join(srcRoot, "application.sqlite");
  const db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
  let albumId, imageId, storageKey, tables, originalInfo;
  try {
    db.exec(`PRAGMA application_id = ${productionStageApplicationId};`);
    for (const file of readdirSync(migrationsDir).filter((n) => /^\d{4}_.+\.sql$/.test(n)).sort()) {
      db.exec(readFileSync(new URL(file, migrationsDir), "utf8"));
    }
    const now = new Date().toISOString();
    albumId = randomUUID();
    imageId = randomUUID();
    const blob = Buffer.from("synthetic-jpeg-payload-for-unlimited-import");
    const sha256 = createHash("sha256").update(blob).digest("hex");
    storageKey = `albums/${albumId}/${imageId}.jpg`;
    originalInfo = stageOriginal(origRoot, storageKey, blob, "image/jpeg", sha256);

    db.prepare(
      `INSERT INTO albums (id, slug, title, description, location, status, published_at, sort_order, created_at, updated_at)
       VALUES (?, 'ensaio-importado', 'Ensaio Importado Cloudflare', '', 'SC', 'published', ?, 1, ?, ?)`,
    ).run(albumId, now, now, now);
    db.prepare(
      `INSERT INTO images (id, album_id, original_key, original_filename, mime_type, size_bytes, width, height, checksum, position, status, created_at, updated_at)
       VALUES (?, ?, ?, 'foto-1.jpg', 'image/jpeg', ?, 800, 600, ?, 1, 'ready', ?, ?)`,
    ).run(imageId, albumId, storageKey, blob.length, sha256, now, now);
    tables = databaseInventory(db);
  } finally {
    db.close();
  }

  const manifest = {
    schema: "punctum-managed-seed-v1",
    sqlSha256: createHash("sha256").update("seed").digest("hex"),
    objects: [{ key: storageKey, size: originalInfo.size, sha256: originalInfo.sha256, contentType: "image/jpeg" }],
    tables,
  };
  writeFileSync(join(srcRoot, "seed-manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
  const archive = join(workDir, "seed.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", srcRoot, "application.sqlite", "originals", "seed-manifest.json"]);

  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const bundle = join(workDir, "managed-seed.bin");
  writeFileSync(bundle, iv, { mode: 0o600, flag: "wx" });
  await pipeline(createReadStream(archive), cipher, createWriteStream(bundle, { flags: "a" }));
  appendFileSync(bundle, cipher.getAuthTag());
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(bundle)) hash.update(chunk);
  return {
    bundle,
    keyHex: key.toString("hex"),
    digestHex: hash.digest("hex"),
    albumId,
    imageId,
  };
}

test("runUnlimitedImportIfPresent skips cleanly when bundle is absent", async () => {
  const receipt = await runUnlimitedImportIfPresent(
    {
      PUNCTUM_CANDIDATE_DB_FILE: "/tmp/nonexistent/application.sqlite",
    },
    { bundlePath: "/tmp/nonexistent-bundle-that-does-not-exist.bin" },
  );
  assert.deepEqual(receipt, { status: "PUNCTUM_UNLIMITED_IMPORT_NOT_REQUESTED" });
});

test("runUnlimitedImportIfPresent decrypts, imports, reuses idempotently, and preserves data on bootstrap", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-unlimited-import-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const seed = await makeEncryptedSeed(root);
  const destRoot = join(root, "punctum-managed-storage", "punctum-unlimited-d1-r4");
  const dbFile = join(destRoot, "application.sqlite");
  const originals = join(destRoot, "originals");
  const backups = join(destRoot, "backups");

  const env = {
    PUNCTUM_CANDIDATE_DB_FILE: dbFile,
    PUNCTUM_CANDIDATE_ORIGINALS: originals,
    PUNCTUM_CANDIDATE_BACKUPS_ROOT: backups,
    PUNCTUM_MANAGED_IMPORT_KEY: seed.keyHex,
    PUNCTUM_MANAGED_IMPORT_SHA256: seed.digestHex,
    PUNCTUM_CANDIDATE_ADMIN_EMAIL: "studio@punctumpicture.com",
    PUNCTUM_CANDIDATE_CLERK_ADMIN_USER_ID: "user_3M7epRZWjA3wg33n8xOk9ddeOzg",
    PUNCTUM_QA_SOURCE_SHA: "e".repeat(40),
  };

  const first = await runUnlimitedImportIfPresent(env, { bundlePath: seed.bundle });
  assert.equal(first.status, "PUNCTUM_UNLIMITED_IMPORT_VERIFIED");
  assert.equal(first.objects, 1);
  assert.equal(first.reused, false);
  assert.equal(existsSync(dbFile), true);
  assert.equal(statSync(destRoot).mode & 0o077, 0);
  assert.equal(statSync(dbFile).mode & 0o077, 0);

  const boot = ensureUnlimitedCandidateStorage(env);
  assert.equal(boot.status, "PUNCTUM_UNLIMITED_BOOTSTRAP_VERIFIED");
  assert.equal(boot.createdDatabase, false);
  assert.equal(boot.adminClerkLinked, true);
  assert.equal(boot.hasLayoutPresetColumn, true);

  const second = await runUnlimitedImportIfPresent(env, { bundlePath: seed.bundle });
  assert.equal(second.status, "PUNCTUM_UNLIMITED_IMPORT_VERIFIED");
  assert.equal(second.reused, true);

  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const row = db.prepare("SELECT title FROM albums WHERE id = ?").get(seed.albumId);
    assert.equal(row?.title, "Ensaio Importado Cloudflare");
  } finally {
    db.close();
  }
});

test("runUnlimitedImportIfPresent fails closed on missing config, unsafe paths, or symlinks", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "punctum-unlimited-import-unsafe-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bundle = join(root, "managed-seed.bin");
  writeFileSync(bundle, Buffer.from("dummy"));

  await assert.rejects(
    () => runUnlimitedImportIfPresent({}, { bundlePath: bundle }),
    /UNLIMITED_IMPORT_MISSING_CONFIG/,
  );

  await assert.rejects(
    () =>
      runUnlimitedImportIfPresent(
        {
          PUNCTUM_CANDIDATE_DB_FILE: join(root, "public_html", "application.sqlite"),
          PUNCTUM_CANDIDATE_ORIGINALS: join(root, "public_html", "originals"),
          PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(root, "public_html", "backups"),
          PUNCTUM_MANAGED_IMPORT_KEY: "a".repeat(64),
          PUNCTUM_MANAGED_IMPORT_SHA256: "b".repeat(64),
        },
        { bundlePath: bundle },
      ),
    /UNLIMITED_IMPORT_UNSAFE_PATH/,
  );

  const realDir = join(root, "real");
  const symDir = join(root, "sym");
  mkdirSync(realDir, { mode: 0o700 });
  symlinkSync(realDir, symDir);
  await assert.rejects(
    () =>
      runUnlimitedImportIfPresent(
        {
          PUNCTUM_CANDIDATE_DB_FILE: join(symDir, "dest", "application.sqlite"),
          PUNCTUM_CANDIDATE_ORIGINALS: join(symDir, "dest", "originals"),
          PUNCTUM_CANDIDATE_BACKUPS_ROOT: join(symDir, "dest", "backups"),
          PUNCTUM_MANAGED_IMPORT_KEY: "a".repeat(64),
          PUNCTUM_MANAGED_IMPORT_SHA256: "b".repeat(64),
        },
        { bundlePath: bundle },
      ),
    /UNLIMITED_IMPORT_SYMLINK_FORBIDDEN/,
  );
  chmodSync(realDir, 0o700);
});
