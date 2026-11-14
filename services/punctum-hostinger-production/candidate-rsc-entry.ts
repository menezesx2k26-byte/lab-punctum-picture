import punctum from "../../worker/index";
import { env } from "./candidate-bindings";
import { candidateConfig } from "./candidate-runtime.mjs";
import { publicPaths } from "../punctum-hostinger-node/public-files";

const context = {
  waitUntil(task: Promise<unknown>) {
    void task.catch(() => console.error("Production candidate deferred operation failed"));
  },
} as ExecutionContext;

function buildForwardedRequest(request: Request, cfg: ReturnType<typeof candidateConfig>): Request {
  const incomingUrl = new URL(request.url);
  const target = new URL(cfg.publicOrigin);
  target.pathname = incomingUrl.pathname;
  target.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  // Never trust client-supplied Cloudflare edge headers on Hostinger origin.
  headers.delete("cf-connecting-ip");
  headers.delete("cf-ray");
  headers.delete("cf-visitor");

  if (cfg.trustedProxy === "caddy") {
    const trustedIp =
      headers.get("x-real-ip")?.trim() ||
      headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (trustedIp) {
      headers.set("cf-connecting-ip", trustedIp);
    }
  }
  return new Request(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    // @ts-expect-error duplex is required in Node 24 for streaming Request bodies
    duplex: request.method === "GET" || request.method === "HEAD" ? undefined : "half",
  });
}

export default async function fetchCandidate(request: Request): Promise<Response> {
  const cfg = candidateConfig();
  const url = new URL(request.url);
  const allowedHosts = new Set([cfg.origin.host, cfg.publicOrigin.host]);
  if (!allowedHosts.has(url.host)) {
    return new Response(null, { status: 421, headers: { "Cache-Control": "no-store" } });
  }

  if (publicPaths.has(url.pathname)) {
    const staticHeaders: Record<string, string> = {
      "x-vinext-static-file": encodeURIComponent(url.pathname),
      "X-Content-Type-Options": "nosniff",
    };
    if (cfg.environment !== "production") {
      staticHeaders["X-Robots-Tag"] = "noindex, nofollow, noarchive";
    }
    return new Response(null, { headers: staticHeaders });
  }

  const forwarded = buildForwardedRequest(request, cfg);
  const response = await punctum.fetch(forwarded, env, context);
  const headers = new Headers(response.headers);

  if (!headers.has("X-Content-Type-Options")) {
    headers.set("X-Content-Type-Options", "nosniff");
  }
  if (!headers.has("Referrer-Policy")) {
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  }
  if (!headers.has("X-Frame-Options")) {
    headers.set("X-Frame-Options", "DENY");
  }
  if (cfg.environment === "production" && request.headers.get("x-forwarded-proto") === "https") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  if (cfg.environment !== "production") {
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (!headers.has("Cache-Control")) {
      headers.set("Cache-Control", "private, no-store");
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
