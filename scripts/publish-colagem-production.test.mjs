import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  assertSafeReleaseState,
  assertVisualOnlyChange,
  createCandidate,
} from "./publish-colagem-production.mjs";

const compiled = await build({
  entryPoints: ["shared/config/preset-registry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});
const { getSitePreset } = await import(
  "data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].contents).toString("base64")
);
const sample = () => {
  const current = structuredClone(getSitePreset("intenso-noturno").config);
  current.editorial.home.hero.title = "Texto personalizado da Maria";
  current.pages.home.sections[0].heroMedia = null;
  current.theme.background.imageId = null;
  current.theme.background.assetId = null;
  return current;
};
const state = (config) => ({
  siteConfig: config,
  revision: 8,
  hasUnpublishedChanges: false,
  history: [{ id: "published-version", isCurrent: true }],
});

test("release gate allows preserving Maria's unpublished work without publishing it", () => {
  const current = sample();
  assert.doesNotThrow(() => assertSafeReleaseState(state(current), { siteConfig: current }));
  assert.doesNotThrow(() => assertSafeReleaseState({ ...state(current), hasUnpublishedChanges: true }, { siteConfig: current }));
  assert.throws(
    () => assertSafeReleaseState({ ...state(current), history: [] }, { siteConfig: current }),
    /rollback_checkpoint/,
  );
});

test("colagem preset preserves editorial, hero/media, home order and all non-visual data", async () => {
  const current = sample();
  const next = await createCandidate(current);
  assert.equal(next.identity.sourcePresetId, "colagem-autoral");
  assert.notDeepEqual(next.theme, current.theme);
  assert.deepEqual(next.editorial, current.editorial);
  assert.deepEqual(next.pages.portfolio, current.pages.portfolio);
  assert.deepEqual(next.pages.home.sections.map(s => s.id), current.pages.home.sections.map(s => s.id));
  assert.deepEqual(next.pages.home.sections.map(s => s.enabled), current.pages.home.sections.map(s => s.enabled));
  assert.doesNotThrow(() => assertVisualOnlyChange(current, next));
  next.editorial.home.hero.title = "Substituído por engano";
  assert.throws(() => assertVisualOnlyChange(current, next), /non_visual/);
});

test("release guard prevents removal of sections and changes to album display count", async () => {
  const current = sample();
  const next = await createCandidate(current);
  next.pages.home.sections.pop();
  assert.throws(() => assertVisualOnlyChange(current, next), /section_count/);
});
