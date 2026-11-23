import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { PUNCTUM_DEFAULT_SITE_CONFIG } from "../../shared/config";
import { ClientAuthShell } from "../../app/albuns/components/ClientAuthShell";
import { ClientLogin } from "../../app/albuns/components/ClientLogin";

/* Next's browser-facing Image/Link modules are not runnable inside workerd
 * Vitest. Only these presentation boundaries are mocked; ClientLogin
 * itself and the real published theme resolver still render. */
vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ src, alt }: { src: string; alt: string }) =>
      createElement("img", { src, alt }),
  };
});

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    when === "signed-out" ? children : null,
  SignInButton: ({ children }: { children: ReactNode }) => children,
  useAuth: () => ({ isLoaded: true, getToken: async () => null }),
  useClerk: () => ({ signOut: async () => {} }),
}));

vi.mock("next/link", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ href, children, ...props }: { href: string; children: ReactNode; "aria-label"?: string }) =>
      createElement("a", { href, ...props }, children),
  };
});


function renderEntry(
  props: Parameters<typeof ClientLogin>[0] = {},
  config: unknown = PUNCTUM_DEFAULT_SITE_CONFIG,
): string {
  return renderToStaticMarkup(
    createElement(ClientAuthShell, { config }, createElement(ClientLogin, props)),
  );
}

describe("Punctum client authentication presentation", () => {
  it("reuses the published site's nocturne-plum tokens without a parallel beige theme", () => {
    const html = renderEntry();
    expect(html).toContain('data-theme-palette="nocturne-plum"');
    expect(html).toContain("--color-background:#120a17");
    expect(html).toContain("pa-auth-shell");
    expect(html).not.toContain("pa-steps");
    expect(html).not.toContain("Entrar com Clerk");
  });

  it("accepts a published alternate palette rather than hardcoding nocturne", () => {
    const config = structuredClone(PUNCTUM_DEFAULT_SITE_CONFIG);
    config.theme.palette.id = "punctum-violet";
    config.theme.palette.mode = "light";
    const html = renderEntry({}, config);
    expect(html).toContain('data-theme-palette="punctum-violet"');
    expect(html).not.toContain('data-theme-palette="nocturne-plum"');
  });

  it("places the real public logo, photo and accessible client action above the decorative prose", () => {
    const html = renderEntry();
    expect(html).toContain("/logo-punctum-transparent.png");
    expect(html).toContain("/photos/p002.jpg");
    expect(html.replace(/<[^>]*>/g, " ")).toMatch(/Suas fotografias,\s+só suas\./);
    expect(html).toContain("Entre para acessar seus álbuns privados.");
    expect(html).toContain("Abrir meus álbuns");
    expect(html).not.toContain("O que fica,");
    expect(html).not.toContain("Fotografias para revisitar com calma");
    expect(html).not.toContain("Punctum Picture · Maria Helena");
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(html).toContain('alt=""');
    expect(html).not.toContain("/api/client/galleries/");
  });

  it("preserves password change semantics without displaying the login email field", () => {
    const html = renderEntry({ changePassword: true });
    expect(html).toContain("Escolha sua senha");
    expect(html).toContain('autoComplete="new-password"');
    expect(html).toContain('minLength="12"');
    expect(html).toContain("Confirme a nova senha");
    expect(html).toContain("Salvar senha e entrar");
    expect(html).not.toContain('name="email"');
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
  });

  it("uses provider-neutral copy for Clerk-only access and hides the legacy form", () => {
    const html = renderEntry({
      clerkEnabled: true,
      clerkOnly: true,
      publishableKey: "pk_test_synthetic",
    });
    expect(html).toContain("Entrar nos meus álbuns");
    expect(html).not.toContain("Entrar com Clerk");
    expect(html).not.toContain("Conta Clerk conectada");
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain('name="password"');
    expect((html.match(/<h1\b/g) ?? []).length).toBe(1);
  });

  it("keeps the legacy password form when Clerk is absent", () => {
    const html = renderEntry({ clerkOnly: false, clerkEnabled: false });
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain("Primeiro acesso");
  });
});
