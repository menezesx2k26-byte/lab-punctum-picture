import { describe, expect, it } from "vitest";
import {
  BODY_FONT_FAMILY_IDS,
  FONT_FAMILY_IDS,
  FONT_REGISTRY,
  FONT_PAIR_REGISTRY,
  EDITORIAL_TEXT_LIMITS,
  PUNCTUM_DEFAULT_EDITORIAL_CONFIG,
  PUNCTUM_DEFAULT_COMPOSITION_CONFIG,
  HEADING_FONT_FAMILY_IDS,
  PUNCTUM_DEFAULT_SITE_CONFIG,
  SITE_CONFIG_SCHEMA_VERSION,
  SITE_PRESET_REGISTRY,
  applySitePreset,
  siteConfigSchema,
  sitePresetSchema,
  themeConfigSchema,
  paletteContrastChecks,
  safeParseSiteConfig,
} from "../../shared/config";
import {
  serializeSiteConfig,
  siteConfigFromLegacySettings,
} from "../../shared/site-config-storage";

function cloneDefault(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(PUNCTUM_DEFAULT_SITE_CONFIG)) as Record<
    string,
    unknown
  >;
}

describe("SiteConfig v4", () => {
  it("mantém o default do Punctum válido e versionado", () => {
    expect(siteConfigSchema.parse(PUNCTUM_DEFAULT_SITE_CONFIG)).toEqual(
      PUNCTUM_DEFAULT_SITE_CONFIG,
    );
    expect(PUNCTUM_DEFAULT_SITE_CONFIG.schemaVersion).toBe(
      SITE_CONFIG_SCHEMA_VERSION,
    );
    expect(
      themeConfigSchema.parse(PUNCTUM_DEFAULT_SITE_CONFIG.theme),
    ).toEqual(PUNCTUM_DEFAULT_SITE_CONFIG.theme);
  });

  it("inclui defaults editoriais válidos e com os limites atuais", () => {
    expect(PUNCTUM_DEFAULT_SITE_CONFIG.editorial).toEqual(
      PUNCTUM_DEFAULT_EDITORIAL_CONFIG,
    );
    expect(PUNCTUM_DEFAULT_EDITORIAL_CONFIG.home.hero.title.length).toBeLessThanOrEqual(
      EDITORIAL_TEXT_LIMITS.title,
    );
  });

  it("inclui a composição default da Home como parte do SiteConfig", () => {
    expect(PUNCTUM_DEFAULT_SITE_CONFIG.pages).toEqual(
      PUNCTUM_DEFAULT_COMPOSITION_CONFIG,
    );
    expect(PUNCTUM_DEFAULT_SITE_CONFIG.pages.home.sections).toHaveLength(6);
  });

  it("migra configurações v1 e v2 em memória sem aceitar versões desconhecidas", () => {
    const current = cloneDefault();
    const currentTheme = current.theme as Record<string, unknown>;
    const legacyTheme = {
      ...currentTheme,
      background: { style: "organic-glow", assetId: null },
      collage: { style: "off" },
    };
    const legacyV2 = {
      schemaVersion: 2,
      identity: current.identity,
      theme: legacyTheme,
      editorial: current.editorial,
    };
    const migratedV2 = safeParseSiteConfig(legacyV2);
    expect(migratedV2.source).toBe("migrated-v2");
    expect(migratedV2.config.schemaVersion).toBe(4);
    expect(migratedV2.config.editorial).toEqual(current.editorial);
    expect(migratedV2.config.pages).toEqual(PUNCTUM_DEFAULT_COMPOSITION_CONFIG);

    const legacyV1 = {
      schemaVersion: 1,
      identity: current.identity,
      theme: legacyTheme,
    };
    const migrated = safeParseSiteConfig(legacyV1);
    expect(migrated.source).toBe("migrated-v1");
    expect(migrated.config.schemaVersion).toBe(4);
    expect(migrated.config.editorial).toEqual(PUNCTUM_DEFAULT_EDITORIAL_CONFIG);
    expect(migrated.config.pages).toEqual(PUNCTUM_DEFAULT_COMPOSITION_CONFIG);

    expect(safeParseSiteConfig({ schemaVersion: 99 }).source).toBe(
      "punctum-default",
    );
  });

  it("migra v3 e transfere collage global para uma variant segura da section", () => {
    const current = cloneDefault();
    const theme = current.theme as Record<string, unknown>;
    theme.background = { style: "organic-glow", assetId: null };
    theme.collage = { style: "patchwork" };
    const pages = current.pages as { home: { sections: Array<Record<string, unknown>> } };
    pages.home.sections = pages.home.sections.map(({ appearance: _appearance, photoIds: _photoIds, itemCount: _itemCount, ...section }) => {
      void _appearance;
      void _photoIds;
      void _itemCount;
      return section;
    });
    const migrated = safeParseSiteConfig({ ...current, schemaVersion: 3, theme });
    expect(migrated.source).toBe("migrated-v3");
    expect(migrated.config.schemaVersion).toBe(4);
    expect(migrated.config.pages.home.sections.find((section) => section.type === "photo-reel")?.variant).toBe("patch");
    expect("collage" in migrated.config.theme).toBe(false);
  });

  it("usa fallback seguro quando a composição persistida é inválida", () => {
    const invalid = cloneDefault();
    const pages = invalid.pages as {
      home: { sections: Array<{ type: string; variant: string }> };
    };
    pages.home.sections[0].variant = "canvas-livre";

    const result = safeParseSiteConfig(invalid);
    expect(result.source).toBe("punctum-default");
    expect(result.config).toEqual(PUNCTUM_DEFAULT_SITE_CONFIG);
  });

  it("rejeita copy longa, HTML e propriedades editoriais desconhecidas", () => {
    const long = cloneDefault();
    const editorial = long.editorial as typeof PUNCTUM_DEFAULT_EDITORIAL_CONFIG;
    editorial.home.hero.title = "x".repeat(EDITORIAL_TEXT_LIMITS.title + 1);
    expect(siteConfigSchema.safeParse(long).success).toBe(false);

    const html = cloneDefault();
    (html.editorial as typeof PUNCTUM_DEFAULT_EDITORIAL_CONFIG).home.hero.title =
      "<strong>Texto</strong>";
    expect(siteConfigSchema.safeParse(html).success).toBe(false);

    const unknown = cloneDefault();
    const unknownHome = (unknown.editorial as { home: Record<string, unknown> }).home;
    unknownHome.customHtml = "<p>livre</p>";
    expect(siteConfigSchema.safeParse(unknown).success).toBe(false);
  });

  it("deriva o primeiro config dos settings existentes e serializa uma unidade", () => {
    const config = siteConfigFromLegacySettings({
      tagline: "Frase persistida",
      aboutText: "Biografia persistida",
    });
    expect(config.editorial.chrome.footer.tagline).toBe("Frase persistida");
    expect(config.editorial.home.about.body).toBe("Biografia persistida");
    expect(JSON.parse(serializeSiteConfig(config))).toEqual(config);
  });

  it("rejeita enums de theme e FontFamilyId que não foram aprovados", () => {
    const invalid = cloneDefault();
    const theme = invalid.theme as Record<string, unknown>;
    const typography = theme.typography as Record<string, unknown>;
    typography.headingFamily = "https://example.com/minha-fonte.woff2";
    theme.motion = { intensity: "caótico" };

    expect(siteConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejeita propriedades extras em todos os contratos principais", () => {
    const invalid = cloneDefault();
    invalid.customCss = "body { display: none }";

    expect(siteConfigSchema.safeParse(invalid).success).toBe(false);
    expect(
      themeConfigSchema.safeParse({
        ...PUNCTUM_DEFAULT_SITE_CONFIG.theme,
        html: "<script>alert(1)</script>",
      }).success,
    ).toBe(false);
  });

  it("rejeita IDs de imagem, fundos e variants que tentem injetar valores livres", () => {
    const invalidImage = cloneDefault();
    const theme = invalidImage.theme as { background: Record<string, unknown> };
    theme.background = {
      style: "soft-image",
      assetId: null,
      imageId: '\") ; background:url(https://evil.example)',
      treatment: "soft",
    };
    expect(siteConfigSchema.safeParse(invalidImage).success).toBe(false);

    const invalidVariant = cloneDefault();
    const pages = invalidVariant.pages as { home: { sections: Array<Record<string, unknown>> } };
    pages.home.sections[0].variant = "component-path-from-db";
    expect(siteConfigSchema.safeParse(invalidVariant).success).toBe(false);

    const invalidPatch = cloneDefault();
    const patchPages = invalidPatch.pages as { home: { sections: Array<Record<string, unknown>> } };
    const reel = patchPages.home.sections.find((section) => section.type === "photo-reel");
    if (!reel) throw new Error("Percurso default ausente");
    reel.variant = "patch";
    reel.photoIds = ["foto-1", "foto-2"];
    expect(siteConfigSchema.safeParse(invalidPatch).success).toBe(false);
  });
});

describe("registries de identidade", () => {
  it("mantém o FontRegistry completo, coerente e sem imports ou URLs", () => {
    expect(Object.keys(FONT_REGISTRY).sort()).toEqual(
      [...FONT_FAMILY_IDS].sort(),
    );
    for (const id of FONT_FAMILY_IDS) {
      const entry = FONT_REGISTRY[id];
      expect(entry.id).toBe(id);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.category.length).toBeGreaterThan(0);
      expect(entry.availableWeights.length).toBeGreaterThan(0);
      expect(entry.cssStack).not.toMatch(/url\(|@import|https?:/i);
    }
    for (const id of HEADING_FONT_FAMILY_IDS) {
      expect(FONT_REGISTRY[id].allowedRoles).toContain("heading");
    }
    for (const id of BODY_FONT_FAMILY_IDS) {
      expect(FONT_REGISTRY[id].allowedRoles).toContain("body");
    }
  });

  it("expõe os 40 IDs do pack e pares tipográficos humanos aprovados", () => {
    expect(FONT_FAMILY_IDS).toHaveLength(42);
    expect(FONT_FAMILY_IDS).toContain("italiana");
    expect(FONT_FAMILY_IDS).toContain("georgia-editorial");
    expect(Object.keys(FONT_PAIR_REGISTRY)).toEqual([
      "elegante",
      "editorial",
      "delicada",
      "moderna",
      "classica",
      "marcante",
      "acolhedora",
      "manuscrita",
    ]);
    expect(FONT_REGISTRY.sacramento.availableWeights).toEqual([400]);
    expect(FONT_REGISTRY.allura.availableWeights).toEqual([400]);
    expect(FONT_REGISTRY.parisienne.availableWeights).toEqual([400]);
  });

  it("valida todos os presets pelo mesmo SiteConfig", () => {
    for (const preset of Object.values(SITE_PRESET_REGISTRY)) {
      expect(sitePresetSchema.parse(preset)).toEqual(preset);
      expect(preset.config.identity.sourcePresetId).toBe(preset.id);
    }
    expect(Object.keys(SITE_PRESET_REGISTRY)).toEqual([
      "punctum-default",
      "colagem-autoral",
      "editorial-silencioso",
      "delicado-luminoso",
      "intenso-noturno",
      "minimalista-claro",
      "aconchegante-organico",
    ]);
  });

  it("aplica preset como ponto de partida sem perder textos, ordem ou visibilidade", () => {
    const current = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG);
    current.editorial.home.hero.title = "Minha própria frase";
    const statement = current.pages.home.sections.find((section) => section.type === "statement");
    if (!statement) throw new Error("Manifesto default ausente");
    statement.enabled = false;
    current.pages.home.sections = [current.pages.home.sections[0], ...current.pages.home.sections.slice(1).reverse()];

    const applied = applySitePreset(current, "intenso-noturno");
    expect(applied.editorial.home.hero.title).toBe("Minha própria frase");
    expect(applied.pages.home.sections.map((section) => section.id)).toEqual(current.pages.home.sections.map((section) => section.id));
    expect(applied.pages.home.sections.find((section) => section.type === "statement")?.enabled).toBe(false);
    expect(applied.theme.palette.id).toBe("nocturne-plum");
    expect(applied.pages.home.sections.find((section) => section.type === "featured-work")?.variant).toBe("collage");
  });

  it("mantém os pares textuais da palette default acima de 4.5:1", () => {
    for (const check of paletteContrastChecks("punctum-violet")) {
      expect(check.ratio, check.name).toBeGreaterThanOrEqual(4.5);
    }
  });
});
