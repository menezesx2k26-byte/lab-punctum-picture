import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { guardedVinextSource, applyVinextAbortPatch } from "./hostinger-vinext-client-abort-patch.mjs";

const sourcePath="node_modules/vinext/dist/server/prod-server.js";
const pkgPath="node_modules/vinext/package.json";

test("strict patch targets the installed, pinned Vinext and preserves syntax",t=>{
  const before=readFileSync(sourcePath,"utf8");
  const after=guardedVinextSource(before);
  assert.ok(after.includes("PUNCTUM_HOSTINGER_ABORT_GUARD_v1"));
  assert.ok(after.includes("cancelResponseBody(webResponse); return;"));
  assert.ok(after.includes('"ERR_STREAM_UNABLE_TO_PIPE"'));
  assert.ok(after.includes("res.destroyed === true"));
  assert.ok(after.includes("res.writableEnded === true"));
  assert.equal(after.split('console.error("[vinext] Server error:"').length-1,1);
  assert.throws(()=>guardedVinextSource(after),/UNKNOWN_OR_ALREADY_APPLIED/);
  const dir=mkdtempSync(join(tmpdir(),"punctum-vinext-patch-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,"prod-server.mjs");
  writeFileSync(file,after);
  const checked=spawnSync(process.execPath,["--check",file],{encoding:"utf8",timeout:15000});
  assert.equal(checked.status,0,checked.stderr);
});

test("patch will not silently modify another version or altered server code",t=>{
  const dir=mkdtempSync(join(tmpdir(),"punctum-vinext-patch-test-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const target=join(dir,"prod-server.js"),pkg=join(dir,"package.json");
  const contents=readFileSync(sourcePath,"utf8");
  writeFileSync(target,contents);
  writeFileSync(pkg,JSON.stringify({version:"0.0.51"}));
  assert.throws(()=>applyVinextAbortPatch(target,pkg),/UNVERIFIED_VINEXT_VERSION/);
  assert.equal(readFileSync(target,"utf8"),contents);
  writeFileSync(pkg,JSON.stringify({version:"0.0.50"}));
  writeFileSync(target,contents.replace("if (shouldCompress) pipeline(nodeStream", "if (other) pipeline(nodeStream"));
  assert.throws(()=>applyVinextAbortPatch(target,pkg),/UNEXPECTED_MATCH_COUNT/);
});
