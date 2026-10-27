import type { EditorialConfig, HomeSectionConfig } from "../../../shared/config";
import { EditorialText } from "../../components/EditorialText";
import { homeSectionAttributes } from "./section-attributes";

export function HomeStatementSection({
  copy,
  section,
}: {
  copy: EditorialConfig["home"]["statement"];
  section: HomeSectionConfig;
}) {
  const variant = section.variant;

  if (variant === "centered") {
    return (
      <section
        className="visual-thesis visual-thesis-centered reveal"
        aria-labelledby="thesis-title"
        {...homeSectionAttributes(section)}
      >
        <div className="thesis-centered-inner">
          <p className="eyebrow">{copy.eyebrow}</p>
          <div className="thesis-divider-top" aria-hidden="true" />
          <h2 id="thesis-title">
            <EditorialText text={copy.title} />
          </h2>
          <p className="thesis-centered-body">{copy.body}</p>
          <div className="thesis-divider-bottom" aria-hidden="true" />
        </div>
      </section>
    );
  }

  // Default: manifesto
  return (
    <section
      className="visual-thesis visual-thesis-manifesto reveal"
      aria-labelledby="thesis-title"
      {...homeSectionAttributes(section)}
    >
      <div className="thesis-ambient-glow" aria-hidden="true" />
      <div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h2 id="thesis-title">
          <EditorialText text={copy.title} />
        </h2>
      </div>
      <div className="thesis-body-column">
        <p>{copy.body}</p>
        <div className="thesis-colophon-tag">
          <span>Maria Helena · Fotógrafa</span>
          <span>Região Sul do Brasil</span>
        </div>
      </div>
    </section>
  );
}
