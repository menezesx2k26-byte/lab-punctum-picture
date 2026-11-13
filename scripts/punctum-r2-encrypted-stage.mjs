import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const bucket = "punctum-picture-originals";
const endpoint = "https://api.cloudflare.com/client/v4/accounts/";
const MAX_BYTES = 26_214_400;
const MAX_TOTAL = 1_073_741_824;
const MAX_OBJECTS = 1000;
const recipient = "config/hostinger/recipient-20261113.crt";

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function hex64(value) { return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value); }

export function imageMime(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) throw Error("UNSUPPORTED_IMAGE_BYTES");
  const b = Buffer.from(bytes);
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  if (b.subarray(0, 4).toString() === "GIF8" && ["7a","9a"].includes(b.subarray(4,6).toString())) return "image/gif";
  if (b.subarray(0,4).toString() === "RIFF" && b.subarray(8,12).toString() === "WEBP") return "image/webp";
  if (b.subarray(4,8).toString() === "ftyp" && ["avif","avis"].includes(b.subarray(8,12).toString())) return "image/avif";
  throw Error("UNSUPPORTED_IMAGE_BYTES");
}
export function verifyOriginal(row, bytes) {
  if (!row || typeof row.key !== "string" || !row.key.length || Buffer.byteLength(row.key) > 2048 ||
      row.key.includes("\0") || !Number.isSafeInteger(row.size) ||
      row.size < 1 || row.size > MAX_BYTES || !(bytes instanceof Uint8Array)) {
    throw Error("INVALID_SOURCE_ORIGINAL");
  }
  if (bytes.length !== row.size) throw Error("SOURCE_SIZE_MISMATCH");
  return { key: row.key, size: bytes.length, sha256: sha256(bytes), contentType: imageMime(bytes) };
}
export function verifyRequest(req) {
  if (!req || req.scope !== "PUNCTUM_R2_ENCRYPTED_STAGING_ONLY" ||
      req.action !== "encrypt-r2" || req.sourceReadOnly !== true ||
      req.dnsTouched !== false || req.productionDataImported !== false ||
      req.bucket !== bucket ||
      req.expectedObjects !== 230 || req.expectedBytes !== 372040548 ||
      req.recipientCertFingerprintSha256 !== "084d9c304632758f673a920930a388dc45300878d7ecf4fecc3be2fd873fd1d0")
    throw Error("UNAUTHORIZED_ENCRYPTED_R2_REQUEST");
}

