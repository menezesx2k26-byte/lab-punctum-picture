import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { privateOriginals, stageOriginal } from "./originals.mjs";

const hash = data => createHash("sha256").update(data).digest("hex");
function fixture() {
  const root=mkdtempSync(join(tmpdir(),"punctum-originals-"));
  chmodSync(root,0o700);
  const key="originals/synthetic/a.jpg";
  const bytes=Buffer.from("synthetic original image payload");
  return {root,key,bytes,digest:hash(bytes)};
}
test("private originals preserve exact bytes, SHA-256 and R2 metadata",async()=>{
  const f=fixture();
  try {
    assert.equal(await privateOriginals(f.root).get(f.key),null);
    assert.deepEqual(stageOriginal(f.root,f.key,f.bytes,"image/jpeg",f.digest),
      {size:f.bytes.length,sha256:f.digest,contentType:"image/jpeg"});
    const bucket=privateOriginals(f.root);
    const head=await bucket.head(f.key);
    assert.equal(head.size,f.bytes.length);
    assert.equal(head.httpMetadata.contentType,"image/jpeg");
    assert.equal(Buffer.from(head.checksums.sha256).toString("hex"),f.digest);
    const obj=await bucket.get(f.key);
    assert.equal(obj.etag,f.digest);
    assert.deepEqual(Buffer.from(await obj.arrayBuffer()),f.bytes);
    assert.deepEqual(Buffer.from(await new Response(obj.body).arrayBuffer()),f.bytes);
    await assert.rejects(bucket.put(f.key,f.bytes),/WRITE_GATE_CLOSED/);
    await assert.rejects(bucket.delete(f.key),/DELETE_GATE_CLOSED/);
    await assert.rejects(bucket.list(),/LIST_GATE_CLOSED/);
    assert.throws(()=>stageOriginal(f.root,f.key,f.bytes,"image/jpeg",f.digest),/ALREADY_EXISTS/);
  } finally {rmSync(f.root,{recursive:true,force:true});}
});
test("tampered blobs and forged keys are rejected without exposing bytes",async()=>{
  const f=fixture();
  try {
    stageOriginal(f.root,f.key,f.bytes,"image/jpeg",f.digest);
    const sub=join(f.root,hash(Buffer.from(f.key)).slice(0,2));
    const blob=join(sub,hash(Buffer.from(f.key))+".blob");
    writeFileSync(blob,Buffer.alloc(f.bytes.length,0x21));
    await assert.rejects(privateOriginals(f.root).get(f.key),/DIGEST_MISMATCH/);
    assert.equal(await privateOriginals(f.root).get("originals/different/identity.jpg"),null);
    assert.throws(()=>stageOriginal(f.root,"../other",f.bytes,"image/jpeg","0".repeat(64)),/STAGED_ORIGINAL_INVALID/);
    assert.throws(()=>stageOriginal(f.root,"wrong",f.bytes,"text/html",f.digest),/STAGED_ORIGINAL_INVALID/);
  } finally {rmSync(f.root,{recursive:true,force:true});}
});
test("world-readable origins are forbidden on POSIX",()=>{
  if(process.platform==="win32")return;
  const f=fixture();
  try{
    chmodSync(f.root,0o755);
    assert.throws(()=>privateOriginals(f.root),/PRIVATE_ORIGINALS_STORAGE_REQUIRED/);
    assert.throws(()=>stageOriginal(f.root,f.key,f.bytes,"image/jpeg",f.digest),/PRIVATE_ORIGINALS_STORAGE_REQUIRED/);
  }finally{chmodSync(f.root,0o700);rmSync(f.root,{recursive:true,force:true});}
});
