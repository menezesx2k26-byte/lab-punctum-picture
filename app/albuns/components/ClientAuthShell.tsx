import type { ReactNode } from "react";
import { SiteThemeRoot } from "../../components/SiteThemeRoot";
import { PUNCTUM_DEFAULT_SITE_CONFIG } from "../../../shared/config";
import "../auth.css";

/**
 * The entry screen uses the same published design tokens as the public site.
 * Keep this shell outside authenticated gallery routes and auth APIs.
 */
export function ClientAuthShell({
  children,
  config = PUNCTUM_DEFAULT_SITE_CONFIG,
}: {
  children: ReactNode;
  config?: unknown;
}) {
  return (
    <SiteThemeRoot
      config={config}
      ambientCursor={false}
      className="pa-auth-shell"
    >
      {children}
    </SiteThemeRoot>
  );
}
