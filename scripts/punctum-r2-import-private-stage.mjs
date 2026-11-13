import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { imageMime } from "./punctum-r2-encrypted-stage.mjs";
import { privateOriginals, stageOriginal } from "../services/punctum-hostinger-production/originals.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const validMime = new Set(["image/jpeg","image/png","image/webp","image/avif","image/gif"]);
const MAX_IMAGE = 26_214_400;
const expectedTotal = 372040548;
const expectedCount = 230;
const hash = b => createHash("sha256").update(b).digest("hex");

function requirePrivateDir(path) {
  if (!isAbsolute(path)) throw Error("ABSOLUTE_PRIVATE_DIRECTORY_REQUIRED");
  const raw = lstatSync(path);
  const canonical = realpathSync(path);
  const st = statSync(canonical);
  if (raw.isSymbolicLink() || !st.isDirectory() || (st.mode & 0o077) ||
      canonical === project.slice(0,-1) || canonical.startsWith(project) ||
      /(?:^|[\\/])(?:public_html|hbuilds|dist)(?:[\\/]|$)/i.test(canonical)) {
    throw Error("UNSAFE_PRIVATE_DIRECTORY");
  }
  return canonical;
}
function privateFile(path) {
  const raw=lstatSync(path);
  if (!raw.isFile() || raw.isSymbolicLink() || raw.nlink!==1 || (raw.mode & 0o077))
    throw Error("UNSAFE_PRIVATE_IMAGE_FILE");
  return raw;
}

export function validatePrivateManifest(manifest,{count=expectedCount,total=expectedTotal}={}) {
  if (!manifest || manifest.schema!=="punctum-r2-originals-private-v1" ||
      manifest.bucket!=="punctum-picture-originals" ||
      manifest.sourceReadOnly!==true ||
      manifest.objectCount!==count || manifest.totalBytes!==total ||
      !Array.isArray(manifest.objects) || manifest.objects.length!==count)
    throw Error("R2_PRIVATE_MANIFEST_INVALID");
  const seen=new Set();
  let summed=0;
  for(let i=0;i<manifest.objects.length;i++){
    const o=manifest.objects[i];
    if(!o || typeof o.key!=="string" || !o.key.length ||
       Buffer.byteLength(o.key)>2048 || o.key.includes("\0") || seen.has(o.key) ||
       o.path!=="objects/"+String(i).padStart(4,"0")+".blob" ||
       !Number.isSafeInteger(o.size) || o.size<1 || o.size>MAX_IMAGE ||
       typeof o.sha256!=="string" || !/^[0-9a-f]{64}$/.test(o.sha256) ||
       !validMime.has(o.contentType))
      throw Error("R2_PRIVATE_MANIFEST_ENTRY_INVALID");
    seen.add(o.key);
    summed+=o.size;
  }
  if(summed!==total)throw Error("R2_PRIVATE_MANIFEST_TOTAL_MISMATCH");
  return {count,summed};
}

export async function importPrivateStage(unpacked, destination, options={}) {
  const source=requirePrivateDir(unpacked);
  const target=requirePrivateDir(destination);
  if(source===target || readdirSync(target).length)throw Error("R2_STAGE_TARGET_NOT_EMPTY");
  const p=join(source,"manifest.json");
  const info=privateFile(p);
  if(info.size>1024*1024 || info.size<50)throw Error("R2_MANIFEST_SIZE_INVALID");
  const bytes=readFileSync(p);
  const manifest=JSON.parse(bytes.toString("utf8"));
  const expected=validatePrivateManifest(manifest,options);
  const bucket=privateOriginals(target);
  let imported=0, importedBytes=0;
  for(const item of manifest.objects){
    const src=join(source,item.path);
    const st=privateFile(src);
    if(st.size!==item.size)throw Error("R2_IMAGE_STAGING_SIZE_MISMATCH");
    const blob=readFileSync(src);
    if(hash(blob)!==item.sha256 || imageMime(blob)!==item.contentType)
      throw Error("R2_IMAGE_STAGING_DIGEST_OR_MIME_MISMATCH");
    stageOriginal(target,item.key,blob,item.contentType,item.sha256);
    const actual=await bucket.get(item.key);
    if(!actual || actual.size!==item.size ||
       actual.etag!==item.sha256 || actual.httpMetadata?.contentType!==item.contentType ||
       hash(Buffer.from(await actual.arrayBuffer()))!==item.sha256) {
      throw Error("R2_STAGE_READBACK_FAILED");
    }
    imported++;
    importedBytes+=item.size;
  }
  if(imported!==expected.count || importedBytes!==expected.summed)
    throw Error("R2_STAGE_AGGREGATE_MISMATCH");
  const receipt={schema:"punctum-r2-private-stage-receipt-v1",
    status:"STAGED_READ_ONLY_NOT_PRODUCTION",
    sourceManifestSha256:hash(bytes),
    objectsImported:imported,bytesImported:importedBytes,
    hashesVerified:imported,applicationEnabled:false,
    productionReady:false,dnsTouched:false};
  const report=resolve(target,"..","r2-private-stage-receipt.json");
  if(existsSync(report))throw Error("R2_STAGE_RECEIPT_EXISTS");
  writeFileSync(report,JSON.stringify(receipt,null,2)+"\n",{flag:"wx",mode:0o600});
  return receipt;
}
const direct=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  importPrivateStage(process.env.PUNCTUM_R2_STAGE_UNPACKED_DIR??"",
    process.env.PUNCTUM_R2_STAGE_NEW_ROOT??"")
    .then(x=>console.log(JSON.stringify(x)))
    .catch(()=>{console.error("PUNCTUM_R2_IMPORT_STAGE_BLOCKED");process.exitCode=1;});
}
