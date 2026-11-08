import { describe, expect, it } from "vitest";
import { isPublicHomeCacheRequest, publicHomeCacheResponse } from "../../worker/public-home-cache";

function req(path = "/", init: RequestInit = {}) {
  return new Request("https://punctumpicture.com" + path, { method: "GET", headers: { Accept: "text/html", ...init.headers }, ...init });
}

describe("public home isolated cache boundary", () => {
  it("only admits an anonymous public navigation to the canonical home", () => {
    expect(isPublicHomeCacheRequest(req())).toBe(true);
    expect(isPublicHomeCacheRequest(req("/", { method: "HEAD" }))).toBe(false);
    for (const path of ["/albuns", "/albuns/entrar", "/admin", "/admin/studio/preview",
      "/api/client/me", "/api/public/site", "/?preview=1", "/_vinext/image"]) {
      expect(isPublicHomeCacheRequest(req(path))).toBe(false);
    }
    const sensitiveHeaders: Record<string, string>[] = [{Cookie: "punctum_client_session=token"}, {Authorization: "Bearer token"},
      {"CF-Access-Jwt-Assertion": "jwt"}, {RSC: "1"}, {"Next-Router-State-Tree": "tree"},
      {Accept:"text/x-component"}, {Purpose:"prefetch"}, {"Next-Router-Prefetch":"1"}];
    for (const headers of sensitiveHeaders) {
      expect(isPublicHomeCacheRequest(req("/", {headers}))).toBe(false);
    }
  });

  it("only caches successful HTML without set-cookie or private directives", async () => {
    const good = publicHomeCacheResponse(req(), new Response("<html>Public</html>", {
      headers: {"Content-Type":"text/html; charset=utf-8"}
    }));
    expect(good.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(await good.text()).toContain("Public");
    for (const response of [
      new Response("Denied", {status:401, headers: {"Content-Type":"text/html"}}),
      new Response("Json", {headers: {"Content-Type":"application/json"}}),
      new Response("Personal", {headers: {"Content-Type":"text/html", "Set-Cookie":"session=secret"}}),
      new Response("Private", {headers: {"Content-Type":"text/html", "Cache-Control":"private, no-store"}})
    ]) {
      const result=publicHomeCacheResponse(req(),response);
      expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("rejects any unauthorized attempt to call the cached entrypoint", () => {
    const bad=req("/api/client/me");
    const result=publicHomeCacheResponse(bad,new Response("<html>do not cache</html>", {
      headers: {"Content-Type":"text/html"}
    }));
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
