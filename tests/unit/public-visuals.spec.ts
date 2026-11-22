import { describe, expect, it } from "vitest";
import {
  getHeroObjectPosition,
  getHeroMobileMinHeight,
  getPublicVisualAsset,
  getSiteHeaderClassName,
  resolveConfiguredHeroVisual,
  resolveHeroVisual,
} from "../../app/lib/public-visuals";
import { PUNCTUM_DEFAULT_SITE_CONFIG, siteConfigSchema } from "../../shared/config";

describe("identidade visual pública", () => {
  it("renderiza o cabeçalho interno como sobreposição transparente com a marca quadrada", () => {
    const logo = getPublicVisualAsset("logo");
    expect(getSiteHeaderClassName(true)).toBe("site-header dark site-header-transparent");
    expect(logo).toEqual({ src: "/logo-punctum-transparent.png", alt: "", width: 1254, height: 1254 });
  });

  it("usa a fotografia editorial atual no hero em resolução 4K", () => {
    expect(getPublicVisualAsset("hero")).toEqual({
      src: "/images/hero-maria.webp",
      alt: "Fotógrafa em primeiro plano nas arquibancadas de um estádio",
      width: 3840,
      height: 2160,
    });
  });

  it("prefere a fotografia escolhida no Studio e mantém o 4K como fallback", () => {
    const fallback = getPublicVisualAsset("hero");
    expect(resolveHeroVisual("photo-123", [{ id: "photo-123", src: "/media/photo-123/display", alt: "Novo hero" }])).toEqual({
      src: "/media/photo-123/display",
      alt: "Novo hero",
      width: 3840,
      height: 2160,
    });
    expect(resolveHeroVisual(null, [])).toEqual(fallback);
  });

  it("aceita uma referência tipada de mídia própria no hero", () => {
    const config = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG);
    const hero = config.pages.home.sections.find((section) => section.type === "hero");
    if (!hero || hero.type !== "hero") throw new Error("Hero default ausente");
    Object.assign(hero, { heroMedia: { kind: "site-media", id: "hero-123" } });
    expect(siteConfigSchema.safeParse(config).success).toBe(true);
  });

  it("resolve mídia própria do Studio antes do acervo e mantém compatibilidade com o Hero antigo", () => {
    const images = [{ id: "photo-123", src: "/media/photo-123/display", alt: "Hero do acervo" }];
    expect(resolveConfiguredHeroVisual({ kind: "site-media", id: "hero-phone" }, "photo-123", images)).toEqual({
      src: "/media/hero-phone/display",
      alt: "Fotografia principal da Punctum Picture",
      width: 3840,
      height: 2160,
    });
    expect(resolveConfiguredHeroVisual({ kind: "portfolio-image", id: "photo-123" }, null, images)).toEqual({
      src: "/media/photo-123/display",
      alt: "Hero do acervo",
      width: 3840,
      height: 2160,
    });
    expect(resolveConfiguredHeroVisual(null, "photo-123", images)).toEqual(resolveHeroVisual("photo-123", images));
  });

  it("usa enquadramentos distintos no desktop e no mobile", () => {
    expect(getHeroObjectPosition("desktop")).toBe("45% 42%");
    expect(getHeroObjectPosition("mobile")).toBe("50% 50%");
  });

  it("usa a rota autenticada para visualizar o Hero ainda no rascunho do Studio", () => {
    expect(resolveConfiguredHeroVisual({ kind: "site-media", id: "hero-draft" }, null, [], "admin").src)
      .toBe("/admin/media/hero-draft/display");
    expect(resolveConfiguredHeroVisual({ kind: "site-media", id: "hero-draft" }, null, []).src)
      .toBe("/media/hero-draft/display");
  });

  it("mantém o hero mobile full-bleed por pelo menos uma viewport", () => {
    expect(getHeroMobileMinHeight()).toBe("100svh");
  });
});
