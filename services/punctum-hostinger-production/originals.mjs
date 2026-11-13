import { createHash } from "node:crypto";
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";

const hex = /^[a-f0-9]{64}$/;
const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);
const maxBytes = 26_214_400;

const sha = data => createHash("sha256").update(data).digest("hex");
function validateKey(key) {
  if (typeof key !== "string" || !key.length || Buffer.byteLength(key) > 2048 ||
      key.includes("\0")) throw Error("INVALID_ORIGINAL_KEY");
  return sha(Buffer.from(key));
}
function validateRoot(root) {
  if (!isAbsolute(root)) throw Error("ABSOLUTE_ORIGINALS_ROOT_REQUIRED");
  const canonical = realpathSync(root);
  const info = lstatSync(root);
  const actual = statSync(canonical);
  if (info.isSymbolicLink() || !actual.isDirectory() || (actual.mode & 0o077) ||
      /(?:^|[\\/])(?:public_html|hbuilds|public|dist)(?:[\\/]|$)/i.test(canonical)) {
    throw Error("PRIVATE_ORIGINALS_STORAGE_REQUIRED");
  }
  return canonical;
}
function paths(root, key) {
  const id = validateKey(key);
  const partition = join(root,id.slice(0,2));
  return { partition, data:join(partition,id+".blob"), meta:join(partition,id+".json") };
}
function ensurePrivateFile(path) {
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (info.mode & 0o077)) {
    throw Error("UNSAFE_STAGED_ORIGINAL");
  }
  return info;
}
function metadata(root,key) {
  const p=paths(root,key);
  if(!existsSync(p.meta))return null;
  ensurePrivateFile(p.meta);
  const meta=JSON.parse(readFileSync(p.meta,"utf8"));
  if (meta.schema !== "punctum-private-original-v1" || meta.key !== key ||
      !mimeTypes.has(meta.contentType) || !Number.isSafeInteger(meta.size) ||
      meta.size < 1 || meta.size > maxBytes || !hex.test(meta.sha256) ||
      !existsSync(p.data)) throw Error("ORIGINAL_MANIFEST_MISMATCH");
  const info=ensurePrivateFile(p.data);
  if(info.size!==meta.size)throw Error("ORIGINAL_FILE_SIZE_MISMATCH");
  return {p,meta};
}
function exposed(meta) {
  const checksum=Uint8Array.from({length:32},(_,i)=>parseInt(meta.sha256.slice(i*2,i*2+2),16)).buffer;
  return {
    size:meta.size,
    etag:meta.sha256,
    uploaded:new Date(meta.uploadedAt),
    checksums:{sha256:checksum},
    httpMetadata:{contentType:meta.contentType},
    customMetadata:{sha256:meta.sha256},
  };
}
export function privateOriginals(root) {
  const location = validateRoot(root);
  return {
    async head(key) {
      const stored=metadata(location,key);
      return stored?exposed(stored.meta):null;
    },
    async get(key) {
      const stored=metadata(location,key);
      if(!stored)return null;
      const bytes=readFileSync(stored.p.data);
      if(bytes.length!==stored.meta.size || sha(bytes)!==stored.meta.sha256) {
        throw Error("ORIGINAL_BYTES_DIGEST_MISMATCH");
      }
      const info=exposed(stored.meta);
      return {
        ...info,
        body:new Response(new Uint8Array(bytes)).body,
        arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),
      };
    },
    async put(){ throw Error("PRODUCTION_ORIGINALS_WRITE_GATE_CLOSED"); },
    async delete(){ throw Error("PRODUCTION_ORIGINALS_DELETE_GATE_CLOSED"); },
    async list(){ throw Error("PRODUCTION_ORIGINALS_LIST_GATE_CLOSED"); },
  };
}
export function stageOriginal(root, key, bytes, contentType, expectedSha256) {
  const location=validateRoot(root);
  const p=paths(location,key);
  if(!mimeTypes.has(contentType) || !hex.test(expectedSha256) ||
      !(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > maxBytes ||
      sha(bytes)!==expectedSha256)throw Error("STAGED_ORIGINAL_INVALID");
  mkdirSync(p.partition,{recursive:true,mode:0o700});
  const partition=statSync(p.partition);
  if((partition.mode & 0o077) || lstatSync(p.partition).isSymbolicLink()) throw Error("UNSAFE_ORIGINAL_PARTITION");
  if(existsSync(p.data)||existsSync(p.meta))throw Error("STAGED_ORIGINAL_ALREADY_EXISTS");
  // Never publish the metadata commit-marker unless the immutable bytes exist.
  let blobCreated=false;
  try {
    const fd=openSync(p.data,"wx",0o600);
    blobCreated=true;
    try { writeFileSync(fd,bytes); } finally { closeSync(fd); }
    const meta={
      schema:"punctum-private-original-v1",key,size:bytes.length,
      sha256:expectedSha256,contentType,uploadedAt:new Date().toISOString(),
    };
    writeFileSync(p.meta,JSON.stringify(meta)+"\n",{flag:"wx",mode:0o600});
    return {size:meta.size,sha256:meta.sha256,contentType:meta.contentType};
  } catch(error){
    if(blobCreated && !existsSync(p.meta))rmSync(p.data,{force:true});
    throw error;
  }
}
