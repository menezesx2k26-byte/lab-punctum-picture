import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { validatePrivateStageDb, productionStageApplicationId } from "./sqlite.mjs";

/**
 * Writable D1-compatible SQLite adapter for the isolated Hostinger production candidate.
 * Requires explicit candidate opt-in and refuses golden export/import snapshot paths.
 */
export function openCandidateWritableDatabase(path, { candidateMode } = {}) {
  if (
    candidateMode !== "PRIVATE_PRODUCTION_CANDIDATE" ||
    process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE !== "private-candidate"
  ) {
    throw Error("CANDIDATE_D1_MODE_REQUIRED");
  }
  const name = validatePrivateStageDb(path);
  if (/(?:^|[\\/])(?:production-import|d1-export|r2-export|real-recovery-drill)(?:[^\\/]*)(?:[\\/]|$)/i.test(name)) {
    throw Error("CANDIDATE_D1_GOLDEN_SNAPSHOT_FORBIDDEN");
  }
  const sqlite = new DatabaseSync(name, {
    enableForeignKeyConstraints: true,
    timeout: 5000,
  });
  const execs = new WeakMap();
  try {
    if (
      sqlite.prepare("PRAGMA application_id").get().application_id !== productionStageApplicationId ||
      sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok" ||
      sqlite.prepare("PRAGMA foreign_key_check").all().length !== 0
    ) {
      throw Error("CANDIDATE_D1_ID_OR_INTEGRITY_INVALID");
    }
    sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
  } catch (error) {
    sqlite.close();
    throw error;
  }

  function prepare(query, params = []) {
    const statement = sqlite.prepare(query);
    const execute = () => {
      const started = performance.now();
      const hasColumns = statement.columns().length > 0;
      const before = hasColumns ? sqlite.prepare("SELECT total_changes() AS n").get().n : 0;
      const write = hasColumns ? undefined : statement.run(...params);
      const rows = hasColumns ? statement.all(...params) : [];
      const after = hasColumns ? sqlite.prepare("SELECT total_changes() AS n").get().n : 0;
      const changes = hasColumns ? after - before : (write?.changes ?? 0);
      return {
        success: true,
        results: rows,
        meta: { duration: performance.now() - started, changes: Number(changes) },
      };
    };
    const bound = {
      bind: (...args) => prepare(query, args),
      first: async (column) => {
        const row = statement.get(...params);
        if (!row) return null;
        if (column === undefined) return row;
        if (!Object.hasOwn(row, column)) throw Error("CANDIDATE_D1_UNKNOWN_COLUMN");
        return row[column];
      },
      all: async () => execute(),
      run: async () => execute(),
    };
    execs.set(bound, execute);
    return bound;
  }

  return {
    prepare,
    close: () => sqlite.close(),
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => {
          const execute = execs.get(statement);
          if (!execute) throw Error("CANDIDATE_D1_FOREIGN_STATEMENT");
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
