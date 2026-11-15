import { closeSync, fstatSync, lstatSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { candidateConfig } from "./services/punctum-hostinger-production/candidate-runtime.mjs";

export async function withMaintenanceLock(root, run) {
  const directory = lstatSync(root);
  if (!isAbsolute(root) || !directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077)) {
    throw Error("MANAGED_MAINTENANCE_PRIVATE_ROOT_REQUIRED");
  }
  const lock = join(root, "maintenance.lock");
  let fd;
  try { fd = openSync(lock, "wx", 0o600); }
  catch (error) {
    if (error.code === "EEXIST") throw Error("MANAGED_MAINTENANCE_BUSY");
    throw error;
  }
  const inode = fstatSync(fd).ino;
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return await run();
  } finally {
    closeSync(fd);
    if (lstatSync(lock).ino === inode) unlinkSync(lock);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const mode = process.argv[2];
  if (!["hourly", "daily", "check"].includes(mode)) throw Error("CANDIDATE_CRON_MODE_INVALID");
  const config = candidateConfig();
  await withMaintenanceLock(dirname(config.dbFile), async () => {
    if (mode === "check") {
      const { managedAcceptance } = await import("./services/punctum-hostinger-production/managed-acceptance.mjs");
      console.log("PUNCTUM_MANAGED_ACCEPTANCE " + JSON.stringify(await managedAcceptance(config, process.argv[3])));
    } else {
      await import("./services/punctum-hostinger-production/candidate-cron.mjs");
    }
  });
}
