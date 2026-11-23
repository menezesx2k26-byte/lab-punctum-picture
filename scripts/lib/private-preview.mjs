export const PRIVATE_PREVIEW_NAMES = Object.freeze({
  worker: "punctum-picture-albums-qa",
  database: "punctum-picture-albums-qa",
  restoreDatabase: "punctum-picture-albums-qa-restore",
  originals: "punctum-picture-albums-qa-originals",
  restoreOriginals: "punctum-picture-albums-qa-restored",
  backups: "punctum-picture-albums-qa-backups",
});
const PRODUCTION_DATABASES = new Set([
  "22697f13-7484-41e3-9441-f7b902c6577a",
  "4e959036-a3f0-4faf-bda2-fca9b4c5e984",
]);
export function privatePreviewConfig(
  base,
  { databaseId, origin, restored = false, accessTeamDomain = undefined, accessAudience = undefined },
) {
  if (
    !/^[0-9a-f-]{36}$/i.test(databaseId ?? "") ||
    PRODUCTION_DATABASES.has(databaseId)
  )
    throw new Error("Preview requires an isolated database.");
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".workers.dev") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Preview requires its dedicated workers.dev origin.");
  const vars = { ...base.vars };
  const authMode = vars.CLIENT_AUTH_MODE ?? "password";
  if (!["password", "access"].includes(authMode))
    throw new Error("Invalid private auth mode.");
  if (Boolean(accessTeamDomain) !== Boolean(accessAudience))
    throw new Error("Access preview requires both team domain and audience.");
  if (accessTeamDomain) {
    if (
      !/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(accessTeamDomain) ||
      typeof accessAudience !== "string" ||
      accessAudience.length < 8 ||
      accessAudience.length > 256
    )
      throw new Error("Invalid Access preview identity configuration.");
  }
  for (const key of Object.keys(vars))
    if (/SECRET|PASSWORD|TOKEN|KEY/.test(key)) delete vars[key];
  const config = {
    ...base,
    name: PRIVATE_PREVIEW_NAMES.worker,
    account_id: "257bca437616da74ece1ce4bbaf0bd89",
    workers_dev: true,
    preview_urls: false,
    routes: [],
    triggers: { crons: [] },
    vars: {
      ...vars,
      ENVIRONMENT: "preview",
      PRIVATE_GALLERIES_ENABLED: "true",
      CLIENT_AUTH_MODE: authMode,
      ...(authMode === "access"
        ? {
            CLIENT_ACCESS_TEAM_DOMAIN:
              accessTeamDomain ?? "qa-placeholder.cloudflareaccess.com",
            CLIENT_ACCESS_AUD: accessAudience ?? "qa-access-not-configured",
          }
        : {}),
      SITE_ORIGIN: url.origin,
      PUBLIC_SITE_URL: url.origin,
      ADMIN_ALLOWED_EMAILS: "qa@punctum.invalid",
    },
    d1_databases: [
      {
        binding: "DB",
        database_name: restored
          ? PRIVATE_PREVIEW_NAMES.restoreDatabase
          : PRIVATE_PREVIEW_NAMES.database,
        database_id: databaseId,
        migrations_dir: "../../migrations",
      },
    ],
    r2_buckets: [
      {
        binding: "ORIGINALS",
        bucket_name: restored
          ? PRIVATE_PREVIEW_NAMES.restoreOriginals
          : PRIVATE_PREVIEW_NAMES.originals,
      },
      { binding: "BACKUPS", bucket_name: PRIVATE_PREVIEW_NAMES.backups },
    ],
    images: { binding: "IMAGES" },
  };
  // QA never requests a paid Workers CPU allowance, including legacy-password QA.
  delete config.limits;
  return config;
}

/**
 * @param {Response} response
 * @param {{ authMode: string, accessTeamDomain?: string, accessAudience?: string }} config
 */
export function assertPreviewLoginEntry(response, config) {
  const { authMode, accessTeamDomain, accessAudience } = config;
  if (authMode !== "access") {
    if (response.status !== 200) throw new Error("Password login entry unavailable.");
    return "password";
  }
  if (!accessTeamDomain && !accessAudience) {
    if (response.status !== 401) throw new Error("Unconfigured Access entry must fail closed.");
    return "access-unconfigured";
  }
  if (!accessTeamDomain || !accessAudience || response.status !== 302)
    throw new Error("Configured Access login redirect unavailable.");
  const location = new URL(response.headers.get("Location") ?? "");
  if (location.protocol !== "https:" || location.hostname !== accessTeamDomain ||
    location.username || location.password ||
    !location.pathname.startsWith("/cdn-cgi/access/login/") ||
    location.searchParams.get("kid") !== accessAudience)
    throw new Error("Unexpected Access login destination.");
  // Reaching this page is evidence of provider routing, never successful OTP.
  return "access-redirect";
}

