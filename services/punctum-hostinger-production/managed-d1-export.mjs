import { createHash } from "node:crypto";

const identifier = (value) => '"' + value.replaceAll('"', '""') + '"';
const applicationObject = (name) => !name.startsWith("sqlite_") && !name.startsWith("_cf_");

function literalFromStorage(type, hexValue, rawValue) {
  if (type === "null") return "NULL";
  if (type === "integer") {
    if (typeof rawValue === "bigint") return rawValue.toString();
    if (typeof rawValue === "number" && Number.isSafeInteger(rawValue)) {
      return String(rawValue);
    }
    // Prefer the exact decimal captured by CAST(... AS TEXT) when available.
    if (typeof rawValue === "string" && /^-?\d+$/.test(rawValue)) return rawValue;
    throw Error("MANAGED_D1_VALUE_UNSUPPORTED");
  }
  if (type === "real") {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) {
      throw Error("MANAGED_D1_VALUE_UNSUPPORTED");
    }
    const text = String(rawValue);
    return /[.e]/i.test(text) ? text : text + ".0";
  }
  if (type === "text") {
    // node:sqlite truncates JS strings at embedded NULs; hex() is authoritative.
    const bytes = Buffer.from(hexValue, "hex");
    if (bytes.includes(0)) {
      return "CAST(X'" + hexValue + "' AS TEXT)";
    }
    return "'" + bytes.toString("utf8").replaceAll("'", "''") + "'";
  }
  if (type === "blob") return "X'" + hexValue + "'";
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
      const typedSelection = columns
        .map(
          (column) =>
            `typeof(${identifier(column)}) AS ${identifier(column + "__type")},` +
            `hex(${identifier(column)}) AS ${identifier(column + "__hex")},` +
            `CAST(${identifier(column)} AS TEXT) AS ${identifier(column + "__text")},` +
            `${identifier(column)} AS ${identifier(column)}`,
        )
        .join(",");
      const statement = db.prepare(
        "SELECT " + typedSelection + " FROM " + identifier(table.name),
      );
      statement.setReadBigInts(true);
      const rows = statement.all();
      const inserts = rows
        .map((row) => {
          const values = columns.map((column) => {
            const type = row[column + "__type"];
            const hexValue = row[column + "__hex"] ?? "";
            const raw =
              type === "integer" ? (row[column] ?? row[column + "__text"]) : row[column];
            return literalFromStorage(type, hexValue, raw);
          });
          return (
            "INSERT INTO " +
            identifier(table.name) +
            "(" +
            selection +
            ") VALUES(" +
            values.join(",") +
            ");"
          );
        })
        .sort();
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
