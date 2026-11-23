import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { exportD1Snapshot } from "./managed-d1-export.mjs";

test("reverse export preserves post-snapshot changes, types, cyclic references and trigger state", () => {
  const source = new DatabaseSync(":memory:");
  const restored = new DatabaseSync(":memory:");
  try {
    source.exec(`
      CREATE TABLE parents(id INTEGER PRIMARY KEY, child_id INTEGER REFERENCES children(id), title TEXT);
      CREATE TABLE children(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parents(id), payload BLOB, note TEXT, numeric_value);
      CREATE TABLE audit(id INTEGER PRIMARY KEY, action TEXT);
      CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE);
      CREATE TABLE _cf_internal(id INTEGER);
      CREATE INDEX child_parent ON children(parent_id);
      CREATE VIEW child_titles AS SELECT c.id,p.title FROM children c JOIN parents p ON p.id=c.parent_id;
      CREATE TRIGGER record_insert AFTER INSERT ON children BEGIN INSERT INTO audit(action) VALUES ('created'); END;
      BEGIN; PRAGMA defer_foreign_keys=ON;
      INSERT INTO parents VALUES(1,1,'original');
      INSERT INTO children VALUES(1,1,X'00ff','first',1.0);
      INSERT INTO children VALUES(2,1,X'aa','deleted later',2.0);
      COMMIT;
      UPDATE parents SET title='edited after initial migration' WHERE id=1;
      DELETE FROM children WHERE id=2;
      INSERT INTO children VALUES(3,1,X'bb','new post-migration row',3.0);
      INSERT INTO d1_migrations(name) VALUES('0015_clerk_admin_identity_links.sql');
    `);
    const unusual = "João's image\0尾";
    source.prepare("UPDATE parents SET title=? WHERE id=1").run("edited O'Neil 漢字");
    source.prepare("UPDATE children SET note=?,numeric_value=? WHERE id=1").run(unusual, 9223372036854775807n);
    const exported = exportD1Snapshot(source);
    assert.equal(source.isTransaction, false);
    assert.equal(exported.tables.children, 2);
    assert.equal(exported.tables._cf_internal, undefined);
    assert(!exported.sql.includes("application_id"));
    restored.exec("BEGIN;" + exported.sql + "COMMIT;");
    assert.equal(restored.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.deepEqual(restored.prepare("PRAGMA foreign_key_check").all(), []);
    for (const query of ["SELECT * FROM parents", "SELECT id,parent_id,hex(payload) AS payload,hex(note) AS note,typeof(numeric_value) AS type,CAST(numeric_value AS TEXT) AS value FROM children ORDER BY id", "SELECT * FROM audit", "SELECT * FROM child_titles ORDER BY id", "SELECT * FROM d1_migrations"]) {
      assert.deepEqual(restored.prepare(query).all(), source.prepare(query).all());
    }
    assert.equal(restored.prepare("SELECT count(*) AS n FROM audit").get().n, 3);
    restored.exec("INSERT INTO children VALUES(4,1,X'cc','after restore',4.0)");
    assert.equal(restored.prepare("SELECT count(*) AS n FROM audit").get().n, 4);
    assert.equal(exportD1Snapshot(source).sqlSha256, exported.sqlSha256);
  } finally { source.close(); restored.close(); }
});

test("reverse export quotes identifiers and rejects unsupported numeric values without data loss", () => {
  const db = new DatabaseSync(":memory:");
  const target = new DatabaseSync(":memory:");
  try {
    db.exec('CREATE TABLE "odd""table"("odd""column" TEXT,value);');
    db.prepare('INSERT INTO "odd""table" VALUES(?,?)').run("'; DROP TABLE x; --", 2.0);
    const exported = exportD1Snapshot(db);
    target.exec("BEGIN;" + exported.sql + "COMMIT;");
    assert.deepEqual(target.prepare('SELECT *,typeof(value) AS storage FROM "odd""table"').all(), db.prepare('SELECT *,typeof(value) AS storage FROM "odd""table"').all());
    db.exec('INSERT INTO "odd""table" VALUES(NULL,1e999)');
    assert.throws(() => exportD1Snapshot(db), /VALUE_UNSUPPORTED/);
    assert.equal(db.prepare('SELECT count(*) AS n FROM "odd""table"').get().n, 2);
    assert.equal(db.isTransaction, false);
  } finally { db.close(); target.close(); }
});

test("reverse export rejects corrupt references and never commits a caller's transaction", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE p(id INTEGER PRIMARY KEY); CREATE TABLE c(id INTEGER REFERENCES p(id)); BEGIN;");
    assert.throws(() => exportD1Snapshot(db), /TRANSACTION_OWNED_BY_CALLER/);
    assert.equal(db.isTransaction, true);
    db.exec("ROLLBACK; PRAGMA foreign_keys=OFF; INSERT INTO c VALUES(99); PRAGMA foreign_keys=ON;");
    assert.throws(() => exportD1Snapshot(db), /SNAPSHOT_INVALID/);
    assert.equal(db.isTransaction, false);
  } finally { db.close(); }
});
