import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { summarizeOriginalsInventory } from './lib/r4-originals-inventory-readonly.mjs';

const sha = letter => letter.repeat(64);
const publicKey = (owner,id) => `originals/${owner}/${id}.png`;
const privateKey = (owner,id) => `client-galleries/${owner}/${id}.png`;
const img = (owner='album-A',id='image-A',patch={}) => ({
  domain:'public',ownerId:owner,id,key:publicKey(owner,id),mimeType:'image/png',
  sizeBytes:3,status:'ready',deletedAt:null,sha256:sha('a'),...patch,
});
const obj = (key,size=3,patch={}) => ({key,size,etag:'synthetic-etag',sha256:sha('a'),...patch});
const intent = (image,patch={}) => ({
  domain:image.domain,ownerId:image.ownerId,imageId:image.id,key:image.key,
  mimeType:image.mimeType,sizeBytes:image.sizeBytes,status:'completed',...patch,
});
const complete={images:true,intents:true,objects:true};
function receipt(images,intents,objects,completeness=complete) {
  return summarizeOriginalsInventory({images,intents,objects,completeness});
}
function row(report,key){return report.rows.find(item=>item.key===key)}

test('never authorizes deletion, rollback or production even for a complete consistent inventory',()=>{
  const image=img();const report=receipt([image],[intent(image)],[obj(image.key)]);
  assert.equal(report.inventoryComplete,true);
  assert.equal(report.deletionAuthorized,false);
  assert.equal(report.rollbackAuthorized,false);
  assert.equal(report.productionSafeToRelease,false);
  assert.equal(report.writes,0);
  assert.equal(row(report,image.key).classification,'active');
  assert.equal(row(report,image.key).byteDigestVerified,false);
});

test('preserves failed public originals as recoverable quarantine and flags unreferenced keys for review only',()=>{
  const failed=img('album-B','image-B',{status:'failed',sha256:sha('b')});
  const orphan=publicKey('album-C','image-C');
  const report=receipt([failed],[intent(failed,{status:'expired'})],[
    obj(failed.key,3,{sha256:sha('b')}),obj(orphan),
  ]);
  assert.equal(row(report,failed.key).classification,'quarantine');
  assert.equal(row(report,orphan).classification,'orphan_candidate');
  assert.equal(report.deletionAuthorized,false);
});

test('a partial R2 or D1 listing cannot establish an orphan or authorize disposal',()=>{
  const unknown=privateKey('gallery-X','photo-X');
  for(const missing of ['images','intents','objects']){
    const report=receipt([],[],[obj(unknown)],{...complete,[missing]:false});
    assert.equal(report.inventoryComplete,false);
    assert.equal(report.status,'BLOCKED_INCOMPLETE_INVENTORY');
    assert.equal(row(report,unknown).classification,'unverified');
    assert.equal(report.deletionAuthorized,false);
  }
});

test('cross-owner forged intent is not evidence of ownership, even if valid public image is ready',()=>{
  const a=img('album-A','image-A',{status:'pending'});
  const b=img('album-B','image-B');
  const fake=intent(a,{key:b.key});
  const report=receipt([a,b],[fake,intent(b)],[obj(a.key),obj(b.key)]);
  assert.equal(row(report,b.key).classification,'ownership_conflict');
  assert.notEqual(row(report,a.key).classification,'active');
});

test('private legacy paths remain recovery-only, never silently accepted as canonical ownership',()=>{
  const image=img('gallery-1','photo-1',{domain:'private',key:privateKey('gallery-1','photo-1')});
  const old=`client-galleries/gallery-1/photo-1/original.png`;
  const report=receipt([image],[intent(image)],[obj(image.key),obj(old)]);
  assert.equal(row(report,image.key).classification,'active');
  assert.equal(row(report,old).classification,'legacy_recovery_only');
  assert.equal(report.deletionAuthorized,false);
});

test('never compares owner keys by prefix or disregards size/hash mismatch',()=>{
  const a=img();
  const report=receipt([a],[intent(a)],[obj(a.key,4,{sha256:sha('f')}),obj(a.key+'.extra')]);
  assert.equal(row(report,a.key).classification,'integrity_conflict');
  assert.notEqual(row(report,a.key+'.extra').classification,'active');
});

test('duplicate exact key claims and absent R2 originals are reported without mutation',()=>{
  const a=img();const b=img('album-B','image-B',{key:a.key});
  const missing=img('album-C','image-C');
  const report=receipt([a,b,missing],[intent(a)],[obj(a.key)]);
  assert.equal(row(report,a.key).classification,'ownership_conflict');
  assert.equal(row(report,missing.key).classification,'missing_object');
  assert.equal(report.deletionAuthorized,false);
});

test('missing data and unknown metadata fail closed instead of forging completed manifest',()=>{
  const report=summarizeOriginalsInventory({images:null,intents:[],objects:[],completeness:complete});
  assert.equal(report.inventoryComplete,false);
  assert.equal(report.deletionAuthorized,false);
  assert.equal(report.status,'BLOCKED_INCOMPLETE_INVENTORY');
});

