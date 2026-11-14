import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const KEY_RE = /^backups\/d1\/(daily|weekly|monthly)\/(\d{4}-\d{2}(?:-\d{2})?)\/([A-Za-z0-9._-]+)\.json$/;
const PREFIX_RE = /^backups\/d1\/(?:(?:daily|weekly|monthly)\/)?$/;
const MAX_BYTES = 64 * 1024 * 1024;
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

function candidateBackupRoot(path) {
  if (typeof path !== "string" || !isAbsolute(path)) {
    throw Error("CANDIDATE_BACKUP_ABSOLUTE_ROOT_REQUIRED");
  }
  const l = lstatSync(path);
  const r = realpathSync(path);
  const st = statSync(r);
  const rel = relative(projectRoot, r);
  if (
    l.isSymbolicLink() ||
    !st.isDirectory() ||
    (st.mode & 0o077) ||
    r === projectRoot.slice(0, -1) ||
    (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel)) ||
    /(?:^|[\\/])(?:hbuilds|public_html|public|dist|production-import|d1-export|r2-export)(?:[^\\/]*)(?:[\\/]|$)/i.test(r)
  ) {
    throw Error("CANDIDATE_BACKUP_PRIVATE_ROOT_REQUIRED");
  }
  return r;
}

function validKey(key) {
  if (typeof key !== "string" || key.includes("..") || !KEY_RE.test(key) || key.length > 220) {
    throw Error("CANDIDATE_BACKUP_KEY_INVALID");
  }
  return key;
}

function destination(root, key) {
  const path = resolve(root, ...validKey(key).split("/"));
  const rel = relative(root, path);
  if (rel.startsWith(".." + sep) || rel === ".." || isAbsolute(rel)) {
    throw Error("CANDIDATE_BACKUP_PATH_ESCAPE");
  }
  return path;
}

function scan(root, sub = "") {
  const result = [];
  const dir = join(root, sub);
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw Error("CANDIDATE_BACKUP_SYMLINK_FORBIDDEN");
    if (item.isDirectory()) {
      result.push(...scan(root, join(sub, item.name)));
    } else if (item.isFile()) {
      if (item.name.startsWith(".tmp-")) continue;
      const key = join(sub, item.name).split(sep).join("/");
      validKey(key);
      const st = statSync(join(dir, item.name));
      if ((st.mode & 0o077) || st.nlink !== 1) throw Error("CANDIDATE_BACKUP_UNSAFE_FILE");
      result.push({ key, size: st.size, uploaded: st.mtime });
    }
  }
  return result;
}

export function candidateLocalBackups(rootPath) {
  const root = candidateBackupRoot(rootPath);
  return {
    async put(key, body, options) {
      const target = destination(root, key);
      if (typeof body !== "string" || Buffer.byteLength(body) > MAX_BYTES || Buffer.byteLength(body) < 2) {
        throw Error("CANDIDATE_BACKUP_BODY_INVALID");
      }
      if (options?.httpMetadata?.contentType && options.httpMetadata.contentType !== "application/json") {
        throw Error("CANDIDATE_BACKUP_CONTENT_TYPE_INVALID");
      }
      JSON.parse(body);
      const parts = key.split("/");
      let dir = root;
      for (const segment of parts.slice(0, -1)) {
        dir = join(dir, segment);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: false, mode: 0o700 });
        const st = lstatSync(dir);
        if (st.isSymbolicLink() || !st.isDirectory() || (st.mode & 0o077)) {
          throw Error("CANDIDATE_BACKUP_PARENT_UNSAFE");
        }
      }
      const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
      writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 });
      renameSync(tmp, target);
      const st = statSync(target);
      return { key, size: st.size, uploaded: st.mtime };
    },
    async head(key) {
      const target = destination(root, key);
      if (!existsSync(target)) return null;
      const st = lstatSync(target);
      if (st.isSymbolicLink() || !st.isFile() || (st.mode & 0o077)) throw Error("CANDIDATE_BACKUP_UNSAFE_FILE");
      return { key, size: st.size, uploaded: st.mtime };
    },
    async get(key) {
      const meta = await this.head(key);
      if (!meta) return null;
      const raw = readFileSync(destination(root, key), "utf8");
      return {
        ...meta,
        async text() {
          return raw;
        },
        async json() {
          return JSON.parse(raw);
        },
      };
    },
    async list({ prefix = "backups/d1/", cursor, limit = 1000 } = {}) {
      if (!PREFIX_RE.test(prefix)) throw Error("CANDIDATE_BACKUP_PREFIX_INVALID");
      const cap = Math.max(1, Math.min(1000, Number(limit) || 1000));
      const items = scan(root)
        .filter((x) => x.key.startsWith(prefix))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      const start = cursor ? items.findIndex((x) => x.key > cursor) : 0;
      const objects = start === -1 ? [] : items.slice(start, start + cap);
      const truncated = start !== -1 && start + cap < items.length;
      return { objects, truncated, cursor: truncated ? objects[objects.length - 1].key : undefined };
    },
    async delete(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const key of list) {
        const target = destination(root, key);
        if (existsSync(target)) unlinkSync(target);
      }
    },
  };
}
