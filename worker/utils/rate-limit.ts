import { AppError } from "./errors";

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function assertRateLimit(
  request: Request,
  db: D1Database,
  scope: string,
  max: number,
  windowSeconds: number,
): Promise<void> {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const now = new Date();
  const expires = new Date(now.getTime() + windowSeconds * 1000);
  const bucketKey = await digest(`${scope}:${ip}`);

  const bucket = await db
    .prepare(
      `INSERT INTO rate_limit_buckets (bucket_key, request_count, window_started_at, expires_at)
       VALUES (?, 1, ?, ?)
       ON CONFLICT(bucket_key) DO UPDATE SET
         request_count = CASE
           WHEN rate_limit_buckets.expires_at <= ? THEN 1
           ELSE rate_limit_buckets.request_count + 1
         END,
         window_started_at = CASE
           WHEN rate_limit_buckets.expires_at <= ? THEN excluded.window_started_at
           ELSE rate_limit_buckets.window_started_at
         END,
         expires_at = CASE
           WHEN rate_limit_buckets.expires_at <= ? THEN excluded.expires_at
           ELSE rate_limit_buckets.expires_at
         END
       WHERE rate_limit_buckets.expires_at <= ?
          OR rate_limit_buckets.request_count < ?
       RETURNING request_count AS requestCount`,
    )
    .bind(
      bucketKey,
      now.toISOString(),
      expires.toISOString(),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
      now.toISOString(),
      max,
    )
    .first<{ requestCount: number }>();

  if (!bucket || bucket.requestCount > max) {
    throw new AppError(429, "RATE_LIMITED", "Muitas tentativas. Aguarde um pouco e tente novamente.");
  }
}
