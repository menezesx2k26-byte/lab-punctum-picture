"use client";

import { useMemo, useState } from "react";
import {
  BACKGROUND_STYLE_REGISTRY,
  BODY_FONT_FAMILY_IDS,
  FONT_CATEGORY_LABELS,
  FONT_PAIR_REGISTRY,
  FONT_REGISTRY,
  HEADING_FONT_FAMILY_IDS,
  PALETTE_REGISTRY,
  SITE_PRESET_REGISTRY,
  applyFontPair,
  applySitePreset,
  fontPairIdForConfig,
  siteConfigSchema,
  type BackgroundStyleId,
  type BodyFontFamilyId,
  type FontCategoryId,
  type HeadingFontFamilyId,
  type PaletteId,
  type SiteConfig,
  type SitePresetId,
} from "../../../../shared/config";

const MOTION_CHOICES = [
  { id: "none", label: "Sem movimento", description: "Fotografia direta e galeria acessível, sem abertura animada ou giro 3D." },
  { id: "subtle", label: "Suave", description: "A lente abre; os ensaios e retratos se movem discretamente." },
  { id: "expressive", label: "Mais vivo", description: "A mesma lente, com reenquadramento mais amplo nos ensaios." },
] as const;

const IMAGE_CHOICES = [
  { id: "natural", label: "Natural" },
  { id: "soft", label: "Suave" },
  { id: "contrast", label: "Contraste" },
  { id: "monochrome", label: "Preto e branco" },
] as const;

const BACKGROUND_TREATMENTS = [
  { id: "soft", label: "Mais suave" },
  { id: "present", label: "Mais presente" },
  { id: "dark", label: "Mais escuro" },
  { id: "light", label: "Mais claro" },
] as const;

