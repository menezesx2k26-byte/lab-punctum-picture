import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSqlStage } from "./hostinger-import-sqlite-preflight.mjs";

const id = "22697f13-7484-41e3-9441-f7b902c6577a";
const sha = data => createHash("sha256").update(data).digest("hex");
const ddl = [
  "CREATE TABLE admin_credentials (id INTEGER PRIMARY KEY, value TEXT)",
  "CREATE TABLE albums (id INTEGER PRIMARY KEY, title TEXT)",
  "CREATE TABLE categories (id INTEGER PRIMARY KEY, name TEXT)",
  "CREATE TABLE images (id INTEGER PRIMARY KEY, album_id INTEGER)",
  "CREATE TABLE inquiries (id INTEGER PRIMARY KEY, email TEXT)",
  "CREATE TABLE site_settings (id INTEGER PRIMARY KEY, brand TEXT)",
];
function fixture({ applicationId = 0, permission = 0o700 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "punctum-prod-stage-test-"));
  chmodSync(dir, permission);
  const sql = join(dir, "source.sql");
  const receipt = join(dir, "source-manifest.json");
  const inventory = join(dir, "source-inventory.json");
  const stage = join(dir, "private-import.sqlite");
  const statement = "PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n" +
    ddl.map(x => x + ";").join("\n") +
    "\nINSERT INTO albums VALUES (1,'synthetic');\nINSERT INTO images VALUES (1,1);\nCOMMIT;\nPRAGMA application_id=" + applicationId + ";\n";
  writeFileSync(sql, statement, { mode: 0o600 });
  const lookupDb = join(dir, "lookup.sqlite");
  const db = new DatabaseSync(lookupDb);
  db.exec(statement);
  const schema = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name").all();
  const counts = {};
  for (const row of schema) counts[row.name] = Number(db.prepare("SELECT COUNT(*) AS c FROM " + row.name).get().c);
  db.close();
  const schemaSha256 = sha(JSON.stringify(schema.map(x => [x.name,x.sql]).sort((a,b) => a[0].localeCompare(b[0]))));
  writeFileSync(receipt,JSON.stringify({
    schema:"punctum-encrypted-d1-stage-v1", database:"punctum-picture", databaseId:id,
    sqlBytes:Buffer.byteLength(statement), sqlSha256:sha(statement),
    productionDataImported:false, dnsTouched:false,
  }));
  writeFileSync(inventory,JSON.stringify({
    schema:"punctum-source-d1-readonly-inventory-v1",databaseId:id,
    schemaSha256, tableCounts:counts, sourceReadOnly:true,
  }));
  return {dir,sql,receipt,inventory,stage,counts,applicationId};
}
function run(f) {
  return validateSqlStage({sqlPath:f.sql,receiptPath:f.receipt,inventoryPath:f.inventory,stagePath:f.stage});
}
test("imports a synthetic D1 dump to a separate private stage, but refuses production release",()=>{
  const f = fixture();
  try {
    const proof=run(f);
    assert.equal(proof.productionReady,false);
    assert.equal(proof.dnsTouched,false);
    assert.equal(proof.r2ObjectsImported,0);
    assert.equal(proof.stagingApplicationId,0x50554e50);
    assert.deepEqual(proof.sourceTableCounts,f.counts);
    const imported = new DatabaseSync(f.stage,{readOnly:true});
    try {
      assert.equal(imported.prepare("PRAGMA application_id").get().application_id,0x50554e50);
      assert.equal(imported.prepare("SELECT COUNT(*) AS c FROM images").get().c,1);
      assert.equal(imported.prepare("PRAGMA integrity_check").get().integrity_check,"ok");
    } finally {imported.close();}
    assert.equal((statSync(f.stage).mode & 0o077),0);
    assert.deepEqual(JSON.parse(readFileSync(f.stage+".manifest.json","utf8")),proof);
    assert.throws(()=>run(f),/STAGE_ALREADY_EXISTS/);
  } finally {rmSync(f.dir,{recursive:true,force:true});}
});
test("refuses stale inventory counts and cleans failed private staging",()=>{
  const f=fixture();
  try {
    const inventory=JSON.parse(readFileSync(f.inventory,"utf8"));
    inventory.tableCounts.images++;
    writeFileSync(f.inventory,JSON.stringify(inventory));
    assert.throws(()=>run(f),/STAGING_PARITY_FAILED/);
    assert.equal(existsSync(f.stage),false);
  } finally{rmSync(f.dir,{recursive:true,force:true});}
});
test("refuses SQL checksum mutation before opening a database",()=>{
  const f=fixture();
  try {
    writeFileSync(f.sql,readFileSync(f.sql,"utf8")+"\n-- malicious or stale\n");
    assert.throws(()=>run(f),/STAGING_SOURCE_SHA_MISMATCH/);
    assert.equal(existsSync(f.stage),false);
  } finally{rmSync(f.dir,{recursive:true,force:true});}
});
test("rejects a synthetic QA application id",()=>{
  const f=fixture({applicationId:0x50554e51});
  try {
    assert.throws(()=>run(f),/STAGING_CANNOT_REUSE_QA_OR_UNKNOWN_DB/);
    assert.equal(existsSync(f.stage),false);
  } finally{rmSync(f.dir,{recursive:true,force:true});}
});
test("rejects storage readable by group or others on POSIX",()=>{
  if(process.platform==="win32")return;
  const f=fixture({permission:0o755});
  try{
    assert.throws(()=>run(f),/PRIVATE_STAGE_PARENT_REQUIRED/);
    assert.equal(existsSync(f.stage),false);
  }finally {chmodSync(f.dir,0o700);rmSync(f.dir,{recursive:true,force:true});}
});
