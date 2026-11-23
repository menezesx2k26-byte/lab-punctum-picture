import { describe, expect, it } from "vitest";
import {
  CLIENT_GALLERY_LAYOUTS,
  CLIENT_GALLERY_TEMPLATE_OPTIONS,
  clientGalleryCreateSchema,
  clientGalleryLayoutLabel,
  clientGalleryUpdateSchema,
  resolveClientGalleryLayout,
} from "../../shared/client-galleries";

describe("five fixed private album templates", () => {
  it("offers exactly five named, accessible presets without arbitrary CSS", () => {
    expect(CLIENT_GALLERY_LAYOUTS).toEqual(["classico", "editorial", "colagem", "mosaico", "cinema"]);
    expect(CLIENT_GALLERY_TEMPLATE_OPTIONS.map((option) => option.id)).toEqual(CLIENT_GALLERY_LAYOUTS);
    expect(CLIENT_GALLERY_TEMPLATE_OPTIONS.every((option) => option.label && option.description)).toBe(true);
  });
  it("defaults old albums to their existing layout and ignores untrusted template names", () => {
    expect(resolveClientGalleryLayout(undefined)).toBe("classico");
    expect(resolveClientGalleryLayout("colagem")).toBe("colagem");
    expect(resolveClientGalleryLayout("javascript:alert(1)")).toBe("classico");
    expect(clientGalleryLayoutLabel("colagem")).toBe("Colagem");
    expect(clientGalleryLayoutLabel("cinema")).toBe("Cinema");
    expect(clientGalleryLayoutLabel(undefined)).toBe("Clássico");
    expect(clientGalleryLayoutLabel("javascript:alert(1)")).toBe("Clássico");
  });
  it("accepts allowlisted templates on create and update only", () => {
    const base = { clientId: "11111111-1111-4111-8111-111111111111", title: "Ensaio" };
    expect(clientGalleryCreateSchema.parse(base).layoutPreset).toBe("classico");
    for (const layoutPreset of CLIENT_GALLERY_LAYOUTS) {
      expect(clientGalleryCreateSchema.safeParse({ ...base, layoutPreset }).success).toBe(true);
      expect(clientGalleryUpdateSchema.safeParse({ layoutPreset }).success).toBe(true);
    }
    expect(clientGalleryUpdateSchema.safeParse({ layoutPreset: "custom-html" }).success).toBe(false);
    expect(clientGalleryUpdateSchema.safeParse({ css: "body { display: none }" }).success).toBe(false);
  });
});
