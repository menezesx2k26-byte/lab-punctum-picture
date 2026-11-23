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

  it("habilita CSP do Clerk nas rotas que montam ClerkProvider (/acesso, /admin/*, /albuns/entrar) sem relaxar páginas públicas", async () => {
    const { shouldAllowClerkCsp } = await import("../../worker/auth/clerk-auth");
    const clerkEnv = {
      ADMIN_AUTH_MODE: "clerk",
      CLIENT_AUTH_MODE: "clerk",
      CLERK_AUTH_ENABLED: "true",
    } as unknown as Env;
    const legacyEnv = {
      ADMIN_AUTH_MODE: "legacy",
      CLIENT_AUTH_MODE: "password",
      CLERK_AUTH_ENABLED: "false",
    } as unknown as Env;

    expect(shouldAllowClerkCsp("/acesso", clerkEnv)).toBe(true);
    expect(shouldAllowClerkCsp("/admin", clerkEnv)).toBe(true);
    expect(shouldAllowClerkCsp("/admin/clientes", clerkEnv)).toBe(true);
    expect(shouldAllowClerkCsp("/admin/albuns-privados", clerkEnv)).toBe(true);
    expect(shouldAllowClerkCsp("/albuns/entrar", clerkEnv)).toBe(true);

    // Public routes and preview iframe never receive Clerk script-src
    expect(shouldAllowClerkCsp("/", clerkEnv)).toBe(false);
    expect(shouldAllowClerkCsp("/ensaios", clerkEnv)).toBe(false);
    expect(shouldAllowClerkCsp("/admin/studio/preview", clerkEnv)).toBe(false);
    expect(shouldAllowClerkCsp("/albuns", clerkEnv)).toBe(false);

    // Legacy mode with Clerk off keeps strict CSP everywhere
    expect(shouldAllowClerkCsp("/acesso", legacyEnv)).toBe(false);
    expect(shouldAllowClerkCsp("/admin/clientes", legacyEnv)).toBe(false);
    expect(shouldAllowClerkCsp("/albuns/entrar", legacyEnv)).toBe(false);
  });

  it("inclui largura 1254 da logo na allowlist de otimização e redireciona /sobre", async () => {
    const {
      INVALID_IMAGE_SOURCE_MESSAGE,
      buildAllowedImageWidths,
      maybeRedirectLegacyPublicRoute,
    } = await import("../../worker/utils/public-routing");
    expect(buildAllowedImageWidths([640, 1200], [32, 64])).toEqual([
      640, 1200, 32, 64, 280, 300, 360, 600, 720, 800, 900, 1024, 1254, 1440, 1600, 1800,
    ]);
    expect(INVALID_IMAGE_SOURCE_MESSAGE).toBe("A origem da imagem é inválida.");
    const redir = maybeRedirectLegacyPublicRoute(new URL("https://punctumpicture.com/sobre"));
    expect(redir?.status).toBe(308);
    expect(redir?.headers.get("location")).toBe("https://punctumpicture.com/#sobre");
    expect(maybeRedirectLegacyPublicRoute(new URL("https://punctumpicture.com/portfolio"))).toBeNull();
  });
});
