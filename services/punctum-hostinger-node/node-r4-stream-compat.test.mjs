import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { installNodeR4StreamCompatibility } from "./node-r4-stream-compat.mjs";

function isolate() {
  return {
    TransformStream,
    WritableStream,
    crypto: {subtle: crypto.subtle},
  };
}
function source(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
async function read(stream) {
  const reader=stream.getReader();
  const chunks=[];
  try {
    while(true) {
      const {done,value}=await reader.read();
      if(done) break;
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }finally{reader.releaseLock();}
}
test("Node compatibility installs only absent primitives",()=>{
  const target=isolate();
  assert.deepEqual(installNodeR4StreamCompatibility(target),["FixedLengthStream","DigestStream"]);
  assert.deepEqual(installNodeR4StreamCompatibility(target),[]);
  assert.equal(typeof target.FixedLengthStream,"function");
  assert.equal(typeof target.crypto.DigestStream,"function");
});
test("stream accepts exact bytes, rejects short and oversized bodies",async()=>{
  const target=isolate();installNodeR4StreamCompatibility(target);
  const valid=[Buffer.from("abc"),Buffer.from("1234")];
  assert.equal((await read(source(valid).pipeThrough(new target.FixedLengthStream(7)))).toString(),"abc1234");
  await assert.rejects(read(source(valid).pipeThrough(new target.FixedLengthStream(6))),/R4_STREAM_TOO_LARGE/);
  await assert.rejects(read(source(valid).pipeThrough(new target.FixedLengthStream(8))),/R4_STREAM_LENGTH_MISMATCH/);
  assert.throws(()=>new target.FixedLengthStream(25*1024*1024+1),/R4_FIXED_LENGTH_INVALID/);
  assert.throws(()=>new target.FixedLengthStream(-1),/R4_FIXED_LENGTH_INVALID/);
  await assert.rejects(read(source([Buffer.from("ok"),"untrusted"]).pipeThrough(new target.FixedLengthStream(10))),/R4_STREAM_CHUNK_INVALID/);
});
test("G05 Node FixedLengthStream accepts exact 26214400 and rejects 26214401",async()=>{
  const exact=26_214_400;
  const target=isolate();installNodeR4StreamCompatibility(target);
  assert.doesNotThrow(()=>new target.FixedLengthStream(exact));
  assert.throws(()=>new target.FixedLengthStream(exact+1),/R4_FIXED_LENGTH_INVALID/);
  // Stream exact limit in fixed-size chunks (no single 25MiB allocation retained beyond pipe).
  const chunkSize=1024*1024;
  const chunks=[];
  let remaining=exact;
  while(remaining>0){
    const n=Math.min(chunkSize,remaining);
    chunks.push(Buffer.alloc(n,0x5a));
    remaining-=n;
  }
  const out=await read(source(chunks).pipeThrough(new target.FixedLengthStream(exact)));
  assert.equal(out.byteLength,exact);
  assert.equal(createHash("sha256").update(out).digest("hex"),
    createHash("sha256").update(Buffer.alloc(exact,0x5a)).digest("hex"));
});
test("DigestStream returns a SHA-256 ArrayBuffer equal to Node crypto",async()=>{
  const target=isolate();installNodeR4StreamCompatibility(target);
  const stream=new target.crypto.DigestStream("SHA-256");
  assert.ok(stream instanceof WritableStream);
  assert.throws(()=>new target.crypto.DigestStream("SHA-1"),/R4_DIGEST_ALGORITHM_INVALID/);
  await source([Buffer.from("abc"),Buffer.from("def")]).pipeTo(stream);
  const digest=await stream.digest;
  assert.ok(digest instanceof ArrayBuffer);
  assert.equal(Buffer.from(digest).toString("hex"),createHash("sha256").update("abcdef").digest("hex"));
});
