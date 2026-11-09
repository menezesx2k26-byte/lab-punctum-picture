import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { bootstrapPrivateDb } from "../integration/client-fixture";
import {
  invalidatePublicHomeSnapshot,
  readPublicHomeSnapshot,
  stagePublicHomeSnapshot,
} from "../../worker/public-home-snapshot";

const BUILD = "punctum-test-build-20261108";
const HTML = '<!doctype html><html lang="pt-BR"><head><title>Punctum Picture</title></head><body><main>Studio publicado</main><script>window.__VINEXT_RSC_DONE__=true</script></body></html>';

describe("versioned public-home snapshot for cold cache MISS", () => {
  beforeAll(bootstrapPrivateDb);

  it("returns an intact, public HTML snapshot instead of running SSR when generation and build match", async () => {
    const state = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
    expect(state).not.toBeNull();
    expect(await stagePublicHomeSnapshot(env.DB, state!.epoch, BUILD, HTML)).toBe(true);
    const response = await readPublicHomeSnapshot(env.DB, BUILD);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response?.headers.has("Set-Cookie")).toBe(false);
    expect(await response?.text()).toBe(HTML);
  });

  it("refuses cross-build content, then invalidates before publication and prevents stale reuse", async () => {
    expect(await readPublicHomeSnapshot(env.DB, "another-deploy")).toBeNull();
    const current = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
    expect(current).not.toBeNull();
    await invalidatePublicHomeSnapshot(env.DB);
    expect(await readPublicHomeSnapshot(env.DB, BUILD)).toBeNull();
    // A pre-publication producer cannot re-stage its older snapshot.
    expect(await stagePublicHomeSnapshot(env.DB, current!.epoch, BUILD, HTML)).toBe(false);
    const newer = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
    expect(newer!.epoch).toBe(current!.epoch + 1);
  });

  it("fails closed on HTML named entities that conceal private session or R2 paths", async () => {
    const state = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
    expect(state).not.toBeNull();
    for (const escaped of [
      "punctum&lowbar;client&lowbar;session=secret",
      "client&percnt;2Dgalleries/private.jpg",
      "/&percnt;61pi/client/galleries/secret",
    ]) {
      expect(await stagePublicHomeSnapshot(env.DB, state!.epoch, BUILD,
        HTML.replace("Studio publicado", escaped)), escaped).toBe(false);
    }
  });

  it("rejects broken SSR, tampered hashes and accidental private content", async () => {
    const state = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
    expect(await stagePublicHomeSnapshot(env.DB, state!.epoch, BUILD, "<html>partial</html>")).toBe(false);
    expect(await stagePublicHomeSnapshot(env.DB, state!.epoch, BUILD, HTML.replace("Studio publicado", "Set-Cookie: secret"))).toBe(false);
    for (const secret of ["client-galleries/example/private.jpg", "/api/client/galleries/secret/images/id/download",
      "/admin/api/albuns-privados/secret", "/qa/recover",
      "%2Fapi%2Fclient%2Fgalleries%2Fsecret", "\\u002Fapi\\u002Fclient\\u002Fgalleries",
      "&#47;api&#47;client&#47;galleries", "\\/admin\\/api\\/albuns-privados\\/secret",
      "%252Fapi%252Fclient%252Fgalleries%252Fsecret",
      "%25252Fadmin%25252Fapi%25252Falbuns-privados%252Fsecret",
      "&#38;#47;api&#38;#47;client&#38;#47;galleries",
      "client&#45;galleries&#47;other-client/private.jpg",
      "punctum&#95;client&#95;session=private-cookie"]) {
      const dangerous = HTML.replace("Studio publicado", secret);
      expect(await stagePublicHomeSnapshot(env.DB, state!.epoch, BUILD, dangerous)).toBe(false);
    }
    // Escape the letters rather than the separators: scripts and links still
    // decode these to known private endpoints, even when the slashes are plain.
    for (const secret of [
      "/\\u0061pi/client/galleries/secret",
      "/\\x61pi/client/galleries/secret",
      "/%61pi/client/galleries/secret",
      "/%2561pi/client/galleries/secret",
      "/&#97;pi/client/galleries/secret",
      "/&#x61;pi/client/galleries/secret",
      "/&#97pi/client/galleries/secret",
      "/&#x61pi/client/galleries/secret",
      "/\\u{61}pi/client/galleries/secret",
      "client-g\\u0061lleries/private.jpg",
      "punctum_\\u0063lient_session=secret",
    ]) {
      expect(await stagePublicHomeSnapshot(env.DB, state!.epoch, BUILD,
        HTML.replace("Studio publicado", secret))).toBe(false);
    }
    expect(await stagePublicHomeSnapshot(env.DB, state!.epoch, BUILD, HTML)).toBe(true);
    await env.DB.prepare("UPDATE public_home_snapshot SET html_sha256=? WHERE id=1").bind("0".repeat(64)).run();
    expect(await readPublicHomeSnapshot(env.DB, BUILD)).toBeNull();
  });
});
