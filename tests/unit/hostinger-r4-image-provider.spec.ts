import { describe, it, expect } from "vitest";
import { providerImageInputLimit } from "../../worker/media/provider-input-limit";
import {
  CLIENT_SPEC_MAX_UPLOAD_BYTES,
  IMAGES_BINDING_MAX_INPUT_BYTES,
  NODE_SHARP_IMAGES_MARKER,
} from "../../shared/client-galleries";

describe("Hostinger R4 25 MiB provider boundary", () => {
  const sharp = {
    ENVIRONMENT: "preview",
    HOSTINGER_IMAGE_PROVIDER: "sharp",
    HOSTINGER_IMAGES_MAX_25MIB: "true",
    IMAGES: { [NODE_SHARP_IMAGES_MARKER]: true },
  } as unknown as Env;

  it("permits 25 MiB only with the Node Sharp binding in preview, staging or production", () => {
    for (const environment of ["preview", "staging", "production"]) {
      expect(providerImageInputLimit({ ...sharp, ENVIRONMENT: environment } as Env))
        .toBe(CLIENT_SPEC_MAX_UPLOAD_BYTES);
    }
  });

  it("retains Cloudflare's 20 MB limit even when environment flags are spoofed", () => {
    for (const changes of [
      { IMAGES: {} },
      { IMAGES: undefined },
      { ENVIRONMENT: "local" },
      { HOSTINGER_IMAGE_PROVIDER: "cloudflare" },
      { HOSTINGER_IMAGES_MAX_25MIB: "false" },
    ]) {
      expect(providerImageInputLimit({ ...sharp, ...changes } as Env))
        .toBe(IMAGES_BINDING_MAX_INPUT_BYTES);
    }
    for (const environment of ["preview", "staging", "production"]) {
      expect(providerImageInputLimit({ ...sharp, ENVIRONMENT: environment, IMAGES: {} } as Env))
        .toBe(IMAGES_BINDING_MAX_INPUT_BYTES);
    }
    expect(providerImageInputLimit({} as Env)).toBe(IMAGES_BINDING_MAX_INPUT_BYTES);
  });
});
