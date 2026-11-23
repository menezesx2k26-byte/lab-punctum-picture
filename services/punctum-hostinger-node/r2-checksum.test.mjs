import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { qaProvidedSha256Matches } from "./r2-checksum.mjs";

test("R4 v3 signed upload accepts exact Uint8Array and ArrayBuffer SHA-256",()=>{
  const hex = createHash("sha256").update("synthetic image").digest("hex");
  const digest=Buffer.from(hex,"hex");
  assert.equal(qaProvidedSha256Matches(Uint8Array.from(digest),hex),true);
  assert.equal(qaProvidedSha256Matches(Uint8Array.from(digest).buffer,hex),true);
  const altered=Uint8Array.from(digest);
  altered[5]^=1;
  assert.equal(qaProvidedSha256Matches(altered,hex),false);
  assert.equal(qaProvidedSha256Matches(altered.buffer,hex),false);
  assert.equal(qaProvidedSha256Matches("hex:sha256",hex),false);
  assert.equal(qaProvidedSha256Matches(new Uint8Array(31),hex),false);
  assert.equal(qaProvidedSha256Matches(new Uint8Array(33),hex),false);
  assert.equal(qaProvidedSha256Matches(digest,"0".repeat(65)),false);
  assert.equal(qaProvidedSha256Matches(digest,hex.toUpperCase()),false);
});
test("offset Uint8Array uses only its specified 32-byte range",()=>{
  const hex=createHash("sha256").update("synthetic other image").digest("hex");
  const buffer=new Uint8Array(42);
  buffer.set(Buffer.from(hex,"hex"),5);
  assert.equal(qaProvidedSha256Matches(buffer.subarray(5,37),hex),true);
  assert.equal(qaProvidedSha256Matches(buffer,hex),false);
});
