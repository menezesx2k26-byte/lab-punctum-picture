import {build} from "esbuild";
import {mkdirSync} from "node:fs";
import {resolve} from "node:path";

const outfile=resolve("dist/hostinger-cron/scheduled.mjs");
mkdirSync(resolve("dist/hostinger-cron"),{recursive:true});
await build({
 entryPoints:[resolve("worker/scheduled.ts")],
 outfile,
 bundle:true,
 platform:"node",
 format:"esm",
 target:"node24",
 logLevel:"warning",
 packages:"bundle",
});
console.log("PUNCTUM_HOSTINGER_SCHEDULED_WORKER_BUNDLED");
