/* eslint-disable @next/next/no-img-element -- Admin preview uses authenticated admin Worker endpoints without the public image optimizer. */
"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { X } from "lucide-react";
import {
  CLIENT_GALLERY_LAYOUTS,
  CLIENT_THEMES,
  clientGalleryLayoutLabel,
  resolveClientGalleryLayout,
  type ClientGalleryLayout,
  type ClientImage,
  type ClientTheme,
} from "../../../shared/client-galleries";
import { privateImageUrl } from "../../albuns/components/routes";
import { themeTokens } from "../../albuns/components/theme";

const THEME_LABELS: Record<ClientTheme, string> = {
  noir: "Noir",
  ivory: "Ivory",
  warm: "Warm",
};

type Props = {
  open: boolean;
  onClose: () => void;
  galleryId: string;
  galleryTitle: string;
  introduction: string;
  theme: ClientTheme;
  layoutPreset: ClientGalleryLayout;
  allowDownloads: boolean;
  images: ClientImage[];
  clientName: string;
  onChangeTheme?: (theme: ClientTheme) => void;
  onChangeLayout?: (layout: ClientGalleryLayout) => void;
};

export function PrivateGalleryClientPreview({
  open,
  onClose,
  galleryId,
  galleryTitle,
  introduction,
  theme,
  layoutPreset,
  allowDownloads,
  images,
  clientName,
  onChangeTheme,
  onChangeLayout,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const readyImages = images.filter((img) => img.status === "ready");
  const resolvedLayout = resolveClientGalleryLayout(layoutPreset);
  const firstName = clientName.trim().split(/\s+/)[0] || "Cliente";

  return (
    <dialog
      ref={dialogRef}
      className="pga-preview-dialog"
      aria-labelledby="pga-preview-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="pga-preview-toolbar">
        <div>
          <strong id="pga-preview-title">
            Prévia como cliente · {clientName || "Cliente"}
          </strong>
          <span className="pga-preview-meta">
            Rascunho interativo · {readyImages.length}{" "}
            {readyImages.length === 1 ? "foto pronta" : "fotos prontas"} ·{" "}
            {allowDownloads ? "Downloads liberados" : "Somente visualização"}
          </span>
        </div>
        <div className="pga-preview-controls">
          {onChangeLayout && (
            <label className="pga-preview-select-label">
              Template
              <select
                value={resolvedLayout}
                onChange={(e) =>
                  onChangeLayout(e.target.value as ClientGalleryLayout)
                }
              >
                {CLIENT_GALLERY_LAYOUTS.map((preset) => (
                  <option key={preset} value={preset}>
                    {clientGalleryLayoutLabel(preset)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onChangeTheme && (
            <label className="pga-preview-select-label">
              Tema
              <select
                value={theme}
                onChange={(e) => onChangeTheme(e.target.value as ClientTheme)}
              >
                {CLIENT_THEMES.map((t) => (
                  <option key={t} value={t}>
                    {THEME_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            className="button secondary small"
            onClick={onClose}
          >
            <X size={15} aria-hidden="true" /> Fechar prévia
          </button>
        </div>
      </div>

      <div
        className="pga-preview-stage"
        tabIndex={0}
        role="region"
        aria-label="Conteúdo da galeria em pré-visualização"
        style={themeTokens(theme) as CSSProperties}
        data-layout-preset={resolvedLayout}
      >
        <header className="pga-preview-client-header">
          <span>PUNCTUM PICTURE</span>
          <span>Olá, {firstName} · Pré-visualização</span>
        </header>
        <div className="pga-preview-body">
          <p className="pga-preview-eyebrow">
            Uma coleção só sua · {clientGalleryLayoutLabel(resolvedLayout)}
          </p>
          <h3>{galleryTitle || "Sem título"}</h3>
          {introduction.trim() && (
            <p className="pga-preview-intro">{introduction}</p>
          )}
          <div className="pga-preview-bar">
            <span>Todas ({readyImages.length})</span>
            <span>
              {allowDownloads
                ? "Downloads originais habilitados"
                : "Somente visualização"}
            </span>
          </div>
          {readyImages.length === 0 ? (
            <p className="pga-preview-empty">
              Nenhuma fotografia pronta enviada ainda para exibir nesta prévia.
            </p>
          ) : (
            <div className="pga-preview-grid">
              {readyImages.map((image, index) => (
                <figure className="pga-preview-photo" key={image.id}>
                  <img
                    src={privateImageUrl(galleryId, image.id, "gallery", true)}
                    alt={image.altText || image.originalFilename}
                    loading="lazy"
                  />
                  <figcaption>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      ♡{allowDownloads ? " · ↓" : ""}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