async function apiJson(account, token, path) {
  const response = await fetch(endpoint + account + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw Error("R2_METADATA_HTTP_" + response.status);
  const body = await response.json();
  if (!body || body.success !== true) throw Error("R2_METADATA_INVALID");
  return body;
}
async function sourceInventory(account, token) {
  const objects = [];
  const keys = new Set();
  const cursors = new Set();
  let cursor = null;
  do {
    const q = new URLSearchParams({ per_page: "1000" });
    if (cursor) q.set("cursor", cursor);
    const result = await apiJson(account, token, "/r2/buckets/" + bucket + "/objects?" + q);
    if (!Array.isArray(result.result)) throw Error("R2_LIST_INCOMPLETE");
    for (const row of result.result) {
      if (typeof row?.key !== "string" || !row.key.length ||
          Buffer.byteLength(row.key) > 2048 || row.key.includes("\0") ||
          !Number.isSafeInteger(row?.size) || row.size < 1 || row.size > MAX_BYTES ||
          keys.has(row.key)) throw Error("R2_LIST_INVALID");
      keys.add(row.key);
      objects.push({key:row.key,size:row.size});
      if (objects.length > MAX_OBJECTS) throw Error("R2_OBJECT_COUNT_CAP");
    }
    if (result.result_info?.is_truncated) {
      const next = result.result_info.cursor;
      if (typeof next !== "string" || !next || cursors.has(next)) throw Error("R2_CURSOR_INVALID");
      cursors.add(next);
      cursor = next;
    } else cursor = null;
  } while (cursor);
  objects.sort((a,b) => a.key.localeCompare(b.key));
  const total = objects.reduce((acc,o)=>acc+o.size,0);
  if (total > MAX_TOTAL) throw Error("R2_TOTAL_CAP");
  return {objects,total};
}
async function downloadObject(account, token, key) {
  const path = key.split("/").map(encodeURIComponent).join("/");
  for (let attempt=0;attempt<3;attempt++) {
    const response = await fetch(endpoint + account + "/r2/buckets/" + bucket + "/objects/" + path, {
      headers: {Authorization:"Bearer "+token,Accept:"application/octet-stream"},
      signal:AbortSignal.timeout(90000),
    });
    if ((response.status===429 || response.status>=500) && attempt<2) {
      await new Promise(done=>setTimeout(done,1500*(attempt+1)));
      continue;
    }
    if (!response.ok) throw Error("R2_SOURCE_HTTP_" + response.status);
    const bytes=Buffer.from(await response.arrayBuffer());
    if (bytes.length>MAX_BYTES) throw Error("R2_DOWNLOAD_SIZE_CAP");
    return bytes;
  }
  throw Error("R2_SOURCE_RETRY_EXHAUSTED");
}
function exec(program,args,timeout=120000) {
  return execFileSync(program,args,{encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout,maxBuffer:4*1024*1024});
}
function fingerprint(cert) {
  exec("openssl",["x509","-in",cert,"-checkend","3600","-noout"]);
  return exec("openssl",["x509","-in",cert,"-fingerprint","-sha256","-noout"])
    .trim().split("=").at(-1).replaceAll(":","").toLowerCase();
}
async function fileHash(path) {
  const {createReadStream}=await import("node:fs");
  const hash=createHash("sha256");
  for await (const piece of createReadStream(path,{highWaterMark:1024*1024})) hash.update(piece);
  return hash.digest("hex");
}
export async function run() {
  const request=JSON.parse(readFileSync(resolve("requests/punctum-r2-encrypted-stage.json"),"utf8"));
  verifyRequest(request);
  const cert=resolve(recipient);
  if (fingerprint(cert)!==request.recipientCertFingerprintSha256) throw Error("RECIPIENT_CERTIFICATE_MISMATCH");
  const account=process.env.CLOUDFLARE_ACCOUNT_ID;
  const token=process.env.CLOUDFLARE_API_TOKEN;
  if (!/^[0-9a-f]{32}$/i.test(account??"") || !token) throw Error("R2_SOURCE_CREDENTIALS_UNAVAILABLE");
  const {objects,total}=await sourceInventory(account,token);
  if (objects.length!==request.expectedObjects || total!==request.expectedBytes) throw Error("R2_SOURCE_CHANGED");
  const temp=mkdtempSync(join(tmpdir(),"punctum-r2-private-"));
  const output=resolve("outputs/punctum-r2-encrypted-stage");
  mkdirSync(output,{recursive:true,mode:0o700});
  const encrypted=join(output,"punctum-r2-originals.cms");
  const receiptPath=join(output,"punctum-r2-stage-receipt.json");
  try {
    mkdirSync(join(temp,"objects"),{mode:0o700});
    const entries=new Array(objects.length);
    let index=0;
    async function worker() {
      while(index<objects.length) {
        const i=index++;
        const row=objects[i];
        const data=await downloadObject(account,token,row.key);
        const info=verifyOriginal(row,data);
        const name=String(i).padStart(4,"0")+".blob";
        writeFileSync(join(temp,"objects",name),data,{flag:"wx",mode:0o600});
        entries[i]={...info,path:"objects/"+name};
      }
    }
    await Promise.all(Array.from({length:4},()=>worker()));
    const manifest={schema:"punctum-r2-originals-private-v1",bucket,sourceReadOnly:true,
      objectCount:entries.length,totalBytes:total,objects:entries};
    writeFileSync(join(temp,"manifest.json"),JSON.stringify(manifest)+"\n",{flag:"wx",mode:0o600});
    const tar=join(temp,"payload.tar");
    exec("tar",["-C",temp,"-cf",tar,"manifest.json","objects"],180000);
    if (statSync(tar).size<total || statSync(tar).size>MAX_TOTAL+10000000) throw Error("R2_TAR_SIZE_INVALID");
    if (statSync(encrypted,{throwIfNoEntry:false})) throw Error("R2_CIPHERTEXT_ALREADY_EXISTS");
    exec("openssl",["cms","-encrypt","-binary","-aes-256-gcm","-outform","DER",
      "-in",tar,"-out",encrypted,"-recip",cert,"-keyopt","rsa_padding_mode:oaep"],240000);
    // Never print the huge CMS encrypted content to logs while validating format.
    // Algorithm options are pinned in the invocation; decryption at the VPS receiver authenticates it.
    if (statSync(encrypted).size < total || statSync(encrypted).size > MAX_TOTAL + 10000000)
      throw Error("R2_CIPHERTEXT_SIZE_INVALID");
    const receipt={schema:"punctum-r2-encrypted-stage-v1",status:"ENCRYPTED_ONLY",
      bucket,objectsCount:entries.length,objectsBytes:total,
      sourceInventoryExpectedObjects:request.expectedObjects,
      sourceInventoryExpectedBytes:request.expectedBytes,
      cmsBytes:statSync(encrypted).size,cmsSha256:await fileHash(encrypted),
      recipientCertFingerprintSha256:request.recipientCertFingerprintSha256,
      sourceReadOnly:true,sourceMutations:0,productionDataImported:false,dnsTouched:false,
      privateKeysInArtifact:false};
    if (statSync(receiptPath,{throwIfNoEntry:false})) throw Error("R2_RECEIPT_ALREADY_EXISTS");
    writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+"\n",{flag:"wx",mode:0o600});
    console.log(JSON.stringify(receipt));
    return receipt;
  } finally {
    rmSync(temp,{recursive:true,force:true});
  }
}
const direct=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct)run().catch(()=>{console.error("PUNCTUM_R2_ENCRYPTED_STAGE_BLOCKED");process.exitCode=1;});
