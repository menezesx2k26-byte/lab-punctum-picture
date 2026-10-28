import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHmac, createHash, randomBytes, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  privatePreviewConfig,
  privateRecoveryConfig,
  assertPrivateQaVacant,
  r2RestListing,
  d1QueryRows,
  assertPrivateBucketPrivacy,
  waitForPreviewStatus,
  PRIVATE_PREVIEW_NAMES as names,
  assertPreviewLoginEntry,
} from "./lib/private-preview.mjs";

assert.equal(
  process.env.PRIVATE_GALLERY_PREVIEW,
  "true",
  "This command is preview-only.",
);
assert.equal(
  process.env.GITHUB_ACTIONS,
  "true",
  "Run this credential-masking pilot only in GitHub Actions.",
);
const account = "257bca437616da74ece1ce4bbaf0bd89";
assert.equal(
  process.env.CLOUDFLARE_ACCOUNT_ID,
  account,
  "Unexpected Cloudflare account.",
);
const token = process.env.CLOUDFLARE_API_TOKEN;
const dbToken = process.env.CLOUDFLARE_D1_API_TOKEN;
assert.ok(token && dbToken, "Missing preview deployment credentials.");
const generated = "dist/server/wrangler.json";
const accessMode = process.env.PRIVATE_GALLERY_PREVIEW_AUTH_MODE === "access";
const report = {
  status: "running",
  worker: names.worker,
  authMode: accessMode ? "access" : "password",
  accessProviderTested: false,
  productionTouched: false,
  checks: [],
};
await mkdir("outputs", { recursive: true });
const record = (value) => {
  report.checks.push(value);
  console.log("PASS " + value);
};
async function api(path, { method = "GET", body, database = false, envelope = false } = {}) {
  const response = await fetch(
    "https://api.cloudflare.com/client/v4/accounts/" + account + path,
    {
      method,
      headers: {
        Authorization: "Bearer " + (database ? dbToken : token),
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(
      "Cloudflare " +
        method +
        " " +
        path +
        " failed: HTTP " +
        response.status +
        " codes " +
        JSON.stringify(result.errors?.map((e) => e.code)),
    );
  return envelope ? result : result.result;
}
function wrangler(args, input, database = false) {
  const result = spawnSync("node_modules/.bin/wrangler", args, {
    encoding: "utf8",
    input,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: database ? dbToken : token,
      WRANGLER_SEND_METRICS: "false",
    },
  });
  if (result.status !== 0) {
    console.error(result.stderr);
    console.error(result.stdout);
    throw new Error("Wrangler operation failed: " + args.slice(0, 2).join(" "));
  }
}
async function database(name) {
  const list = await api(
    "/d1/database?per_page=100&name=" + encodeURIComponent(name),
    { database: true },
  );
  const existing = list.find((d) => d.name === name);
  assert.ok(existing, "Pre-existing isolated QA database required; resource creation is disabled.");
  return existing;
}
async function query(id, sql, params = []) {
  const result = await api("/d1/database/" + id + "/query", {
    method: "POST",
    database: true,
    body: { sql, params },
  });
  return d1QueryRows(result);
}
const sign = (payload, secret) => {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret).update(body).digest("base64url")
  );
};
const mask = (value) => console.log("::add-mask::" + value);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  // Check permissions before any resource creation. All names are dedicated to this QA.
  const subdomain = await api("/workers/subdomain");
  const buckets = await api("/r2/buckets");
  await api("/d1/database?per_page=100", { database: true });
  const origin =
    "https://" + names.worker + "." + subdomain.subdomain + ".workers.dev";
  report.previewUrl = origin;
  const source = await database(names.database);
  const restored = await database(names.restoreDatabase);
  assert.notEqual(source.uuid, restored.uuid);
  for (const name of [names.originals, names.restoreOriginals, names.backups]) {
    assert.ok(buckets.buckets.some((b) => b.name === name), "Pre-existing isolated QA bucket required; resource creation is disabled.");
    const managed = await api("/r2/buckets/" + name + "/domains/managed");
    const custom = await api("/r2/buckets/" + name + "/domains/custom");
    assertPrivateBucketPrivacy(managed, custom);
  }
  await assertPrivateQaVacant(
    (role, sql, params) => query(role === "source" ? source.uuid : restored.uuid, sql, params),
    async (role) => r2RestListing(await api("/r2/buckets/" + (role === "source" ? names.originals : names.restoreOriginals) + "/objects?per_page=1", { envelope: true })),
  );
  record("isolated D1 databases and private R2 buckets verified without changing existing data");
  const originalConfig = JSON.parse(await readFile(generated, "utf8"));
  assert.equal(
    originalConfig.vars?.CLIENT_AUTH_MODE,
    accessMode ? "access" : "password",
    "Generated Worker mode differs from QA login mode.",
  );
  const configure = async (databaseId, restore = false) => {
    await writeFile(
      generated,
      JSON.stringify(
        privatePreviewConfig(originalConfig, {
          databaseId,
          origin,
          restored: restore,
          accessTeamDomain: process.env.CLIENT_ACCESS_TEAM_DOMAIN || undefined,
          accessAudience: process.env.CLIENT_ACCESS_AUD || undefined,
        }),
      ),
    );
  };
  for (const [db, restore] of [
    [source, false],
    [restored, true],
  ]) {
    await configure(db.uuid, restore);
    wrangler(
      [
        "d1",
        "migrations",
        "apply",
        restore ? names.restoreDatabase : names.database,
        "--remote",
        "--config",
        generated,
      ],
      undefined,
      true,
    );
  }
  await configure(source.uuid);
  wrangler(["deploy", "--config", generated]);
  const adminSecret = randomBytes(32).toString("base64url");
  let clientSecret = randomBytes(32).toString("base64url");
  const password = randomBytes(24).toString("base64url");
  for (const value of [adminSecret, clientSecret, password]) mask(value);
  wrangler(
    ["secret", "bulk", "--config", generated],
    JSON.stringify({
      ADMIN_SESSION_SECRET: adminSecret,
      CLIENT_SESSION_SECRET: clientSecret,
      ADMIN_PASSWORD_HASH: createHash("sha256").update(password).digest("hex"),
    }),
  );
  const adminCookie =
    "punctum_admin_session=" +
    sign(
      {
        email: "qa@punctum.invalid",
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
      adminSecret,
    );
  mask(adminCookie);
  async function request(
    path,
    method = "GET",
    body,
    cookie = adminCookie,
    expected = 200,
  ) {
    const response = await fetch(origin + path, {
      method,
      redirect: "manual",
      headers: {
        Origin: origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status !== expected) {
      const failure = await response
        .clone()
        .json()
        .catch(() => ({}));
      const code = failure?.error?.code;
      const safeCode =
        typeof code === "string" && /^[A-Z_]+$/.test(code)
          ? " (" + code + ")"
          : "";
      throw new Error(
        method +
          " " +
          path +
          " expected HTTP " +
          expected +
          ", received " +
          response.status +
          safeCode,
      );
    }
    assert.equal(
      response.headers.get("cache-control"),
      "private, no-store",
      path + " private caching",
    );
    assert.match(
      response.headers.get("x-robots-tag") ?? "",
      /noindex/,
      path + " private indexing",
    );
    return response;
  }
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      report.loginEntry = assertPreviewLoginEntry(
        await fetch(origin + "/albuns/entrar", { redirect: "manual" }),
        {
          authMode: accessMode ? "access" : "password",
          accessTeamDomain: process.env.CLIENT_ACCESS_TEAM_DOMAIN || undefined,
          accessAudience: process.env.CLIENT_ACCESS_AUD || undefined,
        },
      );
      break;
    } catch (error) {
      if (attempt === 11) throw error;
      await sleep(1000);
    }
  }
  if (report.loginEntry !== "access-redirect")
    await request("/albuns/entrar", "GET", undefined, "", accessMode ? 401 : 200);
  await request("/albuns", "GET", undefined, "", 303);
  await waitForPreviewStatus({
    probe: async () =>
      (
        await fetch(origin + "/admin/api/clientes", {
          headers: { Cookie: adminCookie },
        })
      ).status,
    pause: () => sleep(1000),
  });
  record(
    "login entry (real Access redirect when configured), page gate, private headers and rotated admin session",
  );
  const email = "pilot-" + randomUUID() + "@example.invalid";
  const accountData = await (
    await request(
      "/admin/api/clientes",
      "POST",
      { name: "Cliente fictício de homologação", email },
      adminCookie,
      201,
    )
  ).json();
  let cookie;
  if (accessMode) {
    assert.equal(accountData.authMode, "access");
    assert.equal(accountData.temporaryPassword, undefined);
    await request(
      "/api/client/session",
      "POST",
      { email, password: "blocked" },
      "",
      405,
    );
    await request("/api/client/password", "POST", { password }, "", 405);
    const now = Math.floor(Date.now() / 1000);
    cookie =
      "punctum_client_session=" +
      sign(
        {
          sub: accountData.client.id,
          version: 1,
          iat: now,
          exp: now + 3600,
          audience: "punctum-client-access",
        },
        clientSecret,
      );
    mask(cookie);
    await request("/api/client/me", "GET", undefined, cookie);
    report.accessProviderTested = false;
    report.sessionForQa = "synthetic HMAC cookie in isolated QA only";
    record(
      "Access-only account, password endpoints disabled, and synthetic QA session for downstream tests",
    );
  } else {
    mask(accountData.temporaryPassword);
    const login = await request(
      "/api/client/session",
      "POST",
      { email, password: accountData.temporaryPassword },
      "",
    );
    const temporaryCookie = login.headers.get("set-cookie").split(";")[0];
    mask(temporaryCookie);
    await request(
      "/api/client/galleries",
      "GET",
      undefined,
      temporaryCookie,
      403,
    );
    const changed = await request(
      "/api/client/password",
      "POST",
      { password },
      temporaryCookie,
    );
    cookie = changed.headers.get("set-cookie").split(";")[0];
    mask(cookie);
    await request("/api/client/me", "GET", undefined, temporaryCookie, 401);
    record(
      "first-password flow and old-session revocation on Cloudflare runtime",
    );
  }
  const data = await (
    await request(
      "/admin/api/albuns-privados",
      "POST",
      {
        title: "Homologação — dez fotografias",
        clientId: accountData.client.id,
        theme: "ivory",
      },
      adminCookie,
      201,
    )
  ).json();
  const galleryId = data.gallery.id;
  const base = "/admin/api/albuns-privados/" + galleryId;
  const client = "/api/client/galleries/" + galleryId;
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg==",
    "base64",
  );
  const images = [];
  for (let i = 0; i < 10; i++) {
    const intent = await (
      await request(
        base + "/uploads/intents",
        "POST",
        {
          filename: "ficticia-" + i + ".png",
          mimeType: "image/png",
          sizeBytes: bytes.length,
        },
        adminCookie,
        201,
      )
    ).json();
    const upload = (content) =>
      fetch(intent.uploadUrl, {
        method: "PUT",
        headers: {
          ...intent.requiredHeaders,
          Origin: origin,
          Cookie: adminCookie,
          "Content-Length": String(content.length),
        },
        body: content,
      });
    if (i === 4)
      assert.equal((await upload(Buffer.alloc(bytes.length))).status, 400);
    assert.equal((await upload(bytes)).status, 200);
    await request(base + "/uploads/" + intent.intentId + "/complete", "POST");
    images.push(intent.imageId);
  }
  await request(base + "/cover", "PUT", { imageId: images[0] });
  await request(base + "/publish", "POST");
  const detail = await (await request(client, "GET", undefined, cookie)).json();
  assert.equal(detail.gallery.images.length, 10);
  await request(client + "/favorites/" + images[0], "PUT", undefined, cookie);
  await request(
    client + "/images/" + images[0] + "/download",
    "GET",
    undefined,
    cookie,
    403,
  );
  await request(base, "PATCH", { allowDownloads: true });
  const original = await request(
    client + "/images/" + images[0] + "/download",
    "GET",
    undefined,
    cookie,
  );
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  await request(
    client + "/images/" + images[0] + "/gallery",
    "GET",
    undefined,
    cookie,
  );
  await request(
    client + "/images/" + images[0] + "/gallery",
    "GET",
    undefined,
    "",
    404,
  );
  const publicLeak = await fetch(origin + "/media/" + images[0] + "/gallery");
  assert.equal(publicLeak.status, 404);
  assert.equal(
    (
      await fetch(
        origin +
          "/_vinext/image?url=" +
          encodeURIComponent(client + "/images/" + images[0] + "/gallery") +
          "&w=640&q=75",
        { headers: { Cookie: cookie } },
      )
    ).status,
    404,
  );
  record(
    "ten uploads, isolated retry, publication, favorites, downloads and public-media denial",
  );

  // Source-only revocation is scoped to this run's synthetic client.
  await query(source.uuid, "UPDATE client_accounts SET disabled_at=?,session_version=session_version+1 WHERE id=?", [new Date().toISOString(), accountData.client.id]);
  await request("/api/client/me", "GET", undefined, cookie, 401);
  const recoveryConfigPath = "outputs/private-recovery-wrangler.json";
  await writeFile(recoveryConfigPath, JSON.stringify(privateRecoveryConfig({ sourceId: source.uuid, restoreId: restored.uuid, origin, clientId: accountData.client.id })));
  report.qaWorkerStage = "recovery";
  wrangler(["deploy", "--config", recoveryConfigPath]);
  const recoverySecret = randomBytes(32).toString("base64url");
  mask(recoverySecret);
  wrangler(["secret", "bulk", "--config", recoveryConfigPath], JSON.stringify({ QA_RECOVERY_SECRET: recoverySecret }));
  // Never retry an ambiguous recovery write automatically; inspect the sanitized report/state.
  const recoveryResponse = await fetch(origin + "/qa/recover", { method: "POST", redirect: "manual", headers: {
    Origin: origin, Authorization: "Bearer " + recoverySecret, "Content-Type": "application/json",
  }, body: JSON.stringify({ clientIds: [accountData.client.id] }) });
  assert.equal(recoveryResponse.status, 200, "QA recovery failed; inspect preserved resources before retrying.");
  const recovery = await recoveryResponse.json();
  assert.equal(recovery.backupVerified, true);
  assert.equal(recovery.accountsQuarantined, true);
  assert.equal(recovery.requiresSessionSecretRotation, true);
  assert.equal(recovery.objects, 10);
  report.restoredRows = recovery.rows;
  report.restoredObjects = recovery.objects;
  report.backupHash = recovery.backupHash;
  report.objectHashes = recovery.hashes;
  // Quarantine prevents reopening until a fresh secret is installed.
  await configure(restored.uuid, true);
  wrangler(["deploy", "--config", generated]);
  report.qaWorkerStage = "restored-app-quarantined";
  clientSecret = randomBytes(32).toString("base64url");
  mask(clientSecret);
  wrangler(["secret", "bulk", "--config", generated], JSON.stringify({ CLIENT_SESSION_SECRET: clientSecret }));
  await waitForPreviewStatus({ probe: async () => (await fetch(origin + "/admin/api/clientes", { headers: { Cookie: adminCookie } })).status, pause: () => sleep(1000) });
  await request("/api/client/me", "GET", undefined, cookie, 401);
  await request("/admin/api/clientes/" + accountData.client.id, "PATCH", { disabled: false });
  const [restoredAccount] = await query(restored.uuid, "SELECT session_version FROM client_accounts WHERE id=?", [accountData.client.id]);
  const restoredSessionVersion = restoredAccount.session_version;
  if (accessMode) {
    const now = Math.floor(Date.now() / 1000);
    cookie = "punctum_client_session=" + sign({ sub: accountData.client.id, version: restoredSessionVersion, iat: now, exp: now + 3600, audience: "punctum-client-access" }, clientSecret);
    mask(cookie);
  } else {
    const login = await request("/api/client/session", "POST", { email, password }, "");
    cookie = login.headers.get("set-cookie").split(";")[0];
    mask(cookie);
  }
  await waitForPreviewStatus({ probe: async () => (await fetch(origin + "/api/client/me", { headers: { Cookie: cookie } })).status, transient: [401], pause: () => sleep(1000) });
  report.qaWorkerStage = "restored-app";
  const restoredGallery = await (
    await request(client, "GET", undefined, cookie)
  ).json();
  assert.equal(restoredGallery.gallery.images.length, 10);
  assert.equal(
    restoredGallery.gallery.images.find((i) => i.id === images[0]).favorite,
    true,
  );
  for (const id of images) {
    const result = await request(
      client + "/images/" + id + "/download",
      "GET",
      undefined,
      cookie,
    );
    assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes);
  }
  record(
    "D1 and R2 restoration: authenticated gallery, favorite and every original verified byte-for-byte",
  );
  await request(base + "/archive", "POST");
  await request(
    client + "/images/" + images[0] + "/gallery",
    "GET",
    undefined,
    cookie,
    404,
  );
  const reset = await (
    await request(
      "/admin/api/clientes/" + accountData.client.id + "/reset-password",
      "POST",
    )
  ).json();
  await request("/api/client/me", "GET", undefined, cookie, 401);
  let resetCookie;
  if (accessMode) {
    assert.equal(reset.temporaryPassword, undefined);
    assert.equal(reset.authMode, "access");
    const now = Math.floor(Date.now() / 1000);
    resetCookie =
      "punctum_client_session=" +
      sign(
        {
          sub: accountData.client.id,
          version: restoredSessionVersion + 1,
          iat: now,
          exp: now + 3600,
          audience: "punctum-client-access",
        },
        clientSecret,
      );
  } else {
    mask(reset.temporaryPassword);
    const resetLogin = await request(
      "/api/client/session",
      "POST",
      { email, password: reset.temporaryPassword },
      "",
    );
    resetCookie = resetLogin.headers.get("set-cookie").split(";")[0];
  }
  mask(resetCookie);
  await request("/api/client/me", "GET", undefined, resetCookie);
  await request("/admin/api/clientes/" + accountData.client.id, "PATCH", {
    disabled: true,
  });
  await request("/api/client/me", "GET", undefined, resetCookie, 401);
  await request(
    "/api/client/session",
    "POST",
    { email, password: reset.temporaryPassword ?? "disabled" },
    "",
    accessMode ? 405 : 401,
  );
  record("archive, reset and disabled account revocation after restoration");
  report.status = accessMode ? "partial-access-otp-required" : "passed";
} catch (error) {
  report.status = "failed";
  report.error = error.message;
  throw error;
} finally {
  await writeFile(
    "outputs/private-galleries-preview-report.json",
    JSON.stringify(report, null, 2),
  );
}
