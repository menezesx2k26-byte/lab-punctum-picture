import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { openProductionStageDatabase } from "./sqlite.mjs";
import { stageConfig } from "./runtime.mjs";
import { privateOriginals } from "./originals.mjs";

function sumKeys(rows, key) {
  return [...new Set(rows.map(x => x[key]).filter(x => typeof x === "string"))];
}
export function classifyReference(row, original) {
  if (!row || typeof row.key !== "string" || !row.key) return "malformed";
  if (row.key.startsWith("static:")) return "static";
  if (!original) return row.status === "ready" ? "missing_ready" : "missing_nonready";
  if (Number.isSafeInteger(Number(row.size)) &&
      Number(row.size) > 0 && Number(row.size) !== original.size) return "size_mismatch";
  if (typeof row.checksum === "string" && /^[0-9a-f]{64}$/i.test(row.checksum) &&
      row.checksum.toLowerCase() !== original.etag.toLowerCase()) return "checksum_mismatch";
  return "present";
}
export async function verifyRealStage() {
  const config=stageConfig();
  // Validate stage identity and private permissions before reading any real rows.
  openProductionStageDatabase(config.dbFile).close();
  const db=new DatabaseSync(config.dbFile,{readOnly:true,enableForeignKeyConstraints:true});
  const originals=privateOriginals(config.originalsRoot);
  try {
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
    const images=db.prepare("SELECT original_key AS key, status, size_bytes AS size, checksum FROM images").all();
    const site= tables.has("site_media")?
      db.prepare("SELECT storage_key AS key, status, size_bytes AS size FROM site_media").all():[];
    const gallery= tables.has("client_gallery_images")?
      db.prepare("SELECT storage_key AS key, status, size_bytes AS size FROM client_gallery_images").all():[];
    const intents= db.prepare("SELECT object_key AS key, status FROM upload_intents").all();
    const clientIntents=tables.has("client_gallery_upload_intents")?
      db.prepare("SELECT storage_key AS key, status FROM client_gallery_upload_intents").all():[];
    const references=[...images,...site,...gallery];
    const stats={
      schema:"punctum-real-stage-content-parity-v1",status:"IN_PROGRESS",sourceMutations:0,
      imageRows:images.length,siteRows:site.length,privateGalleryRows:gallery.length,
      intentRows:intents.length+clientIntents.length,staticReferences:0,
      uniqueOriginalReferences:0,verifiedOriginals:0,verifiedOriginalBytes:0,
      referencePresent:0,missingReady:0,missingNonReady:0,
      missingCompletedIntents:0,missingIncompleteIntents:0,
      checksumMismatch:0,sizeMismatch:0,malformed:0,
      productionReady:false,dnsTouched:false,
    };
    const cache=new Map();
    for(const row of references){
      if(row.key?.startsWith("static:")){stats.staticReferences++;continue;}
      if(typeof row.key!=="string"||!row.key){stats.malformed++;continue;}
      let original=cache.get(row.key);
      if(!cache.has(row.key)){
        const info=await originals.head(row.key);
        cache.set(row.key,info);
        original=info;
      }
      const kind=classifyReference(row,original);
      if(kind==="present")stats.referencePresent++;
      else if(kind==="missing_ready")stats.missingReady++;
      else if(kind==="missing_nonready")stats.missingNonReady++;
      else if(kind==="checksum_mismatch")stats.checksumMismatch++;
      else if(kind==="size_mismatch")stats.sizeMismatch++;
      else stats.malformed++;
    }
    stats.uniqueOriginalReferences=[...cache.keys()].length;
    const unique=Array.from(cache.entries());
    for(const [key,info] of unique){
      if(!info)continue;
      const object=await originals.get(key);
      if(!object||object.size!==info.size||object.etag!==info.etag)
        throw Error("R2_READBACK_DIGEST_FAILED");
      stats.verifiedOriginals++;
      stats.verifiedOriginalBytes+=object.size;
    }
    for(const row of [...intents,...clientIntents]){
      if(typeof row.key!=="string" || !row.key){stats.malformed++;continue;}
      if(row.key.startsWith("static:"))continue;
      if(cache.has(row.key)&&cache.get(row.key))continue;
      if(await originals.head(row.key))continue;
      if(row.status==="completed")stats.missingCompletedIntents++;
      else stats.missingIncompleteIntents++;
    }
    if(stats.missingReady||stats.missingCompletedIntents||stats.checksumMismatch||
       stats.sizeMismatch||stats.malformed)throw Error("PRODUCTION_SOURCE_REFERENCE_PARITY_FAILED");
    stats.status="REAL_STAGE_METADATA_AND_BYTES_MATCHED_WITH_INCOMPLETE_INTENTS_PRESERVED";
    return stats;
  }finally{db.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  verifyRealStage().then(result=>console.log(JSON.stringify(result)))
    .catch(()=>{console.error("PRODUCTION_SOURCE_REFERENCE_PARITY_BLOCKED");process.exitCode=1;});
}
