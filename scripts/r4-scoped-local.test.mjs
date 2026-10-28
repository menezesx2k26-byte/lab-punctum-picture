// Real local integration only: Wrangler --dry-run bundle + Miniflare D1/R2.
// No Cloudflare API, deploy, credentials, production assets, or network endpoints.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { globSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createScopedFixtureReceipt } from "./lib/r4-scoped-fixture.mjs";
import { R4_FAILED_OWNER } from "./lib/r4-recovery-qa.mjs";

const ROOT=resolve(".");
const PNG=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==","base64");
const SHA=bytes=>createHash("sha256").update(bytes).digest("hex");
const tables=["client_accounts","client_galleries","client_gallery_images","client_gallery_upload_intents","client_gallery_favorites"];
const origin="https://punctum-picture-r4-qa-20261028.localtest.workers.dev";
const secret="test-only-local-qa-recovery-secret-32-bytes";
const n=(db,table)=>db.prepare("SELECT COUNT(*) AS n FROM "+table).first().then(r=>r.n);
const allCounts=async(db)=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await n(db,table)])));
async function contents(bucket) {
  const listed=await bucket.list({limit:100});
  assert.equal(listed.truncated,false,"Local R2 list must be complete");
  return listed.objects.map(x=>x.key).sort();
}
async function oldCase(db,bucket) {
  const ids=[["client_accounts",R4_FAILED_OWNER.clientId],["client_galleries",R4_FAILED_OWNER.galleryId],
    ["client_gallery_images",R4_FAILED_OWNER.imageId],["client_gallery_upload_intents",R4_FAILED_OWNER.intentId]];
  const rows={};
  for(const [table,id] of ids) {
    const row=await db.prepare("SELECT * FROM "+table+" WHERE id=?").bind(id).first();
    assert.ok(row,"Legacy row missing: "+table);
    rows[table]=row;
  }
  const key=rows.client_gallery_images.storage_key;
  const object=await bucket.get(key);
  assert.ok(object);
  return {rowsHash:SHA(Buffer.from(JSON.stringify(rows))),objectHash:SHA(Buffer.from(await object.arrayBuffer())),key};
}
async function applyMigrations(db) {
  // Same real-D1 local migration pattern as scripts/e2e/punctum-browser.mjs.
  for(const path of globSync(resolve("migrations/*.sql")).sort()) {
    const sql=await readFile(path,"utf8");
    for(const statement of sql.split(";").map(s=>s.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
}
async function createOriginalCase(db,bucket){
  const old=R4_FAILED_OWNER,now="2026-10-28T19:00:00.000Z";
  const key="client-galleries/"+old.galleryId+"/"+old.imageId+".png";
  await db.prepare("INSERT INTO client_accounts(id,name,email,password_hash,password_salt,password_iterations,must_change_password,session_version,disabled_at,created_at,updated_at) VALUES(?,?,?,?,?,310000,0,1,NULL,?,?)")
    .bind(old.clientId,"Known old failed QA","failed-"+old.clientId+"@example.invalid","local-qa-placeholder","local-qa-placeholder",now,now).run();
  await db.prepare("INSERT INTO client_galleries(id,client_id,title,introduction,theme,cover_image_id,allow_downloads,status,created_at,updated_at,published_at) VALUES(?,?,?,'','ivory',NULL,0,'draft',?,?,NULL)")
    .bind(old.galleryId,old.clientId,"Known failed original QA",now,now).run();
  await db.prepare("INSERT INTO client_gallery_images(id,gallery_id,storage_key,original_filename,mime_type,size_bytes,width,height,alt_text,position,status,created_at,updated_at,deleted_at) VALUES(?,?,?,'legacy.png','image/png',79,2,2,'legacy',0,'failed',?,?,NULL)")
    .bind(old.imageId,old.galleryId,key,now,now).run();
  await db.prepare("INSERT INTO client_gallery_upload_intents(id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,completed_at) VALUES(?,?,?,'image/png',79,?,'failed',?,?,NULL)")
    .bind(old.intentId,old.galleryId,old.imageId,key,now,now).run();
  await bucket.put(key,PNG,{httpMetadata:{contentType:"image/png"}});
}
async function dryBundle(temp) {
  const out=join(temp,"bundle");
  const configPath=join(temp,"wrangler.json");
  await writeFile(configPath,JSON.stringify({
    name:"punctum-r4-local-recovery-test",
    main:resolve(ROOT,"scripts/private-recovery-worker.ts"),
    compatibility_date:"2026-05-22",
    compatibility_flags:["nodejs_compat"],
    workers_dev:false,
    d1_databases:[{binding:"SOURCE_DB",database_name:"r4-local-source",database_id:"00000000-0000-4000-8000-000000000001"},
      {binding:"RESTORE_DB",database_name:"r4-local-restore",database_id:"00000000-0000-4000-8000-000000000002"}],
    r2_buckets:[{binding:"SOURCE_ORIGINALS",bucket_name:"r4-local-source-originals"},
      {binding:"RESTORE_ORIGINALS",bucket_name:"r4-local-restore-originals"},
      {binding:"BACKUPS",bucket_name:"r4-local-backups"}]
  }));
  const cli=resolve(ROOT,"node_modules/wrangler/bin/wrangler.js");
  // The dry-run compiler receives no Cloudflare/API credentials, even if the
  // caller's shell is authenticated. Only OS paths needed to spawn Node.
  const cleanEnv=Object.fromEntries(["PATH","Path","SystemRoot","WINDIR","TEMP","TMP","USERPROFILE","HOME","APPDATA","LOCALAPPDATA"].filter(k=>process.env[k]!==undefined).map(k=>[k,process.env[k]]));
  execFileSync(process.execPath,[cli,"deploy","--dry-run","--outdir",out,"--config",configPath],{
    cwd:ROOT,encoding:"utf8",timeout:45000,stdio:["ignore","pipe","pipe"],
    env:{...cleanEnv,WRANGLER_SEND_METRICS:"false",WRANGLER_WRITE_LOGS:"false",CI:"true"}
  });
  const files=await readdir(out);
  assert.ok(files.includes("private-recovery-worker.js"),"Wrangler dry-run compiled entry required; "+files.join(","));
  return {out,entry:join(out,"private-recovery-worker.js")};
}
test("real local G18 scoped fixture: HTTP seed, immutable legacy, D1/R2 backup, 26-row restore and anti-replay", {timeout:120000}, async()=>{
  assert.equal(PNG.length,79,"Fixture must use known decoded 79-byte PNG");
  const tmp=await mkdtemp(join(tmpdir(),"punctum-r4-g18-local-"));
  assert.ok(tmp.startsWith(tmpdir()) && tmp.includes("punctum-r4-g18-local-"));
  let mf;
  try{
    const fixture=createScopedFixtureReceipt();
    const {out,entry}=await dryBundle(tmp);
    const opts=convertV4MiniflareOptions({
      name:"punctum-r4-local-g18",
      modules:[{type:"ESModule",path:entry}],
      modulesRoot:out,
      compatibilityDate:"2026-05-22",compatibilityFlags:["nodejs_compat"],
      d1Databases:{SOURCE_DB:"r4-local-source",RESTORE_DB:"r4-local-restore"},
      r2Buckets:{SOURCE_ORIGINALS:"r4-local-source-originals",RESTORE_ORIGINALS:"r4-local-restore-originals",BACKUPS:"r4-local-backups"},
      bindings:{
        ENVIRONMENT:"preview",QA_RECOVERY_ENABLED:"true",QA_RECOVERY_ALLOCATION:"r4-20261028",
        QA_RECOVERY_SEED_MODE:"true",QA_RECOVERY_SECRET:secret,SITE_ORIGIN:origin,
        QA_RECOVERY_CLIENT_IDS:fixture.clients.map(c=>c.id).join(",")
      }
    });
    opts.resourcePersistencePath=join(tmp,"storage");
    opts.telemetry={enabled:false};
    mf=new Miniflare(opts);
    await mf.ready;
    const source=await mf.getD1Database("SOURCE_DB"),restored=await mf.getD1Database("RESTORE_DB");
    const original=await mf.getR2Bucket("SOURCE_ORIGINALS"), target=await mf.getR2Bucket("RESTORE_ORIGINALS"),backups=await mf.getR2Bucket("BACKUPS");
    await applyMigrations(source);
    await applyMigrations(restored);
    await createOriginalCase(source,original);
    const baseline=await oldCase(source,original);
    assert.deepEqual(await allCounts(source),{client_accounts:1,client_galleries:1,client_gallery_images:1,client_gallery_upload_intents:1,client_gallery_favorites:0});
    assert.deepEqual(await allCounts(restored),{client_accounts:0,client_galleries:0,client_gallery_images:0,client_gallery_upload_intents:0,client_gallery_favorites:0});
    assert.equal((await contents(original)).length,1);
    const call=async(path,method="GET",data,expected=200)=>{
      const res=await mf.dispatchFetch(origin+path,{method,headers:{Origin:origin,Authorization:"Bearer "+secret,...(data?{"Content-Type":"application/json"}:{})},...(data?{body:JSON.stringify(data)}:{})});
      const body=await res.json();
      assert.equal(res.status,expected,method+" "+path+" failed: "+JSON.stringify(body));
      return body;
    };
    const initial=await call("/qa/inspect");
    assert.equal(initial.legacyRowsSha256,baseline.rowsHash);
    assert.equal(initial.legacyObjectSha256,baseline.objectHash);
    const seeded=await call("/qa/seed","POST",fixture,201);
    assert.equal(seeded.createdRows,26);
    assert.equal(seeded.createdObjects,10);
    assert.equal(seeded.sha256,SHA(PNG));
    assert.deepEqual(await allCounts(source),{client_accounts:3,client_galleries:3,client_gallery_images:11,client_gallery_upload_intents:11,client_gallery_favorites:2});
    assert.equal((await contents(original)).length,11);
    assert.deepEqual(await oldCase(source,original),baseline);
    const afterSeed=await call("/qa/inspect");
    assert.equal(afterSeed.legacyRowsSha256,initial.legacyRowsSha256);
    assert.equal(afterSeed.legacyObjectSha256,initial.legacyObjectSha256);
    await call("/qa/seed","POST",fixture,400); // No replay; local seed's explicit scope rejects existing data.
    assert.deepEqual(await allCounts(source),{client_accounts:3,client_galleries:3,client_gallery_images:11,client_gallery_upload_intents:11,client_gallery_favorites:2});
    assert.deepEqual(await oldCase(source,original),baseline);
    assert.equal((await contents(original)).length,11);
    const recovery=await call("/qa/recover","POST",{clientIds:fixture.clients.map(x=>x.id)},200);
    assert.equal(recovery.backupVerified,true);
    assert.equal(recovery.accountsQuarantined,true);
    assert.equal(recovery.rows,26);
    assert.equal(recovery.objects,10);
    assert.deepEqual(recovery.hashes,Array(10).fill(SHA(PNG)));
    assert.deepEqual(await allCounts(restored),{client_accounts:2,client_galleries:2,client_gallery_images:10,client_gallery_upload_intents:10,client_gallery_favorites:2});
    assert.equal((await restored.prepare("SELECT COUNT(*) AS n FROM client_accounts WHERE disabled_at IS NOT NULL AND session_version>=2").first()).n,2);
    assert.deepEqual((await restored.prepare("PRAGMA foreign_key_check").all()).results,[]);
    const keys=await contents(target);
    assert.equal(keys.length,10);
    for(const image of fixture.images){
      assert.ok(keys.includes(image.storageKey));
      const obj=await target.get(image.storageKey);
      assert.ok(obj);
      const bytes=Buffer.from(await obj.arrayBuffer());
      assert.deepEqual(bytes,PNG);
      assert.equal(SHA(bytes),SHA(PNG));
    }
    const saved=await contents(backups);
    assert.equal(saved.length,1);
    const archive=await backups.get(saved[0]);
    assert.ok(archive);
    const archiveBytes=Buffer.from(await archive.arrayBuffer());
    assert.equal(SHA(archiveBytes),recovery.backupHash);
    const stored=JSON.parse(archiveBytes.toString());
    assert.equal(stored.objects.length,10);
    assert.equal(stored.tables.client_accounts.length,2);
    assert.equal(stored.tables.client_gallery_images.length,10);
    assert.deepEqual(stored.tables.client_accounts.map(x=>x.id).sort(),fixture.clients.map(x=>x.id).sort(),"Legacy owner must not enter scoped backup");
    assert.deepEqual(stored.objects.map(x=>x.key).sort(),fixture.images.map(x=>x.storageKey).sort(),"Only 10 new objects may be backed up");
    const relations=(await restored.prepare("SELECT a.id AS owner,g.id AS gallery,i.id AS image,u.id AS intent FROM client_accounts a JOIN client_galleries g ON g.client_id=a.id JOIN client_gallery_images i ON i.gallery_id=g.id JOIN client_gallery_upload_intents u ON u.image_id=i.id AND u.gallery_id=g.id").all()).results;
    assert.equal(relations.length,10);
    for(const row of relations){
      assert.ok(fixture.clients.some(c=>c.id===row.owner));
      assert.ok(fixture.galleries.some(g=>g.id===row.gallery&&g.clientId===row.owner));
      assert.ok(fixture.images.some(i=>i.id===row.image&&i.galleryId===row.gallery));
      assert.ok(fixture.intents.some(i=>i.id===row.intent&&i.imageId===row.image));
    }
    assert.deepEqual(await oldCase(source,original),baseline);
    await call("/qa/recover","POST",{clientIds:fixture.clients.map(x=>x.id)},409);
    assert.deepEqual(await allCounts(restored),{client_accounts:2,client_galleries:2,client_gallery_images:10,client_gallery_upload_intents:10,client_gallery_favorites:2});
    assert.equal((await contents(target)).length,10);
    assert.equal((await contents(backups)).length,1);
    assert.deepEqual(await oldCase(source,original),baseline);
  }finally{
    if(mf)await mf.dispose();
    await rm(tmp,{recursive:true,force:true});
  }
});
