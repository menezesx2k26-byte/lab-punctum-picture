import "../immersive.css";
import "../collage-home.css";
import { MotionControl, StudioMotionProvider } from "./visual/motion-preference";
import type { SiteConfig } from "../../shared/config";
import type {
  PublicAlbumSummary,
  PublicSiteSettings,
} from "../../shared/public-content";
import type { CarouselImage } from "../lib/portfolio";
import { HomeRenderer } from "../sections/home/HomeRenderer";
import { SiteFooter, SiteHeader } from "./SiteChrome";
import { SiteThemeRoot } from "./SiteThemeRoot";

export function HomeExperience({
  site,
  config,
  featuredAlbums,
  carouselImages,
}: {
  site: PublicSiteSettings;
  config: SiteConfig;
  featuredAlbums: PublicAlbumSummary[];
  carouselImages: CarouselImage[];
}) {
  return (
    <SiteThemeRoot config={config} className="immersive-home" ambientCursor={false}>
      <StudioMotionProvider intensity={config.theme.motion.intensity}>
      <SiteHeader site={site} editorial={config.editorial} />
      <main id="conteudo">
        <HomeRenderer
          config={config}
          site={site}
          featuredAlbums={featuredAlbums}
          carouselImages={carouselImages}
        />
      </main>
      <SiteFooter site={site} editorial={config.editorial} />
      <div className="motion-preference-bar"><MotionControl /></div>
      </StudioMotionProvider>
    </SiteThemeRoot>
  );
}
