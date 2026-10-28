import { PUNCTUM_DEFAULT_SITE_CONFIG } from "./defaults";
import { siteConfigSchema, type SiteConfig } from "./schema";

export const LEGACY_DEFAULT_HERO_MEDIA_ID =
  "a66bbe1b-d1f8-449f-bc08-481f73253ed5";

const LEGACY_HOME_EDITORIAL = {
  hero: {
    eyebrow: "Maria Helena · fotografia documental",
    title: "O que pulsa,",
    accent: "permanece.",
    body: "Pessoas, ritos, palcos e movimento observados com intimidade — antes que o instante mude de forma.",
    primaryCta: "Ver histórias",
    secondaryCta: "Abrir arquivo",
  },
  statement: {
    eyebrow: "Um arquivo vivo",
    title: "Entre o íntimo e o elétrico, a vida sempre deixa um vestígio.",
    body: "A Punctum nasce da atenção ao que não se repete: uma mão acesa por uma vela, o corpo antes do salto, a pausa entre duas músicas, um riso que ninguém dirigiu.",
  },
  carousel: {
    eyebrow: "Atravessar o acervo",
    title: "Muitos ritmos.\nUm mesmo olhar.",
    body: "Do silêncio à vibração, cada série preserva a atmosfera do lugar e a presença de quem estava ali.",
    hint: "Arraste para atravessar o acervo",
  },
  featured: {
    title: "Histórias que",
    accent: "respiram.",
    body: "Ensaios completos, organizados pelo ritmo de cada encontro — sem moldar pessoas diferentes dentro da mesma fórmula.",
  },
  about: {
    eyebrow: "Sobre a Punctum",
    quote: "Fotografar é reconhecer o que já estava ali.",
    body: "O trabalho de Maria Helena se aproxima sem invadir. Busca a textura dos lugares, a verdade dos gestos e o instante em que uma pessoa deixa de posar para simplesmente estar.",
    cta: "Conhecer o olhar por inteiro",
    imageNote: "Olhar / presença / memória",
  },
  contact: {
    eyebrow: "Vamos conversar",
    title: "Toda história começa antes da câmera.",
    body: "Conte quando, onde e o que você deseja preservar. O retorno é pessoal, atento e sem respostas automáticas.",
  },
} as const;

const LEGACY_PORTFOLIO_REEL_HINT = "Arraste para atravessar o acervo";

/**
 * Refreshes only values that exactly match defaults shipped by the previous
 * Punctum release. Studio-authored content remains authoritative.
 */
