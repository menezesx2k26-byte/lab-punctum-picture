import { z } from "zod";
import { PUNCTUM_DEFAULT_SITE_CONFIG } from "./defaults";
import { SITE_PRESET_IDS, type SitePresetId } from "./preset-ids";
import { siteConfigSchema, type SiteConfig } from "./schema";
import { protectImmersiveConfig } from "./immersive-policy";
import type { PaletteId } from "./palette-registry";

export const sitePresetSchema = z.object({
  id: z.enum(SITE_PRESET_IDS),
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(240),
  config: siteConfigSchema,
}).strict();

export type SitePreset = {
  id: SitePresetId;
  label: string;
  description: string;
  config: SiteConfig;
};

type PresetRecipe = {
  id: SitePresetId;
  label: string;
  description: string;
  palette: PaletteId;
  headingFamily: SiteConfig["theme"]["typography"]["headingFamily"];
  bodyFamily: SiteConfig["theme"]["typography"]["bodyFamily"];
  headingScale: SiteConfig["theme"]["typography"]["headingScale"];
  headingWeight: SiteConfig["theme"]["typography"]["headingWeight"];
  headingTracking: SiteConfig["theme"]["typography"]["headingTracking"];
  radius: SiteConfig["theme"]["shape"]["radius"];
  density: SiteConfig["theme"]["spacing"]["density"];
  shadow: SiteConfig["theme"]["shadow"]["style"];
  motion: SiteConfig["theme"]["motion"]["intensity"];
  image: SiteConfig["theme"]["image"]["treatment"];
  background: SiteConfig["theme"]["background"]["style"];
  variants: Partial<Record<SiteConfig["pages"]["home"]["sections"][number]["type"], string>>;
};

function buildPreset(recipe: PresetRecipe): SitePreset {
  const config = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG);
  config.identity.sourcePresetId = recipe.id;
  config.theme.palette = {
    id: recipe.palette,
    mode: recipe.palette === "nocturne-plum" ? "dark" : "light",
  };
  config.theme.typography = {
    ...config.theme.typography,
    headingFamily: recipe.headingFamily,
    bodyFamily: recipe.bodyFamily,
    headingScale: recipe.headingScale,
    headingWeight: recipe.headingWeight,
    headingTracking: recipe.headingTracking,
  };
  config.theme.shape.radius = recipe.radius;
  config.theme.spacing.density = recipe.density;
  config.theme.shadow.style = recipe.shadow;
  config.theme.motion.intensity = recipe.motion;
  config.theme.image.treatment = recipe.image;
  config.theme.background = {
    style: recipe.background,
    assetId: null,
    imageId: null,
    treatment: "soft",
  };
  config.pages.home.sections = config.pages.home.sections.map((section) => {
    const nextVariant = recipe.variants[section.type];
    return nextVariant ? { ...section, variant: nextVariant } : section;
  }) as SiteConfig["pages"]["home"]["sections"];
  return sitePresetSchema.parse({
    id: recipe.id,
    label: recipe.label,
    description: recipe.description,
    config,
  });
}

