import punctum from "../../worker/index";
import { env } from "./bindings";
import { qaOrigin } from "./runtime.mjs";
import { publicPaths } from "./public-files";

const context = {
  waitUntil(task: Promise<unknown>) {
    void task.catch(() => console.warn("Punctum QA background task failed"));
  },
} as ExecutionContext;

export default async function fetchQaRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const origin = qaOrigin();
  if (url.host !== origin.host) {
    return new Response(null, { status: 421, headers: { "Cache-Control": "no-store" } });
  }
  if ((request.method === "GET" || request.method === "HEAD") && publicPaths.has(url.pathname)) {
    // The Vinext Node server recognizes this internal signal and streams the
    // file from its client build directory. Only tracked public files qualify.
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
  const normalized = new Request(target, request);
  const result = await punctum.fetch(normalized, env, context);
  const headers = new Headers(result.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Cache-Control", "private, no-store");
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}
