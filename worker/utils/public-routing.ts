import { withSecurityHeaders } from "./response";

export const EXTRA_ALLOWED_IMAGE_WIDTHS = [1254] as const;
export const INVALID_IMAGE_SOURCE_MESSAGE = "A origem da imagem é inválida.";

export function buildAllowedImageWidths(
  deviceSizes: readonly number[],
  imageSizes: readonly number[],
): number[] {
  return Array.from(
    new Set([...deviceSizes, ...imageSizes, ...EXTRA_ALLOWED_IMAGE_WIDTHS]),
  );
}

export function maybeRedirectLegacyPublicRoute(url: URL): Response | null {
  if (url.pathname === "/sobre") {
    return withSecurityHeaders(
      Response.redirect(new URL("/#sobre", url.origin), 308),
    );
  }
  return null;
}
