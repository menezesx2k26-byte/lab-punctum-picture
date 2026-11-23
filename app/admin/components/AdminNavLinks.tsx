"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Camera,
  FolderHeart,
  Inbox,
  LayoutDashboard,
  Settings,
  Sparkles,
  Tags,
  Users,
} from "lucide-react";

const ICON_MAP = {
  dashboard: LayoutDashboard,
  ensaios: FolderHeart,
  categorias: Tags,
  contatos: Inbox,
  studio: Sparkles,
  configuracoes: Settings,
  clientes: Users,
  privados: Camera,
} as const;

export type AdminNavIconKey = keyof typeof ICON_MAP;

export type AdminNavLinkItem = {
  href: string;
  label: string;
  mobileLabel?: string;
  iconKey: AdminNavIconKey;
  group: "site" | "clients";
};

function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export function AdminSidebarNav({ items }: { items: AdminNavLinkItem[] }) {
  const pathname = usePathname() ?? "";
  const siteItems = items.filter((item) => item.group === "site");
  const clientItems = items.filter((item) => item.group === "clients");

  return (
    <nav aria-label="Painel">
      <div className="admin-nav-group">
        <span className="admin-nav-group-label">Site &amp; Portfólio</span>
        {siteItems.map((item) => {
          const Icon = ICON_MAP[item.iconKey];
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={active ? "is-active" : undefined}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </div>
      {clientItems.length > 0 && (
        <div className="admin-nav-group">
          <span className="admin-nav-group-label">Entrega a Clientes</span>
          {clientItems.map((item) => {
            const Icon = ICON_MAP[item.iconKey];
            const active = isActiveRoute(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "is-active" : undefined}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={17} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}

export function AdminMobileNav({
  items,
  expanded,
}: {
  items: AdminNavLinkItem[];
  expanded: boolean;
}) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      className={
        "mobile-admin-nav" +
        (expanded ? " private-gallery-mobile-nav" : "")
      }
      aria-label="Painel no celular"
    >
      {items.map((item) => {
        const Icon = ICON_MAP[item.iconKey];
        const active = isActiveRoute(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={19} aria-hidden="true" />
            <span>{item.mobileLabel ?? item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
