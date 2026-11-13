import { spawn } from "node:child_process";
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
  // Do only the minimum validation/seed before Hostinger's three-second listen gate.
  // Full SQLite stress tests and backup must run in a separate process after listen().
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

// The managed loader requires listen() almost immediately. Running spawnSync
// concurrency tests or a full backup before listening caused Hostinger startup
// watchdog restarts. Preserve the receipts while isolating that work off-process.
if (process.env.PUNCTUM_QA_MANAGED_BOOTSTRAP === '1') {
  const startDiagnostics = setTimeout(() => {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL('./managed-diagnostics.mjs', import.meta.url)),
    ], { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
    child.on('error', () => console.error('PUNCTUM_MANAGED_QA_DIAGNOSTICS_SPAWN_FAILED'));
    child.on('exit', code => {
      if (code !== 0) console.error('PUNCTUM_MANAGED_QA_DIAGNOSTICS_FAILED', code);
    });
  }, 500);
  startDiagnostics.unref();
}
