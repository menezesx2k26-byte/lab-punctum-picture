import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const R4_SCOPED_PNG_BYTES=79;
/** @param {() => string} [uuid] */
export function createScopedFixtureReceipt(uuid=randomUUID) {
 const clients=[],galleries=[],images=[],intents=[],favorites=[];
 for(let owner=0;owner<2;owner++){
   const id=uuid(),galleryId=uuid();
   clients.push({id,email:`pilot-${id}@example.invalid`,name:`R4 synthetic owner ${owner+1}`});
   galleries.push({id:galleryId,clientId:id,title:`R4 synthetic gallery ${owner+1}`});
   for(let index=0;index<5;index++){
     const imageId=uuid(),intentId=uuid();
     const storageKey=`client-galleries/${galleryId}/${imageId}/original.png`;
     images.push({id:imageId,galleryId,storageKey,sizeBytes:R4_SCOPED_PNG_BYTES,mimeType:'image/png',position:index});
     intents.push({id:intentId,galleryId,imageId,storageKey});
     if(index===0)favorites.push({clientId:id,galleryId,imageId});
   }
 }
 const receipt={mode:'r4-scoped-synthetic-backup-fixture-v1',clients,galleries,images,intents,favorites,uploadE2E:false};
 validateScopedFixtureReceipt(receipt);
 return receipt;
}
export function validateScopedFixtureReceipt(receipt) {
 assert.equal(receipt?.mode,'r4-scoped-synthetic-backup-fixture-v1');
 assert.equal(receipt.uploadE2E,false);
 for(const [field,count] of [['clients',2],['galleries',2],['images',10],['intents',10],['favorites',2]])assert.equal(receipt[field]?.length,count,'Expected fixture relation count '+field);
 const ids=[...receipt.clients,...receipt.galleries,...receipt.images,...receipt.intents].map(row=>row.id);
 assert.ok(ids.every(id=>UUID.test(id))&&new Set(ids).size===24,'All 24 IDs must be unique UUIDs');
 const clientIds=new Set(receipt.clients.map(c=>c.id));
 assert.ok(receipt.clients.every(c=>c.email===`pilot-${c.id}@example.invalid`));
 const galleries=new Map(receipt.galleries.map(g=>[g.id,g]));
 assert.ok(receipt.galleries.every(g=>clientIds.has(g.clientId)));
 const images=new Map(receipt.images.map(i=>[i.id,i]));
 assert.equal(new Set(receipt.images.map(i=>i.storageKey)).size,10);
 assert.ok(receipt.images.every(i=>galleries.has(i.galleryId)&&i.storageKey===`client-galleries/${i.galleryId}/${i.id}/original.png`&&i.sizeBytes===79&&i.mimeType==='image/png'&&Number.isInteger(i.position)&&i.position>=0&&i.position<5));
 assert.ok(receipt.intents.every(i=>images.get(i.imageId)?.galleryId===i.galleryId&&images.get(i.imageId)?.storageKey===i.storageKey));
 assert.ok(receipt.favorites.every(f=>galleries.get(f.galleryId)?.clientId===f.clientId&&images.get(f.imageId)?.galleryId===f.galleryId));
 assert.ok(receipt.galleries.every(g=>receipt.images.filter(i=>i.galleryId===g.id).length===5&&receipt.favorites.filter(f=>f.galleryId===g.id).length===1));
 return true;
}
