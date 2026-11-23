import {
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
  parseImageParams,
} from "vinext/server/image-optimization";
import { buildAllowedImageWidths } from "../../shared/punctum-image-widths.mjs";

const defaultWidthSet = new Set([
  0,
  ...DEFAULT_DEVICE_SIZES,
  ...DEFAULT_IMAGE_SIZES,
]);

export const PUNCTUM_CANDIDATE_ALLOWED_IMAGE_WIDTHS = Object.freeze(
  buildAllowedImageWidths(DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES),
);

export function normalizeCandidateImageRequestUrl(
  rawUrl,
  allowedWidths = PUNCTUM_CANDIDATE_ALLOWED_IMAGE_WIDTHS,
) {
  if (typeof rawUrl !== "string" || !rawUrl.startsWith("/") || rawUrl.startsWith("//")) {
    return rawUrl;
  }
  let parsed;
  try {
    parsed = new URL(rawUrl, "http://localhost");
  } catch {
    return rawUrl;
  }
  if (parsed.pathname !== "/_vinext/image") {
    return rawUrl;
  }
  if (parsed.searchParams.getAll("w").length !== 1) {
    return rawUrl;
  }
  const params = parseImageParams(parsed, allowedWidths);
  if (!params || defaultWidthSet.has(params.width)) {
    return rawUrl;
  }
  parsed.searchParams.set("w", "0");
  return parsed.pathname + parsed.search;
}

export function installCandidateImageWidthCompatibility(
  server,
  allowedWidths = PUNCTUM_CANDIDATE_ALLOWED_IMAGE_WIDTHS,
) {
  const listeners = server.listeners("request");
  if (listeners.length === 0) return;
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    if (typeof req.url === "string") {
      req.url = normalizeCandidateImageRequestUrl(req.url, allowedWidths);
    }
    for (const listener of listeners) {
      listener.call(server, req, res);
    }
  });
}