function FontBrowser({
  role,
  selected,
  onSelect,
}: {
  role: "heading" | "body";
  selected: string;
  onSelect: (fontId: string) => void;
}) {
  const entries = useMemo(
    () =>
      Object.values(FONT_REGISTRY).filter((entry) =>
        entry.allowedRoles.includes(role),
      ),
    [role],
  );
  const categories = useMemo(
    () => [...new Set(entries.map((entry) => entry.category))],
    [entries],
  );
  const selectedEntry = FONT_REGISTRY[selected as keyof typeof FONT_REGISTRY];
  const [category, setCategory] = useState<FontCategoryId>(
    selectedEntry?.category ?? categories[0],
  );
  const visible = entries.filter((entry) => entry.category === category);

  return (
    <div className="studio-font-browser">
      <div className="studio-category-pills" role="tablist" aria-label="Estilos de escrita">
        {categories.map((categoryId) => (
          <button
            type="button"
            role="tab"
            aria-selected={category === categoryId}
            key={categoryId}
            onClick={() => setCategory(categoryId)}
          >
            {FONT_CATEGORY_LABELS[categoryId]}
          </button>
        ))}
      </div>
      <div className="studio-font-grid">
        {visible.map((font) => (
          <button
            type="button"
            className={selected === font.id ? "selected" : ""}
            aria-pressed={selected === font.id}
            onClick={() => onSelect(font.id)}
            key={font.id}
          >
            <strong style={{ fontFamily: font.cssStack }}>Histórias que permanecem</strong>
            <span>{font.label}</span>
            <small>{font.description}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

export function StudioStylePanel({
  config,
  onChange,
}: {
  config: SiteConfig;
  onChange: (next: SiteConfig, message: string) => void;
}) {
  const activePair = fontPairIdForConfig(config);

  function updateTheme(
    mutate: (next: SiteConfig) => void,
    message: string,
  ) {
    const next = structuredClone(config);
    mutate(next);
    onChange(siteConfigSchema.parse(next), message);
  }

  function choosePreset(id: SitePresetId) {
    onChange(applySitePreset(config, id), "Estilo aplicado. A câmera e o carrossel continuam protegidos.");
  }

  function choosePalette(id: PaletteId) {
    const palette = PALETTE_REGISTRY[id];
    updateTheme((next) => {
      next.theme.palette = { id, mode: palette.mode };
    }, "Cores escolhidas.");
  }

  function chooseBackground(style: BackgroundStyleId) {
    updateTheme((next) => {
      next.theme.background = {
        ...next.theme.background,
        style,
        assetId:
          style === "soft-image" && !next.theme.background.imageId
            ? "manifesto-portrait"
            : null,
        imageId: style === "soft-image" ? next.theme.background.imageId : null,
      };
    }, "Fundo escolhido.");
  }

  function chooseHeadingFont(id: string) {
    if (!(HEADING_FONT_FAMILY_IDS as readonly string[]).includes(id)) return;
    updateTheme((next) => {
      next.theme.typography.headingFamily = id as HeadingFontFamilyId;
      next.theme.typography.headingWeight = "regular";
    }, "Escrita dos títulos escolhida.");
  }

  function chooseBodyFont(id: string) {
    if (!(BODY_FONT_FAMILY_IDS as readonly string[]).includes(id)) return;
    updateTheme((next) => {
      next.theme.typography.bodyFamily = id as BodyFontFamilyId;
    }, "Escrita dos textos escolhida.");
  }

  return (
    <section className="studio-panel studio-style-panel" aria-labelledby="studio-style-title">
      <div className="studio-panel-heading">
        <p className="eyebrow">Seu jeito de contar</p>
        <h2 id="studio-style-title">Estilo</h2>
        <p>Comece por uma personalidade pronta e, se quiser, ajuste só o que sentir.</p>
      </div>

      <div className="studio-subsection">
        <h3>Escolha um clima</h3>
        <div className="studio-preset-grid">
          {Object.values(SITE_PRESET_REGISTRY).map((preset) => (
            <button
              type="button"
              className={`studio-preset-card${config.identity.sourcePresetId === preset.id ? " selected" : ""}`}
              aria-pressed={config.identity.sourcePresetId === preset.id}
              onClick={() => choosePreset(preset.id)}
              key={preset.id}
            >
              <span className={`studio-preset-preview preset-${preset.id}`} aria-hidden="true">
                <i /><i /><i />
              </span>
              <strong>{preset.label}</strong>
              <small>{preset.description}</small>
            </button>
          ))}
        </div>
      </div>

      <details className="studio-progressive" open>
        <summary>Cores</summary>
        <div className="studio-palette-grid">
          {Object.values(PALETTE_REGISTRY).map((palette) => (
            <button
              type="button"
              aria-pressed={config.theme.palette.id === palette.id}
              className={config.theme.palette.id === palette.id ? "selected" : ""}
              onClick={() => choosePalette(palette.id)}
              key={palette.id}
            >
              <span className="studio-palette-swatches" aria-hidden="true">
                <i style={{ background: palette.colors.background }} />
                <i style={{ background: palette.colors.primary }} />
                <i style={{ background: palette.colors.accent }} />
                <i style={{ background: palette.colors.foreground }} />
              </span>
              <strong>{palette.label}</strong>
              <small>{palette.description}</small>
            </button>
          ))}
        </div>
        <p className="studio-reassurance">As combinações difíceis de ler ficam bloqueadas automaticamente.</p>
      </details>

      <details className="studio-progressive">
        <summary>Escrita</summary>
        <h3>Estilo da escrita</h3>
        <div className="studio-choice-grid font-pair-grid">
          {Object.values(FONT_PAIR_REGISTRY).map((pair) => (
            <button
              type="button"
              className={`studio-choice-card${activePair === pair.id ? " selected" : ""}`}
              onClick={() => onChange(applyFontPair(config, pair.id), "Estilo de escrita escolhido.")}
              aria-pressed={activePair === pair.id}
              key={pair.id}
            >
              <strong style={{ fontFamily: FONT_REGISTRY[pair.headingFamily].cssStack }}>{pair.sample}</strong>
              <span>{pair.label}</span>
              <small>{pair.description}</small>
            </button>
          ))}
        </div>
        <details className="studio-personalize-more">
          <summary>Personalizar mais</summary>
          <div>
            <h3>Escrita dos títulos</h3>
            <FontBrowser role="heading" selected={config.theme.typography.headingFamily} onSelect={chooseHeadingFont} />
          </div>
          <div>
            <h3>Escrita dos textos</h3>
            <FontBrowser role="body" selected={config.theme.typography.bodyFamily} onSelect={chooseBodyFont} />
          </div>
        </details>
      </details>

      <details className="studio-progressive">
        <summary>Fundo</summary>
        <div className="studio-choice-grid background-choice-grid">
          {Object.values(BACKGROUND_STYLE_REGISTRY).map((background) => {
            const selected = config.theme.background.style === background.id;
            const label = { plain: "Limpo", "organic-glow": "Luz suave", "soft-image": "Com foto", "editorial-texture": "Textura editorial" }[background.id];
            return (
              <button type="button" className={`studio-choice-card${selected ? " selected" : ""}`} onClick={() => chooseBackground(background.id)} aria-pressed={selected} key={background.id}>
                <span className={`studio-background-swatch ${background.id}`} aria-hidden="true" />
                <span>{label}</span>
                <small>{background.description}</small>
              </button>
            );
          })}
        </div>
        {config.theme.background.style === "soft-image" ? (
          <div className="studio-segmented" role="group" aria-label="Presença da fotografia no fundo">
            {BACKGROUND_TREATMENTS.map((choice) => (
              <button type="button" aria-pressed={config.theme.background.treatment === choice.id} onClick={() => updateTheme((next) => { next.theme.background.treatment = choice.id; }, "Tratamento do fundo escolhido.")} key={choice.id}>{choice.label}</button>
            ))}
          </div>
        ) : null}
      </details>

      <details className="studio-progressive">
        <summary>Movimento e fotografias</summary>
        <h3>Movimento</h3>
        <p>A preferência do visitante por reduzir movimento sempre prevalece. A duração da abertura acompanha a rolagem; não há reprodução automática.</p>
        <div className="studio-option-row">
          {MOTION_CHOICES.map((choice) => (
            <button type="button" aria-pressed={config.theme.motion.intensity === choice.id} onClick={() => updateTheme((next) => { next.theme.motion.intensity = choice.id; }, "Movimento escolhido.")} key={choice.id}>
              <strong>{choice.label}</strong><small>{choice.description}</small>
            </button>
          ))}
        </div>
        <h3>Tratamento das fotografias</h3>
        <div className="studio-segmented" role="group" aria-label="Tratamento das fotografias">
          {IMAGE_CHOICES.map((choice) => (
            <button type="button" aria-pressed={config.theme.image.treatment === choice.id} onClick={() => updateTheme((next) => { next.theme.image.treatment = choice.id; }, "Tratamento das fotografias escolhido.")} key={choice.id}>{choice.label}</button>
          ))}
        </div>
      </details>
    </section>
  );
}
