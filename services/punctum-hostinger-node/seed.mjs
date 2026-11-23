import { closeSync, openSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import { isAbsolute } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { qaApplicationId } from "./sqlite.mjs";

const file = process.argv[2];
if (!file || !isAbsolute(file)) throw new Error("Pass the absolute path of a new QA database");
closeSync(openSync(file, "wx", 0o600));
try {
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  try {
    const directory = new URL("../../migrations/", import.meta.url);
    db.exec("BEGIN IMMEDIATE");
    for (const migration of readdirSync(directory).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
      db.exec(readFileSync(new URL(migration, directory), "utf8"));
    }
    db.exec(`PRAGMA application_id = ${qaApplicationId}`);
    db.exec(`CREATE TABLE node_qa_media (
      key TEXT PRIMARY KEY, bytes BLOB NOT NULL, mime TEXT NOT NULL, etag TEXT NOT NULL
    ) STRICT`);
    db.exec("COMMIT");
    if (db.prepare("PRAGMA foreign_key_check").all().length !== 0) {
      throw new Error("QA migration produced inconsistent references");
    }
  } finally {
    db.close();
  }
} catch (error) {
  unlinkSync(file);
  throw error;
}
