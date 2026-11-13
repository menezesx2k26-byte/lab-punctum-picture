import test from "node:test";
import assert from "node:assert/strict";
import {imageMime,verifyOriginal,verifyRequest} from "./punctum-r2-encrypted-stage.mjs";

function req(){return {
  scope:"PUNCTUM_R2_ENCRYPTED_STAGING_ONLY",action:"encrypt-r2",
  sourceReadOnly:true,dnsTouched:false,productionDataImported:false,
  bucket:"punctum-picture-originals",expectedObjects:230,expectedBytes:372040548,
  recipientCertFingerprintSha256:"084d9c304632758f673a920930a388dc45300878d7ecf4fecc3be2fd873fd1d0",
};}
test("requires an exact read-only encrypted request with pinned recipient and inventory",()=>{
  assert.doesNotThrow(()=>verifyRequest(req()));
  for(const [field,value] of [
    ["action","plain-r2"],["sourceReadOnly",false],["dnsTouched",true],
    ["productionDataImported",true],["expectedObjects",229],
    ["expectedBytes",372040549],["bucket","another-bucket"],
    ["recipientCertFingerprintSha256","0".repeat(64)],
  ]){
    const variant={...req(),[field]:value};
    assert.throws(()=>verifyRequest(variant),/UNAUTHORIZED_ENCRYPTED_R2_REQUEST/);
  }
});
test("recognizes only approved image payload signatures",()=>{
  const jpeg=Buffer.from([255,216,255,224,10,20,30,40]);
  const png=Buffer.from([137,80,78,71,13,10,26,10]);
  const webp=Buffer.from("RIFFzzzzWEBPTEST");
  const gif=Buffer.from("GIF89a.........");
  const avif=Buffer.from("1234ftypavifxxxx");
  assert.equal(imageMime(jpeg),"image/jpeg");
  assert.equal(imageMime(png),"image/png");
  assert.equal(imageMime(webp),"image/webp");
  assert.equal(imageMime(gif),"image/gif");
  assert.equal(imageMime(avif),"image/avif");
  for(const bad of [Buffer.from("<script>alert(1)</script>"),Buffer.from(""),Buffer.from("hello!!!")])
    assert.throws(()=>imageMime(bad),/UNSUPPORTED_IMAGE_BYTES/);
});
test("validates exact bytes, key and size without leaking object identifiers",()=>{
  const bytes=Buffer.from([255,216,255,224,10,20,30,40]);
  const result=verifyOriginal({key:"originals/synthetic/a.jpg",size:bytes.length},bytes);
  assert.equal(result.contentType,"image/jpeg");
  assert.equal(result.size,bytes.length);
  assert.match(result.sha256,/^[0-9a-f]{64}$/);
  assert.throws(()=>verifyOriginal({key:"originals/synthetic/a.jpg",size:bytes.length+1},bytes),/SOURCE_SIZE_MISMATCH/);
  assert.throws(()=>verifyOriginal({key:"",size:bytes.length},bytes),/INVALID_SOURCE_ORIGINAL/);
  assert.throws(()=>verifyOriginal({key:"x".repeat(2049),size:bytes.length},bytes),/INVALID_SOURCE_ORIGINAL/);
  assert.throws(()=>verifyOriginal({key:"valid",size:26_214_401},bytes),/INVALID_SOURCE_ORIGINAL/);
});
