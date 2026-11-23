import Image from "next/image";
import Link from "next/link";
import {
  SITE_DEFAULTS,
  type PublicSiteSettings,
} from "../../shared/public-content";
import {
  PUNCTUM_DEFAULT_EDITORIAL_CONFIG,
  type EditorialConfig,
} from "../../shared/config";
import {
  getPublicVisualAsset,
  getSiteHeaderClassName,
} from "../lib/public-visuals";
import { WhatsAppLink } from "./WhatsAppLink";

export function SiteHeader({
  dark = false,
  site = SITE_DEFAULTS,
  editorial = PUNCTUM_DEFAULT_EDITORIAL_CONFIG,
}: {
  dark?: boolean;
  site?: PublicSiteSettings;
  editorial?: EditorialConfig;
}) {
  const logo = getPublicVisualAsset("logo");

  return (
    <header className={getSiteHeaderClassName(dark)}>
      <a className="skip-link" href="#conteudo">Ir para o conteúdo</a>
      <Link href="/" className="wordmark" aria-label={`${site.brandName} — início`}>
        <span className="wordmark-art" aria-hidden="true">
          <Image
            src={logo.src}
            alt={logo.alt}
            width={logo.width}
            height={logo.height}
            sizes="(max-width: 700px) 65px, 90px"
            priority
          />
        </span>
      </Link>
      <span className="header-author">Fotografias por Maria Helena</span>
      <nav className="site-nav" aria-label="Navegação principal">
        <Link href="/portfolio">{editorial.chrome.navigation.portfolio}</Link>
        <Link href="/arquivo">{editorial.chrome.navigation.archive}</Link>
        <Link href="/#sobre">{editorial.chrome.navigation.about}</Link>
        <Link href="/albuns/entrar" prefetch={false} className="nav-client-cta">
          Área do cliente
        </Link>
        <Link href="/contato" className="nav-cta">
          {editorial.chrome.navigation.contact}
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter({
  site = SITE_DEFAULTS,
  editorial = PUNCTUM_DEFAULT_EDITORIAL_CONFIG,
}: {
  site?: PublicSiteSettings;
  editorial?: EditorialConfig;
}) {
  return (
    <>
      <footer className="site-footer">
        <div>
          <span className="footer-wordmark">{site.brandName}</span>
          <p>{editorial.chrome.footer.tagline}</p>
        </div>
        <nav aria-label="Navegação do rodapé">
          <Link href="/portfolio">{editorial.chrome.footer.stories}</Link>
          <Link href="/arquivo">{editorial.chrome.footer.archive}</Link>
          <Link href="/#sobre">Sobre Maria Helena</Link>
          <Link href="/servicos">O que fotografo</Link>
          <Link href="/fotografia">Onde fotografo</Link>
          <Link href="/contato">{editorial.chrome.footer.contact}</Link>
          <Link href="/albuns/entrar" prefetch={false}>
            Área do cliente
          </Link>
          <Link href="/acesso" prefetch={false} className="footer-studio-link">
            Entrar no estúdio
          </Link>
          {site.instagramUrl ? (
            <a href={site.instagramUrl} target="_blank" rel="noreferrer">
              {editorial.chrome.footer.instagram}
            </a>
          ) : null}
          {site.contactEmail ? (
            <a href={`mailto:${site.contactEmail}`}>{editorial.chrome.footer.email}</a>
          ) : null}
        </nav>
        <span>© {new Date().getFullYear()} · {editorial.chrome.footer.credit}</span>
      </footer>
      <WhatsAppLink variant="floating" site={site} label={editorial.chrome.whatsappCta} />
    </>
  );
}
