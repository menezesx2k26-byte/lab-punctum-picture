import {createHash} from "node:crypto";
import {existsSync,mkdirSync,lstatSync,realpathSync,statSync,writeFileSync,readFileSync,readdirSync,unlinkSync} from "node:fs";
import {isAbsolute,join,relative,resolve,sep} from "node:path";

const KEY=/^backups\/d1\/(daily|weekly|monthly)\/(\d{4}-\d{2}(?:-\d{2})?)\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)\.json$/;
const PREFIX=/^backups\/d1\/(?:(?:daily|weekly|monthly)\/)?$/;
const MAX_BYTES=32*1024*1024;

function syntheticPrivateRoot(path){
  if(typeof path!=="string"||!isAbsolute(path))throw Error("SYNTHETIC_BACKUP_ABSOLUTE_ROOT_REQUIRED");
  const l=lstatSync(path),r=realpathSync(path),st=statSync(r);
  if(l.isSymbolicLink()||!st.isDirectory()||(st.mode&0o077)||
     !/(?:^|[\\/])synthetic-[a-z0-9-]+(?:[\\/]|$)/.test(r)||
     /(?:^|[\\/])(?:production-import|real-recovery)(?:[\\/]|$)/i.test(r))
    throw Error("SYNTHETIC_BACKUP_PRIVATE_ROOT_REQUIRED");
  return r;
}
function validKey(key){
 if(typeof key!=="string"||!KEY.test(key)||key.length>200)throw Error("SYNTHETIC_BACKUP_INVALID_KEY");
 return key;
}
function destination(root,key){
 const path=resolve(root,...validKey(key).split("/"));
 const rel=relative(root,path);
 if(rel.startsWith(".."+sep)||rel===".."||isAbsolute(rel))throw Error("SYNTHETIC_BACKUP_PATH_ESCAPE");
 return path;
}
function scan(root,sub=""){
 const result=[];
 const dir=join(root,sub);
 for(const item of readdirSync(dir,{withFileTypes:true})){
  if(item.isSymbolicLink())throw Error("SYNTHETIC_BACKUP_SYMLINK_FORBIDDEN");
  if(item.isDirectory())result.push(...scan(root,join(sub,item.name)));
  else if(item.isFile()){
   const key=join(sub,item.name).split(sep).join("/");
   validKey(key);
   const st=statSync(join(dir,item.name));
   if((st.mode&0o077)||st.nlink!==1)throw Error("SYNTHETIC_BACKUP_UNSAFE_FILE");
   result.push({key,size:st.size,uploaded:st.mtime});
  }else throw Error("SYNTHETIC_BACKUP_UNEXPECTED_ENTRY");
 }
 return result;
}
export function syntheticLocalBackups(rootPath){
 const root=syntheticPrivateRoot(rootPath);
 return {
  async put(key,body,options){
   const path=destination(root,key);
   if(typeof body!=="string"||Buffer.byteLength(body)>MAX_BYTES||Buffer.byteLength(body)<2)
     throw Error("SYNTHETIC_BACKUP_BODY_INVALID");
   if(options?.httpMetadata?.contentType!=="application/json")
     throw Error("SYNTHETIC_BACKUP_CONTENT_TYPE_INVALID");
   if(!["daily","weekly","monthly"].includes(options?.customMetadata?.retention))
     throw Error("SYNTHETIC_BACKUP_RETENTION_INVALID");
   JSON.parse(body);
   const parts=key.split("/");
   if(parts[2]!==options.customMetadata.retention)throw Error("SYNTHETIC_BACKUP_RETENTION_KEY_MISMATCH");
   let dir=root;
   for(const segment of parts.slice(0,-1)){
    dir=join(dir,segment);
    if(!existsSync(dir))mkdirSync(dir,{recursive:false,mode:0o700});
    const st=lstatSync(dir);
    if(st.isSymbolicLink()||!st.isDirectory()||(st.mode&0o077))
      throw Error("SYNTHETIC_BACKUP_PARENT_UNSAFE");
   }
   writeFileSync(path,body,{flag:"wx",mode:0o600});
   return {key,size:Buffer.byteLength(body),etag:createHash("sha256").update(body).digest("hex")};
  },
  async get(key){
   const path=destination(root,key),st=lstatSync(path);
   if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077))
     throw Error("SYNTHETIC_BACKUP_UNSAFE_FILE");
   const bytes=readFileSync(path);
   return {key,size:bytes.length,body:bytes,etag:createHash("sha256").update(bytes).digest("hex")};
  },
  async list({prefix="",cursor,limit=1000}={}){
   if(!PREFIX.test(prefix)||!Number.isSafeInteger(limit)||limit<1||limit>1000)
     throw Error("SYNTHETIC_BACKUP_LIST_UNSAFE");
   const all=scan(root).filter(x=>x.key.startsWith(prefix)).sort((a,b)=>a.key.localeCompare(b.key));
   let start=0;
   if(cursor){
    if(typeof cursor!=="string"||cursor.length>270)throw Error("SYNTHETIC_BACKUP_CURSOR_INVALID");
    const previous=Buffer.from(cursor,"base64url").toString("utf8");
    start=all.findIndex(x=>x.key===previous)+1;
    if(start===0)throw Error("SYNTHETIC_BACKUP_CURSOR_NOT_FOUND");
   }
   const objects=all.slice(start,start+limit);
   const truncated=start+objects.length<all.length;
   return {objects,truncated,cursor:truncated?Buffer.from(objects.at(-1).key).toString("base64url"):undefined};
  },
  async delete(keys){
   if(!Array.isArray(keys)||keys.length>1000)throw Error("SYNTHETIC_BACKUP_DELETE_INVALID");
   for(const key of keys){
    const path=destination(root,key),st=lstatSync(path);
    if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||(st.mode&0o077))
      throw Error("SYNTHETIC_BACKUP_DELETE_UNSAFE");
    unlinkSync(path);
   }
  },
 };
}
