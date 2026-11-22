import type { HeroMediaRef } from "../../shared/config";

// Public-facing visual assets. Keep hero metadata aligned with its regression test.
const PUBLIC_VISUAL_ASSETS = {
  logo: { src: "/logo-punctum-transparent.png", alt: "", width: 1254, height: 1254 },
  hero: {
    src: "/images/hero-maria.webp",
    alt: "Fotógrafa em primeiro plano nas arquibancadas de um estádio",
    width: 3840,
    height: 2160,
  },
} as const;

const HERO_OBJECT_POSITIONS = { desktop: "45% 42%", mobile: "50% 50%" } as const;
const HERO_MOBILE_MIN_HEIGHT = "100svh" as const;

export type PublicVisualAssetRole = keyof typeof PUBLIC_VISUAL_ASSETS;
export type HeroViewport = keyof typeof HERO_OBJECT_POSITIONS;

type HeroCandidate = { id: string; src: string; alt: string };

export function getPublicVisualAsset<Role extends PublicVisualAssetRole>(role: Role): (typeof PUBLIC_VISUAL_ASSETS)[Role] {
  return PUBLIC_VISUAL_ASSETS[role];
}

export function resolveHeroVisual(imageId: string | null, images: readonly HeroCandidate[]) {
  const selected = imageId ? images.find((image) => image.id === imageId) : null;
  if (!selected) return getPublicVisualAsset("hero");
  return { src: selected.src, alt: selected.alt, width: 3840, height: 2160 };
}

export function resolveConfiguredHeroVisual(
  heroMedia: HeroMediaRef | null | undefined,
  legacyImageId: string | null,
  images: readonly HeroCandidate[],
  audience: "public" | "admin" = "public",
) {
  if (heroMedia?.kind === "site-media") {
    return {
      src: `${audience === "admin" ? "/admin" : ""}/media/${heroMedia.id}/display`,
      alt: "Fotografia principal da Punctum Picture",
      width: 3840,
      height: 2160,
    };
  }
  if (heroMedia?.kind === "portfolio-image") {
    return resolveHeroVisual(heroMedia.id, images);
  }
  return resolveHeroVisual(legacyImageId, images);
}

export function getHeroObjectPosition<Viewport extends HeroViewport>(viewport: Viewport): (typeof HERO_OBJECT_POSITIONS)[Viewport] {
  return HERO_OBJECT_POSITIONS[viewport];
}

export function getHeroMobileMinHeight(): typeof HERO_MOBILE_MIN_HEIGHT {
  return HERO_MOBILE_MIN_HEIGHT;
}

export function getSiteHeaderClassName(dark: boolean): string {
  return dark ? "site-header dark site-header-transparent" : "site-header";
}
