import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {importPrivateStage,validatePrivateManifest} from "./punctum-r2-import-private-stage.mjs";
import {privateOriginals} from "../services/punctum-hostinger-production/originals.mjs";

const hash=b=>createHash("sha256").update(b).digest("hex");
const b=Buffer.from([255,216,255,224,10,20,30,40]);
function fixture(){
  const root=mkdtempSync(join(tmpdir(),"punctum-r2-import-test-"));
  const unpacked=join(root,"unpacked"),target=join(root,"target");
  mkdirSync(unpacked,{mode:0o700});mkdirSync(target,{mode:0o700});
  mkdirSync(join(unpacked,"objects"),{mode:0o700});
  writeFileSync(join(unpacked,"objects","0000.blob"),b,{mode:0o600});
  const manifest={schema:"punctum-r2-originals-private-v1",bucket:"punctum-picture-originals",
    sourceReadOnly:true,objectCount:1,totalBytes:b.length,objects:[
    {key:"originals/synthetic/a.jpg",path:"objects/0000.blob",size:b.length,sha256:hash(b),contentType:"image/jpeg"}]};
  writeFileSync(join(unpacked,"manifest.json"),JSON.stringify(manifest),{mode:0o600});
  return {root,unpacked,target,manifest};
}
test("verified immutable original can be staged without enabling production",async()=>{
  const f=fixture();
  try {
    const report=await importPrivateStage(f.unpacked,f.target,{count:1,total:b.length});
    assert.equal(report.objectsImported,1);
    assert.equal(report.bytesImported,b.length);
    assert.equal(report.productionReady,false);
    assert.equal(report.dnsTouched,false);
    const restored=await privateOriginals(f.target).get("originals/synthetic/a.jpg");
    assert.deepEqual(Buffer.from(await restored.arrayBuffer()),b);
    assert.equal(readFileSync(join(f.root,"r2-private-stage-receipt.json"),"utf8").includes("STAGED_READ_ONLY"),true);
    await assert.rejects(importPrivateStage(f.unpacked,f.target,{count:1,total:b.length}),/R2_STAGE_TARGET_NOT_EMPTY/);
  }finally{rmSync(f.root,{recursive:true,force:true})}
});
test("manifest denies traversal, duplicate, altered digest, bad byte counts",async()=>{
 const f=fixture();
 try{
  assert.doesNotThrow(()=>validatePrivateManifest(f.manifest,{count:1,total:b.length}));
  assert.throws(()=>validatePrivateManifest({...f.manifest,totalBytes:b.length+1},{count:1,total:b.length}),/R2_PRIVATE_MANIFEST_INVALID/);
  assert.throws(()=>validatePrivateManifest({...f.manifest,objects:[{...f.manifest.objects[0],path:"../../secret"}]},{count:1,total:b.length}),/ENTRY_INVALID/);
  assert.throws(()=>validatePrivateManifest({...f.manifest,objects:[{...f.manifest.objects[0],sha256:"0".repeat(64)}]},{count:1,total:b.length+1}),/MANIFEST_INVALID|TOTAL_MISMATCH/);
  const data=readFileSync(join(f.unpacked,"manifest.json"),"utf8").replace(hash(b),"0".repeat(64));
  writeFileSync(join(f.unpacked,"manifest.json"),data);
  await assert.rejects(importPrivateStage(f.unpacked,f.target,{count:1,total:b.length}),/R2_IMAGE_STAGING_DIGEST_OR_MIME_MISMATCH/);
 }finally{rmSync(f.root,{recursive:true,force:true})}
});
