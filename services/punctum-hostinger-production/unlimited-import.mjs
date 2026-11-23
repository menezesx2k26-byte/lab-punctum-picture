import { chmodSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { importManagedSeed } from "./managed-import.mjs";

const moduleFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(moduleFile), "../..");
const defaultBundlePath = fileURLToPath(new URL("./managed-seed.bin", import.meta.url));
const forbiddenSegments = new Set([
  "hbuilds",
  "public_html",
  "public",
  "dist",
  "production-import",
  "d1-export",
  "r2-export",
]);

function assertSafeTarget(rawPath) {
  if (typeof rawPath !== "string" || !rawPath.trim()) {
    throw Error("UNLIMITED_IMPORT_UNSAFE_PATH");
  }
  const trimmed = rawPath.trim();
  if (/[\x00-\x1f\x7f]/.test(trimmed) || !isAbsolute(trimmed)) {
    throw Error("UNLIMITED_IMPORT_UNSAFE_PATH");
  }
  const parts = trimmed.split(/[\\/]+/).filter(Boolean);
  if (parts.includes("..") || parts.includes(".")) {
    throw Error("UNLIMITED_IMPORT_UNSAFE_PATH");
  }
  for (const part of parts) {
    if (forbiddenSegments.has(part.toLowerCase())) {
      throw Error("UNLIMITED_IMPORT_UNSAFE_PATH");
    }
  }
  const normalized = resolve(trimmed);
  if (normalized === projectRoot || normalized.startsWith(projectRoot + sep)) {
    throw Error("UNLIMITED_IMPORT_UNSAFE_PATH");
  }
  let current = sep;
  for (const segment of normalized.split(sep).filter(Boolean)) {
    current = join(current, segment);
    let st;
    try {
      st = lstatSync(current);
    } catch (error) {
      if (error && error.code === "ENOENT") break;
      throw error;
    }
    if (st.isSymbolicLink()) {
      throw Error("UNLIMITED_IMPORT_SYMLINK_FORBIDDEN");
    }
  }
  return normalized;
}

export async function runUnlimitedImportIfPresent(
  env = process.env,
  { bundlePath = defaultBundlePath } = {},
) {
  if (!existsSync(bundlePath)) {
    return { status: "PUNCTUM_UNLIMITED_IMPORT_NOT_REQUESTED" };
  }

  const rawDbFile = env.PUNCTUM_CANDIDATE_DB_FILE;
  const rawOriginals = env.PUNCTUM_CANDIDATE_ORIGINALS;
  const rawBackups = env.PUNCTUM_CANDIDATE_BACKUPS_ROOT;
  const key = env.PUNCTUM_MANAGED_IMPORT_KEY;
  const digest = env.PUNCTUM_MANAGED_IMPORT_SHA256;
  if (!rawDbFile || !rawOriginals || !rawBackups || !key || !digest) {
    throw Error("UNLIMITED_IMPORT_MISSING_CONFIG");
  }

  const dbFile = assertSafeTarget(rawDbFile);
  const originals = assertSafeTarget(rawOriginals);
  const backups = assertSafeTarget(rawBackups);
  const destination = dirname(dbFile);
  if (originals !== join(destination, "originals") || backups !== join(destination, "backups")) {
    throw Error("UNLIMITED_IMPORT_UNSAFE_PATH");
  }

  const wrapper = dirname(destination);
  mkdirSync(wrapper, { recursive: true, mode: 0o700 });
  chmodSync(wrapper, 0o700);
  if (lstatSync(wrapper).isSymbolicLink()) {
    throw Error("UNLIMITED_IMPORT_SYMLINK_FORBIDDEN");
  }

  const receipt = await importManagedSeed({
    bundle: bundlePath,
    key,
    digest,
    destination,
  });

  return {
    status: "PUNCTUM_UNLIMITED_IMPORT_VERIFIED",
    objects: receipt.objects,
    bytes: receipt.bytes,
    cipherSha256: receipt.cipherSha256,
    reused: Boolean(receipt.reused),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === moduleFile) {
  process.umask(0o077);
  runUnlimitedImportIfPresent(process.env)
    .then((receipt) => {
      console.log(JSON.stringify(receipt));
    })
    .catch((error) => {
      const code = error?.message && /^UNLIMITED_IMPORT_|^MANAGED_IMPORT_/.test(error.message)
        ? error.message
        : "UNLIMITED_IMPORT_FAILED";
      console.error(JSON.stringify({ status: "UNLIMITED_IMPORT_FAILED", code }));
      process.exitCode = 1;
    });
}
