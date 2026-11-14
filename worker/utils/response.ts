import { AppError, asAppError } from "./errors";

const SECURITY_HEADERS = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} satisfies Record<string, string>;

export function json(
  data: unknown,
  init: ResponseInit & { admin?: boolean } = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (init.admin) {
    headers.set("Cache-Control", "no-store");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function apiError(error: unknown, requestId = crypto.randomUUID()): Response {
  const appError = asAppError(error);
  if (!(error instanceof AppError)) {
    console.error(
      JSON.stringify({
        message: "Erro não tratado",
        requestId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  return json(
    {
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.field ? { field: appError.field } : {}),
        requestId,
      },
    },
    { status: appError.status, admin: appError.status !== 404 },
  );
}

export function withSecurityHeaders(
  response: Response,
  options: { studioPreview?: boolean; clerkIssuer?: string } = {},
): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) {
      headers.set(name, value);
    }
  }
  const frameAncestors = options.studioPreview ? "'self'" : "'none'";
  const issuer = options.clerkIssuer ?? "";
  const clerk = /^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(issuer);
  const challenges = "https://challenges.cloudflare.com https://*.protect.clerk.com";
  headers.set("X-Frame-Options", options.studioPreview ? "SAMEORIGIN" : "DENY");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `img-src 'self' data: blob:${clerk ? " https://img.clerk.com" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${clerk ? ` ${issuer} ${challenges}` : ""}`,
      `connect-src 'self' https://*.r2.cloudflarestorage.com${clerk ? ` ${issuer} https://*.protect.clerk.com:*` : ""}`,
      `frame-ancestors ${frameAncestors}`,
      "base-uri 'self'",
      "form-action 'self'",
      ...(clerk ? [`frame-src 'self' ${challenges}`, "worker-src 'self' blob:"] : []),
    ].join("; "),
  );
  if (options.studioPreview) {
    headers.set("Cache-Control", "private, no-store, max-age=0");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
