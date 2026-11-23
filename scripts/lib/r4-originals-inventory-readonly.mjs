/**
 * PUNCTUM R4 — offline/read-only D1 image/intent + R2 listing reconciler.
 * This module has no I/O or mutation capabilities and cannot grant R2 deletion.
 * Inputs are independently collected, complete read-only manifests; hashes in
 * metadata are just claims, NEVER proof that R2 bytes were digested here.
 */
const SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const EXTENSIONS = Object.freeze({
  'image/png':'png', 'image/webp':'webp', 'image/jpeg':'jpg',
});
const PREFIXES=['originals/','client-galleries/'];

function keyFor(image) {
  const domain=image?.domain;
  const owner=image?.ownerId;
  const id=image?.id;
  const ext=EXTENSIONS[image?.mimeType];
  if (!SEGMENT.test(owner||'') || !SEGMENT.test(id||'') || !ext) return null;
  if (domain==='public') return `originals/${owner}/${id}.${ext}`;
  if (domain==='private') return `client-galleries/${owner}/${id}.${ext}`;
  return null;
}

function classifyUnknownKey(key) {
  if (/^client-galleries\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/original\.png$/.test(key))
    return 'legacy_recovery_only';
  if (PREFIXES.some(prefix=>key.startsWith(prefix))) {
    const publicOriginal=/^originals\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.(?:png|webp|jpg)$/;
    const privateOriginal=/^client-galleries\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\.(?:png|webp|jpg)$/;
    return publicOriginal.test(key)||privateOriginal.test(key) ? 'orphan_candidate' : 'unverified';
  }
  return 'out_of_scope';
}

const safeArray=value => Array.isArray(value) ? value : [];
const objKey=row => typeof row?.key === 'string' ? row.key : '';
const imageId=row => `${row?.domain}\u0000${row?.ownerId}\u0000${row?.id}`;
const intentImageId=row => `${row?.domain}\u0000${row?.ownerId}\u0000${row?.imageId}`;

export function summarizeOriginalsInventory(input) {
  const images=safeArray(input?.images);
  const intents=safeArray(input?.intents);
  const objects=safeArray(input?.objects);
  const flags=input?.completeness;
  // Completeness flags alone are not evidence that a listing is well formed.
  // Malformed identifiers/sizes must fail closed even if a caller labels every
  // page complete. This is still not a consistency proof across D1 and R2.
  const validObjectRows=objects.every(object =>
    typeof object?.key==='string' && object.key.length>0 &&
    Number.isSafeInteger(object.size) && object.size>=0 &&
    typeof object.etag==='string' && object.etag.length>0);
  const inventoryComplete=Array.isArray(input?.images) && Array.isArray(input?.intents) &&
    Array.isArray(input?.objects) && flags?.images === true &&
    flags?.intents === true && flags?.objects === true && validObjectRows;
  const imageMap=new Map();
  const imageClaims=new Map();
  const conflictKeys=new Set();
  const intentKeys=new Map();

  for (const image of images) {
    const imageIdentity=imageId(image);
    const key=objKey(image);
    if (!imageIdentity || imageMap.has(imageIdentity)) conflictKeys.add(key);
    imageMap.set(imageIdentity,image);
    if (!imageClaims.has(key)) imageClaims.set(key,[]);
    imageClaims.get(key).push(image);
    if (!key || keyFor(image)!==key || !Number.isSafeInteger(image?.sizeBytes) || image.sizeBytes<0)
      conflictKeys.add(key);
  }
  for (const intent of intents) {
    const key=objKey(intent);
    const img=imageMap.get(intentImageId(intent));
    if (!intentKeys.has(key)) intentKeys.set(key,[]);
    intentKeys.get(key).push(intent);
    if (!key || !img || key!==img.key || intent?.mimeType!==img.mimeType ||
        intent?.sizeBytes!==img.sizeBytes || intent?.status==='failed' && img.status==='ready')
      conflictKeys.add(key);
  }

  const objectKeyCounts=new Map();
  for (const object of objects) {
    const key=objKey(object);
    objectKeyCounts.set(key,(objectKeyCounts.get(key)||0)+1);
  }
  const objectKeys=new Set();
  const rows=[];
  let observedBytes=0;
  for (const object of objects) {
    const key=objKey(object);
    const duplicate=objectKeyCounts.get(key)!==1;
    objectKeys.add(key);
    if (Number.isSafeInteger(object?.size) && object.size>=0) observedBytes+=object.size;
    const claim=imageClaims.get(key)||[];
    const intentClaim=intentKeys.get(key)||[];
    const cls=classifyUnknownKey(key);
    let classification=inventoryComplete?cls:'unverified';
    let metadataDigestMatch=null;
    const image=claim[0];
    if (image) {
      if (!inventoryComplete) classification='unverified';
      else if (duplicate || claim.length!==1 || intentClaim.length>1 ||
        conflictKeys.has(key) || keyFor(image)!==key)
        classification='ownership_conflict';
      else {
        const sizeMatch=object?.size===image.sizeBytes;
        const recordedSha=typeof image.sha256==='string'?image.sha256.toLowerCase():null;
        const listedSha=typeof object.sha256==='string'?object.sha256.toLowerCase():null;
        const hashKnown=recordedSha && listedSha && SHA256.test(recordedSha) && SHA256.test(listedSha);
        metadataDigestMatch=hashKnown ? recordedSha===listedSha : null;
        if (!sizeMatch || metadataDigestMatch===false) classification='integrity_conflict';
        else if (image.status==='ready' && !image.deletedAt &&
          !intentClaim.some(item=>item.status==='expired' || item.status==='failed'))
          classification=metadataDigestMatch===true && intentClaim.length===1 &&
            intentClaim[0].status==='completed' ? 'active':'integrity_unverified';
        else classification='quarantine';
      }
    } else if (duplicate) classification='ownership_conflict';
    else if (conflictKeys.has(key)) classification='ownership_conflict';
    rows.push({key,classification,sizeBytes:object?.size??null,
      etag:typeof object?.etag==='string'?object.etag:null,
      metadataDigestMatch,byteDigestVerified:false});
  }

  for (const [key,claims] of imageClaims) {
    if (objectKeys.has(key)) continue;
    rows.push({key,classification:inventoryComplete?(claims.length!==1||conflictKeys.has(key)?
      'ownership_conflict':'missing_object'):'unverified',sizeBytes:null,etag:null,
      metadataDigestMatch:null,byteDigestVerified:false});
  }
  rows.sort((a,b)=>a.key.localeCompare(b.key));
  const counts={};
  for (const row of rows) counts[row.classification]=(counts[row.classification]||0)+1;
  return {
    schemaVersion:1,
    scope:'PUNCTUM_R4_ORIGINALS_MANIFEST_OFFLINE_READ_ONLY',
    status:inventoryComplete?'READ_ONLY_REVIEW_REQUIRED':'BLOCKED_INCOMPLETE_INVENTORY',
    inventoryComplete,
    rows,
    observedBytes,
    counts,
    deletionAuthorized:false,
    rollbackAuthorized:false,
    productionSafeToRelease:false,
    writes:0,
    blockers:[
      'No proof of exclusive actor fencing or distributed D1/R2 atomicity',
      'R2 byte-level SHA-256 was not re-read and verified by this metadata-only manifest',
      'No authorized segregated remote rollback, predecessor/config, cost and restoration QA',
      ...(!inventoryComplete?['At least one D1/R2 manifest is incomplete or absent']:[]),
    ],
  };
}
