import { DatabaseSync } from "node:sqlite";
import { lstatSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const productionStageApplicationId = 0x50554e50;
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export function validatePrivateStageDb(path) {
  if (typeof path !== "string" || !isAbsolute(path)) throw Error("STAGE_DB_ABSOLUTE_REQUIRED");
  const original = lstatSync(path);
  const canonical = realpathSync(path);
  const file = statSync(canonical);
  const parent = statSync(dirname(canonical));
  const rel = relative(projectRoot, canonical);
  if (canonical === projectRoot || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel)) ||
      /(?:^|[\\/])(?:hbuilds|public_html|public|dist)(?:[\\/]|$)/i.test(canonical) ||
      original.isSymbolicLink() || !file.isFile() || file.nlink !== 1 ||
      (file.mode & 0o077) || !parent.isDirectory() || (parent.mode & 0o077)) {
    throw Error("UNSAFE_PRODUCTION_STAGE_DB");
  }
  return canonical;
}

export function openProductionStageDatabase(path) {
  const valid = validatePrivateStageDb(path);
  const db = new DatabaseSync(valid, {
    readOnly: true, enableForeignKeyConstraints: true, timeout: 5000,
  });
  try {
    if (db.prepare("PRAGMA application_id").get().application_id !== productionStageApplicationId ||
        db.prepare("PRAGMA quick_check").get().quick_check !== "ok" ||
        db.prepare("PRAGMA foreign_key_check").all().length !== 0) {
      throw Error("INVALID_PRODUCTION_STAGE_DB_ID_OR_INTEGRITY");
    }
  } catch (error) {
    db.close();
    throw error;
  }
  const forbidden = () => { throw Error("PRODUCTION_STAGE_SQL_WRITES_DISABLED"); };
  const prepare = (sql, args = []) => {
    const statement = db.prepare(sql);
    if (typeof statement.readOnly === "boolean" && !statement.readOnly)
      throw Error("PRODUCTION_STAGE_SQL_WRITES_DISABLED");
    return {
      bind: (...values) => prepare(sql, values),
      first: async (column) => {
        const row = statement.get(...args);
        if (!row) return null;
        if (column === undefined) return row;
        if (!Object.hasOwn(row,column)) throw Error("UNKNOWN_RESULT_COLUMN");
        return row[column];
      },
      all: async () => ({
        success: true,
        results: statement.all(...args),
        meta: { duration: 0, changes: 0 },
      }),
      run: forbidden,
    };
  };
  return {
    prepare,
    batch: forbidden,
    close: () => db.close(),
  };
}
