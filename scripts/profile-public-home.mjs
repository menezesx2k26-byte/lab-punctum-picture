/**
 * Reproducible local workerd profiler, not Cloudflare billing CPU or RUM.
 * Usage: node scripts/profile-public-home.mjs baseline=/tmp/baseline-dist after=dist
 * Alternates fresh isolates per build to reduce ordering/load bias. Each isolate
 * serves one cold and five warm homes using identical fresh synthetic D1 seeds.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { globSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

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
  scope: "LOCAL workerd/V8 sampled execution; excludes idle samples, includes compilation/program samples; not edge CPU or billable CPU",
  node: process.version, repetitions, warmRequestsPerIsolate: 5,
  builds: variants.map(variant => ({ label: variant.label, bundleSha256: createHash("sha256").update(readFileSync(resolve(variant.directory, "server/index.js"))).digest("hex"), ssrBundleSha256: createHash("sha256").update(readFileSync(resolve(variant.directory, "server/ssr/index.js"))).digest("hex") })),
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
  const root = resolve(variant.directory, "server");
  const main = resolve(root, "index.js");
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: "punctum-home-profiler",
    modules: [{ type: "ESModule", path: main }, ...globSync(root + "/**/*.js").filter(path => path !== main).map(path => ({ type: "ESModule", path }))],
    modulesRoot: root, compatibilityDate: "2026-05-22", compatibilityFlags: ["nodejs_compat"],
    d1Databases: { DB: "punctum-home-profiler" },
    r2Buckets: { ORIGINALS: "punctum-home-profiler-originals", BACKUPS: "punctum-home-profiler-backups" },
    assets: { directory: resolve(variant.directory, "client"), binding: "ASSETS", routerConfig: { has_user_worker: true } },
    bindings: { ENVIRONMENT: "local", PRIVATE_GALLERIES_ENABLED: "false", CLIENT_AUTH_MODE: "access", SITE_ORIGIN: "http://localhost", PUBLIC_SITE_URL: "http://localhost" },
    host: "127.0.0.1", port: 0, inspectorPort: 0,
  }));
  let inspector;
  try {
    await mf.ready;
    const db = await mf.getD1Database("DB");
    for (const file of globSync("migrations/*.sql").sort()) {
      for (const sql of readFileSync(file, "utf8").split(";").map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
    }
    inspector = await connect(mf);
    await inspector.send("Profiler.enable");
    await inspector.send("Profiler.setSamplingInterval", { interval: 100 });
    const worker = await mf.getWorker();
    for (let index = 0; index < 6; index++) {
      await inspector.send("Profiler.start");
      const start = performance.now();
      const response = await worker.fetch("http://localhost/");
      const html = await response.text();
      const elapsedMs = performance.now() - start;
      const { profile } = await inspector.send("Profiler.stop");
      const idleIds = new Set(profile.nodes.filter(node => node.callFrame.functionName === "(idle)").map(node => node.id));
      let sampledExecutionUs = 0;
      profile.samples.forEach((id, index) => { if (!idleIds.has(id)) sampledExecutionUs += profile.timeDeltas[index]; });
      const heap = await inspector.send("Runtime.getHeapUsage");
      assert.equal(response.status, 200);
      assert.match(html, /__VINEXT_RSC_DONE__/);
      report.samples.push({ build: variant.label, repetition, phase: index === 0 ? "cold" : "warm", index, status: response.status, htmlBytes: Buffer.byteLength(html), elapsedMs, sampledExecutionMs: sampledExecutionUs / 1000, heapUsedBytes: heap.usedSize });
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
