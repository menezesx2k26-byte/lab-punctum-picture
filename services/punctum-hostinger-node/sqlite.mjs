import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { privateQaDatabasePath } from "./runtime.mjs";

export const qaApplicationId = 0x50554e51;

export function openQaDatabase(path) {
  const sqlite = new DatabaseSync(privateQaDatabasePath(path), { enableForeignKeyConstraints: true, timeout: 5000 });
  if (sqlite.prepare("PRAGMA application_id").get().application_id !== qaApplicationId) {
    sqlite.close();
    throw new Error("Only a synthetic Punctum QA database is accepted");
  }

  const executions = new WeakMap();

  function prepare(sql, values = []) {
    const statement = sqlite.prepare(sql);
    const execute = () => {
      const started = performance.now();
      const hasColumns = statement.columns().length > 0;
      const before = hasColumns ? sqlite.prepare("SELECT total_changes() AS count").get().count : 0;
      const result = hasColumns ? undefined : statement.run(...values);
      const results = hasColumns ? statement.all(...values) : [];
      const wroteRows = hasColumns && sqlite.prepare("SELECT total_changes() AS count").get().count !== before;
      const changes = wroteRows ? sqlite.prepare("SELECT changes() AS count").get().count : result?.changes ?? 0;
      return {
        success: true,
        results,
        meta: { duration: performance.now() - started, changes: Number(changes) },
      };
    };
    const bound = {
      bind: (...parameters) => prepare(sql, parameters),
      first: async (column) => {
        const row = statement.get(...values);
        if (!row) return null;
        if (column === undefined) return row;
        if (!Object.hasOwn(row, column)) throw new Error("Unknown result column");
        return row[column];
      },
      all: async () => execute(),
      run: async () => execute(),
    };
    executions.set(bound, execute);
    return bound;
  }

  return {
    prepare,
    close: () => sqlite.close(),
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => {
          const execute = executions.get(statement);
          if (!execute) throw new Error("Statement belongs to a different database");
          return execute();
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
