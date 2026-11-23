import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openProductionStageDatabase, productionStageApplicationId } from "./sqlite.mjs";
import { stageConfig, stageOrigin } from "./runtime.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(),"punctum-real-stage-"));
  chmodSync(root,0o700);
  const dbPath = join(root,"application-staged.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE example(id INTEGER PRIMARY KEY, name TEXT)");
  db.exec("INSERT INTO example VALUES(1,'sanitized')");
  db.exec("PRAGMA application_id = " + productionStageApplicationId);
  db.close();
  chmodSync(dbPath,0o600);
  const originals = join(root,"originals");
  mkdirSync(originals,{mode:0o700});
  const d1Receipt = join(root,"d1-receipt.json");
  const r2Receipt = join(root,"r2-receipt.json");
  writeFileSync(d1Receipt,JSON.stringify({
    schema:"punctum-production-sqlite-preflight-v1",
    stage:"IMPORT_ONLY_NOT_PRODUCTION",
    databaseId:"22697f13-7484-41e3-9441-f7b902c6577a",
    sqlIntegrity:"ok",foreignKeys:"ok",
    sourceTableCounts:{images:339,albums:20,site_media:12},
    exportSha256:"9b44bcb3cb46388654e9dd636f09f88adc2791e608382a3100b917dcb480a217",
    productionReady:false,dnsTouched:false,
  }),{mode:0o600});
  writeFileSync(r2Receipt,JSON.stringify({
    schema:"punctum-r2-private-stage-receipt-v1",
    status:"STAGED_READ_ONLY_NOT_PRODUCTION",
    objectsImported:230,bytesImported:372040548,hashesVerified:230,
    sourceManifestSha256:"0abeda19b5a151f311218b6876216e7e6d6976df83c9b89eb323908d462e00c9",
    productionReady:false,dnsTouched:false,
  }),{mode:0o600});
  return {root,dbPath,originals,d1Receipt,r2Receipt};
}

test("production staging reads only verified SQLite but never writes",async t=>{
  const f=fixture();t.after(()=>rmSync(f.root,{recursive:true,force:true}));
  const db=openProductionStageDatabase(f.dbPath);
  t.after(()=>db.close());
  assert.equal((await db.prepare("SELECT name FROM example WHERE id=?").bind(1).first("name")),"sanitized");
  assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM example").all()).results[0].count,1);
  assert.throws(()=>db.prepare("UPDATE example SET name='unsafe'").run(),/PRODUCTION_STAGE_SQL_WRITES_DISABLED|readonly|read-only/i);
  assert.throws(()=>db.batch([]),/PRODUCTION_STAGE_SQL_WRITES_DISABLED/);
  const raw=new DatabaseSync(f.dbPath);
  assert.equal(raw.prepare("SELECT name FROM example").get().name,"sanitized");
  raw.close();
});

test("denies QA/unknown database IDs, symlink storage and non-private permissions",t=>{
  const f=fixture();t.after(()=>rmSync(f.root,{recursive:true,force:true}));
  const db=new DatabaseSync(f.dbPath);
  db.exec("PRAGMA application_id = 1347767889");
  db.close();
  assert.throws(()=>openProductionStageDatabase(f.dbPath),/INVALID_PRODUCTION_STAGE_DB_ID_OR_INTEGRITY/);
  if(process.platform!=="win32"){
    chmodSync(f.dbPath,0o644);
    assert.throws(()=>openProductionStageDatabase(f.dbPath),/UNSAFE_PRODUCTION_STAGE_DB/);
  }
});

test("only explicit loopback origin with a port is admissible",()=>{
  const old=process.env.PUNCTUM_STAGE_ORIGIN;
  try{
    for(const bad of [
      "https://punctumpicture.com","https://127.0.0.1:3019/",
      "http://0.0.0.0:3019/","http://192.0.2.20:3019/",
      "http://127.0.0.1/","http://127.0.0.1:3019/other",
    ]){
      process.env.PUNCTUM_STAGE_ORIGIN=bad;
      assert.throws(()=>stageOrigin(),/STAGING_ORIGIN_MUST_BE_PRIVATE_LOOPBACK/);
    }
    process.env.PUNCTUM_STAGE_ORIGIN="http://127.0.0.1:3019/";
    assert.equal(stageOrigin().origin,"http://127.0.0.1:3019");
  }finally{
    if(old===undefined)delete process.env.PUNCTUM_STAGE_ORIGIN;
    else process.env.PUNCTUM_STAGE_ORIGIN=old;
  }
});

test("staging binds only matching D1/R2 receipts",t=>{
 const f=fixture();t.after(()=>rmSync(f.root,{recursive:true,force:true}));
 const names=["PUNCTUM_STAGE_ORIGIN","PUNCTUM_STAGE_DB_FILE","PUNCTUM_STAGE_D1_RECEIPT",
   "PUNCTUM_STAGE_R2_RECEIPT","PUNCTUM_STAGE_ORIGINALS_ROOT"];
 const old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 t.after(()=>{for(const name of names)if(old[name]===undefined)delete process.env[name];
   else process.env[name]=old[name]});
 Object.assign(process.env,{
   PUNCTUM_STAGE_ORIGIN:"http://127.0.0.1:3019/",
   PUNCTUM_STAGE_DB_FILE:f.dbPath,
   PUNCTUM_STAGE_D1_RECEIPT:f.d1Receipt,
   PUNCTUM_STAGE_R2_RECEIPT:f.r2Receipt,
   PUNCTUM_STAGE_ORIGINALS_ROOT:f.originals,
 });
 assert.equal(stageConfig().dbFile,f.dbPath);
 assert.equal(stageConfig().origin.origin,"http://127.0.0.1:3019");
 writeFileSync(f.r2Receipt,JSON.stringify({
   schema:"punctum-r2-private-stage-receipt-v1",
   status:"STAGED_READ_ONLY_NOT_PRODUCTION",objectsImported:229,
 }),{mode:0o600});
 assert.throws(()=>stageConfig(),/STAGING_SOURCE_RECEIPTS_DIVERGE/);
});
