import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writableOriginals } from "./writable-originals.mjs";

function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),"punctum-r2-writable-"));
  chmodSync(dir,0o700);
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  return {dir,bucket:writableOriginals(dir)};
}
function options(bytes,type="image/png") {
  const digest=createHash("sha256").update(bytes).digest("hex");
  return {
    onlyIf:{etagDoesNotMatch:"*"},
    sha256:Uint8Array.from(Buffer.from(digest,"hex")),
    httpMetadata:{contentType:type},
    customMetadata:{sha256:digest},
  };
}
test("immutable conditional put verifies native SHA, private bytes and duplicate gate",async t=>{
  const {bucket}=fixture(t);
  const key="client-galleries/synthetic/id.png";
  const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const opt=options(bytes);
  const first=await bucket.put(key,bytes,opt);
  assert.equal(first.size,bytes.length);
  assert.equal(first.etag,createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(Buffer.from(await (await bucket.get(key)).arrayBuffer()),bytes);
  assert.equal(await bucket.put(key,Buffer.from("wrong"),options(Buffer.from("wrong"))),null);
  assert.deepEqual(Buffer.from(await (await bucket.get(key)).arrayBuffer()),bytes);
  await assert.rejects(bucket.delete(key),/RETENTION_POLICY/);
  await assert.rejects(bucket.list(),/UNIMPLEMENTED/);
});
test("stream uses bounded chunks and matches exact ArrayBuffer digest",async t=>{
  const {bucket}=fixture(t);
  const bytes=Buffer.from([255,216,255,224,1,2,3,4,5,6]);
  const opts=options(bytes,"image/jpeg");
  opts.sha256=Uint8Array.from(opts.sha256).buffer;
  const stream=new ReadableStream({start(controller){
    controller.enqueue(bytes.subarray(0,4));
    controller.enqueue(bytes.subarray(4));
    controller.close();
  }});
  assert.equal((await bucket.put("synthetic/jpg",stream,opts)).size,bytes.length);
  assert.deepEqual(Buffer.from(await (await bucket.get("synthetic/jpg")).arrayBuffer()),bytes);
});
test("rejects unverified writes without creating an object",async t=>{
  const {bucket}=fixture(t);
  const bytes=Buffer.from([255,216,255,224,1,2,3,4]);
  const key="synthetic/rejected";
  await assert.rejects(bucket.put(key,bytes,{httpMetadata:{contentType:"image/jpeg"}}),/CONDITIONAL_WRITE_REQUIRED/);
  const wrong=options(bytes,"image/jpeg");wrong.sha256=new Uint8Array(32);
  await assert.rejects(bucket.put(key,bytes,wrong),/NATIVE_SHA256_MISMATCH/);
  const oversized=options(bytes,"image/jpeg");oversized.customMetadata.sha256="0".repeat(64);
  await assert.rejects(bucket.put(key,bytes,oversized),/CUSTOM_SHA256_MISMATCH/);
  const invalid=options(bytes,"image/svg+xml");
  await assert.rejects(bucket.put(key,bytes,invalid),/MIME_INVALID/);
  assert.equal(await bucket.head(key),null);
});
test("rejects directories with group/world permissions",t=>{
  const {dir}=fixture(t);
  chmodSync(dir,0o755);
  assert.throws(()=>writableOriginals(dir),/PRIVATE_ORIGINALS_STORAGE_REQUIRED/);
});
