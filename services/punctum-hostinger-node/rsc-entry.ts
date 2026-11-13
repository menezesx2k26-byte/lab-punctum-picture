import { randomUUID } from "node:crypto";
import punctum from "../../worker/index";
import { env } from "./bindings";
import { qaOrigin } from "./runtime.mjs";
import { publicPaths } from "./public-files";
import { traceQaLoginBody, traceQaWorker } from "./worker-phase-trace.mjs";

const bootId = randomUUID();

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
  const traceOptions = { enabled: process.env.PUNCTUM_QA_MANAGED_BOOTSTRAP === "1" };
  const normalized = traceQaLoginBody(new Request(target, request), traceOptions);
  const result = await traceQaWorker(
    url.pathname,
    (mark: ((phase: string) => void) | undefined) => punctum.fetch(normalized, env, context, mark),
    traceOptions,
  );
  const headers = new Headers(result.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Cache-Control", "private, no-store");
  const sourceSha = process.env.PUNCTUM_QA_SOURCE_SHA;
  if (traceOptions.enabled && request.method === "GET" && url.pathname === "/api/health" &&
      result.ok && sourceSha && /^[a-f0-9]{40}$/.test(sourceSha)) {
    headers.set("X-Punctum-QA-Source", sourceSha);
    headers.set("X-Punctum-QA-Boot", bootId);
  }
  return new Response(result.body, {
    status: result.status,
    statusText: result.statusText,
    headers,
  });
}
