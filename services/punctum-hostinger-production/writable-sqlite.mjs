import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { validatePrivateStageDb, productionStageApplicationId } from "./sqlite.mjs";

/**
 * Mutable D1 compatibility for a disposable, locally isolated rehearsal.
 * No production path can enable this by merely supplying a database filename.
 * The final production writer must have its own authorization and backup gate.
 */
export function openSyntheticWritableDatabase(path, {syntheticMode}={}) {
  if (syntheticMode !== "SYNTHETIC_ONLY_DO_NOT_USE_REAL_D1" ||
      process.env.PUNCTUM_MUTABLE_SANDBOX_MODE !== "synthetic") {
    throw Error("MUTABLE_D1_REQUIRES_SYNTHETIC_ONLY_GATE");
  }
  const name = validatePrivateStageDb(path);
  if (!/(?:^|[\\/])synthetic-[a-z0-9-]+(?:[\\/]|$)/.test(name) ||
      /(?:^|[\\/])(?:production-import|d1-export|r2-export)(?:[\\/]|$)/i.test(name))
    throw Error("MUTABLE_D1_CANNOT_USE_REAL_SNAPSHOT");
  const sqlite = new DatabaseSync(name,{
    enableForeignKeyConstraints:true, timeout:5000,
  });
  const execs = new WeakMap();
  try {
    if(sqlite.prepare("PRAGMA application_id").get().application_id !== productionStageApplicationId ||
       sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok" ||
       sqlite.prepare("PRAGMA foreign_key_check").all().length)
      throw Error("MUTABLE_D1_ID_OR_INTEGRITY_INVALID");
    sqlite.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000");
  } catch(e) {
    sqlite.close();throw e;
  }
  function prepare(query, params=[]) {
    const statement=sqlite.prepare(query);
    const execute=()=>{
      const started=performance.now();
      const hasColumns=statement.columns().length>0;
      const before=hasColumns?sqlite.prepare("SELECT total_changes() AS n").get().n:0;
      const write=hasColumns?undefined:statement.run(...params);
      const rows=hasColumns?statement.all(...params):[];
      const after=hasColumns?sqlite.prepare("SELECT total_changes() AS n").get().n:0;
      const changes=hasColumns?(after-before):(write?.changes??0);
      return {success:true,results:rows,meta:{duration:performance.now()-started,changes:Number(changes)}};
    };
    const bound={
      bind:(...args)=>prepare(query,args),
      first:async (column)=>{
        const row=statement.get(...params);
        if(!row)return null;
        if(column===undefined)return row;
        if(!Object.hasOwn(row,column))throw Error("MUTABLE_D1_UNKNOWN_COLUMN");
        return row[column];
      },
      all:async()=>execute(),
      run:async()=>execute(),
    };
    execs.set(bound,execute);
    return bound;
  }
  return {
    prepare,
    close:()=>sqlite.close(),
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try{
        const results=statements.map(statement=>{
          const execute=execs.get(statement);
          if(!execute)throw Error("MUTABLE_D1_FOREIGN_STATEMENT");
          return execute();
        });
        sqlite.exec("COMMIT");
        return results;
      }catch(error){
        sqlite.exec("ROLLBACK");throw error;
      }
    },
  };
}
