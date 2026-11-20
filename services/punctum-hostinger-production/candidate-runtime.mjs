import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute } from "node:path";
import { validatePrivateStageDb } from "./sqlite.mjs";

export function canonicalCandidateUrl(url, publicOrigin) {
  if (publicOrigin.origin !== "https://punctumpicture.com" || url.hostname !== "www.punctumpicture.com" || url.port) return null;
  const target = new URL(publicOrigin.origin);
  target.pathname = url.pathname;
  target.search = url.search;
  return target;
}

function privateDir(path, errCode) {
  if (typeof path !== "string" || !isAbsolute(path)) throw Error(errCode);
  const l = lstatSync(path);
  const canonical = realpathSync(path);
  const st = statSync(canonical);
  if (
    l.isSymbolicLink() ||
    !st.isDirectory() ||
    (st.mode & 0o077) ||
    /(?:^|[\\/])(?:hbuilds|public_html|public|dist|production-import|d1-export|r2-export)(?:[^\\/]*)(?:[\\/]|$)/i.test(canonical)
  ) {
    throw Error(errCode);
  }
  return canonical;
}

export function candidateConfig() {
  if (process.env.PUNCTUM_PRODUCTION_CANDIDATE_MODE !== "private-candidate") {
    throw Error("CANDIDATE_OPT_IN_REQUIRED");
  }
  const environment = process.env.PUNCTUM_CANDIDATE_ENVIRONMENT || "staging";
  if (!["staging", "production"].includes(environment)) {
    throw Error("CANDIDATE_ENVIRONMENT_INVALID");
  }
  let origin;
  const managed = process.env.PUNCTUM_CANDIDATE_PROVIDER === "hostinger-managed";
  try {
    origin = new URL(managed
      ? `http://127.0.0.1:${process.env.PORT || "3000"}`
      : process.env.PUNCTUM_CANDIDATE_ORIGIN ?? "");
  } catch {
    throw Error("CANDIDATE_LISTEN_ORIGIN_INVALID");
  }
  if (
    origin.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(origin.hostname) ||
    !origin.port ||
    !Number.isInteger(Number(origin.port)) ||
    Number(origin.port) < 1024 ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw Error("CANDIDATE_LISTEN_ORIGIN_INVALID");
  }

  let publicOrigin;
  try {
    publicOrigin = new URL(process.env.PUNCTUM_CANDIDATE_PUBLIC_URL ?? origin.origin);
  } catch {
    throw Error("CANDIDATE_PUBLIC_URL_INVALID");
  }
  const alternateQaOrigin = environment === "staging" &&
    publicOrigin.origin === "https://magic-lime-guanaco-79.hostingersite.com";
  if (managed && !alternateQaOrigin &&
    !["https://aliceblue-locust-999458.hostingersite.com", "https://punctumpicture.com"].includes(publicOrigin.origin)) {
    throw Error("CANDIDATE_MANAGED_HOST_INVALID");
  }
  if (
    (publicOrigin.protocol !== "https:" &&
      !(publicOrigin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(publicOrigin.hostname))) ||
    publicOrigin.pathname !== "/" ||
    publicOrigin.search ||
    publicOrigin.hash
  ) {
    throw Error("CANDIDATE_PUBLIC_URL_INVALID");
  }

  const dbFile = validatePrivateStageDb(process.env.PUNCTUM_CANDIDATE_DB_FILE);
  if (/(?:^|[\\/])(?:production-import|d1-export|r2-export)(?:[^\\/]*)(?:[\\/]|$)/i.test(dbFile)) {
    throw Error("CANDIDATE_REAL_GOLDEN_FORBIDDEN");
  }
  const originals = privateDir(process.env.PUNCTUM_CANDIDATE_ORIGINALS, "CANDIDATE_ORIGINALS_INVALID");
  const backupsRoot = privateDir(process.env.PUNCTUM_CANDIDATE_BACKUPS_ROOT, "CANDIDATE_BACKUPS_ROOT_INVALID");

  const adminEmail = (process.env.PUNCTUM_CANDIDATE_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw Error("CANDIDATE_ADMIN_EMAIL_REQUIRED");
  }
  const adminPasswordHash = process.env.PUNCTUM_CANDIDATE_ADMIN_PASSWORD_HASH ?? "";
  if (adminPasswordHash && !/^[a-f0-9]{64}$/.test(adminPasswordHash)) {
    throw Error("CANDIDATE_ADMIN_PASSWORD_HASH_INVALID");
  }
  const adminSessionSecret = process.env.PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET ?? "";
  const clientSessionSecret = process.env.PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET ?? "";
  if (adminSessionSecret.length < 40 || clientSessionSecret.length < 40) {
    throw Error("CANDIDATE_SESSION_SECRETS_REQUIRED");
  }
  const trustedProxy = process.env.PUNCTUM_CANDIDATE_TRUSTED_PROXY || (managed ? "none" : "caddy");
  if (!["caddy", "none"].includes(trustedProxy)) {
    throw Error("CANDIDATE_TRUSTED_PROXY_INVALID");
  }

  return {
    managed,
    noindex: environment !== "production" || publicOrigin.hostname === "aliceblue-locust-999458.hostingersite.com",
    environment,
    origin,
    publicOrigin,
    dbFile,
    originals,
    backupsRoot,
    adminEmail,
    adminPasswordHash,
    trustedProxy,
  };
}
