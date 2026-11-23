import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { privateOriginals } from "./originals.mjs";
import { openProductionStageDatabase } from "./sqlite.mjs";
import { fixturePng, fixtureSha256 } from "./acceptance-fixture.mjs";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const requireSafe = (condition) => { if (!condition) throw Error("MANAGED_FIXTURE_OWNERSHIP_NOT_VERIFIED"); };

export async function cleanupManagedFixture(config, fixture, expectedMarker) {
  requireSafe(fixture?.schema === "punctum-managed-fixture-v1" && /^p[a-f0-9]{6}$/.test(expectedMarker ?? "") &&
    fixture.marker === expectedMarker && /^[a-f0-9]{40}$/.test(fixture.sourceSha ?? "") && Number.isFinite(Date.parse(fixture.startedAt)));
  for (const [name, maximum] of [["albums", 2], ["clients", 4], ["galleries", 2], ["images", 8], ["inquiries", 2]]) {
    requireSafe(Array.isArray(fixture[name]) && fixture[name].length <= maximum &&
      fixture[name].every((item) => uuid.test(item.id ?? "")) && new Set(fixture[name].map(({ id }) => id)).size === fixture[name].length);
  }
  openProductionStageDatabase(config.dbFile).close();
  const seedFile = join(dirname(config.dbFile), "seed-manifest.json"), info = lstatSync(seedFile);
  requireSafe(info.isFile() && !info.isSymbolicLink() && info.nlink === 1 && !(info.mode & 0o077) && info.size <= 2_000_000);
  const baseline = new Set(JSON.parse(readFileSync(seedFile, "utf8")).objects.map(({ key }) => key));
  privateOriginals(config.originals);
  const files = [];
  const db = new DatabaseSync(config.dbFile, { enableForeignKeyConstraints: true, timeout: 5000 });
  const title = "Punctum QA " + expectedMarker;
  const selected = new Set([...fixture.albums, ...fixture.clients, ...fixture.galleries, ...fixture.images].map(({ id }) => id));
  try {
    db.exec("BEGIN IMMEDIATE");
    for (const table of ["site_settings", "site_config", "site_config_versions", "public_home_snapshot"]) {
      if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table)) continue;
      for (const row of db.prepare(`SELECT * FROM ${table}`).all()) {
        const content = JSON.stringify(row);
        requireSafe(![...selected].some((id) => content.includes(id)));
      }
    }
    for (const album of fixture.albums) {
      const row = db.prepare("SELECT title,created_at FROM albums WHERE id=?").get(album.id);
      if (row) requireSafe(row.title === title && album.title === title && Date.parse(row.created_at) >= Date.parse(fixture.startedAt) - 10000);
      const allowed = new Set(fixture.images.filter((item) => !item.private && item.parentId === album.id).map(({ id }) => id));
      requireSafe(db.prepare("SELECT id FROM images WHERE album_id=?").all(album.id).every(({ id }) => allowed.has(id)));
    }
    for (const client of fixture.clients) {
      const row = db.prepare("SELECT name,email,created_at FROM client_accounts WHERE id=?").get(client.id);
      if (row) requireSafe(row.name === title && client.name === title && row.email === client.email &&
        new RegExp(`^punctum-${expectedMarker}-[ab]@example\\.test$`).test(row.email) && Date.parse(row.created_at) >= Date.parse(fixture.startedAt) - 10000);
      const allowed = new Set(fixture.galleries.filter(({ clientId }) => clientId === client.id).map(({ id }) => id));
      requireSafe(db.prepare("SELECT id FROM client_galleries WHERE client_id=?").all(client.id).every(({ id }) => allowed.has(id)));
      requireSafe(!db.prepare("SELECT 1 FROM clerk_pilot_identity_links WHERE client_id=?").get(client.id));
    }
    for (const gallery of fixture.galleries) {
      requireSafe(fixture.clients.some(({ id }) => id === gallery.clientId));
      const row = db.prepare("SELECT title,client_id,created_at FROM client_galleries WHERE id=?").get(gallery.id);
      if (row) requireSafe(row.title === title && gallery.title === title && row.client_id === gallery.clientId &&
        Date.parse(row.created_at) >= Date.parse(fixture.startedAt) - 10000);
      const allowed = new Set(fixture.images.filter((item) => item.private && item.parentId === gallery.id).map(({ id }) => id));
      requireSafe(db.prepare("SELECT id FROM client_gallery_images WHERE gallery_id=?").all(gallery.id).every(({ id }) => allowed.has(id)));
      const clients = new Set(fixture.clients.map(({ id }) => id));
      requireSafe(db.prepare("SELECT client_id,image_id FROM client_gallery_favorites WHERE gallery_id=?").all(gallery.id)
        .every((row) => clients.has(row.client_id) && allowed.has(row.image_id)));
    }
    for (const image of fixture.images) {
      const parents = image.private ? fixture.galleries : fixture.albums;
      requireSafe(typeof image.private === "boolean" && parents.some(({ id }) => id === image.parentId) &&
        image.sha256 === fixtureSha256 && image.key === `${image.private ? "client-galleries" : "originals"}/${image.parentId}/${image.id}.png` && !baseline.has(image.key));
      const row = db.prepare(image.private
        ? "SELECT gallery_id AS parent,storage_key AS key FROM client_gallery_images WHERE id=?"
        : "SELECT album_id AS parent,original_key AS key FROM images WHERE id=?").get(image.id);
      if (row) requireSafe(row.parent === image.parentId && row.key === image.key);
      for (const [table, column] of [["images", "original_key"], ["site_media", "storage_key"], ["client_gallery_images", "storage_key"]]) {
        requireSafe(db.prepare(`SELECT id FROM ${table} WHERE ${column}=?`).all(image.key).every(({ id }) => id === image.id && table === (image.private ? "client_gallery_images" : "images")));
      }
      for (const [table, column, parent] of [["upload_intents", "object_key", "album_id"], ["client_gallery_upload_intents", "storage_key", "gallery_id"]]) {
        requireSafe(db.prepare(`SELECT image_id,${parent} AS parent FROM ${table} WHERE ${column}=?`).all(image.key)
          .every((row) => row.image_id === image.id && row.parent === image.parentId && table === (image.private ? "client_gallery_upload_intents" : "upload_intents")));
      }
      const id = createHash("sha256").update(image.key).digest("hex");
      for (const suffix of [".blob", ".json"]) {
        const file = join(config.originals, id.slice(0, 2), id + suffix);
        if (!existsSync(file)) continue;
        const stat = lstatSync(file);
        requireSafe(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1 && !(stat.mode & 0o077));
        if (suffix === ".blob") {
          requireSafe(stat.size === fixturePng.length && createHash("sha256").update(readFileSync(file)).digest("hex") === fixtureSha256);
        } else {
          const meta = JSON.parse(readFileSync(file, "utf8"));
          requireSafe(meta.schema === "punctum-private-original-v1" && meta.key === image.key && meta.sha256 === fixtureSha256 && meta.size === fixturePng.length);
        }
        files.push({ file, inode: stat.ino, device: stat.dev, uid: stat.uid });
      }
    }
    for (const inquiry of fixture.inquiries) {
      const row = db.prepare("SELECT name,email FROM inquiries WHERE id=?").get(inquiry.id);
      if (row) requireSafe(row.name === title && inquiry.name === title && row.email === inquiry.email && row.email === `punctum-${expectedMarker}@example.test`);
    }
    for (const { id } of fixture.galleries) {
      db.prepare("DELETE FROM client_gallery_favorites WHERE gallery_id=?").run(id);
      db.prepare("DELETE FROM client_gallery_upload_intents WHERE gallery_id=?").run(id);
      db.prepare("DELETE FROM client_gallery_images WHERE gallery_id=?").run(id);
      db.prepare("DELETE FROM client_galleries WHERE id=?").run(id);
    }
    for (const { id } of fixture.clients) db.prepare("DELETE FROM client_accounts WHERE id=?").run(id);
    for (const { id } of fixture.albums) db.prepare("DELETE FROM albums WHERE id=?").run(id);
    for (const { id } of fixture.inquiries) db.prepare("DELETE FROM inquiries WHERE id=?").run(id);
    requireSafe(db.prepare("PRAGMA foreign_key_check").all().length === 0);
    db.exec("COMMIT");
  } catch (error) { try { db.exec("ROLLBACK"); } catch { /* BEGIN may have failed before a transaction existed. */ } throw error; }
  finally { db.close(); }
  for (const { file, inode, device, uid } of files) {
    const current = lstatSync(file);
    requireSafe(current.isFile() && !current.isSymbolicLink() && current.ino === inode && current.dev === device && current.uid === uid);
    unlinkSync(file);
  }
  return { status: "OWNED_FIXTURE_REMOVED", albums: fixture.albums.length, clients: fixture.clients.length,
    galleries: fixture.galleries.length, images: fixture.images.length, inquiries: fixture.inquiries.length, files: files.length };
}
