import { env } from "cloudflare:workers";
import { cache } from "react";
import {
  readPublicSiteSettings,
  readPublicStats,
  readPublishedAlbum,
  readPublishedAlbums,
  readPublishedArchive,
  readPublishedImagesById,
} from "../../shared/public-content";
import {
  readDraftSiteConfigState,
  readPublicSiteConfig,
} from "../../shared/site-config-storage";
import {
  EDITORIAL_CAROUSEL_IMAGE_IDS,
  buildEditorialCarousel,
} from "./portfolio";
import type { SiteConfig } from "../../shared/config";

function publicDb(): D1Database {
  if (!env.DB) {
    throw new Error("Cloudflare D1 binding `DB` is unavailable for public rendering.");
  }
  return env.DB;
}

export const loadPublicExperience = cache(async () => {
  const db = publicDb();
  const site = await readPublicSiteSettings(db);
  const config = await readPublicSiteConfig(db, site, env.ORIGINALS);
  return { site, config };
});

export const loadStudioPreviewExperience = cache(async () => {
  const db = publicDb();
  const site = await readPublicSiteSettings(db);
  const draft = await readDraftSiteConfigState(db, site);
  return { site, config: draft.config, revision: draft.revision };
});

export const loadPublicSiteSettings = cache(async () =>
  (await loadPublicExperience()).site,
);

export const loadPublicSiteConfig = cache(async () =>
  (await loadPublicExperience()).config,
);

export const loadFeaturedAlbums = cache(async () => {
  const result = await readPublishedAlbums(publicDb(), {
    featured: true,
    limit: 6,
  });
  return result.albums;
});

export const loadPortfolioAlbums = cache(async () => {
  const result = await readPublishedAlbums(publicDb(), { limit: 100 });
  return result.albums;
});

export const loadPublishedAlbum = cache((slug: string) =>
  readPublishedAlbum(publicDb(), slug),
);

export const loadPublishedArchive = cache(() =>
  readPublishedArchive(publicDb()),
);

export const loadPublicStats = cache(() => readPublicStats(publicDb()));

export const loadEditorialCarousel = cache(async () => {
  const liveImages = await readPublishedImagesById(
    publicDb(),
    EDITORIAL_CAROUSEL_IMAGE_IDS,
  );
  return buildEditorialCarousel(liveImages);
});

export async function loadHomeCarousel(config: SiteConfig) {
  const configuredIds = new Set<string>(EDITORIAL_CAROUSEL_IMAGE_IDS);
  if (config.theme.background.imageId) configuredIds.add(config.theme.background.imageId);
  for (const section of config.pages.home.sections) {
    if (section.appearance.backgroundImageId) configuredIds.add(section.appearance.backgroundImageId);
    if (section.type === "hero" && section.heroMedia?.kind === "portfolio-image") {
      configuredIds.add(section.heroMedia.id);
    }
    if (section.type === "photo-reel") {
      section.photoIds.forEach((imageId) => configuredIds.add(imageId));
    }
  }
  const liveImages = await readPublishedImagesById(publicDb(), [...configuredIds]);
  return buildEditorialCarousel(liveImages);
}
