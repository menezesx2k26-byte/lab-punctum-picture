import { afterEach, describe, expect, it, vi } from "vitest";
import { privateApi, PrivateApiError } from "../../app/albuns/components/api";

afterEach(() => vi.unstubAllGlobals());

describe("private API recovery", () => {
  it("returns an expired client to Access even when the failure body is HTML", async () => {
    const destinations: string[] = [];
    vi.stubGlobal("window", { location: { replace: (path: string) => destinations.push(path) } });
    vi.stubGlobal("fetch", async () => new Response("<html>Access challenge</html>", {
      status: 401, headers: { "Content-Type": "text/html" },
    }));
    await expect(privateApi("/api/client/me")).rejects.toMatchObject({
      name: "Error", status: 401,
    });
    expect(destinations).toEqual(["/albuns/entrar"]);
  });

  it("replaces malformed service responses with safe recoverable feedback", async () => {
    for (const [status, body] of [[503, "<html>internal-token-should-not-be-displayed</html>"], [200, "null"], [200, "{broken"]] as const) {
      vi.stubGlobal("fetch", async () => new Response(body, { status }));
      let caught: unknown;
      try { await privateApi("/api/client/galleries"); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(PrivateApiError);
      expect(caught).toMatchObject({ message: "Não foi possível concluir. Tente novamente." });
      expect(String(caught)).not.toContain("internal-token");
      expect(String(caught)).not.toContain("JSON");
    }
  });

  it("preserves structured application errors and successful object responses", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: {
      message: "Este álbum está indisponível.", code: "NOT_FOUND",
    } }, { status: 404 }));
    await expect(privateApi("/api/client/galleries/missing")).rejects.toMatchObject({
      status: 404, code: "NOT_FOUND", message: "Este álbum está indisponível.",
    });
    vi.stubGlobal("fetch", async () => Response.json({ galleries: [] }));
    await expect(privateApi("/api/client/galleries")).resolves.toEqual({ galleries: [] });
  });

  it("shows recoverable feedback when the connection fails", async () => {
    vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
    await expect(privateApi("/api/client/galleries")).rejects.toMatchObject({
      status: 0, message: "Não foi possível conectar. Tente novamente.",
    });
  });
});
