"use client";

import {
  CLIENT_GALLERY_TEMPLATE_OPTIONS,
  type ClientGalleryLayout,
} from "../../../shared/client-galleries";

type Props = {
  value: ClientGalleryLayout;
  onChange: (value: ClientGalleryLayout) => void;
};

export function PrivateGalleryTemplatePicker({ value, onChange }: Props) {
  return (
    <fieldset className="pga-template-picker pga-wide">
      <legend>Template do álbum</legend>
      <p className="pga-template-help">Escolha um dos cinco estilos prontos. A ordem e os arquivos das fotos não mudam.</p>
      <div className="pga-template-grid" role="group" aria-label="Modelos de apresentação do álbum">
        {CLIENT_GALLERY_TEMPLATE_OPTIONS.map(({ id, label, description }) => (
          <button
            key={id}
            type="button"
            className={`pga-template-card${value === id ? " selected" : ""}`}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            <span className={`pga-template-preview pga-template-preview--${id}`} aria-hidden="true">
              <i /><i /><i /><i />
            </span>
            <strong>{label}</strong>
            <small>{description}</small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
