import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { bootstrapPrivateDb } from "../integration/client-fixture";
import {
  invalidatePublicHomeSnapshot,
  beginPublicHomeSnapshotMutation,
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

  it("does not repeat full HTML policy scanning on read but still verifies the staged SHA-256", async () => {
    const state = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
    expect(state).not.toBeNull();
    expect(await stagePublicHomeSnapshot(env.DB, state!.epoch, BUILD, HTML)).toBe(true);
    const encode = vi.spyOn(TextEncoder.prototype, "encode");
    try {
      const response = await readPublicHomeSnapshot(env.DB, BUILD);
      expect(response?.status).toBe(200);
      // One encoding is required for the SHA-256 digest. The stage-time
      // validator already enforced the public HTML policy before persistence.
      expect(encode).toHaveBeenCalledTimes(1);
    } finally {
      encode.mockRestore();
    }
    await env.DB.prepare("UPDATE public_home_snapshot SET html=? WHERE id=1")
      .bind(HTML.replace("Studio publicado", "alterado depois do staging")).run();
    expect(await readPublicHomeSnapshot(env.DB, BUILD)).toBeNull();
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

  it("rejects private URLs hidden by browser-stripped HTML URL control whitespace", async () => {
    const state = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
    expect(state).not.toBeNull();
    // URL parsing removes ASCII tab/newline characters, including ones that
    // HTML entity decoding first introduces in an href attribute. The snapshot
    // guard must test the effective URL rather than just its literal spelling.
    for (const path of [
      "/api/cl&Tab;ient/galleries/secret",
      "/api/cl&NewLine;ient/galleries/secret",
      "/api/cl&#9;ient/galleries/secret",
      "/api/cl&#xA;ient/galleries/secret",
      "/api/cl&#13;ient/galleries/secret",
      "/api/cl\tient/galleries/secret",
      "/api/cl\nient/galleries/secret",
      "/api/cl\\u0009ient/galleries/secret",
      "/api/cl\\x09ient/galleries/secret",
      "/api/cl\\u{9}ient/galleries/secret",
      "/api/cl%09ient/galleries/secret",
      "/api/cl%250Aient/galleries/secret",
    ]) {
      const malicious = HTML.replace("Studio publicado", `<a href="${path}">Publicar</a>`);
      expect(await stagePublicHomeSnapshot(env.DB, state!.epoch, BUILD, malicious), path).toBe(false);
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


it("blocks snapshot staging throughout overlapping publications and rejects renders started inside them", async () => {
  await bootstrapPrivateDb();
  const finishA = await beginPublicHomeSnapshotMutation(env.DB);
  const duringA = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
  expect(await stagePublicHomeSnapshot(env.DB, duringA!.epoch, BUILD, HTML)).toBe(false);
  const finishB = await beginPublicHomeSnapshotMutation(env.DB);
  await finishA();
  const duringB = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
  expect(await stagePublicHomeSnapshot(env.DB, duringB!.epoch, BUILD, HTML)).toBe(false);
  expect(await readPublicHomeSnapshot(env.DB, BUILD)).toBeNull();
  await finishB();
  expect(await stagePublicHomeSnapshot(env.DB, duringB!.epoch, BUILD, HTML)).toBe(false);
  const final = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
  expect(await stagePublicHomeSnapshot(env.DB, final!.epoch, BUILD, HTML)).toBe(true);
  // A finally callback invoked again must not release somebody else's fence.
  const finishC = await beginPublicHomeSnapshotMutation(env.DB);
  await finishA();
  const duringC = await env.DB.prepare("SELECT epoch FROM public_home_snapshot WHERE id=1").first<{epoch:number}>();
  expect(await stagePublicHomeSnapshot(env.DB, duringC!.epoch, BUILD, HTML)).toBe(false);
  await finishC();
});
