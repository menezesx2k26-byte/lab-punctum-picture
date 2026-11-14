import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { writableOriginals } from "./writable-originals.mjs";

/**
 * Private R2-compatible originals store for the Hostinger production candidate.
 * Preserves 25 MiB cap, conditional immutable puts, SHA-256 verification, and delete-block;
 * adds safe prefix listing over partitioned sidecar metadata.
 */
export function candidateOriginals(root) {
  const base = writableOriginals(root);
  const canonicalRoot = realpathSync(root);

  return {
    ...base,
    async list({ prefix = "", cursor, limit = 1000 } = {}) {
      const cap = Math.max(1, Math.min(1000, Number(limit) || 1000));
      const entries = [];
      for (const part of readdirSync(canonicalRoot, { withFileTypes: true })) {
        if (part.isSymbolicLink() || !part.isDirectory()) continue;
        if (!/^[a-f0-9]{2}$/.test(part.name)) continue;
        const partDir = join(canonicalRoot, part.name);
        const partStat = lstatSync(partDir);
        if (partStat.isSymbolicLink() || (partStat.mode & 0o077)) {
          throw Error("UNSAFE_ORIGINAL_PARTITION");
        }
        for (const item of readdirSync(partDir, { withFileTypes: true })) {
          if (!item.isFile() || !item.name.endsWith(".json")) continue;
          const metaPath = join(partDir, item.name);
          const metaStat = lstatSync(metaPath);
          if (metaStat.isSymbolicLink() || metaStat.nlink !== 1 || (metaStat.mode & 0o077)) {
            throw Error("UNSAFE_STAGED_ORIGINAL");
          }
          const meta = JSON.parse(readFileSync(metaPath, "utf8"));
          if (meta.schema !== "punctum-private-original-v1" || typeof meta.key !== "string") continue;
          if (prefix && !meta.key.startsWith(prefix)) continue;
          const dataPath = join(partDir, item.name.slice(0, -5) + ".blob");
          const dataStat = statSync(dataPath);
          entries.push({
            key: meta.key,
            size: meta.size,
            etag: meta.sha256,
            uploaded: dataStat.mtime,
            httpMetadata: { contentType: meta.contentType },
            customMetadata: { sha256: meta.sha256 },
          });
        }
      }
      entries.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      const start = cursor ? entries.findIndex((entry) => entry.key > cursor) : 0;
      const sliced = start === -1 ? [] : entries.slice(start, start + cap);
      const truncated = start !== -1 && start + cap < entries.length;
      return {
        objects: sliced,
        truncated,
        cursor: truncated ? sliced[sliced.length - 1].key : undefined,
      };
    },
  };
}
