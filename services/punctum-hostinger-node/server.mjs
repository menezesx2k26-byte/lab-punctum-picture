import { fileURLToPath } from "node:url";
import { startProdServer } from "vinext/server/prod-server";
import { qaDatabasePath, qaOrigin } from "./runtime.mjs";
import { openQaDatabase } from "./sqlite.mjs";

const origin = qaOrigin();
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("A valid provider PORT is required");
}
openQaDatabase(qaDatabasePath()).close();

const output = new URL("../../dist/hostinger-qa/", import.meta.url);
process.env.PUNCTUM_QA_CLIENT_DIRECTORY = fileURLToPath(new URL("client/", output));

// The managed loader imports this module. Listen on import, as in the live probe.
await startProdServer({
  port,
  host: origin.protocol === "http:" ? origin.hostname : "0.0.0.0",
  outDir: fileURLToPath(output),
});
