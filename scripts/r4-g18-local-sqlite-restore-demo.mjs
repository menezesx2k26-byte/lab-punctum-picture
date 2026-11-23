#!/usr/bin/env node
/**
 * Isolated local-only G18 demo for managed SQLite reverse export/restore.
 * Synthetic data only. No Hostinger, Cloudflare, or production media.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { exportD1Snapshot } from "../services/punctum-hostinger-production/managed-d1-export.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function runG18LocalSqliteRestoreDemo(root = mkdtempSync(join(tmpdir(), "punctum-g18-local-"))) {
  const mode = 0o700;
  const originals = join(root, "originals");
  const backups = join(root, "backups");
  const liveDbPath = join(root, "live.sqlite");
  const restoredDbPath = join(root, "restored.sqlite");
  mkdirSync(originals, { mode });
  mkdirSync(backups, { mode });

  const live = new DatabaseSync(liveDbPath);
  try {
    live.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE client_accounts(id TEXT PRIMARY KEY, name TEXT NOT NULL, session_version INTEGER NOT NULL);
      CREATE TABLE client_galleries(id TEXT PRIMARY KEY, client_id TEXT NOT NULL REFERENCES client_accounts(id), title TEXT NOT NULL);
      CREATE TABLE client_gallery_images(
        id TEXT PRIMARY KEY,
        gallery_id TEXT NOT NULL REFERENCES client_galleries(id),
        storage_key TEXT NOT NULL,
        original_sha256 TEXT NOT NULL,
        note TEXT
      );
    `);
    const clients = [
      { id: "client-a", name: "Synthetic A" },
      { id: "client-b", name: "Synthetic B" },
    ];
    const galleries = [
      { id: "gallery-a", clientId: "client-a", title: "Album A" },
      { id: "gallery-b", clientId: "client-b", title: "Album B" },
    ];
    const objectDigests = [];
    for (const client of clients) {
      live.prepare(
        "INSERT INTO client_accounts(id,name,session_version) VALUES(?,?,1)",
      ).run(client.id, client.name);
    }
    for (const gallery of galleries) {
      live.prepare(
        "INSERT INTO client_galleries(id,client_id,title) VALUES(?,?,?)",
      ).run(gallery.id, gallery.clientId, gallery.title);
      for (let i = 0; i < 5; i++) {
        const id = `${gallery.id}-img-${i}`;
        const bytes = randomBytes(64 + i);
        // Embed a NUL + UTF-8 tail to prove TEXT fidelity after the export fix.
        const note = `obj-${i}\0尾`;
        const key = `client-galleries/${gallery.id}/${id}.bin`;
        const digest = sha256(bytes);
        writeFileSync(join(originals, `${id}.bin`), bytes, { mode: 0o600 });
        live.prepare(
          `INSERT INTO client_gallery_images(id,gallery_id,storage_key,original_sha256,note)
           VALUES(?,?,?,?,?)`,
        ).run(id, gallery.id, key, digest, note);
        objectDigests.push({ id, galleryId: gallery.id, digest, bytes, note });
      }
    }

    // "Backup" step: logical SQL export + hashed originals inventory.
    const snapshot = exportD1Snapshot(live);
    const backupSqlPath = join(backups, "logical.sql");
    writeFileSync(backupSqlPath, snapshot.sql, { mode: 0o600 });
    const inventory = objectDigests.map((item) => ({
      id: item.id,
      galleryId: item.galleryId,
      digest: item.digest,
      noteHex: Buffer.from(item.note, "utf8").toString("hex"),
    }));
    writeFileSync(
      join(backups, "originals-inventory.json"),
      JSON.stringify({ count: inventory.length, items: inventory }, null, 2),
      { mode: 0o600 },
    );

    // "Restart/rebuild": close live handle and open a fresh DB from the export only.
    live.close();
    const restored = new DatabaseSync(restoredDbPath);
    try {
      restored.exec("BEGIN;" + readFileSync(backupSqlPath, "utf8") + "COMMIT;");
      assert.equal(restored.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
      assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(
        restored.prepare("SELECT count(*) AS n FROM client_accounts").get().n,
        2,
      );
      assert.equal(
        restored.prepare("SELECT count(*) AS n FROM client_galleries").get().n,
        2,
      );
      assert.equal(
        restored.prepare("SELECT count(*) AS n FROM client_gallery_images").get().n,
        10,
      );

      for (const item of objectDigests) {
        const row = restored
          .prepare(
            `SELECT gallery_id AS galleryId, storage_key AS storageKey,
                    original_sha256 AS digest, hex(note) AS noteHex
             FROM client_gallery_images WHERE id=?`,
          )
          .get(item.id);
        assert.equal(row.galleryId, item.galleryId);
        assert.equal(row.digest, item.digest);
        assert.equal(row.noteHex, Buffer.from(item.note, "utf8").toString("hex").toUpperCase());
        const fileDigest = sha256(readFileSync(join(originals, `${item.id}.bin`)));
        assert.equal(fileDigest, item.digest);
      }

      // Cross-tenant negative: gallery B rows never reference client A.
      const leak = restored
        .prepare(
          `SELECT count(*) AS n FROM client_galleries g
           JOIN client_accounts c ON c.id=g.client_id
           WHERE g.id='gallery-b' AND c.id='client-a'`,
        )
        .get().n;
      assert.equal(leak, 0);

      return {
        result: "PASS_LOCAL_SYNTHETIC_G18_SQLITE",
        root,
        clients: 2,
        galleries: 2,
        objects: 10,
        sqlSha256: snapshot.sqlSha256,
        backupSqlPath,
      };
    } finally {
      restored.close();
    }
  } catch (error) {
    try {
      live.close();
    } catch {
      /* already closed */
    }
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keep = process.argv.includes("--keep");
  let root;
  try {
    const report = runG18LocalSqliteRestoreDemo();
    root = report.root;
    console.log(JSON.stringify(report));
  } finally {
    if (root && !keep) rmSync(root, { recursive: true, force: true });
  }
}
