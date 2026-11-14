import { describe, expect, it } from "vitest";
import { withSecurityHeaders } from "../../worker/utils/response";

describe("headers de framing", () => {
  it("mantém páginas públicas fora de iframes", () => {
    const response = withSecurityHeaders(new Response("public"));
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers.get("x-robots-tag")).toBeNull();
  });

  it("abre somente a resposta de preview para framing same-origin", () => {
    const response = withSecurityHeaders(new Response("preview"), {
      studioPreview: true,
    });
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'self'",
    );
    expect(response.headers.get("cache-control")).toBe(
      "private, no-store, max-age=0",
    );
    expect(response.headers.get("x-robots-tag")).toBe(
      "noindex, nofollow, noarchive",
    );
  });

  it("permite os recursos do Clerk com issuer HTTPS sem liberar framing da página", () => {
    const response = withSecurityHeaders(new Response("login"), {
      clerkIssuer: "https://clerk.punctumpicture.com",
    });
    const policy = response.headers.get("content-security-policy")!;
    expect(policy).toMatch(/script-src [^;]+https:\/\/clerk\.punctumpicture\.com/);
    expect(policy).toMatch(/connect-src [^;]+https:\/\/clerk\.punctumpicture\.com/);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("worker-src 'self' blob:");
  });

  it("rejeita um issuer que poderia injetar diretivas no CSP", () => {
    const response = withSecurityHeaders(new Response("login"), {
      clerkIssuer: "https://clerk.punctumpicture.com; script-src *",
    });
    expect(response.headers.get("content-security-policy")).not.toContain("clerk.punctumpicture.com");
  });
});