export async function waitForPreviewStatus({
  probe,
  expected = 200,
  transient = [403],
  pause,
  attempts = 30,
}) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const status = await probe();
    if (status === expected) return;
    if (!transient.includes(status))
      throw new Error("Preview readiness failed: HTTP " + status);
    if (attempt + 1 < attempts) await pause();
  }
  throw new Error("Preview authentication/binding propagation timed out.");
}

export async function assertPrivateQaVacant(query, listObjects) {
  const tables = ["client_accounts", "client_galleries", "client_gallery_images", "client_gallery_upload_intents", "client_gallery_favorites"];
  for (const role of ["source", "restore"]) {
    for (const table of tables) {
      const schema = await query(role, "SELECT name FROM sqlite_master WHERE type='table' AND name=?", [table]);
      if (!Array.isArray(schema)) throw new Error("Private QA schema is not verifiable.");
      if (schema.length) {
        const rows = await query(role, `SELECT 1 FROM ${table} LIMIT 1`, []);
        if (!Array.isArray(rows)) throw new Error("Private QA rows are not verifiable.");
        if (rows.length) throw new Error("Private QA database is not empty; preserve existing evidence.");
      }
    }
    const listed = await listObjects(role);
    if (!Array.isArray(listed?.objects) || listed.objects.length || listed.truncated)
      throw new Error("Private QA bucket is not empty or cannot be verified.");
  }
}

export function assertPrivateBucketPrivacy(managed, custom) {
  if (managed?.enabled !== false || !Array.isArray(custom?.domains) || custom.domains.some((d) => d.enabled !== false))
    throw new Error("QA bucket privacy is not verified.");
}
export function privateRecoveryConfig({ sourceId, restoreId, origin, clientId }) {
  if (!/^[a-f0-9-]{36}$/i.test(clientId || "")) throw new Error("Explicit QA fixture required.");
  for (const id of [sourceId, restoreId])
    if (!/^[a-f0-9-]{36}$/i.test(id || "") || PRODUCTION_DATABASES.has(id)) throw new Error("Isolated recovery database required.");
  if (sourceId === restoreId || !/^https:\/\/punctum-picture-albums-qa\.[a-z0-9-]+\.workers\.dev$/.test(origin))
    throw new Error("Distinct QA recovery resources required.");
  return {
    name: PRIVATE_PREVIEW_NAMES.worker, account_id: "257bca437616da74ece1ce4bbaf0bd89",
    main: "../scripts/private-recovery-worker.ts", compatibility_date: "2026-05-22", compatibility_flags: ["nodejs_compat"],
    workers_dev: true, preview_urls: false, routes: [], triggers: { crons: [] },
    vars: { ENVIRONMENT: "preview", QA_RECOVERY_ENABLED: "true", SITE_ORIGIN: origin, QA_RECOVERY_CLIENT_ID: clientId },
    d1_databases: [{ binding: "SOURCE_DB", database_id: sourceId }, { binding: "RESTORE_DB", database_id: restoreId }],
    r2_buckets: [
      { binding: "SOURCE_ORIGINALS", bucket_name: PRIVATE_PREVIEW_NAMES.originals },
      { binding: "RESTORE_ORIGINALS", bucket_name: PRIVATE_PREVIEW_NAMES.restoreOriginals },
      { binding: "BACKUPS", bucket_name: PRIVATE_PREVIEW_NAMES.backups },
    ],
  };
}

export function r2RestListing(envelope) {
  if (envelope?.success !== true || !Array.isArray(envelope.result) || typeof envelope.result_info?.is_truncated !== "boolean")
    throw new Error("R2 object listing is not verifiable.");
  return { objects: envelope.result, truncated: envelope.result_info.is_truncated };
}

export function d1QueryRows(result) {
  if (!Array.isArray(result) || result.length !== 1 || result[0]?.success !== true || !Array.isArray(result[0].results))
    throw new Error("D1 query result is not verifiable.");
  return result[0].results;
}
