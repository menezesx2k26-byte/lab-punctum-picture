import assert from "node:assert/strict";
import test from "node:test";
import {chmodSync,mkdtempSync,mkdirSync,rmSync,statSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {syntheticLocalBackups} from "./synthetic-backups.mjs";

function fixture(t){
 const base=mkdtempSync(join(tmpdir(),"synthetic-backup-gate-"));
 chmodSync(base,0o700);
 const sandbox=join(base,"synthetic-private");
 mkdirSync(sandbox,{mode:0o700});
 const bucket=join(sandbox,"backups");
 mkdirSync(bucket,{mode:0o700});
 t.after(()=>rmSync(base,{recursive:true,force:true}));
 return {base,bucket};
}
const key=(suffix="000")=>"backups/d1/daily/2026-11-13/2026-11-13T22-55-00-"+suffix+"Z.json";
const opts={httpMetadata:{contentType:"application/json"},customMetadata:{retention:"daily"}};
test("private backup writer is create-only, owner-only and supports retention pagination",async t=>{
 const {bucket}=fixture(t),b=syntheticLocalBackups(bucket);
 const body=JSON.stringify({synthetic:true});
 const a=await b.put(key(),body,opts);
 assert.equal(a.size,body.length);
 assert.equal((await b.get(key())).body.toString(),body);
 const p=join(bucket,...key().split("/"));
 assert.equal(statSync(p).mode&0o077,0);
 await assert.rejects(b.put(key(),"{}",opts),/EEXIST/);
 await b.put(key("001"),JSON.stringify({synthetic:2}),opts);
 const first=await b.list({prefix:"backups/d1/daily/",limit:1});
 assert.equal(first.objects.length,1);
 assert.equal(first.truncated,true);
 const next=await b.list({prefix:"backups/d1/daily/",cursor:first.cursor,limit:1});
 assert.equal(next.objects.length,1);
 assert.equal(next.truncated,false);
 await b.delete([key()]);
 assert.equal((await b.list({prefix:"backups/d1/daily/"})).objects.length,1);
});
test("rejects path escape, unsafe retention, unexpected MIME and non-private root",async t=>{
 const {bucket}=fixture(t),b=syntheticLocalBackups(bucket);
 for(const path of ["../../etc/passwd","backups/d1/daily/2026-11-13/bad.txt","backup/private.json"]){
  await assert.rejects(b.put(path,"{}",opts),/INVALID_KEY/);
 }
 await assert.rejects(b.put(key(),"{}",{...opts,customMetadata:{retention:"weekly"}}),/RETENTION_KEY_MISMATCH/);
 await assert.rejects(b.put(key(),"{}",{...opts,httpMetadata:{contentType:"text/plain"}}),/CONTENT_TYPE_INVALID/);
 await assert.rejects(b.list({prefix:"originals/"}),/LIST_UNSAFE/);
 chmodSync(bucket,0o755);
 assert.throws(()=>syntheticLocalBackups(bucket),/PRIVATE_ROOT_REQUIRED/);
});
