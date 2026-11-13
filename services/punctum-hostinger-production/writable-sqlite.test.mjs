import assert from "node:assert/strict";
import test from "node:test";
import {chmodSync,mkdtempSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {productionStageApplicationId} from "./sqlite.mjs";
import {openSyntheticWritableDatabase} from "./writable-sqlite.mjs";

function fixture(t){
  const root=mkdtempSync(join(tmpdir(),"punctum-synthetic-sqlite-"));
  chmodSync(root,0o700);
  const dir=join(root,"synthetic-do-not-use-real-data");
  mkdirSync(dir,{mode:0o700});
  const file=join(dir,"application.sqlite");
  const db=new DatabaseSync(file);
  db.exec("PRAGMA application_id="+productionStageApplicationId+"; CREATE TABLE fixture (id INTEGER PRIMARY KEY, value TEXT NOT NULL); INSERT INTO fixture VALUES(1,'base')");
  db.close();
  chmodSync(file,0o600);
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  return {root,file};
}
function withEnv(t){
  const old=process.env.PUNCTUM_MUTABLE_SANDBOX_MODE;
  process.env.PUNCTUM_MUTABLE_SANDBOX_MODE="synthetic";
  t.after(()=>old===undefined?delete process.env.PUNCTUM_MUTABLE_SANDBOX_MODE:process.env.PUNCTUM_MUTABLE_SANDBOX_MODE=old);
}
test("requires explicit synthetic mode and private synthetic file path",t=>{
  const f=fixture(t);
  assert.throws(()=>openSyntheticWritableDatabase(f.file),/MUTABLE_D1_REQUIRES_SYNTHETIC_ONLY_GATE/);
  withEnv(t);
  assert.throws(()=>openSyntheticWritableDatabase(f.file,{syntheticMode:"production"}),/MUTABLE_D1_REQUIRES_SYNTHETIC_ONLY_GATE/);
  const db=openSyntheticWritableDatabase(f.file,{syntheticMode:"SYNTHETIC_ONLY_DO_NOT_USE_REAL_D1"});
  db.close();
});
test("supports bound reads, writes and atomic batch rollback",async t=>{
  const f=fixture(t);
  withEnv(t);
  const db=openSyntheticWritableDatabase(f.file,{syntheticMode:"SYNTHETIC_ONLY_DO_NOT_USE_REAL_D1"});
  t.after(()=>db.close());
  assert.equal(await db.prepare("SELECT value FROM fixture WHERE id=?").bind(1).first("value"),"base");
  const inserted=await db.prepare("INSERT INTO fixture(id,value) VALUES(?,?)").bind(2,"ok").run();
  assert.equal(inserted.meta.changes,1);
  await assert.rejects(db.batch([
    db.prepare("UPDATE fixture SET value=? WHERE id=?").bind("reverted",1),
    db.prepare("INSERT INTO fixture (id,value) VALUES(1,'duplicate')"),
  ]));
  assert.equal(await db.prepare("SELECT value FROM fixture WHERE id=?").bind(1).first("value"),"base");
  const committed=await db.batch([
    db.prepare("UPDATE fixture SET value=? WHERE id=?").bind("committed",1),
    db.prepare("UPDATE fixture SET value=? WHERE id=?").bind("updated",2),
  ]);
  assert.equal(committed.length,2);
  assert.equal(await db.prepare("SELECT value FROM fixture WHERE id=?").bind(1).first("value"),"committed");
});
test("rejects false production application identity",t=>{
  const f=fixture(t);
  withEnv(t);
  const raw=new DatabaseSync(f.file);
  raw.exec("PRAGMA application_id=1");
  raw.close();
  assert.throws(()=>openSyntheticWritableDatabase(f.file,{syntheticMode:"SYNTHETIC_ONLY_DO_NOT_USE_REAL_D1"}),/MUTABLE_D1_ID_OR_INTEGRITY_INVALID/);
});
