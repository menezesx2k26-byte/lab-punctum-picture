import { createHash } from "node:crypto";

const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
const applicationObject = (name) => !name.startsWith("sqlite_") && !name.startsWith("_cf_");

function literal(value) {
  if (value === null) return "NULL";
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const text = String(value);
    return /[.e]/i.test(text) ? text : text + ".0";
  }
  if (typeof value === "string") return value.includes("\0")
    ? "CAST(X'" + Buffer.from(value).toString("hex") + "' AS TEXT)"
    : "'" + value.replaceAll("'", "''") + "'";
  if (value instanceof Uint8Array) return "X'" + Buffer.from(value).toString("hex") + "'";
  throw Error("MANAGED_D1_VALUE_UNSUPPORTED");
}

export function exportD1Snapshot(db) {
  if (db.isTransaction) throw Error("MANAGED_D1_SNAPSHOT_TRANSACTION_OWNED_BY_CALLER");
  db.exec("BEGIN");
  try {
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length)
      throw Error("MANAGED_D1_SNAPSHOT_INVALID");
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name").all()
      .filter((row) => applicationObject(row.name) && applicationObject(row.tbl_name));
    if (schema.some((row) => /^CREATE\s+VIRTUAL\s+TABLE/i.test(row.sql))) throw Error("MANAGED_D1_VIRTUAL_TABLE_REQUIRES_REVIEW");
    const tables = schema.filter((row) => row.type === "table");
    if (!tables.length) throw Error("MANAGED_D1_SNAPSHOT_EMPTY");
    const lines = ["PRAGMA defer_foreign_keys=ON;", ...tables.map((row) => row.sql.replace(/;\s*$/, "") + ";")];
    const counts = {};
    for (const table of tables) {
      const columns = db.prepare("PRAGMA table_xinfo(" + identifier(table.name) + ")").all().filter((row) => row.hidden === 0).map((row) => row.name);
      if (!columns.length) throw Error("MANAGED_D1_COLUMNS_UNSUPPORTED");
      const selection = columns.map(identifier).join(",");
      const statement = db.prepare("SELECT " + selection + " FROM " + identifier(table.name));
      statement.setReadBigInts(true);
      const rows = statement.all();
      const inserts = rows.map((row) => "INSERT INTO " + identifier(table.name) + "(" + selection + ") VALUES(" + columns.map((column) => literal(row[column])).join(",") + ");").sort();
      lines.push(...inserts);
      counts[table.name] = rows.length;
    }
    for (const type of ["index", "view", "trigger"]) {
      for (const row of schema.filter((item) => item.type === type)) lines.push(row.sql.replace(/;\s*$/, "") + ";");
    }
    const sql = lines.join("\n") + "\n";
    return { sql, sqlSha256: createHash("sha256").update(sql).digest("hex"), tables: counts };
  } finally { db.exec("ROLLBACK"); }
}
