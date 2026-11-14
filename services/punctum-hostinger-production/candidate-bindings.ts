import { openCandidateWritableDatabase } from "./candidate-sqlite.mjs";
import { candidateOriginals } from "./candidate-originals.mjs";
import { candidateLocalBackups } from "./candidate-backups.mjs";
import { candidateConfig } from "./candidate-runtime.mjs";
import { qaAssets, qaImages } from "../punctum-hostinger-node/media";

let db: D1Database | undefined;
let originals: R2Bucket | undefined;
let backups: R2Bucket | undefined;
const config = () => candidateConfig();

export const env = {
  get ENVIRONMENT() {
    return config().environment;
  },
  PRIVATE_GALLERIES_ENABLED: "true",
  CLIENT_AUTH_MODE: "password",
  CLIENT_PASSWORD_BACKEND: "local",
  HOSTINGER_PREFER_WEBP: "true",
  HOSTINGER_IMAGE_PROVIDER: "sharp",
  HOSTINGER_IMAGES_MAX_25MIB: "true",
  PUBLIC_HOME_CACHE_ENABLED: "false",
  PUBLIC_HOME_SNAPSHOT_ENABLED: "false",
  BACKUP_PREFIX: "backups/d1",
  ASSETS: qaAssets,
  IMAGES: qaImages,
  get SITE_ORIGIN() {
    return config().publicOrigin.origin;
  },
  get PUBLIC_SITE_URL() {
    return config().publicOrigin.origin;
  },
  get ADMIN_ALLOWED_EMAILS() {
    return config().adminEmail;
  },
  get ADMIN_PASSWORD_HASH() {
    return config().adminPasswordHash || undefined;
  },
  get ADMIN_SESSION_SECRET() {
    return process.env.PUNCTUM_CANDIDATE_ADMIN_SESSION_SECRET;
  },
  get CLIENT_SESSION_SECRET() {
    return process.env.PUNCTUM_CANDIDATE_CLIENT_SESSION_SECRET;
  },
  get DB() {
    return (db ??= openCandidateWritableDatabase(config().dbFile, {
      candidateMode: "PRIVATE_PRODUCTION_CANDIDATE",
    }) as unknown as D1Database);
  },
  get ORIGINALS() {
    return (originals ??= candidateOriginals(config().originals) as unknown as R2Bucket);
  },
  get BACKUPS() {
    return (backups ??= candidateLocalBackups(config().backupsRoot) as unknown as R2Bucket);
  },
} as unknown as Env;

export class WorkerEntrypoint<T> {
  declare readonly env: T;
  declare readonly ctx: ExecutionContext;
}
