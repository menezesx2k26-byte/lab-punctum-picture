import { fileURLToPath } from "node:url";
import { startProdServer } from "vinext/server/prod-server";
import { ensureUnlimitedCandidateStorage } from "./unlimited-bootstrap.mjs";
import { candidateConfig } from "./candidate-runtime.mjs";
import { openCandidateWritableDatabase } from "./candidate-sqlite.mjs";
import { candidateOriginals } from "./candidate-originals.mjs";
import { candidateLocalBackups } from "./candidate-backups.mjs";
import { installCandidateImageWidthCompatibility } from "./image-width-compat.mjs";
import { installNodeR4StreamCompatibility } from "../punctum-hostinger-node/node-r4-stream-compat.mjs";

process.umask(0o077);
if (process.env.PUNCTUM_CANDIDATE_AUTO_BOOTSTRAP === "true") {
  const bootstrapReceipt = ensureUnlimitedCandidateStorage(process.env);
  console.log(JSON.stringify(bootstrapReceipt));
}
const config = candidateConfig();
const port = Number(process.env.PORT || config.origin.port);
if (!Number.isInteger(port) || port !== Number(config.origin.port)) {
  throw Error("CANDIDATE_LISTEN_PORT_MISMATCH");
}
openCandidateWritableDatabase(config.dbFile, {
  candidateMode: "PRIVATE_PRODUCTION_CANDIDATE",
}).close();
candidateOriginals(config.originals);
candidateLocalBackups(config.backupsRoot);
installNodeR4StreamCompatibility();

process.env.PUNCTUM_QA_SHARP_WORKER = fileURLToPath(
  new URL("../punctum-hostinger-node/sharp-worker.mjs", import.meta.url),
);
process.env.PUNCTUM_HOSTINGER_SHARP_POOL = process.env.PUNCTUM_HOSTINGER_SHARP_POOL || "3";
process.env.PUNCTUM_HOSTINGER_SHARP_TIMEOUT_MS = process.env.PUNCTUM_HOSTINGER_SHARP_TIMEOUT_MS || "60000";

const output = new URL("../../dist/hostinger-candidate/", import.meta.url);
process.env.PUNCTUM_QA_CLIENT_DIRECTORY = fileURLToPath(new URL("client/", output));

const { server } = await startProdServer({
  port,
  host: config.managed ? "0.0.0.0" : config.origin.hostname,
  outDir: fileURLToPath(output),
  noCompression: true,
});
installCandidateImageWidthCompatibility(server);
