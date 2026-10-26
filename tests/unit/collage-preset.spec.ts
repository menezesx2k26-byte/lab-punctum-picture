import { describe, expect, it } from "vitest";
import {
  PUNCTUM_DEFAULT_SITE_CONFIG,
  SITE_PRESET_REGISTRY,
  applySitePreset,
  siteConfigSchema,
} from "../../shared/config";

function customized() {
  const config = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG);
  config.editorial.home.hero.title = "Fotografia da Maria";
  const hero = config.pages.home.sections.find(s => s.type === "hero");
  const reel = config.pages.home.sections.find(s => s.type === "photo-reel");
  const featured = config.pages.home.sections.find(s => s.type === "featured-work");
  if (!hero || hero.type !== "hero" || !reel || reel.type !== "photo-reel" || !featured || featured.type !== "featured-work") throw Error("incomplete fixtures");
  hero.heroMedia = { kind: "site-media", id: "chosen-photo" };
  reel.photoIds = ["photo-c", "photo-a", "photo-b"];
  featured.itemCount = 3;
  return config;
}

describe("mobile collage preset", () => {
  it("exposes a safe allowlisted editorial-collage preset", () => {
    expect(SITE_PRESET_REGISTRY).toHaveProperty("colagem-autoral");
  });
  it("keeps Studio photos, copy, item count and immersive contracts when applying collage", () => {
    const current = customized();
    const next = applySitePreset(current, "colagem-autoral" as Parameters<typeof applySitePreset>[1]);
    const hero = next.pages.home.sections.find(s => s.type === "hero");
    const reel = next.pages.home.sections.find(s => s.type === "photo-reel");
    const featured = next.pages.home.sections.find(s => s.type === "featured-work");
    expect(hero).toMatchObject({ variant: "cinematic", heroMedia: { kind: "site-media", id: "chosen-photo" } });
    expect(reel).toMatchObject({ variant: "horizontal", photoIds: ["photo-c", "photo-a", "photo-b"] });
    expect(featured).toMatchObject({ variant: "collage", itemCount: 3 });
    expect(next.editorial).toEqual(current.editorial);
    expect(next.pages.home.sections.map(s => s.id)).toEqual(current.pages.home.sections.map(s => s.id));
    expect(siteConfigSchema.safeParse(next).success).toBe(true);
  });
  it("keeps media selections on preset round trip, serialization and parse", () => {
    const current = customized();
    const returned = applySitePreset(applySitePreset(current, "editorial-silencioso"), "punctum-default");
    expect(returned.pages.home.sections.find(s => s.type === "hero")).toMatchObject({ heroMedia: { kind: "site-media", id: "chosen-photo" } });
    expect(returned.pages.home.sections.find(s => s.type === "photo-reel")).toMatchObject({ photoIds: ["photo-c", "photo-a", "photo-b"] });
    expect(siteConfigSchema.parse(JSON.parse(JSON.stringify(returned)))).toEqual(returned);
  });
});
