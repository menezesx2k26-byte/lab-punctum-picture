import { statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";

export const qaApplicationId = 0x50554e51;

export function openQaDatabase(path) {
  if (!statSync(path).isFile()) throw new Error("QA database must be an existing file");
  const sqlite = new DatabaseSync(path, { enableForeignKeyConstraints: true, timeout: 5000 });
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
      const result = hasColumns ? undefined : statement.run(...values);
      return {
        success: true,
        results: hasColumns ? statement.all(...values) : [],
        meta: { duration: performance.now() - started, changes: Number(result?.changes ?? 0) },
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
