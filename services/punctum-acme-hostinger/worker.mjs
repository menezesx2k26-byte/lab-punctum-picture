const origin = "https://aliceblue-locust-999458.hostingersite.com";

export async function proxyChallenge(request, upstreamFetch = fetch) {
  const url = new URL(request.url);
  if (!["punctumpicture.com", "www.punctumpicture.com"].includes(url.hostname) || url.search ||
      !/^\/\.well-known\/acme-challenge\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname)) return new Response(null, { status: 404 });
  if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405 });
  const response = await upstreamFetch(origin + url.pathname, { method: request.method, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  return new Response(request.method === "HEAD" ? null : response.body, { status: response.status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export default { fetch(request) { return proxyChallenge(request); } };
