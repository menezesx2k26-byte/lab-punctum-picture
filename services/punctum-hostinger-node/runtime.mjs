import { realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function qaOrigin() {
  const url = new URL(process.env.PUNCTUM_QA_ORIGIN ?? "");
  const loopback = ["127.0.0.1", "localhost"].includes(url.hostname);
  const hosted = url.origin === "https://aliceblue-locust-999458.hostingersite.com";
  if (url.href !== `${url.origin}/` || !(hosted || (loopback && url.protocol === "http:"))) {
    throw new Error("PUNCTUM_QA_ORIGIN must point to the designated QA host or localhost");
  }
  return url;
}

export function qaDatabasePath() {
  return privateQaDatabasePath(process.env.PUNCTUM_QA_DB_FILE);
}

export function privateQaDatabasePath(path) {
  if (!path || !isAbsolute(path)) throw new Error("An absolute QA SQLite path is required");
  const canonical = realpathSync(path);
  const project = fileURLToPath(new URL("../../", import.meta.url));
  const forbidden = new Set(["public_html", "hbuilds", "public", "dist"]);
  for (const candidate of [path, canonical]) {
    const fromProject = relative(project, candidate);
    if ((!fromProject.startsWith(`..${sep}`) && fromProject !== ".." && !isAbsolute(fromProject)) ||
        candidate.split(sep).some(part => forbidden.has(part.toLowerCase()))) {
      throw new Error("QA SQLite must use private storage outside deployment directories");
    }
  }
  const info = statSync(canonical);
  const parent = statSync(dirname(canonical));
  if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) || (parent.mode & 0o077)) {
    throw new Error("QA SQLite requires private owner-only file and directory permissions");
  }
  return canonical;
}
