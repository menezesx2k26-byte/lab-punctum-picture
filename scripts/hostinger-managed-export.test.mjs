import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS_DIR = join(process.cwd(), "migrations");

test("hostinger-managed-export includes every migration from 0009 onward, including 0016 layout presets", async () => {
  const source = readFileSync(join(process.cwd(), "scripts/hostinger-managed-export.mjs"), "utf8");
  const expected = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && name >= "0009_")
    .sort();
  assert(expected.includes("0016_private_gallery_layout_presets.sql"));
  for (const file of expected) {
    assert(source.includes(file), `hostinger-managed-export.mjs is missing migration ${file}`);
  }
});

test("applyManagedExportMigrations upgrades pre-0009 and pre-0016 databases without mutating prior data", async () => {
  const { MANAGED_EXPORT_MIGRATIONS, applyManagedExportMigrations } = await import("./hostinger-managed-export.mjs");
  assert(MANAGED_EXPORT_MIGRATIONS.includes("0016_private_gallery_layout_presets.sql"));

  // Case A: pre-0009 database (matching current production D1 schema)
  const dbPre0009 = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  try {
    dbPre0009.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE);");
    for (const file of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql") && n < "0009_").sort()) {
      dbPre0009.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      dbPre0009.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
    }
    const { tables } = applyManagedExportMigrations(dbPre0009, MIGRATIONS_DIR);
    assert(tables.client_galleries, "client_galleries must exist after managed export migrations");
    const columns = dbPre0009.prepare("PRAGMA table_info(client_galleries)").all().map((c) => c.name);
    assert(columns.includes("layout_preset"), "layout_preset column must exist after migration 0016");
  } finally {
    dbPre0009.close();
  }

  // Case B: pre-0016 database with existing legacy client_galleries row
  const dbPre0016 = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  try {
    dbPre0016.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE);");
    for (const file of readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql") && n < "0016_").sort()) {
      dbPre0016.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
      dbPre0016.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(file);
    }
    dbPre0016.prepare(
      `INSERT INTO client_accounts (id,name,email,password_hash,password_salt,password_iterations,must_change_password,session_version,created_at,updated_at)
       VALUES ('c1','Legacy','legacy@example.test','h','s',310000,0,1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    ).run();
    dbPre0016.prepare(
      `INSERT INTO client_galleries (id,client_id,title,introduction,theme,allow_downloads,status,created_at,updated_at)
       VALUES ('g1','c1','Álbum legado','Intro','warm',1,'published','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`,
    ).run();

    applyManagedExportMigrations(dbPre0016, MIGRATIONS_DIR);

    const legacy = dbPre0016.prepare("SELECT id,client_id,title,introduction,theme,allow_downloads,status,layout_preset FROM client_galleries WHERE id='g1'").get();
    assert.deepEqual({ ...legacy }, {
      id: "g1",
      client_id: "c1",
      title: "Álbum legado",
      introduction: "Intro",
      theme: "warm",
      allow_downloads: 1,
      status: "published",
      layout_preset: "classico",
    });

    // Enforce CHECK constraint for all 5 valid values and reject arbitrary values
    for (const preset of ["classico", "editorial", "colagem", "mosaico", "cinema"]) {
      dbPre0016.prepare("UPDATE client_galleries SET layout_preset=? WHERE id='g1'").run(preset);
      assert.equal(dbPre0016.prepare("SELECT layout_preset FROM client_galleries WHERE id='g1'").get().layout_preset, preset);
    }
    assert.throws(() => {
      dbPre0016.prepare("UPDATE client_galleries SET layout_preset='invalid-css' WHERE id='g1'").run();
    }, /CHECK constraint failed/);

    // Re-running is idempotent
    applyManagedExportMigrations(dbPre0016, MIGRATIONS_DIR);
  } finally {
    dbPre0016.close();
  }
});
