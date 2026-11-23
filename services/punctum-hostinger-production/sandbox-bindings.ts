import { openSyntheticWritableDatabase } from "./writable-sqlite.mjs";
import { writableOriginals } from "./writable-originals.mjs";
import { mutableSandboxConfig } from "./sandbox-runtime.mjs";
import { qaAssets,qaImages } from "../punctum-hostinger-node/media";

let db: D1Database | undefined;
let originals: R2Bucket | undefined;
const config=()=>mutableSandboxConfig();

export const env={
  ENVIRONMENT:"preview",
  PRIVATE_GALLERIES_ENABLED:"true",
  CLIENT_AUTH_MODE:"password",
  CLIENT_PASSWORD_BACKEND:"local",
  HOSTINGER_PREFER_WEBP:"true",
  HOSTINGER_IMAGE_PROVIDER:"sharp",
  HOSTINGER_IMAGES_MAX_25MIB:"true",
  PUBLIC_HOME_CACHE_ENABLED:"false",
  PUBLIC_HOME_SNAPSHOT_ENABLED:"false",
  ASSETS:qaAssets,
  IMAGES:qaImages,
  get SITE_ORIGIN(){return config().origin.origin;},
  get PUBLIC_SITE_URL(){return config().origin.origin;},
  get ADMIN_ALLOWED_EMAILS(){return config().email;},
  get ADMIN_PASSWORD_HASH(){return process.env.PUNCTUM_MUTABLE_SANDBOX_ADMIN_PASSWORD_HASH;},
  get ADMIN_SESSION_SECRET(){return process.env.PUNCTUM_MUTABLE_SANDBOX_ADMIN_SESSION_SECRET;},
  get CLIENT_SESSION_SECRET(){return process.env.PUNCTUM_MUTABLE_SANDBOX_CLIENT_SESSION_SECRET;},
  get DB(){return db??=openSyntheticWritableDatabase(config().dbFile,{syntheticMode:"SYNTHETIC_ONLY_DO_NOT_USE_REAL_D1"}) as unknown as D1Database;},
  get ORIGINALS(){return originals??=writableOriginals(config().originals) as unknown as R2Bucket;},
} as unknown as Env;
export class WorkerEntrypoint<T>{
  declare readonly env:T;
  declare readonly ctx:ExecutionContext;
}
