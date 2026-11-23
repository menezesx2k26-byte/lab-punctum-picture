import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb } from "./client-fixture";
import { AppError } from "../../worker/utils/errors";
import { assertRateLimit } from "../../worker/utils/rate-limit";

function statementBarrier(db: D1Database, count: number): D1Database {
  let firstCalls = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });

  function wrap(statement: D1PreparedStatement): D1PreparedStatement {
    return new Proxy(statement, {
      get(target, property) {
        if (property === "bind")
          return (...args: unknown[]) =>
            wrap(Reflect.apply(target.bind, target, args));
        if (property === "first")
          return async (...args: unknown[]) => {
            const result = await Reflect.apply(target.first, target, args);
            if (firstCalls < count) {
              firstCalls++;
              if (firstCalls === count) release();
              await barrier;
            }
            return result;
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  return new Proxy(db, {
    get(target, property) {
      if (property === "prepare")
        return (sql: string) =>
          wrap(Reflect.apply(target.prepare, target, [sql]));
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function bucketKey(scope: string, ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${scope}:${ip}`);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

describe("shared rate limit", () => {
  beforeAll(bootstrapPrivateDb);

  it("enforces the limit when requests for a new bucket arrive concurrently", async () => {
    const ip = "203.0.113.48";
    const scope = `rate-limit-concurrency:${crypto.randomUUID()}`;
    const key = await bucketKey(scope, ip);
    const request = new Request("https://punctumpicture.com/api/test", {
      headers: { "cf-connecting-ip": ip },
    });
    const concurrentRequests = 8;
    const db = statementBarrier(env.DB, concurrentRequests);

    try {
      const results = await Promise.allSettled(
        Array.from({ length: concurrentRequests }, () =>
          assertRateLimit(request, db, scope, 2, 60),
        ),
      );

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
      const rejected = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      expect(rejected).toHaveLength(concurrentRequests - 2);
      expect(rejected.every(({ reason }) => reason instanceof AppError && reason.status === 429)).toBe(true);
      await expect(assertRateLimit(request, db, scope, 2, 60)).rejects.toMatchObject({
        status: 429,
      });
      expect(
        await env.DB.prepare(
          "SELECT request_count AS requestCount FROM rate_limit_buckets WHERE bucket_key = ?",
        )
          .bind(key)
          .first<{ requestCount: number }>(),
      ).toEqual({ requestCount: 2 });
    } finally {
      await env.DB.prepare("DELETE FROM rate_limit_buckets WHERE bucket_key = ?")
        .bind(key)
        .run();
    }
  });

  it("starts a fresh window after the stored bucket expires", async () => {
    const ip = "203.0.113.49";
    const scope = `rate-limit-expiry:${crypto.randomUUID()}`;
    const key = await bucketKey(scope, ip);
    const request = new Request("https://punctumpicture.com/api/test", {
      headers: { "cf-connecting-ip": ip },
    });

    try {
      await assertRateLimit(request, env.DB, scope, 1, 60);
      await expect(assertRateLimit(request, env.DB, scope, 1, 60)).rejects.toMatchObject({
        status: 429,
      });
      await env.DB.prepare(
        "UPDATE rate_limit_buckets SET expires_at = ? WHERE bucket_key = ?",
      )
        .bind("2000-01-01T00:00:00.000Z", key)
        .run();

      await expect(assertRateLimit(request, env.DB, scope, 1, 60)).resolves.toBeUndefined();
      expect(
        await env.DB.prepare(
          "SELECT request_count AS requestCount FROM rate_limit_buckets WHERE bucket_key = ?",
        )
          .bind(key)
          .first<{ requestCount: number }>(),
      ).toEqual({ requestCount: 1 });
    } finally {
      await env.DB.prepare("DELETE FROM rate_limit_buckets WHERE bucket_key = ?")
        .bind(key)
        .run();
    }
  });
});
