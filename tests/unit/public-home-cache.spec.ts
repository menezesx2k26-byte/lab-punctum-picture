import { describe, expect, it } from "vitest";
import { isPublicHomeCacheRequest, isPublicHomeMutationRequest, publicHomeCacheResponse, shouldPurgePublicHome } from "../../worker/public-home-cache";

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
    for (const header of ["CF-Access-Authenticated-User-Email", "X-Forwarded-User",
      "X-Auth-User", "X-Api-Key", "Proxy-Authorization"]) {
      expect(isPublicHomeCacheRequest(req("/", {headers:{
        Accept:"text/html", [header]:"identity-or-credential",
      }}))).toBe(false);
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
  it("removes alternate CDN/surrogate expiry overrides from private responses and public cache envelopes", () => {
    for (const status of [200, 401, 404]) {
      const response = publicHomeCacheResponse(req(), new Response("<html>response</html>", {
        status, headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": status === 200 ? "no-store, must-revalidate" : "private, no-store",
          "CDN-Cache-Control": "public, max-age=3600",
          "Surrogate-Control": "max-age=3600",
          "Expires": "Wed, 21 Oct 2099 07:28:00 GMT",
        },
      }));
      for (const name of ["CDN-Cache-Control", "Surrogate-Control", "Expires"]) {
        expect(response.headers.has(name)).toBe(false);
      }
      expect(response.headers.get("Cloudflare-CDN-Cache-Control"))
        .toBe(status === 200 ? "public, max-age=60" : null);
    }
  });
  it("never promotes a public HTML response carrying identity or authentication response headers into shared cache", () => {
    for (const header of ["Authentication-Info", "Proxy-Authentication-Info",
      "Set-Cookie2", "CF-Access-Jwt-Assertion", "X-Client-Identity",
      "X-Session-Token"]) {
      const result = publicHomeCacheResponse(req(), new Response("<html>anonymous</html>", {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, must-revalidate",
          [header]: "sensitive-per-request-value",
        },
      }));
      expect(result.headers.get("Cache-Control"), header).toBe("private, no-store");
      expect(result.headers.get("Cloudflare-CDN-Cache-Control"), header).toBeNull();
      expect(result.headers.get("Cache-Tag"), header).toBeNull();
      expect(result.headers.get(header), header).toBeNull();
    }
  });
  it("rejects identity-bearing forwarded request headers outside the existing explicit list", () => {
    for (const header of ["X-Client-Id", "X-Session-Token",
      "X-Authenticated-User", "X-Forwarded-Access-Token"]) {
      const result = isPublicHomeCacheRequest(req("/", {
        headers: { Accept: "text/html", [header]: "per-request-identity" },
      }));
      expect(result, header).toBe(false);
    }
  });

  it("rejects forwarded credentials and per-request identity envelopes from the shared cache", () => {
    for (const header of ["X-Forwarded-Authorization", "X-Client-Session", "X-Forwarded-Cookie"]) {
      const request = req("/", { headers: { Accept: "text/html", [header]: "identity-secret" } });
      expect(isPublicHomeCacheRequest(request), header).toBe(false);
      const response = publicHomeCacheResponse(request, new Response("<html>private</html>", {
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store, must-revalidate" },
      }));
      expect(response.headers.get("Cache-Control"), header).toBe("private, no-store");
      expect(response.headers.get("Cloudflare-CDN-Cache-Control"), header).toBeNull();
    }
    for (const header of ["X-Authenticated-User", "X-Client-Id", "X-Forwarded-User"]) {
      const response = publicHomeCacheResponse(req(), new Response("<html>personalized</html>", {
        headers: { "Content-Type": "text/html", "Cache-Control": "no-store, must-revalidate",
          [header]: "identity-secret" },
      }));
      expect(response.headers.get("Cache-Control"), header).toBe("private, no-store");
      expect(response.headers.get("Cloudflare-CDN-Cache-Control"), header).toBeNull();
      expect(response.headers.get(header), header).toBeNull();
    }
  });

  it("does not cache HTML containing per-response CSP nonces or forwarded identity responses", () => {
    for (const header of ["Content-Security-Policy", "Content-Security-Policy-Report-Only"]) {
      const result = publicHomeCacheResponse(req(), new Response("<html>public-looking</html>", {
        headers: { "Content-Type": "text/html",
          "Cache-Control": "no-store, must-revalidate",
          [header]: "script-src 'nonce-UniquePerRequest123=' 'strict-dynamic'",
        },
      }));
      expect(result.headers.get("Cache-Control"), header).toBe("private, no-store");
      expect(result.headers.get("Cloudflare-CDN-Cache-Control"), header).toBeNull();
    }
    for (const header of ["X-Forwarded-Authorization", "X-Forwarded-Cookie", "X-Client-Session"]) {
      const result = publicHomeCacheResponse(req(), new Response("<html>identity</html>", {
        headers: { "Content-Type": "text/html",
          "Cache-Control": "no-store, must-revalidate", [header]: "private-credential" },
      }));
      expect(result.headers.get("Cache-Control"), header).toBe("private, no-store");
      expect(result.headers.get(header), header).toBeNull();
      expect(result.headers.get("Cloudflare-CDN-Cache-Control"), header).toBeNull();
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
    for (const vary of ["Accept-Language", "Origin", "User-Agent", "X-Client-Identity", "*"]) {
      const variant = new Response("<html>personalized variant</html>", {
        headers:{"Content-Type":"text/html", "Cache-Control":"no-store, must-revalidate", Vary:vary}
      });
      const isolated = publicHomeCacheResponse(req(),variant);
      expect(isolated.headers.get("Cache-Control")).toBe("private, no-store");
      expect(isolated.headers.has("Cloudflare-CDN-Cache-Control")).toBe(false);
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
      ["POST", "/admin/api/site-media/hero/complete"],
      ["POST", "/admin/api/categories"],
    ];
    for (const [method, path] of yes) {
      const request = req(path, { method });
      expect(isPublicHomeMutationRequest(request)).toBe(true);
      expect(shouldPurgePublicHome(request, new Response(null, { status: 200 }))).toBe(true);
      expect(shouldPurgePublicHome(request, new Response(null, { status: 403 }))).toBe(false);
    }
    for (const path of ["/admin/api/studio", "/admin/api/studio/discard", "/admin/api/inquiries",
      "/admin/api/albuns-privados", "/api/client/session"]) {
      expect(isPublicHomeMutationRequest(req(path,{method:"POST"}))).toBe(false);
      expect(shouldPurgePublicHome(req(path,{method:"POST"}),new Response(null,{status:200}))).toBe(false);
    }
    expect(shouldPurgePublicHome(req("/admin/api/studio/publish"),new Response(null,{status:200}))).toBe(false);
  });});
