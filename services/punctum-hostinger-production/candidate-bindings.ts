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
  get CLIENT_AUTH_MODE() {
    return (
      process.env.PUNCTUM_CANDIDATE_CLIENT_AUTH_MODE ||
      process.env.CLIENT_AUTH_MODE ||
      "password"
    );
  },
  get ADMIN_AUTH_MODE() {
    return (
      process.env.PUNCTUM_CANDIDATE_ADMIN_AUTH_MODE ||
      process.env.ADMIN_AUTH_MODE ||
      undefined
    );
  },
  get CLERK_AUTH_ENABLED() {
    return (
      process.env.PUNCTUM_CANDIDATE_CLERK_AUTH_ENABLED ||
      process.env.CLERK_AUTH_ENABLED ||
      undefined
    );
  },
  get CLERK_PILOT_ENABLED() {
    return (
      process.env.PUNCTUM_CANDIDATE_CLERK_PILOT_ENABLED ||
      process.env.CLERK_PILOT_ENABLED ||
      undefined
    );
  },
  get CLERK_PUBLISHABLE_KEY() {
    return (
      process.env.PUNCTUM_CANDIDATE_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY ||
      undefined
    );
  },
  get NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY() {
    return (
      process.env.PUNCTUM_CANDIDATE_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      process.env.PUNCTUM_CANDIDATE_CLERK_PUBLISHABLE_KEY ||
      process.env.CLERK_PUBLISHABLE_KEY ||
      undefined
    );
  },
  get CLERK_SECRET_KEY() {
    return (
      process.env.PUNCTUM_CANDIDATE_CLERK_SECRET_KEY ||
      process.env.CLERK_SECRET_KEY ||
      undefined
    );
  },
  get CLERK_JWT_KEY() {
    return (
      process.env.PUNCTUM_CANDIDATE_CLERK_JWT_KEY ||
      process.env.CLERK_JWT_KEY ||
      undefined
    );
  },
  get CLERK_ISSUER() {
    return (
      process.env.PUNCTUM_CANDIDATE_CLERK_ISSUER ||
      process.env.CLERK_ISSUER ||
      undefined
    );
  },
  get CLERK_PILOT_ISSUER() {
    return (
      process.env.PUNCTUM_CANDIDATE_CLERK_PILOT_ISSUER ||
      process.env.CLERK_PILOT_ISSUER ||
      undefined
    );
  },
  get CLERK_AUTHORIZED_PARTIES() {
    return (
      process.env.PUNCTUM_CANDIDATE_CLERK_AUTHORIZED_PARTIES ||
      process.env.CLERK_AUTHORIZED_PARTIES ||
      undefined
    );
  },
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
