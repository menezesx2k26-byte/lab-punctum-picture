import { openProductionStageDatabase } from "./sqlite.mjs";
import { stageConfig } from "./runtime.mjs";
import { privateOriginals } from "./originals.mjs";
import { qaAssets, qaImages } from "../punctum-hostinger-node/media";

let database: D1Database | undefined;
let originals: R2Bucket | undefined;

function stageDb() {
  return database ??= openProductionStageDatabase(stageConfig().dbFile) as unknown as D1Database;
}
function stageOriginals() {
  return originals ??= privateOriginals(stageConfig().originalsRoot) as unknown as R2Bucket;
}

export const env = {
  ENVIRONMENT: "preview",
  PRIVATE_GALLERIES_ENABLED: "false",
  HOSTINGER_PREFER_WEBP: "true",
  PUBLIC_HOME_CACHE_ENABLED: "false",
  PUBLIC_HOME_SNAPSHOT_ENABLED: "false",
  get SITE_ORIGIN() { return stageConfig().origin.origin; },
  get PUBLIC_SITE_URL() { return stageConfig().origin.origin; },
  ASSETS: qaAssets,
  IMAGES: qaImages,
  get DB() { return stageDb(); },
  get ORIGINALS() { return stageOriginals(); },
  // Do not bind any administrative email, password or session secret to this
  // real-data staging instance. Every state mutation is also blocked at ingress.
} as unknown as Env;

export class WorkerEntrypoint<T> {
  declare readonly env: T;
  declare readonly ctx: ExecutionContext;
}
