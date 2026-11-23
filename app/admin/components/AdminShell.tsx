import { Camera, ExternalLink } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { env } from "cloudflare:workers";
import {
  AdminMobileNav,
  AdminSidebarNav,
  type AdminNavLinkItem,
} from "./AdminNavLinks";
import "./private-gallery-admin.css";

const baseNavigation: AdminNavLinkItem[] = [
  { href: "/admin", label: "Visão geral", mobileLabel: "Início", iconKey: "dashboard", group: "site" },
  { href: "/admin/studio", label: "Studio do site", mobileLabel: "Studio", iconKey: "studio", group: "site" },
  { href: "/admin/ensaios", label: "Ensaios públicos", mobileLabel: "Ensaios", iconKey: "ensaios", group: "site" },
  { href: "/admin/categorias", label: "Categorias", iconKey: "categorias", group: "site" },
  { href: "/admin/contatos", label: "Contatos", iconKey: "contatos", group: "site" },
  { href: "/admin/configuracoes", label: "Configurações", mobileLabel: "Config.", iconKey: "configuracoes", group: "site" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const privateEnabled =
    Reflect.get(env, "PRIVATE_GALLERIES_ENABLED") === "true";
  const links: AdminNavLinkItem[] = privateEnabled
    ? [
        ...baseNavigation,
        {
          href: "/admin/clientes",
          label: "Clientes e acessos",
          mobileLabel: "Clientes",
          iconKey: "clientes",
          group: "clients",
        },
        {
          href: "/admin/albuns-privados",
          label: "Álbuns privados",
          mobileLabel: "Privados",
          iconKey: "privados",
          group: "clients",
        },
      ]
    : baseNavigation;
  const clerkPublishableKeyRaw =
    Reflect.get(env, "CLERK_PUBLISHABLE_KEY") ??
    Reflect.get(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const adminAuthMode = Reflect.get(env, "ADMIN_AUTH_MODE");
  const clerkAuthEnabled =
    Reflect.get(env, "CLERK_AUTH_ENABLED") === "true" ||
    adminAuthMode === "clerk" ||
    adminAuthMode === "hybrid";
  const clerkPublishableKey =
    clerkAuthEnabled &&
    typeof clerkPublishableKeyRaw === "string" &&
    clerkPublishableKeyRaw
      ? clerkPublishableKeyRaw
      : undefined;
  const authNote =
    adminAuthMode === "clerk"
      ? "Sessão protegida pelo Clerk"
      : adminAuthMode === "hybrid"
        ? "Sessão Clerk ou senha"
        : adminAuthMode === "access"
          ? "Sessão Cloudflare Access"
          : "Sessão protegida por senha";
  return (
    <div className="admin-body">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <Link href="/admin" className="wordmark">
            <Camera size={16} aria-hidden="true" />
            Punctum Picture
          </Link>
          <AdminSidebarNav items={links} />
          <div className="admin-sidebar-bottom">
            <p>
              Painel de Maria Helena
              <br />
              {authNote}
            </p>
            <Link
              href="/"
              className="admin-public-link"
              target="_blank"
              rel="noreferrer"
            >
              Ver site público <ExternalLink size={13} aria-hidden="true" />
            </Link>
          </div>
          <LogoutButton clerkPublishableKey={clerkPublishableKey} />
        </aside>
        <main className="admin-main">{children}</main>
        <AdminMobileNav items={links} expanded={privateEnabled} />
      </div>
    </div>
  );
}
