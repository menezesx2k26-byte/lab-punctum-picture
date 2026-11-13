import punctum from "../../worker/index";
import { env } from "./bindings";
import { stageOrigin } from "./runtime.mjs";
import { publicPaths } from "../punctum-hostinger-node/public-files";

const context = {
  waitUntil(task: Promise<unknown>) {
    void task.catch(() => console.warn("Private staging deferred operation failed"));
  },
} as ExecutionContext;

export default async function fetchProductionStage(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = stageOrigin();
  if (url.host !== origin.host) {
    return new Response(null, { status: 421, headers: { "Cache-Control": "no-store" } });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405, headers: { "Allow": "GET, HEAD", "Cache-Control": "no-store" },
    });
  }
  if (publicPaths.has(url.pathname)) {
    return new Response(null, {
      headers: {
        "x-vinext-static-file": encodeURIComponent(url.pathname),
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  }

  const target = new URL(origin);
  target.pathname = url.pathname;
  target.search = url.search;
  const result = await punctum.fetch(new Request(target, request), env, context);
  const headers = new Headers(result.headers);
  headers.delete("Set-Cookie");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}
