import {
  CLIENT_SPEC_MAX_UPLOAD_BYTES,
  IMAGES_BINDING_MAX_INPUT_BYTES,
  NODE_SHARP_IMAGES_MARKER,
} from "../../shared/client-galleries";
import { envString } from "../utils/env";

// Node-only binding identity protects Cloudflare's 20 MB cap even if env flags are set.
export function providerImageInputLimit(env: Env): number {
  const nodeSharp =
    ["preview", "staging", "production"].includes(envString(env, "ENVIRONMENT") ?? "") &&
    envString(env, "HOSTINGER_IMAGE_PROVIDER") === "sharp" &&
    envString(env, "HOSTINGER_IMAGES_MAX_25MIB") === "true" &&
    (env.IMAGES as unknown as Record<symbol, unknown> | undefined)?.[NODE_SHARP_IMAGES_MARKER] === true;
  return nodeSharp ? CLIENT_SPEC_MAX_UPLOAD_BYTES : IMAGES_BINDING_MAX_INPUT_BYTES;
}
