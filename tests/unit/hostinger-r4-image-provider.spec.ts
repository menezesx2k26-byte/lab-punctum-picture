import {describe,it,expect} from "vitest";
import { providerImageInputLimit } from "../../worker/media/provider-input-limit";
import { CLIENT_SPEC_MAX_UPLOAD_BYTES, IMAGES_BINDING_MAX_INPUT_BYTES } from "../../shared/client-galleries";

describe("Hostinger R4 25 MiB provider boundary",()=>{
  const preview = {
    ENVIRONMENT:"preview",
    HOSTINGER_IMAGE_PROVIDER:"sharp",
    HOSTINGER_IMAGES_MAX_25MIB:"true",
  } as unknown as Env;
  it("permits complete 25 MiB via the explicit Node Sharp preview gate",()=>{
    expect(providerImageInputLimit(preview)).toBe(26_214_400);
    expect(providerImageInputLimit(preview)).toBe(CLIENT_SPEC_MAX_UPLOAD_BYTES);
  });
  it("preserves Cloudflare's 20 MB limit without the complete explicit gate",()=>{
    for(const changes of [
      {ENVIRONMENT:"production"},
      {ENVIRONMENT:"local"},
      {HOSTINGER_IMAGE_PROVIDER:""},
      {HOSTINGER_IMAGE_PROVIDER:"cloudflare"},
      {HOSTINGER_IMAGES_MAX_25MIB:"false"},
      {HOSTINGER_IMAGES_MAX_25MIB:""},
    ]){
      expect(providerImageInputLimit({...preview,...changes} as Env))
        .toBe(IMAGES_BINDING_MAX_INPUT_BYTES);
    }
    expect(providerImageInputLimit({} as Env)).toBe(IMAGES_BINDING_MAX_INPUT_BYTES);
  });
});
