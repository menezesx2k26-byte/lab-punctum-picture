/**
 * One-shot, explicitly dispatched visual release for Punctum.
 * Uses the existing Studio version/revision API; never edits D1 directly.
 * Preserve all editorial content, hero/media, photo/album records and secrets.
 */
import crypto from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { build } from "esbuild";

const ORIGIN = "https://punctumpicture.com";
const PRESET = "colagem-autoral";
const hash = (x) => crypto.createHash("sha256").update(JSON.stringify(x)).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function assertSafeReleaseState(studio, published) {
  if (!studio || !published?.siteConfig || !studio.siteConfig) {
    throw Error("studio_or_published_config_missing");
  }
  if (!Number.isSafeInteger(studio.revision) || studio.revision < 1) {
    throw Error("studio_revision_invalid");
  }
  if (!studio.history?.some((version) => version.isCurrent && version.id)) {
    throw Error("published_version_rollback_checkpoint_missing");
  }
}

/** Explicit allowlist. No text/media, order, enabled state or settings changes. */
export function assertVisualOnlyChange(original, updated) {
  if (!original?.identity || !updated?.identity || updated.identity.sourcePresetId !== PRESET) {
    throw Error("target_preset_invalid");
  }
  const stripped = structuredClone(updated);
  stripped.identity = structuredClone(original.identity);
  stripped.theme = structuredClone(original.theme);
  if (stripped.pages.home.sections.length !== original.pages.home.sections.length) {
    throw Error("homepage_section_count_changed");
  }
  for (let index = 0; index < original.pages.home.sections.length; index++) {
    const current = original.pages.home.sections[index];
    const target = stripped.pages.home.sections[index];
    if (target.type !== current.type || target.id !== current.id) {
      throw Error("homepage_section_identity_changed");
    }
    target.variant = current.variant;
  }
  if (!isDeepStrictEqual(stripped, original)) {
    throw Error("release_changes_non_visual_studio_fields");
  }
}

export async function createCandidate(current) {
  // Compile the actual production preset implementation, not a duplicate recipe.
  const bundled = await build({
    entryPoints: ["shared/config/preset-registry.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  const src = Buffer.from(bundled.outputFiles[0].contents).toString("base64");
  const { applySitePreset } = await import("data:text/javascript;base64," + src);
  const candidate = applySitePreset(current, PRESET);
  assertVisualOnlyChange(current, candidate);
  return candidate;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Error("endpoint_http_" + response.status + ":" + new URL(url).pathname);
  return { response, payload };
}

async function publicRead(route) {
  return (await requestJson(ORIGIN + route, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
  })).payload;
}

async function authorizedRead() {
  const email = process.env.SOURCE_ADMIN_EMAIL;
  const password = process.env.SOURCE_ADMIN_PASSWORD;
  if (!email || !password) throw Error("production_admin_secrets_missing");
  const { response } = await requestJson(ORIGIN + "/admin/api/session", {
    method: "POST",
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
  if (!cookie.startsWith("punctum_admin_session=")) throw Error("admin_cookie_missing");
  const adminJson = async (route, method = "GET", body = null) => (await requestJson(
    ORIGIN + route,
    {
      method,
      headers: {
        Cookie: cookie,
        Origin: ORIGIN,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  )).payload;
  return adminJson;
}

async function main(mode) {
  if (!["--check", "--apply"].includes(mode)) throw Error("use_--check_or_--apply");
  const adminJson = await authorizedRead();
  const [studio, before, statsBefore] = await Promise.all([
    adminJson("/admin/api/studio"),
    publicRead("/api/public/site?visual-release=before"),
    publicRead("/api/public/stats?visual-release=before"),
  ]);
  assertSafeReleaseState(studio, before);
  const previousVersion = studio.history.find((version) => version.isCurrent).id;
  // A pending draft is legitimate editorial work. Apply the visual preset to
  // the PUBLISHED snapshot only and preserve the complete draft separately.
  const candidate = await createCandidate(before.siteConfig);
  const initial = before.siteConfig.identity.sourcePresetId;
  const draftHashBefore = hash(studio.siteConfig);
  if (!isDeepStrictEqual(statsBefore.stats, {
    photoCount: statsBefore.stats.photoCount,
    albumCount: statsBefore.stats.albumCount,
    categoryCount: statsBefore.stats.categoryCount,
  })) throw Error("invalid_stats_baseline");
  if (mode === "--check") {
    console.log(JSON.stringify({
      status: "safe_to_publish",
      currentPreset: initial,
      targetPreset: PRESET,
      publishedVersion: previousVersion,
      revision: studio.revision,
      originalHash: hash(before.siteConfig),
      newVisualHash: hash(candidate),
      photoCount: statsBefore.stats.photoCount,
      albumCount: statsBefore.stats.albumCount,
      categoryCount: statsBefore.stats.categoryCount,
      pendingDraftExists: Boolean(studio.hasUnpublishedChanges),
      pendingDraftHash: draftHashBefore,
      draftPreserved: true,
    }));
    return;
  }
  if (initial === PRESET && isDeepStrictEqual(before.siteConfig, candidate)) {
    console.log(JSON.stringify({ status: "already_published", preset: PRESET, publishedVersion: previousVersion }));
    return;
  }
  const published = await adminJson("/admin/api/studio/publish-visual", "POST", {
    presetId: PRESET,
    expectedPublishedVersionId: previousVersion,
    expectedDraftRevision: studio.revision,
  });
  if (!published.draftPreserved || published.previousVersionId !== previousVersion) {
    throw Error("visual_release_response_invalid");
  }
  let after;
  for (let i = 0; i < 5; i++) {
    after = await publicRead("/api/public/site?visual-release=" + Date.now());
    if (isDeepStrictEqual(after.siteConfig, candidate)) break;
    await sleep(2500);
  }
  const statsAfter = await publicRead("/api/public/stats?visual-release=after");
  const draftAfter = await adminJson("/admin/api/studio");
  if (!isDeepStrictEqual(after?.siteConfig, candidate) ||
      !isDeepStrictEqual(statsBefore.stats, statsAfter.stats) ||
      hash(draftAfter.siteConfig) !== draftHashBefore ||
      draftAfter.revision !== studio.revision ||
      draftAfter.hasUnpublishedChanges !== studio.hasUnpublishedChanges) {
    // The former published version is retained in Studio history for an audited
    // restore; do not blindly roll back if another administrator changed it.
    throw Error("post_publish_verification_failed_restore_previous_version_" + previousVersion);
  }
  console.log(JSON.stringify({
    status: "published_and_verified",
    beforePreset: initial,
    preset: PRESET,
    previousVersion,
    publishedVersion: published.publishedVersionId,
    draftRevisionUnchanged: draftAfter.revision,
    draftHashUnchanged: true,
    pendingDraftPreserved: Boolean(draftAfter.hasUnpublishedChanges),
    contentPreserved: true,
    archivePreserved: true,
    originalHash: hash(before.siteConfig),
    releasedHash: hash(candidate),
    productionUrl: ORIGIN,
  }));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/publish-colagem-production.mjs")) {
  main(process.argv[2]).catch((error) => {
    console.error("Release guard failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
