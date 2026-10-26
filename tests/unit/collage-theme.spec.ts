import { describe, expect, it } from "vitest";
import {
  PUNCTUM_DEFAULT_SITE_CONFIG,
  SITE_PRESET_REGISTRY,
  applySitePreset,
  contrastRatio,
  resolveSiteTheme,
} from "../../shared/config";
import { siteThemeRootProps } from "../../app/lib/site-theme";

describe("scoped collage identity", () => {
  it("meets AA contrast for purple, paper and yellow", () => {
    expect(contrastRatio("#422079", "#f7f4ef")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#422079", "#ffe43b")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#18131e", "#ffe43b")).toBeGreaterThanOrEqual(4.5);
  });
  it("ships a reversible preset with natural-color photographs", () => {
    const current = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG);
    const applied = applySitePreset(current, "colagem-autoral");
    expect(applied.theme.image.treatment).toBe("natural");
    expect(applied.theme.motion.intensity).toBe("subtle");
    expect(siteThemeRootProps(applied)["data-theme-preset"]).toBe("colagem-autoral");
    expect(resolveSiteTheme(applied).didFallback).toBe(false);
    const restored = applySitePreset(applied, "punctum-default");
    expect(restored.theme).toEqual(SITE_PRESET_REGISTRY["punctum-default"].config.theme);
    expect(current).toEqual(PUNCTUM_DEFAULT_SITE_CONFIG);
  });
});
