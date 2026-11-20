import {
  Camera,
  FolderHeart,
  Inbox,
  LayoutDashboard,
  Settings,
  Sparkles,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "./LogoutButton";
import { env } from "cloudflare:workers";
import "./private-gallery-admin.css";

const navigation = [
  { href: "/admin", label: "Visão geral", icon: LayoutDashboard },
  { href: "/admin/ensaios", label: "Ensaios", icon: FolderHeart },
  { href: "/admin/categorias", label: "Categorias", icon: Tags },
  { href: "/admin/contatos", label: "Contatos", icon: Inbox },
  { href: "/admin/studio", label: "Studio", icon: Sparkles },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const links=Reflect.get(env,"PRIVATE_GALLERIES_ENABLED")==="true" ? [...navigation,
    {href:"/admin/clientes",label:"Clientes",icon:FolderHeart},
    {href:"/admin/albuns-privados",label:"Álbuns privados",icon:Camera}] : navigation;
  const clerkPublishableKeyRaw =
    Reflect.get(env, "CLERK_PUBLISHABLE_KEY") ??
    Reflect.get(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const clerkAuthEnabled =
    Reflect.get(env, "CLERK_AUTH_ENABLED") === "true" ||
    Reflect.get(env, "ADMIN_AUTH_MODE") === "clerk" ||
    Reflect.get(env, "ADMIN_AUTH_MODE") === "hybrid";
  const clerkPublishableKey =
    clerkAuthEnabled && typeof clerkPublishableKeyRaw === "string" && clerkPublishableKeyRaw
      ? clerkPublishableKeyRaw
      : undefined;
  return (
    <div className="admin-body">
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <Link href="/admin" className="wordmark">
            <Camera size={16} aria-hidden="true" />
            Punctum Picture
          </Link>
          <nav aria-label="Painel">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <Icon size={17} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
          <p className="admin-sidebar-bottom">
            Painel de Maria Helena
            <br />
            Sessão protegida por senha
          </p>
          <LogoutButton clerkPublishableKey={clerkPublishableKey} />
        </aside>
        <main className="admin-main">{children}</main>
        <nav className={"mobile-admin-nav"+(links.length>navigation.length?" private-gallery-mobile-nav":"")} aria-label="Painel no celular">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <Icon size={19} aria-hidden="true" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
