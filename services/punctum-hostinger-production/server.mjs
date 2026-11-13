import { fileURLToPath } from "node:url";
import { startProdServer } from "vinext/server/prod-server";
import { stageConfig } from "./runtime.mjs";
import { openProductionStageDatabase } from "./sqlite.mjs";
import { privateOriginals } from "./originals.mjs";

process.umask(0o077);
const config = stageConfig();
const port = Number(process.env.PORT || 3019);
if (port !== Number(config.origin.port)) {
  throw Error("STAGING_LISTEN_PORT_MUST_MATCH_PRIVATE_ORIGIN");
}
openProductionStageDatabase(config.dbFile).close();
privateOriginals(config.originalsRoot);
process.env.PUNCTUM_QA_SHARP_WORKER = fileURLToPath(
  new URL("../punctum-hostinger-node/sharp-worker.mjs", import.meta.url));
const out = new URL("../../dist/hostinger-production/", import.meta.url);
process.env.PUNCTUM_QA_CLIENT_DIRECTORY = fileURLToPath(new URL("client/", out));
await startProdServer({
  port,
  host: config.origin.hostname,
  outDir: fileURLToPath(out),
  noCompression: true,
});
