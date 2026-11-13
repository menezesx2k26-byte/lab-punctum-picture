import {fileURLToPath} from "node:url";
import {startProdServer} from "vinext/server/prod-server";
import {mutableSandboxConfig} from "./sandbox-runtime.mjs";
import {openSyntheticWritableDatabase} from "./writable-sqlite.mjs";
import {writableOriginals} from "./writable-originals.mjs";
import {installNodeR4StreamCompatibility} from "../punctum-hostinger-node/node-r4-stream-compat.mjs";

process.umask(0o077);
const config=mutableSandboxConfig();
const port=Number(process.env.PORT);
if(!Number.isInteger(port) || port!==Number(config.origin.port))
  throw Error("MUTABLE_SANDBOX_LISTEN_PORT_MISMATCH");
openSyntheticWritableDatabase(config.dbFile,{syntheticMode:"SYNTHETIC_ONLY_DO_NOT_USE_REAL_D1"}).close();
writableOriginals(config.originals);
installNodeR4StreamCompatibility();
process.env.PUNCTUM_QA_SHARP_WORKER=fileURLToPath(new URL("../punctum-hostinger-node/sharp-worker.mjs",import.meta.url));
const output=new URL("../../dist/hostinger-mutable-sandbox/",import.meta.url);
process.env.PUNCTUM_QA_CLIENT_DIRECTORY=fileURLToPath(new URL("client/",output));
await startProdServer({
  port,host:config.origin.hostname,outDir:fileURLToPath(output),noCompression:true,
});
