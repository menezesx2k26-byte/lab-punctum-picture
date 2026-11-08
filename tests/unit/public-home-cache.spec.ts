import { describe, expect, it } from "vitest";
import { isPublicHomeCacheRequest, publicHomeCacheResponse, shouldPurgePublicHome } from "../../worker/public-home-cache";

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
    expect(good.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    expect(good.headers.get("Cloudflare-CDN-Cache-Control")).toBe("public, max-age=60");
    expect(good.headers.get("Cache-Tag")).toBe("punctum-public-home-v1");
    expect(await good.text()).toContain("Public");
    for (const response of [
      new Response("Denied", {status:401, headers: {"Content-Type":"text/html"}}),
      new Response("Json", {headers: {"Content-Type":"application/json"}}),
      new Response("Personal", {headers: {"Content-Type":"text/html", "Set-Cookie":"session=secret"}}),
      new Response("Private", {headers: {"Content-Type":"text/html", "Cache-Control":"private, no-store"}})
    ]) {
      const result=publicHomeCacheResponse(req(),response);
      expect(result.headers.get("Cache-Control")).toBe("private, no-store");
      expect(result.headers.has("Cloudflare-CDN-Cache-Control")).toBe(false);
    }
  });

  it("allows only the known anonymous vinext HTML no-store header to be replaced", () => {
    const html = new Response("<html>public</html>", {
      headers: {"Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store, must-revalidate",
        Vary: "RSC, Accept, Next-Router-State-Tree, Next-Router-Prefetch"}
    });
    expect(publicHomeCacheResponse(req(), html).headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
    for (const dangerous of ["no-store", "private", "no-cache", "private, no-store"]) {
      const response = new Response("<html>secret</html>", {
        headers: {"Content-Type": "text/html", "Cache-Control": dangerous}
      });
      expect(publicHomeCacheResponse(req(), response).headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
  it("rejects any unauthorized attempt to call the cached entrypoint", () => {
    const bad=req("/api/client/me");
    const result=publicHomeCacheResponse(bad,new Response("<html>do not cache</html>", {
      headers: {"Content-Type":"text/html"}
    }));
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  });
  it("invalidates home only after successful public-facing admin writes", () => {
    const yes = [
      ["POST", "/admin/api/studio/publish"],
      ["POST", "/admin/api/studio/publish-visual"],
      ["POST", "/admin/api/studio/restore"],
      ["PATCH", "/admin/api/settings"],
      ["POST", "/admin/api/albums/one/publish"],
      ["PATCH", "/admin/api/albums/one"],
      ["POST", "/admin/api/uploads/intent/complete"],
      ["POST", "/admin/api/categories"],
    ];
    for (const [method, path] of yes) {
      const request = req(path, { method });
      expect(shouldPurgePublicHome(request, new Response(null, { status: 200 }))).toBe(true);
      expect(shouldPurgePublicHome(request, new Response(null, { status: 403 }))).toBe(false);
    }
    for (const path of ["/admin/api/studio", "/admin/api/studio/discard", "/admin/api/inquiries",
      "/admin/api/albuns-privados", "/api/client/session"]) {
      expect(shouldPurgePublicHome(req(path,{method:"POST"}),new Response(null,{status:200}))).toBe(false);
    }
    expect(shouldPurgePublicHome(req("/admin/api/studio/publish"),new Response(null,{status:200}))).toBe(false);
  });});
