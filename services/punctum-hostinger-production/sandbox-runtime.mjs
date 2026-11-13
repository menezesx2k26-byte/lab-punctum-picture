import { lstatSync,realpathSync,statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { validatePrivateStageDb } from "./sqlite.mjs";

export function mutableSandboxConfig(){
  if(process.env.PUNCTUM_MUTABLE_SANDBOX_MODE!=="synthetic")
    throw Error("MUTABLE_SANDBOX_OPT_IN_REQUIRED");
  const value=process.env.PUNCTUM_MUTABLE_SANDBOX_ORIGIN;
  let origin;
  try{origin=new URL(value);}catch{throw Error("MUTABLE_SANDBOX_LOOPBACK_ORIGIN_REQUIRED");}
  if(origin.protocol!=="http:" || !["127.0.0.1","localhost"].includes(origin.hostname) ||
     !origin.port || !Number.isInteger(Number(origin.port)) || Number(origin.port)<1024 ||
     origin.pathname!=="/" || origin.search || origin.hash)
    throw Error("MUTABLE_SANDBOX_LOOPBACK_ORIGIN_REQUIRED");
  const dbFile=validatePrivateStageDb(process.env.PUNCTUM_MUTABLE_SANDBOX_DB_FILE);
  if(!/(?:^|[\\/])synthetic-[a-z0-9-]+(?:[\\/]|$)/.test(dbFile) ||
     /(?:^|[\\/])(?:production-import|d1-export|r2-export)(?:[\\/]|$)/i.test(dbFile))
    throw Error("MUTABLE_SANDBOX_REAL_DATABASE_FORBIDDEN");
  const originals=process.env.PUNCTUM_MUTABLE_SANDBOX_ORIGINALS;
  if(typeof originals!=="string" || !isAbsolute(originals) || realpathSync(originals)!==originals ||
     lstatSync(originals).isSymbolicLink() || !statSync(originals).isDirectory() ||
     (statSync(originals).mode & 0o077) ||
     !/(?:^|[\\/])synthetic-[a-z0-9-]+(?:[\\/]|$)/.test(originals))
    throw Error("MUTABLE_SANDBOX_PRIVATE_ORIGINALS_REQUIRED");
  const email=process.env.PUNCTUM_MUTABLE_SANDBOX_ADMIN_EMAIL;
  if(!/^[a-z0-9._+-]+@(?:[a-z0-9-]+\.)?(?:test|invalid)$/.test(email??""))
    throw Error("MUTABLE_SANDBOX_ADMIN_MUST_BE_FICTITIOUS");
  const secrets=["PUNCTUM_MUTABLE_SANDBOX_ADMIN_PASSWORD_HASH","PUNCTUM_MUTABLE_SANDBOX_ADMIN_SESSION_SECRET","PUNCTUM_MUTABLE_SANDBOX_CLIENT_SESSION_SECRET"];
  if(!/^[a-f0-9]{64}$/.test(process.env[secrets[0]]??"") ||
     secrets.slice(1).some(key=>(process.env[key]??"").length<40))
    throw Error("MUTABLE_SANDBOX_SYNTHETIC_SECRETS_REQUIRED");
  return {origin,dbFile,originals,email};
}
