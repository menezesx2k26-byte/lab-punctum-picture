import {realpathSync,statSync} from "node:fs";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {mutableSandboxConfig} from "./sandbox-runtime.mjs";
import {openSyntheticWritableDatabase} from "./writable-sqlite.mjs";
import {writableOriginals} from "./writable-originals.mjs";
import {syntheticLocalBackups} from "./synthetic-backups.mjs";

const cronMode=process.argv[2];
const expected={hourly:"0 * * * *",daily:"0 3 * * *"};
if(!Object.hasOwn(expected,cronMode) ||
   process.env.PUNCTUM_MUTABLE_SANDBOX_CRON_MODE!=="synthetic")
  throw Error("SYNTHETIC_CRON_EXPLICIT_MODE_REQUIRED");
const config=mutableSandboxConfig();
const backupsRoot=process.env.PUNCTUM_MUTABLE_SANDBOX_BACKUPS_ROOT;
const allowed=join(dirname(config.dbFile),"backups");
if(typeof backupsRoot!=="string" || resolve(backupsRoot)!==allowed ||
   realpathSync(backupsRoot)!==allowed || (statSync(backupsRoot).mode&0o077))
  throw Error("SYNTHETIC_CRON_BACKUP_ROOT_INVALID");
const source=fileURLToPath(new URL("../../dist/hostinger-cron/scheduled.mjs",import.meta.url));
if(!source.startsWith(fileURLToPath(new URL("../../dist/hostinger-cron/",import.meta.url))))
  throw Error("SYNTHETIC_CRON_BUILD_PATH_INVALID");
const {handleScheduled}=await import(new URL("../../dist/hostinger-cron/scheduled.mjs",import.meta.url));
if(typeof handleScheduled!=="function")throw Error("SYNTHETIC_CRON_HANDLER_MISSING");
const db=openSyntheticWritableDatabase(config.dbFile,{syntheticMode:"SYNTHETIC_ONLY_DO_NOT_USE_REAL_D1"});
const bucket=syntheticLocalBackups(backupsRoot);
const env={
 ENVIRONMENT:"preview",PRIVATE_GALLERIES_ENABLED:"true",
 CLIENT_AUTH_MODE:"password",DB:db,ORIGINALS:writableOriginals(config.originals),
 BACKUPS:bucket,BACKUP_PREFIX:"backups/d1",
};
const tasks=[];
const ctx={waitUntil(promise){tasks.push(Promise.resolve(promise));}};
try{
 await handleScheduled({cron:expected[cronMode],scheduledTime:Date.now(),noRetry(){}},env,ctx);
 await Promise.all(tasks);
 const result=await bucket.list({prefix:"backups/d1/",limit:1000});
 if(cronMode==="daily" && !result.objects.some(x=>x.key.includes("/daily/")))
   throw Error("SYNTHETIC_CRON_DAILY_BACKUP_NOT_CREATED");
 console.log(JSON.stringify({
  status:"SYNTHETIC_SCHEDULED_JOB_PASS",cronMode,
  backupsPresent:result.objects.length,
  productionDataUsed:false,dnsTouched:false,
 }));
}finally{db.close();}