export function refreshLegacyPublishedConfig(config: SiteConfig): SiteConfig {
  if (config.identity.sourcePresetId !== "punctum-default") return config;

  const defaults = PUNCTUM_DEFAULT_SITE_CONFIG;
  const legacyHome = LEGACY_HOME_EDITORIAL;
  const currentHome = config.editorial.home;
  const hadLegacyHomepageSignature =
    currentHome.hero.title === legacyHome.hero.title &&
    currentHome.statement.title === legacyHome.statement.title &&
    currentHome.carousel.title === legacyHome.carousel.title &&
    currentHome.featured.title === legacyHome.featured.title &&
    currentHome.about.quote === legacyHome.about.quote &&
    currentHome.contact.title === legacyHome.contact.title;

  let changed = false;
  let draft: SiteConfig | undefined;
  const next = () => (draft ??= structuredClone(config));
  const nextHome = () => next().editorial.home;

  const replaceExact = (
    current: string,
    legacy: string,
    replacement: string,
    apply: () => void,
  ) => {
    if (current !== legacy || current === replacement) return;
    apply();
    changed = true;
  };

  replaceExact(currentHome.hero.eyebrow, legacyHome.hero.eyebrow, defaults.editorial.home.hero.eyebrow, () => {
    nextHome().hero.eyebrow = defaults.editorial.home.hero.eyebrow;
  });
  replaceExact(currentHome.hero.title, legacyHome.hero.title, defaults.editorial.home.hero.title, () => {
    nextHome().hero.title = defaults.editorial.home.hero.title;
  });
  replaceExact(currentHome.hero.accent, legacyHome.hero.accent, defaults.editorial.home.hero.accent, () => {
    nextHome().hero.accent = defaults.editorial.home.hero.accent;
  });
  replaceExact(currentHome.hero.body, legacyHome.hero.body, defaults.editorial.home.hero.body, () => {
    nextHome().hero.body = defaults.editorial.home.hero.body;
  });
  replaceExact(currentHome.hero.primaryCta, legacyHome.hero.primaryCta, defaults.editorial.home.hero.primaryCta, () => {
    nextHome().hero.primaryCta = defaults.editorial.home.hero.primaryCta;
  });
  replaceExact(currentHome.hero.secondaryCta, legacyHome.hero.secondaryCta, defaults.editorial.home.hero.secondaryCta, () => {
    nextHome().hero.secondaryCta = defaults.editorial.home.hero.secondaryCta;
  });

  replaceExact(currentHome.statement.eyebrow, legacyHome.statement.eyebrow, defaults.editorial.home.statement.eyebrow, () => {
    nextHome().statement.eyebrow = defaults.editorial.home.statement.eyebrow;
  });
  replaceExact(currentHome.statement.title, legacyHome.statement.title, defaults.editorial.home.statement.title, () => {
    nextHome().statement.title = defaults.editorial.home.statement.title;
  });
  replaceExact(currentHome.statement.body, legacyHome.statement.body, defaults.editorial.home.statement.body, () => {
    nextHome().statement.body = defaults.editorial.home.statement.body;
  });

  replaceExact(currentHome.carousel.eyebrow, legacyHome.carousel.eyebrow, defaults.editorial.home.carousel.eyebrow, () => {
    nextHome().carousel.eyebrow = defaults.editorial.home.carousel.eyebrow;
  });
  replaceExact(currentHome.carousel.title, legacyHome.carousel.title, defaults.editorial.home.carousel.title, () => {
    nextHome().carousel.title = defaults.editorial.home.carousel.title;
  });
  replaceExact(currentHome.carousel.body, legacyHome.carousel.body, defaults.editorial.home.carousel.body, () => {
    nextHome().carousel.body = defaults.editorial.home.carousel.body;
  });
  replaceExact(currentHome.carousel.hint, legacyHome.carousel.hint, defaults.editorial.home.carousel.hint, () => {
    nextHome().carousel.hint = defaults.editorial.home.carousel.hint;
  });

  replaceExact(currentHome.featured.title, legacyHome.featured.title, defaults.editorial.home.featured.title, () => {
    nextHome().featured.title = defaults.editorial.home.featured.title;
  });
  replaceExact(currentHome.featured.accent, legacyHome.featured.accent, defaults.editorial.home.featured.accent, () => {
    nextHome().featured.accent = defaults.editorial.home.featured.accent;
  });
  replaceExact(currentHome.featured.body, legacyHome.featured.body, defaults.editorial.home.featured.body, () => {
    nextHome().featured.body = defaults.editorial.home.featured.body;
  });

  replaceExact(currentHome.about.eyebrow, legacyHome.about.eyebrow, defaults.editorial.home.about.eyebrow, () => {
    nextHome().about.eyebrow = defaults.editorial.home.about.eyebrow;
  });
  replaceExact(currentHome.about.quote, legacyHome.about.quote, defaults.editorial.home.about.quote, () => {
    nextHome().about.quote = defaults.editorial.home.about.quote;
  });
  replaceExact(currentHome.about.body, legacyHome.about.body, defaults.editorial.home.about.body, () => {
    nextHome().about.body = defaults.editorial.home.about.body;
  });
  replaceExact(currentHome.about.cta, legacyHome.about.cta, defaults.editorial.home.about.cta, () => {
    nextHome().about.cta = defaults.editorial.home.about.cta;
  });
  replaceExact(currentHome.about.imageNote, legacyHome.about.imageNote, defaults.editorial.home.about.imageNote, () => {
    nextHome().about.imageNote = defaults.editorial.home.about.imageNote;
  });

  replaceExact(currentHome.contact.eyebrow, legacyHome.contact.eyebrow, defaults.editorial.home.contact.eyebrow, () => {
    nextHome().contact.eyebrow = defaults.editorial.home.contact.eyebrow;
  });
  replaceExact(currentHome.contact.title, legacyHome.contact.title, defaults.editorial.home.contact.title, () => {
    nextHome().contact.title = defaults.editorial.home.contact.title;
  });
  replaceExact(currentHome.contact.body, legacyHome.contact.body, defaults.editorial.home.contact.body, () => {
    nextHome().contact.body = defaults.editorial.home.contact.body;
  });

  replaceExact(
    config.editorial.portfolio.reel.hint,
    LEGACY_PORTFOLIO_REEL_HINT,
    defaults.editorial.portfolio.reel.hint,
    () => {
      next().editorial.portfolio.reel.hint = defaults.editorial.portfolio.reel.hint;
    },
  );

  if (
    hadLegacyHomepageSignature &&
    config.theme.typography.headingFamily === "cormorant-garamond"
  ) {
    next().theme.typography.headingFamily = defaults.theme.typography.headingFamily;
    changed = true;
  }

  const hero = config.pages.home.sections.find((section) => section.type === "hero");
  if (
    currentHome.hero.title === legacyHome.hero.title &&
    hero?.type === "hero" &&
    hero.heroMedia?.kind === "site-media" &&
    hero.heroMedia.id === LEGACY_DEFAULT_HERO_MEDIA_ID
  ) {
    const draftHero = next().pages.home.sections.find((section) => section.type === "hero");
    if (draftHero?.type === "hero") {
      draftHero.heroMedia = null;
      draftHero.appearance.surface = "default";
      draftHero.appearance.backgroundImageId = null;
    }
    changed = true;
  }

  return changed ? siteConfigSchema.parse(draft) : config;
}
