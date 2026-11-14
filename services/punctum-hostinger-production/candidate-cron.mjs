import { candidateConfig } from "./candidate-runtime.mjs";
import { openCandidateWritableDatabase } from "./candidate-sqlite.mjs";
import { candidateOriginals } from "./candidate-originals.mjs";
import { candidateLocalBackups } from "./candidate-backups.mjs";

const cronMode = process.argv[2];
const expected = { hourly: "0 * * * *", daily: "0 3 * * *" };
if (!Object.hasOwn(expected, cronMode)) {
  throw Error("CANDIDATE_CRON_MODE_INVALID");
}

process.umask(0o077);
const config = candidateConfig();
const { handleScheduled } = await import(new URL("../../dist/hostinger-cron/scheduled.mjs", import.meta.url));
if (typeof handleScheduled !== "function") {
  throw Error("CANDIDATE_CRON_HANDLER_MISSING");
}

const db = openCandidateWritableDatabase(config.dbFile, {
  candidateMode: "PRIVATE_PRODUCTION_CANDIDATE",
});
const originals = candidateOriginals(config.originals);
const backups = candidateLocalBackups(config.backupsRoot);

const env = {
  ENVIRONMENT: config.environment,
  PRIVATE_GALLERIES_ENABLED: "true",
  CLIENT_AUTH_MODE:
    process.env.PUNCTUM_CANDIDATE_CLIENT_AUTH_MODE ||
    process.env.CLIENT_AUTH_MODE ||
    "password",
  DB: db,
  ORIGINALS: originals,
  BACKUPS: backups,
  BACKUP_PREFIX: "backups/d1",
};

const tasks = [];
const ctx = {
  waitUntil(promise) {
    tasks.push(Promise.resolve(promise));
  },
};

try {
  await handleScheduled({ cron: expected[cronMode], scheduledTime: Date.now(), noRetry() {} }, env, ctx);
  await Promise.all(tasks);
  const result = await backups.list({ prefix: "backups/d1/", limit: 1000 });
  if (cronMode === "daily" && !result.objects.some((x) => x.key.includes("/daily/"))) {
    throw Error("CANDIDATE_CRON_DAILY_BACKUP_NOT_CREATED");
  }
  console.log(
    JSON.stringify({
      status: "CANDIDATE_SCHEDULED_JOB_PASS",
      cronMode,
      environment: config.environment,
      backupsPresent: result.objects.length,
      dnsTouched: false,
    }),
  );
} finally {
  db.close();
}
