/** Strict allowlist for Cloudflare's pre-invocation Workers Cache entrypoint.
 * This entrypoint must never be used for admin, client, RSC, API or personalized data.
 */
export function isPublicHomeCacheRequest(request: Request): boolean {
  const url = new URL(request.url);
  const headers = request.headers;
  if (request.method !== "GET" || url.pathname !== "/" || url.search || url.hash ||
      url.username || url.password || !["http:", "https:"].includes(url.protocol)) return false;
  const accept = headers.get("accept") ?? "";
  if (!accept.toLowerCase().includes("text/html")) return false;
  for (const name of ["cookie", "authorization", "cf-access-jwt-assertion",
    "rsc", "next-router-state-tree", "next-router-prefetch", "next-url",
    "purpose", "sec-purpose", "x-nextjs-data", "x-middleware-prefetch"]) {
    if (headers.has(name)) return false;
  }
  return true;
}

export function publicHomeCacheResponse(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const current = headers.get("Cache-Control") ?? "";
  // Vinext emits this exact framework default on anonymous HTML too.
  // Replace it only inside this narrowly constrained public homepage entrypoint.
  const frameworkDefault = /^no-store,\s*must-revalidate$/i.test(current.trim());
  const sensitive = headers.has("Set-Cookie") || headers.has("WWW-Authenticate") ||
    (!frameworkDefault && /\b(?:private|no-store|no-cache)\b/i.test(current)) ||
    (headers.get("Vary") ?? "").split(",").some(part => ["*", "cookie", "authorization"].includes(part.trim().toLowerCase()));
  const safe = isPublicHomeCacheRequest(request) && response.status === 200 &&
    headers.get("Content-Type")?.toLowerCase().startsWith("text/html") && !sensitive;
  headers.set("Cache-Control", safe ? "public, max-age=60" : "private, no-store");
  // The public site is short-lived to reflect Studio publication changes.
  // No stale-while-revalidate, no arbitrary query key explosion.
  return new Response(response.body, {
    status: response.status, statusText: response.statusText, headers
  });
}
