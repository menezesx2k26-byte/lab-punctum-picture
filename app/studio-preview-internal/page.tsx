import type { Metadata } from "next";
import { HomeExperience } from "../components/HomeExperience";
import {
  loadHomeCarousel,
  loadFeaturedAlbums,
  loadStudioPreviewExperience,
} from "../lib/server-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prévia do Studio",
  robots: { index: false, follow: false, nocache: true },
};

export default async function StudioPreview() {
  const experience = await loadStudioPreviewExperience();
  const [featuredAlbums, carouselImages] = await Promise.all([
    loadFeaturedAlbums(),
    loadHomeCarousel(experience.config),
  ]);
  return (
    <HomeExperience
      site={experience.site}
      config={experience.config}
      featuredAlbums={featuredAlbums}
      carouselImages={carouselImages}
      mediaAudience="admin"
    />
  );
}
