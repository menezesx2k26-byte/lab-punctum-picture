import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const targetVersion = "0.0.50";
const begin = "async function sendWebResponse(webResponse, req, res, compress) {\n\tconst status = webResponse.status;";
const send = [
  "\twriteHead(nodeHeaders);",
  '\tif (req.method === "HEAD") {',
  "\t\tcancelResponseBody(webResponse);",
  "\t\tres.end();",
  "\t\treturn;",
  "\t}",
  "\tconst nodeStream = Readable.fromWeb(webResponse.body);",
  '\tif (shouldCompress) pipeline(nodeStream, createCompressor(encoding, "streaming"), res, () => {});',
  "\telse pipeline(nodeStream, res, () => {});",
].join("\n");
const catcher = [
  "\t\t\tawait sendWebResponse(response, req, res, compress);",
  "\t\t} catch (e) {",
  '\t\t\tconsole.error("[vinext] Server error:", e);',
  "\t\t\tif (!res.headersSent) {",
  "\t\t\t\tres.writeHead(500);",
  '\t\t\t\tres.end("Internal Server Error");',
  "\t\t\t}",
].join("\n");

function replaceOnce(source, before, after, id) {
  const n=source.split(before).length-1;
  if(n!==1)throw Error("VINEXT_ABORT_PATCH_"+id+"_UNEXPECTED_MATCH_COUNT_"+n);
  return source.replace(before,after);
}
export function guardedVinextSource(source) {
  if (typeof source !== "string" || source.length < 15000 ||
      source.includes("PUNCTUM_HOSTINGER_ABORT_GUARD_v1"))
    throw Error("VINEXT_ABORT_PATCH_UNKNOWN_OR_ALREADY_APPLIED");
  const isClosed="(req.aborted === true || res.destroyed === true || res.writableEnded === true)";
  let patched=replaceOnce(source,begin,
    "async function sendWebResponse(webResponse, req, res, compress) {\n"+
    "\t// PUNCTUM_HOSTINGER_ABORT_GUARD_v1: a disconnected client must not receive a pipeline.\n"+
    "\tif ("+isClosed+") { cancelResponseBody(webResponse); return; }\n"+
    "\tconst status = webResponse.status;",
    "BEGIN");
  patched=replaceOnce(patched,send,[
    "\t// A navigation can close the socket while async SSR is preparing headers.",
    "\tif ("+isClosed+") { cancelResponseBody(webResponse); return; }",
    "\twriteHead(nodeHeaders);",
    '\tif (req.method === "HEAD") {',
    "\t\tcancelResponseBody(webResponse);",
    "\t\tres.end();",
    "\t\treturn;",
    "\t}",
    "\tif ("+isClosed+") { cancelResponseBody(webResponse); return; }",
    "\tconst nodeStream = Readable.fromWeb(webResponse.body);",
    "\ttry {",
    '\t\tif (shouldCompress) pipeline(nodeStream, createCompressor(encoding, "streaming"), res, () => {});',
    "\t\telse pipeline(nodeStream, res, () => {});",
    "\t} catch (error) {",
    "\t\tif ("+isClosed+" &&",
    '\t\t\t["ERR_STREAM_UNABLE_TO_PIPE", "ERR_STREAM_PREMATURE_CLOSE", "ERR_STREAM_DESTROYED"].includes(error?.code)) {',
    "\t\t\tcancelResponseBody(webResponse);",
    "\t\t\treturn;",
    "\t\t}",
    "\t\tthrow error;",
    "\t}",
  ].join("\n"),"PIPE");
  patched=replaceOnce(patched,catcher,[
    "\t\t\tawait sendWebResponse(response, req, res, compress);",
    "\t\t} catch (e) {",
    "\t\t\t// Only an already-aborted HTTP response is an expected disconnect.",
    "\t\t\tif ("+isClosed+" &&",
    '\t\t\t\t["ERR_STREAM_UNABLE_TO_PIPE", "ERR_STREAM_PREMATURE_CLOSE", "ERR_STREAM_DESTROYED"].includes(e?.code)) return;',
    '\t\t\tconsole.error("[vinext] Server error:", e);',
    "\t\t\tif (!res.headersSent) {",
    "\t\t\t\tres.writeHead(500);",
    '\t\t\t\tres.end("Internal Server Error");',
    "\t\t\t}",
  ].join("\n"),"CATCH");
  return patched;
}
export function applyVinextAbortPatch(target, packageJson) {
  const version = JSON.parse(readFileSync(packageJson, "utf8")).version;
  if(version!==targetVersion)throw Error("UNVERIFIED_VINEXT_VERSION");
  const original=readFileSync(target,"utf8");
  const updated=guardedVinextSource(original);
  const temp=target+".punctum-guard.tmp";
  if(existsSync(temp))throw Error("UNSAFE_VINEXT_TEMP_ALREADY_EXISTS");
  writeFileSync(temp,updated,{flag:"wx",mode:0o600});
  renameSync(temp,target);
  return {status:"VINEXT_ABORT_GUARD_APPLIED",version,patch:"PUNCTUM_HOSTINGER_ABORT_GUARD_v1"};
}
const direct=process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(direct){
  const dir=resolve("node_modules/vinext");
  try{
    const result=applyVinextAbortPatch(join(dir,"dist/server/prod-server.js"),join(dir,"package.json"));
    console.log(JSON.stringify(result));
  }catch{
    console.error("PUNCTUM_VINEXT_ABORT_PATCH_BLOCKED");
    process.exitCode=1;
  }
}
