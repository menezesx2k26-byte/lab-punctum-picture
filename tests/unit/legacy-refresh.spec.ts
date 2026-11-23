import { describe, expect, it, vi } from "vitest";
import {
  LEGACY_DEFAULT_HERO_MEDIA_ID,
  PUNCTUM_DEFAULT_SITE_CONFIG,
  refreshLegacyPublishedConfig,
  siteConfigSchema,
} from "../../shared/config";

function legacyPublishedConfig() {
  const config = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG);
  config.theme.typography.headingFamily = "cormorant-garamond";
  Object.assign(config.editorial.home.hero, {
    title: "O que pulsa,",
    accent: "permanece.",
    body: "Pessoas, ritos, palcos e movimento observados com intimidade — antes que o instante mude de forma.",
  });
  Object.assign(config.editorial.home.statement, {
    eyebrow: "Um arquivo vivo",
    title: "Entre o íntimo e o elétrico, a vida sempre deixa um vestígio.",
    body: "A Punctum nasce da atenção ao que não se repete: uma mão acesa por uma vela, o corpo antes do salto, a pausa entre duas músicas, um riso que ninguém dirigiu.",
  });
  Object.assign(config.editorial.home.carousel, {
    eyebrow: "Atravessar o acervo",
    title: "Muitos ritmos.\nUm mesmo olhar.",
    body: "Do silêncio à vibração, cada série preserva a atmosfera do lugar e a presença de quem estava ali.",
    hint: "Arraste para atravessar o acervo",
  });
  Object.assign(config.editorial.home.featured, {
    title: "Histórias que",
    accent: "respiram.",
    body: "Ensaios completos, organizados pelo ritmo de cada encontro — sem moldar pessoas diferentes dentro da mesma fórmula.",
  });
  Object.assign(config.editorial.home.about, {
    quote: "Fotografar é reconhecer o que já estava ali.",
    body: "O trabalho de Maria Helena se aproxima sem invadir. Busca a textura dos lugares, a verdade dos gestos e o instante em que uma pessoa deixa de posar para simplesmente estar.",
    cta: "Conhecer o olhar por inteiro",
    imageNote: "Olhar / presença / memória",
  });
  Object.assign(config.editorial.home.contact, {
    title: "Toda história começa antes da câmera.",
    body: "Conte quando, onde e o que você deseja preservar. O retorno é pessoal, atento e sem respostas automáticas.",
  });
  config.editorial.portfolio.reel.hint = "Arraste para atravessar o acervo";

  const hero = config.pages.home.sections.find((section) => section.type === "hero");
  if (hero?.type === "hero") {
    hero.heroMedia = { kind: "site-media", id: LEGACY_DEFAULT_HERO_MEDIA_ID };
  }
  return config;
}

describe("refreshLegacyPublishedConfig", () => {
  it("refreshes the previous shipped defaults without mutating the stored snapshot", () => {
    const legacy = legacyPublishedConfig();
    const refreshed = refreshLegacyPublishedConfig(legacy);
    const hero = refreshed.pages.home.sections.find((section) => section.type === "hero");

    expect(refreshed).not.toBe(legacy);
    expect(refreshed.editorial.home).toEqual(PUNCTUM_DEFAULT_SITE_CONFIG.editorial.home);
    expect(refreshed.editorial.portfolio.reel.hint).toBe(
      PUNCTUM_DEFAULT_SITE_CONFIG.editorial.portfolio.reel.hint,
    );
    expect(refreshed.theme.typography.headingFamily).toBe("instrument-serif");
    expect(hero).toMatchObject({
      type: "hero",
      heroMedia: null,
      appearance: { surface: "default", backgroundImageId: null },
    });
    expect(legacy.editorial.home.hero.title).toBe("O que pulsa,");
    expect(siteConfigSchema.safeParse(refreshed).success).toBe(true);
    expect(refreshLegacyPublishedConfig(refreshed)).toBe(refreshed);
  });

  it("preserves Studio-authored copy, typography and hero photography", () => {
    const custom = legacyPublishedConfig();
    custom.editorial.home.hero.title = "Luz de domingo";
    custom.editorial.home.about.body = "Texto escrito no Studio.";
    custom.theme.typography.headingFamily = "cormorant-garamond";
    const hero = custom.pages.home.sections.find((section) => section.type === "hero");
    if (hero?.type === "hero") {
      hero.heroMedia = { kind: "site-media", id: "foto-escolhida-no-studio" };
    }

    const refreshed = refreshLegacyPublishedConfig(custom);
    const refreshedHero = refreshed.pages.home.sections.find(
      (section) => section.type === "hero",
    );

    expect(refreshed.editorial.home.hero.title).toBe("Luz de domingo");
    expect(refreshed.editorial.home.about.body).toBe("Texto escrito no Studio.");
    expect(refreshed.theme.typography.headingFamily).toBe("cormorant-garamond");
    expect(refreshedHero).toMatchObject({
      type: "hero",
      heroMedia: { kind: "site-media", id: "foto-escolhida-no-studio" },
    });
  });

  it("returns a current configuration unchanged", () => {
    expect(refreshLegacyPublishedConfig(PUNCTUM_DEFAULT_SITE_CONFIG)).toBe(
      PUNCTUM_DEFAULT_SITE_CONFIG,
    );
  });

  it("allocates a draft only when a legacy replacement is actually needed", () => {
    const legacy = legacyPublishedConfig();
    const original = JSON.stringify(legacy);
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      expect(refreshLegacyPublishedConfig(PUNCTUM_DEFAULT_SITE_CONFIG)).toBe(PUNCTUM_DEFAULT_SITE_CONFIG);
      expect(clone).not.toHaveBeenCalled();
      const refreshed = refreshLegacyPublishedConfig(legacy);
      expect(clone).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(legacy)).toBe(original);
      expect(refreshed.editorial.home).toEqual(PUNCTUM_DEFAULT_SITE_CONFIG.editorial.home);
      clone.mockClear();
      expect(refreshLegacyPublishedConfig(refreshed)).toBe(refreshed);
      expect(clone).not.toHaveBeenCalled();
    } finally { clone.mockRestore(); }
  });
});