const recipes: readonly PresetRecipe[] = [
  {
    id: "editorial-silencioso", label: "Editorial", description: "Elegante, espaçoso e artístico.",
    palette: "editorial-ivory", headingFamily: "newsreader", bodyFamily: "manrope",
    headingScale: "display", headingWeight: "regular", headingTracking: "normal",
    radius: "square", density: "spacious", shadow: "none", motion: "subtle",
    image: "soft", background: "editorial-texture",
    variants: { hero: "editorial", statement: "centered", "featured-work": "gallery", about: "editorial", contact: "minimal" },
  },
  {
    id: "delicado-luminoso", label: "Delicado", description: "Luminoso, sensível e suave.",
    palette: "rose-mist", headingFamily: "italiana", bodyFamily: "manrope",
    headingScale: "editorial", headingWeight: "regular", headingTracking: "normal",
    radius: "soft", density: "spacious", shadow: "soft", motion: "subtle",
    image: "soft", background: "organic-glow",
    variants: { hero: "split", statement: "centered", "featured-work": "gallery", about: "centered" },
  },
  {
    id: "colagem-autoral", label: "Colagem autoral", description: "Recortes, papel e tipografia expressiva em roxo, amarelo e branco.",
    palette: "nocturne-plum", headingFamily: "syne", bodyFamily: "figtree",
    headingScale: "display", headingWeight: "medium", headingTracking: "tight",
    radius: "square", density: "balanced", shadow: "graphic", motion: "subtle",
    image: "natural", background: "organic-glow",
    variants: { statement: "manifesto", "featured-work": "collage", about: "editorial", contact: "minimal" },
  },
  {
    id: "intenso-noturno", label: "Intenso", description: "Escuro, cinematográfico e expressivo.",
    palette: "nocturne-plum", headingFamily: "syne", bodyFamily: "figtree",
    headingScale: "display", headingWeight: "medium", headingTracking: "tight",
    radius: "square", density: "balanced", shadow: "graphic", motion: "expressive",
    image: "contrast", background: "organic-glow",
    variants: { hero: "fullscreen", "photo-reel": "filmstrip", "featured-work": "collage", about: "editorial" },
  },
  {
    id: "minimalista-claro", label: "Minimalista", description: "Preciso, leve e cheio de respiro.",
    palette: "ink-minimal", headingFamily: "manrope", bodyFamily: "manrope",
    headingScale: "restrained", headingWeight: "medium", headingTracking: "tight",
    radius: "square", density: "spacious", shadow: "none", motion: "none",
    image: "natural", background: "plain",
    variants: { hero: "editorial", statement: "centered", "featured-work": "gallery", about: "centered", contact: "minimal" },
  },
  {
    id: "aconchegante-organico", label: "Aconchegante", description: "Quente, humano e espontâneo.",
    palette: "warm-earth", headingFamily: "fraunces", bodyFamily: "nunito-sans",
    headingScale: "editorial", headingWeight: "regular", headingTracking: "normal",
    radius: "soft", density: "balanced", shadow: "soft", motion: "subtle",
    image: "soft", background: "organic-glow",
    variants: { hero: "split", about: "side-portrait" },
  },
];

export const SITE_PRESET_REGISTRY: Readonly<Record<SitePresetId, SitePreset>> = {
  "punctum-default": sitePresetSchema.parse({
    id: "punctum-default",
    label: "Punctum original",
    description: "Violeta, orgânico e autoral.",
    config: PUNCTUM_DEFAULT_SITE_CONFIG,
  }),
  ...Object.fromEntries(recipes.map((recipe) => [recipe.id, buildPreset(recipe)])),
} as Record<SitePresetId, SitePreset>;

export function getSitePreset(id: unknown): SitePreset {
  if (typeof id === "string" && id in SITE_PRESET_REGISTRY) {
    return SITE_PRESET_REGISTRY[id as SitePresetId];
  }
  return SITE_PRESET_REGISTRY["punctum-default"];
}

export function applySitePreset(current: SiteConfig, id: SitePresetId): SiteConfig {
  const preset = SITE_PRESET_REGISTRY[id].config;
  const presetSections = new Map(preset.pages.home.sections.map((section) => [section.type, section]));
  return protectImmersiveConfig(siteConfigSchema.parse({
    ...current,
    identity: structuredClone(preset.identity),
    theme: structuredClone(preset.theme),
    pages: {
      ...current.pages,
      home: {
        sections: current.pages.home.sections.map((section) => {
          const presetSection = presetSections.get(section.type);
          if (!presetSection) return section;
          // Design variants change; Studio content/media and section-specific
          // selections must survive preset switching and rollback.
          return { ...section, variant: presetSection.variant };
        }),
      },
    },
  }));
}
