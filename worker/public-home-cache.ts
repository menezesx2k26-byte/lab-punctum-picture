/** Strict allowlist for Cloudflare's pre-invocation Workers Cache entrypoint.
 * This entrypoint must never be used for admin, client, RSC, API or personalized data.
 */
export function isPublicHomeCacheRequest(request: Request): boolean {
  const url = new URL(request.url);
  const headers = request.headers;
  if (request.method !== "GET" || url.pathname !== "/" || url.search || url.hash ||
      url.username || url.password || !["http:", "https:"].includes(url.protocol)) return false;
  const accept = (headers.get("accept") ?? "").toLowerCase();
  // A mere substring match accepts `text/html;q=0`, where HTML was explicitly
  // rejected. Treat the shared HTML entry as ineligible for that variant.
  const acceptsHtml = accept.split(",").some(entry => {
    const [kind, ...params] = entry.trim().split(";");
    if (kind.trim() !== "text/html") return false;
    const quality = params.map(part => part.trim()).find(part => /^q\s*=/.test(part));
    if (!quality) return true;
    const weight = Number(quality.split("=")[1]?.trim());
    return Number.isFinite(weight) && weight > 0 && weight <= 1;
  });
  if (!acceptsHtml) return false;
  // Client cache-bypass directives and conditional/range requests are not
  // ordinary anonymous HTML navigations. A shared cache entry cannot
  // represent their validators, byte ranges or proxy rewrite contexts.
  const cacheControl = headers.get("cache-control") ?? "";
  if (/\b(?:no-store|no-cache)\b/i.test(cacheControl) ||
      cacheControl.split(",").some(part => /^max-age\s*=\s*0+\s*$/i.test(part.trim())) ||
      /\bno-cache\b/i.test(headers.get("pragma") ?? "")) return false;
  for (const name of ["cookie", "authorization", "proxy-authorization",
    "cf-access-jwt-assertion", "cf-access-authenticated-user-email",
    "x-forwarded-user", "x-forwarded-email", "x-auth-user", "x-user-email",
    "x-api-key", "x-ms-client-principal", "x-client-id", "x-session-token",
    "x-authenticated-user", "x-forwarded-access-token",
    "x-forwarded-authorization", "x-forwarded-cookie", "x-client-session",
    "rsc", "next-router-state-tree", "next-router-prefetch", "next-url",
    "purpose", "sec-purpose", "x-nextjs-data", "x-middleware-prefetch",
    "range", "if-range", "if-match", "if-none-match",
    "if-modified-since", "if-unmodified-since",
    "x-forwarded-host", "x-original-url", "x-rewrite-url",
    "forwarded", "origin"]) {
    if (headers.has(name)) return false;
  }
  return true;
}

export function publicHomeCacheResponse(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const current = headers.get("Cache-Control") ?? "";
  // A public cache entrypoint must not retain or echo credential and identity
  // metadata mistakenly emitted by an upstream response. Header-based private
  // identity is sufficient to fail closed even when the body is HTML 200.
  const sensitiveResponseHeaders = [
    "Set-Cookie", "Set-Cookie2", "WWW-Authenticate", "Authentication-Info",
    "Proxy-Authentication-Info", "CF-Access-Jwt-Assertion",
    "CF-Access-Authenticated-User-Email", "X-Client-Identity",
    "X-Session-Token", "X-Authenticated-User", "X-Client-Id",
    "X-Forwarded-User", "X-Forwarded-Authorization",
    "X-Forwarded-Cookie", "X-Client-Session",
  ];
  const hasIdentityResponseHeader = sensitiveResponseHeaders.some(name => headers.has(name));
  // A CSP nonce is a per-response secret. Sharing that HTML/CSP pair across
  // anonymous requests would turn a one-response nonce into a reusable value.
  const hasPerResponseNonce = ["Content-Security-Policy",
    "Content-Security-Policy-Report-Only"].some(name =>
    /['"]nonce-[a-z0-9+/_=-]+['"]/i.test(headers.get(name) ?? ""));
  // Vinext emits this exact framework default on anonymous HTML too.
  // Replace it only inside this narrowly constrained public homepage entrypoint.
  const frameworkDefault = /^no-store,\s*must-revalidate$/i.test(current.trim());
  // Cache keys cannot safely represent arbitrary variants (language, origin,
  // identity, user-agent). Only the known Vinext negotiation variants and
  // transport encoding are eligible for the anonymous public home.
  const allowedVary = new Set(["rsc", "accept", "next-router-state-tree",
    "next-router-prefetch", "accept-encoding"]);
  const unaccountedVary = (headers.get("Vary") ?? "").split(",")
    .map(part => part.trim().toLowerCase()).filter(Boolean)
    .some(part => !allowedVary.has(part));
  const sensitive = hasIdentityResponseHeader || hasPerResponseNonce ||
    (!frameworkDefault && /\b(?:private|no-store|no-cache)\b/i.test(current)) ||
    unaccountedVary;
  const safe = isPublicHomeCacheRequest(request) && response.status === 200 &&
    headers.get("Content-Type")?.toLowerCase().startsWith("text/html") && !sensitive;
  // Never retain alternative surrogate/CDN caching directives from upstream:
  // they can override the fail-closed Cache-Control on denials, or defeat the
  // 60s public-home window even when the response itself is anonymous.
  for (const name of ["CDN-Cache-Control", "Surrogate-Control", "Expires", "Age"])
    headers.delete(name);
  for (const name of sensitiveResponseHeaders) headers.delete(name);
  // Browser always revalidates, while the named Cloudflare cache holds public HTML
  // for 60s. A Studio purge therefore cannot leave a browser-local 60s copy.
  headers.set("Cache-Control", safe ? "public, max-age=0, must-revalidate" : "private, no-store");
  if (safe) headers.set("Cloudflare-CDN-Cache-Control", "public, max-age=60");
  else headers.delete("Cloudflare-CDN-Cache-Control");
  if (safe) headers.set("Cache-Tag", PUBLIC_HOME_CACHE_TAG);
  else headers.delete("Cache-Tag");
  // The public site is short-lived to reflect Studio publication changes.
  // No stale-while-revalidate, no arbitrary query key explosion.
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers
  });
}

export const PUBLIC_HOME_CACHE_TAG = "punctum-public-home-v1";

/** A successful publication can affect the cached public homepage.
 * Draft edits, private albums, payments and contact/inquiry mutations never purge it.
 */
export function isPublicHomeMutationRequest(request: Request): boolean {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return false;
  const path = new URL(request.url).pathname;
  if (["/admin/api/studio/publish", "/admin/api/studio/publish-visual",
    "/admin/api/studio/restore"].includes(path)) return request.method === "POST";
  if (path === "/admin/api/settings") return request.method === "PATCH";
  if (path === "/admin/api/albums" || path === "/admin/api/categories") return true;
  if (/^\/admin\/api\/(?:albums|categories|images)\/[^/]+(?:\/(?:publish|archive|reorder|cover))?$/.test(path)) return true;
  if (/^\/admin\/api\/uploads\/[^/]+\/complete$/.test(path)) return request.method === "POST";
  if (/^\/admin\/api\/site-media\/[^/]+\/complete$/.test(path)) return request.method === "POST";
  return false;
}

export function shouldPurgePublicHome(request: Request, response: Response): boolean {
  return response.ok && isPublicHomeMutationRequest(request);
}
