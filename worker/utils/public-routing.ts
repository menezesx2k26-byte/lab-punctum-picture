import { withSecurityHeaders } from "./response";
import {
  PUNCTUM_EXTRA_ALLOWED_IMAGE_WIDTHS,
  buildAllowedImageWidths,
} from "../../shared/punctum-image-widths.mjs";

export const EXTRA_ALLOWED_IMAGE_WIDTHS = PUNCTUM_EXTRA_ALLOWED_IMAGE_WIDTHS;
export const INVALID_IMAGE_SOURCE_MESSAGE = "A origem da imagem é inválida.";

export { buildAllowedImageWidths };

export function maybeRedirectLegacyPublicRoute(url: URL): Response | null {
  if (url.pathname === "/sobre") {
    return withSecurityHeaders(
      Response.redirect(new URL("/#sobre", url.origin), 308),
    );
  }
  return null;
}
