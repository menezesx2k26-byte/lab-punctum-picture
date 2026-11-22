import { Fragment, type ReactNode } from "react";
import type { HomeSectionConfig, SectionType, SectionVariantByType, SiteConfig } from "../../../shared/config";
import type { PublicAlbumSummary, PublicSiteSettings } from "../../../shared/public-content";
import type { CarouselImage } from "../../lib/portfolio";
import { HomeAboutSection } from "./HomeAboutSection";
import { HomeContactSection } from "./HomeContactSection";
import { HomeFeaturedWorkSection } from "./HomeFeaturedWorkSection";
import { HomeHeroSection } from "./HomeHeroSection";
import { HomePhotoReelSection } from "./HomePhotoReelSection";
import { HomeStatementSection } from "./HomeStatementSection";
import { buildHomeSectionRenderPlan, type HomeSectionRenderPlanEntry } from "./render-plan";

export type HomeRendererProps = { config: SiteConfig; site: PublicSiteSettings; featuredAlbums: PublicAlbumSummary[]; carouselImages: CarouselImage[]; mediaAudience?: "public" | "admin" };
type HomeSectionRenderer = (context: HomeRendererProps, section: HomeSectionConfig) => ReactNode;
type HomeSectionRendererRegistry = { [Type in SectionType]: Record<SectionVariantByType[Type], HomeSectionRenderer> };

const heroRenderer: HomeSectionRenderer = (context, section) => <HomeHeroSection copy={context.config.editorial.home.hero} section={section} images={context.carouselImages} mediaAudience={context.mediaAudience} />;
const statementRenderer: HomeSectionRenderer = (context, section) => <HomeStatementSection copy={context.config.editorial.home.statement} section={section} />;
const reelRenderer: HomeSectionRenderer = (context, section) => <HomePhotoReelSection copy={context.config.editorial.home.carousel} images={context.carouselImages} section={section} />;
const featuredRenderer: HomeSectionRenderer = (context, section) => <HomeFeaturedWorkSection albums={context.featuredAlbums} copy={context.config.editorial.home.featured} section={section} />;
const aboutRenderer: HomeSectionRenderer = (context, section) => <HomeAboutSection copy={context.config.editorial.home.about} section={section} />;
const contactRenderer: HomeSectionRenderer = (context, section) => <HomeContactSection copy={context.config.editorial.home.contact} section={section} site={context.site} whatsappLabel={context.config.editorial.chrome.whatsappCta} />;

export const HOME_SECTION_RENDERERS = {
  hero: { cinematic: heroRenderer, editorial: heroRenderer, fullscreen: heroRenderer, split: heroRenderer },
  statement: { manifesto: statementRenderer, centered: statementRenderer },
  "photo-reel": { horizontal: reelRenderer, filmstrip: reelRenderer, patch: reelRenderer },
  "featured-work": { "editorial-grid": featuredRenderer, gallery: featuredRenderer, collage: featuredRenderer },
  about: { portrait: aboutRenderer, "side-portrait": aboutRenderer, centered: aboutRenderer, editorial: aboutRenderer },
  contact: { "split-form": contactRenderer, minimal: contactRenderer },
} satisfies HomeSectionRendererRegistry;

function renderHomeSection(entry: HomeSectionRenderPlanEntry, context: HomeRendererProps): ReactNode {
  const section = entry.section;
  switch (section.type) {
    case "hero": return HOME_SECTION_RENDERERS.hero[section.variant](context, section);
    case "statement": return HOME_SECTION_RENDERERS.statement[section.variant](context, section);
    case "photo-reel": return HOME_SECTION_RENDERERS["photo-reel"][section.variant](context, section);
    case "featured-work": return HOME_SECTION_RENDERERS["featured-work"][section.variant](context, section);
    case "about": return HOME_SECTION_RENDERERS.about[section.variant](context, section);
    case "contact": return HOME_SECTION_RENDERERS.contact[section.variant](context, section);
  }
}

export function HomeRenderer(props: HomeRendererProps) {
  return buildHomeSectionRenderPlan(props.config.pages.home).map((entry) => <Fragment key={entry.section.id}>{renderHomeSection(entry, props)}</Fragment>);
}
