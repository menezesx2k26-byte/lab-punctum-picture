import {
  CLIENT_SPEC_MAX_UPLOAD_BYTES,
  IMAGES_BINDING_MAX_INPUT_BYTES,
} from "../../shared/client-galleries";
import { envString } from "../utils/env";

// This gate is explicit and isolated to Node+Sharp preview. Cloudflare's 20 MB
// Images Binding limit remains intact for production Workers and ordinary QA.
export function providerImageInputLimit(env: Env): number {
  const nodeSharp =
    envString(env, "ENVIRONMENT") === "preview" &&
    envString(env, "HOSTINGER_IMAGE_PROVIDER") === "sharp" &&
    envString(env, "HOSTINGER_IMAGES_MAX_25MIB") === "true";
  return nodeSharp ? CLIENT_SPEC_MAX_UPLOAD_BYTES : IMAGES_BINDING_MAX_INPUT_BYTES;
}
