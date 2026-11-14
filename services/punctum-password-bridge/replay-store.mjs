import { mkdirSync, realpathSync } from "node:fs";
import { open, readdir, stat, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const NONCE_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.nonce$/;
const deployment = fileURLToPath(new URL("../../", import.meta.url));

// All replicas must mount this SAME durable directory. Atomic exclusive create
// rejects a replay after restart and across processes. No passwords/hashes stored.
export function createReplayStore(directory, now = Date.now) {
  const validate = (path) => {
    const child = relative(deployment, path);
    if (!isAbsolute(path) || !child || (!child.startsWith(".." + sep) && !isAbsolute(child)) ||
      /(?:^|[\\/])(?:hbuilds|public_html|nodejs)(?:[\\/]|$)/i.test(path))
      throw new Error("A durable replay directory outside the deployment is required.");
  };
  if (typeof directory !== "string" || !directory)
    throw new Error("A durable replay directory is required.");
  validate(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  directory = realpathSync(directory);
  validate(directory);
  return async (nonce) => {
    const entries = (await readdir(directory)).filter((name) => NONCE_FILE.test(name));
    let retained = entries.length;
    for (const name of entries) {
      try {
        const path = join(directory, name);
        if ((await stat(path)).mtimeMs < now() - 60_000) {
          await unlink(path);
          retained--;
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (retained >= 10_000) throw new Error("Replay store capacity reached.");
    try {
      const file = await open(join(directory, nonce + ".nonce"), "wx", 0o600);
      await file.close();
      return true;
    } catch (error) {
      if (error.code === "EEXIST") return false;
      throw error;
    }
  };
}
