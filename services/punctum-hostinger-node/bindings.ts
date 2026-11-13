import { openQaDatabase } from "./sqlite.mjs";
import { qaDatabasePath, qaOrigin } from "./runtime.mjs";
import { qaAssets, qaImages, qaOriginals } from "./media";

let database: D1Database | undefined;

function getDatabase() {
  return database ??= openQaDatabase(qaDatabasePath()) as unknown as D1Database;
}

export const env = {
  ENVIRONMENT: "preview",
  // Opt-in only for disposable synthetic QA; normal managed QA and the real
  // read-only stage keep private galleries disabled.
  PRIVATE_GALLERIES_ENABLED: process.env.PUNCTUM_QA_R4_ENABLED === "true" ? "true" : "false",
  CLIENT_AUTH_MODE: "password",
  CLIENT_PASSWORD_BACKEND: "local",
  HOSTINGER_PREFER_WEBP: "true",
  HOSTINGER_IMAGE_PROVIDER: "sharp",
  HOSTINGER_IMAGES_MAX_25MIB: process.env.PUNCTUM_QA_R4_ENABLED === "true" ? "true" : "false",
  get CLIENT_SESSION_SECRET() { return process.env.PUNCTUM_QA_CLIENT_SESSION_SECRET; },
  PUBLIC_HOME_CACHE_ENABLED: "false",
  PUBLIC_HOME_SNAPSHOT_ENABLED: "false",
  ASSETS: qaAssets,
  IMAGES: qaImages,
  get SITE_ORIGIN() { return qaOrigin().origin; },
  get PUBLIC_SITE_URL() { return qaOrigin().origin; },
  get ADMIN_ALLOWED_EMAILS() { return process.env.PUNCTUM_QA_ADMIN_EMAIL; },
  get ADMIN_PASSWORD_HASH() { return process.env.PUNCTUM_QA_ADMIN_PASSWORD_HASH; },
  get ADMIN_SESSION_SECRET() { return process.env.PUNCTUM_QA_ADMIN_SESSION_SECRET; },
  get DB() { return getDatabase(); },
  get ORIGINALS() { return qaOriginals(getDatabase()); },
} as unknown as Env;

// The Node build uses the default fetch export. The Cloudflare cache
// entrypoint is declared by the shared module but never instantiated in QA.
export class WorkerEntrypoint<T> {
  declare readonly env: T;
  declare readonly ctx: ExecutionContext;
}
