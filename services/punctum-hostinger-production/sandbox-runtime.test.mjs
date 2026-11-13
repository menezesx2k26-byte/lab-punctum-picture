import assert from "node:assert/strict";
import test from "node:test";
import {randomBytes} from "node:crypto";
import {chmodSync,mkdirSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {mutableSandboxConfig} from "./sandbox-runtime.mjs";
import {productionStageApplicationId} from "./sqlite.mjs";

test("synthetic mutable runtime rejects production identity, public origins and unprivate paths",t=>{
  const base=mkdtempSync(join(tmpdir(),"punctum-runtime-"));
  chmodSync(base,0o700);
  const synthetic=join(base,"synthetic-qa-private");
  mkdirSync(synthetic,{mode:0o700});
  const dbPath=join(synthetic,"application.sqlite");
  const db=new DatabaseSync(dbPath);
  db.exec("PRAGMA application_id="+productionStageApplicationId);
  db.close();
  chmodSync(dbPath,0o600);
  const originals=join(synthetic,"originals");
  mkdirSync(originals,{mode:0o700});
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  const values={
    PUNCTUM_MUTABLE_SANDBOX_MODE:"synthetic",
    PUNCTUM_MUTABLE_SANDBOX_ORIGIN:"http://127.0.0.1:3030/",
    PUNCTUM_MUTABLE_SANDBOX_DB_FILE:dbPath,
    PUNCTUM_MUTABLE_SANDBOX_ORIGINALS:originals,
    PUNCTUM_MUTABLE_SANDBOX_ADMIN_EMAIL:"qa@punctum.invalid",
    PUNCTUM_MUTABLE_SANDBOX_ADMIN_PASSWORD_HASH:"a".repeat(64),
    PUNCTUM_MUTABLE_SANDBOX_ADMIN_SESSION_SECRET:"b".repeat(48),
    PUNCTUM_MUTABLE_SANDBOX_CLIENT_SESSION_SECRET:"c".repeat(48),
  };
  const names=Object.keys(values);
  const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  Object.assign(process.env,values);
  t.after(()=>{for(const n of names)if(previous[n]===undefined)delete process.env[n];else process.env[n]=previous[n]});
  assert.equal(mutableSandboxConfig().origin.origin,"http://127.0.0.1:3030");
  for(const [key,value] of [
    ["PUNCTUM_MUTABLE_SANDBOX_MODE","production"],
    ["PUNCTUM_MUTABLE_SANDBOX_ORIGIN","https://punctumpicture.com/"],
    ["PUNCTUM_MUTABLE_SANDBOX_ORIGIN","http://0.0.0.0:3030/"],
    ["PUNCTUM_MUTABLE_SANDBOX_ADMIN_EMAIL","real@example.com"],
    ["PUNCTUM_MUTABLE_SANDBOX_ADMIN_SESSION_SECRET","short"],
  ]){
    const before=process.env[key];process.env[key]=value;
    assert.throws(()=>mutableSandboxConfig());
    process.env[key]=before;
  }
  chmodSync(originals,0o755);
  assert.throws(()=>mutableSandboxConfig(),/PRIVATE_ORIGINALS_REQUIRED/);
});
