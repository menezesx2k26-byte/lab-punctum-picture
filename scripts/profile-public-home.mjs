/**
 * Reproducible local workerd profiler, not Cloudflare billing CPU or RUM.
 * Usage: node scripts/profile-public-home.mjs baseline=/tmp/baseline-dist after=dist
 * Add `snapshot-miss=dist` and/or `snapshot=dist` to profile the existing D1
 * snapshot miss/hit paths. Run either with Node's --experimental-strip-types
 * flag; the hit mode stages synthetic local HTML in Miniflare only.
 * Alternates fresh isolates per build to reduce ordering/load bias. Each isolate
 * serves one cold and five warm homes using identical fresh synthetic D1 seeds.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { globSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { cpuQaFixtureEligibility } from "./lib/r4-cpu-readonly.mjs";

const variants = process.argv.slice(2).map(argument => {
  const separator = argument.indexOf("=");
  assert.ok(separator > 0, "Arguments must be label=build-directory");
  return { label: argument.slice(0, separator), directory: resolve(argument.slice(separator + 1)) };
});
assert.ok(variants.length, "Supply at least one label=build-directory");
const repetitions = Number(process.env.PUNCTUM_PROFILE_REPETITIONS || 10);
assert.ok(Number.isInteger(repetitions) && repetitions >= 1 && repetitions <= 30);
const report = {
  startedUtc: new Date().toISOString(),
  scope: "LOCAL workerd/V8 sampled execution on the first unprimed home request after a synthetic /api/public/site bootstrap has established one valid published-config pointer; measured home requests do not include one-time DB bootstrap; excludes idle samples, includes compilation/program samples; not edge CPU or billable CPU",
  node: process.version, repetitions, warmRequestsPerIsolate: 5,
  builds: variants.map(variant => ({ label: variant.label, bundleSha256: createHash("sha256").update(readFileSync(resolve(variant.directory, "server/index.js"))).digest("hex"), ssrBundleSha256: createHash("sha256").update(readFileSync(resolve(variant.directory, "server/ssr/index.js"))).digest("hex") })),
  profileFixtures: [],
  samples: [],
};
const connect = async mf => {
  const inspector = await mf.getInspectorURL();
  const targets = await (await fetch("http://" + inspector.host + "/json/list")).json();
  const target = targets.find(target => target.id === "core:user:punctum-home-profiler");
  assert.ok(target, "Worker inspector target unavailable");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    const operation = pending.get(message.id);
    if (!operation) return;
    clearTimeout(operation.timer); pending.delete(message.id);
    if (message.error) operation.reject(new Error(JSON.stringify(message.error)));
    else operation.resolve(message.result);
  };
  return {
    socket,
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("Profiler command timed out: " + method)); }, 15000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    }),
  };
};
async function sampleBuild(variant, repetition) {
  const snapshotMode = variant.label === "snapshot" || variant.label === "snapshot-miss";
  const snapshotHitMode = variant.label === "snapshot";
  const snapshotBuildId = "local-profile-synthetic-build";
  const root = resolve(variant.directory, "server");
  const main = resolve(root, "index.js");
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: "punctum-home-profiler",
    modules: [{ type: "ESModule", path: main }, ...globSync(root + "/**/*.js").filter(path => path !== main).map(path => ({ type: "ESModule", path }))],
    modulesRoot: root, compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "punctum-home-profiler" },
    r2Buckets: { ORIGINALS: "punctum-home-profiler-originals", BACKUPS: "punctum-home-profiler-backups" },
    assets: { directory: resolve(variant.directory, "client"), binding: "ASSETS", routerConfig: { has_user_worker: true } },
    bindings: {
      ENVIRONMENT: "local", PRIVATE_GALLERIES_ENABLED: "false", CLIENT_AUTH_MODE: "access",
      SITE_ORIGIN: "http://localhost", PUBLIC_SITE_URL: "http://localhost",
      PUBLIC_HOME_SNAPSHOT_ENABLED: snapshotMode ? "true" : "false",
      PUBLIC_HOME_SNAPSHOT_BUILD_ID: snapshotMode ? snapshotBuildId : "",
    },
    host: "127.0.0.1", port: 0, inspectorPort: 0,
  }));
  let inspector;
  try {
    await mf.ready;
    const db = await mf.getD1Database("DB");
    for (const file of globSync("migrations/*.sql").sort()) {
      for (const sql of readFileSync(file, "utf8").split(";").map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
    }
    // Production's first home request normally starts against an already-
    // published config pointer. Bootstrap only the synthetic D1 through the
    // public site API before profiling, so measured home requests exercise the
    // steady-state LEFT JOIN path rather than legacy DB bootstrap.
    const worker = await mf.getWorker();
    const bootstrap = await worker.fetch("http://localhost/api/public/site", { headers: { accept: "application/json" } });
    const fixture = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM site_config_pointers) AS pointers,
      (SELECT COUNT(*) FROM site_config_versions) AS configVersions,
      (SELECT COUNT(*) FROM site_config_pointers p JOIN site_config_versions v
        ON v.id=p.published_version_id AND v.state='published' WHERE p.id=1) AS validPublishedPointers`).first();
    assert.equal(bootstrap.status, 200, "Synthetic public site bootstrap must succeed before profiling");
    assert.ok(cpuQaFixtureEligibility(fixture), "Profiler D1 must have one valid published pointer before sampling");
    report.profileFixtures.push({ build: variant.label, repetition, bootstrapStatus: bootstrap.status, ...fixture });
    inspector = await connect(mf);
    await inspector.send("Profiler.enable");
    await inspector.send("Profiler.setSamplingInterval", { interval: 100 });
    if (snapshotHitMode) {
      // Generate the same public SSR HTML once, then stage it through the
      // production validator into this isolate's synthetic D1 only.
      const seedResponse = await worker.fetch("http://localhost/", { headers: { accept: "text/html" } });
      const seedHtml = await seedResponse.text();
      assert.equal(seedResponse.status, 200);
      assert.match(seedHtml, /__VINEXT_RSC_DONE__/);
      const markedSnapshotHtml = seedHtml.replace(/<\/html\s*>/i, "<!-- local-profile-snapshot-probe --></html>");
      assert.notEqual(markedSnapshotHtml, seedHtml, "Synthetic marker must be inserted into the staged HTML");
      const state = await db.prepare("SELECT epoch FROM public_home_snapshot WHERE id = 1").first();
      assert.ok(state && Number.isInteger(state.epoch));
      const { stagePublicHomeSnapshot } = await import("../worker/public-home-snapshot.ts");
      assert.equal(await stagePublicHomeSnapshot(db, state.epoch, snapshotBuildId, markedSnapshotHtml), true);
    }
    for (let index = 0; index < 6; index++) {
      await inspector.send("Profiler.start");
      const start = performance.now();
      const response = await worker.fetch("http://localhost/", { headers: { accept: "text/html" } });
      const html = await response.text();
      const elapsedMs = performance.now() - start;
      const { profile } = await inspector.send("Profiler.stop");
      const idleIds = new Set(profile.nodes.filter(node => node.callFrame.functionName === "(idle)").map(node => node.id));
      const nodes = new Map(profile.nodes.map(node => [node.id, node.callFrame]));
      const frameCosts = new Map();
      let sampledExecutionUs = 0;
      profile.samples.forEach((id, index) => {
        if (idleIds.has(id)) return;
        sampledExecutionUs += profile.timeDeltas[index];
        frameCosts.set(id, (frameCosts.get(id) || 0) + profile.timeDeltas[index]);
      });
      const topFrames = [...frameCosts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, us]) => {
        const frame = nodes.get(id);
        return { functionName: frame.functionName, module: frame.url.split(/[\\/]/).slice(-2).join("/"), line: frame.lineNumber + 1, sampledMs: us / 1000 };
      });
      const heap = await inspector.send("Runtime.getHeapUsage");
      assert.equal(response.status, 200);
      assert.match(html, /__VINEXT_RSC_DONE__/);
      if (snapshotHitMode) assert.ok(html.includes("local-profile-snapshot-probe"), "Expected the staged snapshot, not the SSR fallback");
      if (variant.label === "snapshot-miss") assert.ok(!html.includes("local-profile-snapshot-probe"), "Expected the SSR fallback because no compatible snapshot was staged");
      report.samples.push({ build: variant.label, mode: snapshotHitMode ? "snapshot-hit" : snapshotMode ? "snapshot-miss" : "ssr", repetition, phase: index === 0 ? "cold" : "warm", index, status: response.status, htmlBytes: Buffer.byteLength(html), elapsedMs, sampledExecutionMs: sampledExecutionUs / 1000, heapUsedBytes: heap.usedSize, topFrames });
    }
    console.log(`PROFILE ${variant.label} isolate ${repetition + 1}/${repetitions}`);
  } finally {
    inspector?.socket.close(); await mf.dispose();
  }
}
try {
  for (let repetition = 0; repetition < repetitions; repetition++) {
    for (const variant of repetition % 2 === 0 ? variants : [...variants].reverse()) await sampleBuild(variant, repetition);
  }
  const percentile = (values, fraction) => values.sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
  report.summary = variants.flatMap(variant => ["cold", "warm"].map(phase => {
    const samples = report.samples.filter(sample => sample.build === variant.label && sample.phase === phase);
    const metrics = {};
    for (const metric of ["sampledExecutionMs", "elapsedMs", "heapUsedBytes"]) metrics[metric] = Object.fromEntries([0.5, 0.95, 0.99].map(fraction => ["p" + fraction * 100, percentile(samples.map(sample => sample[metric]), fraction)]));
    return { build: variant.label, phase, count: samples.length, ...metrics };
  }));
  report.status = "PASS_LOCAL_PROFILE";
} catch (error) {
  report.status = "FAILED"; report.error = error.message; process.exitCode = 1;
} finally {
  report.completedUtc = new Date().toISOString();
  await mkdir("outputs", { recursive: true });
  await writeFile("outputs/public-home-profile.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report.summary || { status: report.status, error: report.error }, null, 2));
}
