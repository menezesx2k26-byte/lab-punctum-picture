import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { takeEvidenceScreenshot } from "./screenshot-evidence.mjs";

test("keeps full-page visual proof when the browser succeeds", async () => {
  const calls = [];
  const page = { screenshot: async options => { calls.push(options); } };
  const result = await takeEvidenceScreenshot(page, "/tmp/synthetic.png");
  assert.equal(result, "fullPage");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fullPage, true);
  assert.equal(calls[0].animations, "disabled");
});

test("uses a disclosed viewport fallback if full-page capture alone times out", async () => {
  const calls = [];
  const page = { screenshot: async options => {
    calls.push(options);
    if (calls.length === 1) throw Object.assign(new Error("Screenshot timed out"), { name: "TimeoutError" });
  } };
  const result = await takeEvidenceScreenshot(page, "/tmp/synthetic.png");
  assert.equal(result, "viewportFallback");
  assert.deepEqual(calls.map(call => call.fullPage), [true, false]);
  assert.equal(calls[1].animations, "disabled");
});

test("records a bounded CDP viewport fallback without claiming full-page visual evidence", async () => {
  const folder = await mkdtemp(join(tmpdir(), "punctum-screenshot-test-"));
  const path = join(folder,"synthetic.png");
  let detached = false;
  let requested = null;
  const bytes = Buffer.from("synthetic-screen-bytes");
  const page = {
    screenshot: async () => { throw Object.assign(new Error("slow page capture"), {name:"TimeoutError"}); },
    context: () => ({newCDPSession: async () => ({
      send: async (method, params) => { requested = {method,params}; return {data:bytes.toString("base64")}; },
      detach: async () => { detached = true; },
    })}),
  };
  try {
    assert.equal(await takeEvidenceScreenshot(page,path), "cdpViewportFallback");
    assert.deepEqual(await readFile(path), bytes);
    assert.equal(requested.method,"Page.captureScreenshot");
    assert.equal(requested.params.captureBeyondViewport,false);
    assert.equal(detached,true);
  } finally { await rm(folder, {recursive:true,force:true}); }
});

test("never masks non-timeout screenshot failures or missing viewport evidence", async () => {
  for (const name of ["Error", "TimeoutError"]) {
    const calls = [];
    const page = { screenshot: async options => {
      calls.push(options);
      throw Object.assign(new Error("capture unavailable"), { name });
    } };
    await assert.rejects(() => takeEvidenceScreenshot(page, "/tmp/synthetic.png"), /capture unavailable/);
    assert.equal(calls.length, name === "Error" ? 1 : 2);
  }
});
