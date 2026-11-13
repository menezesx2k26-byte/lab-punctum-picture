import { fileURLToPath } from "node:url";
import { startProdServer } from "vinext/server/prod-server";
import { qaDatabasePath, qaOrigin } from "./runtime.mjs";
import { openQaDatabase } from "./sqlite.mjs";
import { ensureManagedQaDatabase } from './managed-bootstrap.mjs';

if (process.env.PUNCTUM_QA_MANAGED_BOOTSTRAP === '1') {
  if (process.env.PUNCTUM_QA_ORIGIN !== 'https://aliceblue-locust-999458.hostingersite.com' ||
      process.env.PUNCTUM_QA_DB_FILE !== '/home/u571409090/punctum-qa-private-20261112/application.sqlite') {
    throw new Error('Managed bootstrap is restricted to the existing synthetic QA destination');
  }
  process.umask(0o077);
  // Only validate the owner-only QA database before the provider's 3s listen gate.
  // Heavy stress tests and snapshot backups run only as explicit QA operations.
  ensureManagedQaDatabase(process.env.PUNCTUM_QA_DB_FILE);
}

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
  // Hostinger's CDN handles content encoding; avoid extra streamed SSR compression in Node.
  noCompression: true,
});
