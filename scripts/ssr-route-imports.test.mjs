import assert from "node:assert/strict";
import { globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

// Observe actual V8 module evaluation in the production workerd bundle. This is
// deliberately not a source-text assertion: unused admin code must stay unloaded.
test("home SSR loads its own references; Studio loads only when requested", async () => {
  const dist = resolve(process.env.PUNCTUM_SSR_TEST_DIST || "dist");
  const root = resolve(dist, "server");
  const main = resolve(root, "index.js");
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: "punctum-ssr-route-test",
    modules: [{ type: "ESModule", path: main }, ...globSync(root + "/**/*.js").filter(path => path !== main).map(path => ({ type: "ESModule", path }))],
    modulesRoot: root, compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "punctum-ssr-route-test" },
    r2Buckets: { ORIGINALS: "punctum-ssr-route-originals", BACKUPS: "punctum-ssr-route-backups" },
    assets: { directory: resolve(dist, "client"), binding: "ASSETS", routerConfig: { has_user_worker: true } },
    bindings: { ENVIRONMENT: "local", PRIVATE_GALLERIES_ENABLED: "false", CLIENT_AUTH_MODE: "access", SITE_ORIGIN: "http://localhost", PUBLIC_SITE_URL: "http://localhost" },
    host: "127.0.0.1", port: 0, inspectorPort: 0,
  }));
  let socket;
  try {
    await mf.ready;
    const db = await mf.getD1Database("DB");
    for (const file of globSync("migrations/*.sql").sort()) {
      for (const sql of readFileSync(file, "utf8").split(";").map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
    }
    const inspector = await mf.getInspectorURL();
    const targets = await (await fetch("http://" + inspector.host + "/json/list")).json();
    const target = targets.find(target => target.id === "core:user:punctum-ssr-route-test");
    assert.ok(target, "user Worker inspector target unavailable");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    const evaluated = new Set();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === "Debugger.scriptParsed") evaluated.add(message.params.url);
      if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    };
    const send = (method) => new Promise(resolve => { const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method })); });
    await send("Debugger.enable");
    const worker = await mf.getWorker();
    const home = await worker.fetch("http://localhost/");
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.match(html, /Punctum Picture/);
    assert.match(html, /__VINEXT_RSC_DONE__/);
    const adminModules = () => [...evaluated].filter(url => /\/(?:StudioManager|AlbumEditor|PrivateGalleryEditor|AccountsManager|SettingsManager|cloud-upload)-/.test(url));
    assert.deepEqual(adminModules(), [], "public home must not eagerly evaluate admin/upload modules");
    const studio = await worker.fetch("http://localhost/admin/studio");
    const studioHtml = await studio.text();
    assert.equal(studio.status, 200);
    assert.match(studioHtml, /Studio/);
    assert.ok(adminModules().some(url => /StudioManager-/.test(url)), "Studio reference must load on its own route");
  } finally {
    socket?.close();
    await mf.dispose();
  }
});