test('missing SHA metadata cannot make an original integrity-verified or purge-eligible',()=>{
  const a=img('album-X','image-X',{sha256:null});
  const report=receipt([a],[intent(a)],[obj(a.key,3,{sha256:null})]);
  assert.equal(row(report,a.key).classification,'integrity_unverified');
  assert.equal(row(report,a.key).byteDigestVerified,false);
  assert.equal(report.deletionAuthorized,false);
});

test('duplicate listing records flag every occurrence instead of leaving a spurious live row',()=>{
  const a=img('album-Y','image-Y');
  const report=receipt([a],[intent(a)],[obj(a.key),obj(a.key)]);
  assert.equal(report.rows.filter(item=>item.key===a.key).length,2);
  assert.ok(report.rows.filter(item=>item.key===a.key)
    .every(item=>item.classification==='ownership_conflict'));
});

test('a second D1 row with the same image identity cannot leave its first R2 key marked active',()=>{
  const first=img('album-Z','image-Z');
  const restored={...first,key:publicKey('other-owner','other-image')};
  const report=receipt([first,restored],[intent(first)],[obj(first.key)]);
  assert.equal(row(report,first.key).classification,'ownership_conflict');
  assert.equal(report.deletionAuthorized,false);
});

test('declared-complete but malformed object records fail closed before claiming inventory completeness',()=>{
  const report=receipt([],[],[{key:null,size:-1,etag:'garbled'}]);
  assert.equal(report.inventoryComplete,false);
  assert.equal(report.status,'BLOCKED_INCOMPLETE_INVENTORY');
  assert.equal(report.deletionAuthorized,false);
});

test('a ready D1 record with no matching upload intent is not an attested active original',()=>{
  const a=img('album-no-intent','image-no-intent');
  const report=receipt([a],[],[obj(a.key)]);
  assert.equal(row(report,a.key).classification,'integrity_unverified');
});

test('duplicate matching intent rows cannot make an R2 object active',()=>{
  const a=img('album-duplicate-intents','image-duplicate-intents');
  const report=receipt([a],[intent(a),intent(a)],[obj(a.key)]);
  assert.equal(row(report,a.key).classification,'ownership_conflict');
});

test('operator CLI outputs only aggregate read-only data, never R2 keys or SHA metadata',()=>{
  const directory=mkdtempSync(join(tmpdir(),'punctum-inventory-'));
  const path=join(directory,'synthetic-manifest.json');
  const a=img('private-forbidden-identifiers','image-forbidden-identifiers');
  const reportPath=join(dirname(fileURLToPath(import.meta.url)),'r4-originals-inventory-cli.mjs');
  try {
    writeFileSync(path,JSON.stringify({images:[a],intents:[intent(a)],objects:[obj(a.key)],completeness:complete}));
    const result=spawnSync(process.execPath,[reportPath,'--input',path],{encoding:'utf8',timeout:10000});
    assert.equal(result.status,0,result.stderr);
    assert.ok(!result.stderr);
    const summary=JSON.parse(result.stdout);
    assert.equal(summary.objectClassificationCounts.active,1);
    assert.equal(summary.deletionAuthorized,false);
    assert.equal(summary.writes,0);
    assert.equal(summary.byteDigestsVerified,0);
    for(const sensitive of [a.key,a.id,a.ownerId,a.sha256,'synthetic-etag',path]) {
      assert.ok(!result.stdout.includes(sensitive),'operator CLI must redact identifiers');
    }
  } finally {rmSync(directory,{recursive:true,force:true})}
});

test('operator CLI rejects incomplete manifests and invalid JSON without echoing input paths',()=>{
  const directory=mkdtempSync(join(tmpdir(),'punctum-inventory-'));
  const path=join(directory,'synthetic-manifest.json');
  const script=join(dirname(fileURLToPath(import.meta.url)),'r4-originals-inventory-cli.mjs');
  try {
    writeFileSync(path,JSON.stringify({images:[],intents:[],objects:[],completeness:{images:true,intents:false,objects:true}}));
    const incomplete=spawnSync(process.execPath,[script,'--input',path],{encoding:'utf8',timeout:10000});
    assert.equal(incomplete.status,2);
    assert.equal(JSON.parse(incomplete.stdout).status,'BLOCKED_INCOMPLETE_INVENTORY');
    writeFileSync(path,'{INVALID_JSON_RAW_SECRET=never-print}');
    const invalid=spawnSync(process.execPath,[script,'--input',path],{encoding:'utf8',timeout:10000});
    assert.equal(invalid.status,2);
    assert.equal(invalid.stdout,'');
    assert.match(invalid.stderr,/OFFLINE_INVENTORY_INPUT_INVALID/);
    assert.ok(!invalid.stderr.includes(path));
    assert.ok(!invalid.stderr.includes('RAW_SECRET'));
  } finally {rmSync(directory,{recursive:true,force:true})}
});
