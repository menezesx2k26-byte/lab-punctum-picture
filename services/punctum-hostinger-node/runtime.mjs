import { isAbsolute } from "node:path";

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
  const path = process.env.PUNCTUM_QA_DB_FILE;
  if (!path || !isAbsolute(path)) throw new Error("An absolute QA SQLite path is required");
  return path;
}
