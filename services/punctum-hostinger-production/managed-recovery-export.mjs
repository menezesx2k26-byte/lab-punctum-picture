import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, closeSync, createReadStream, createWriteStream, openSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { DatabaseSync } from "node:sqlite";
import { createManagedBackup } from "./managed-restore-check.mjs";
import { exportD1Snapshot } from "./managed-d1-export.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const endpoint = "https://api.cloudflare.com/client/v4/accounts/257bca437616da74ece1ce4bbaf0bd89/r2/buckets/punctum-picture-backups/objects/";

export async function exportManagedRecovery(config, env = process.env, request = fetch) {
  assert(config.managed && config.environment === "staging", "MANAGED_RECOVERY_STAGING_REQUIRED");
  const prefix = env.PUNCTUM_MANAGED_RECOVERY_PREFIX;
  assert(/^managed-recovery\/snapshot-[a-f0-9]{32}$/.test(prefix ?? ""), "MANAGED_RECOVERY_PREFIX_INVALID");
  assert(/^[a-f0-9]{64}$/.test(env.PUNCTUM_MANAGED_RECOVERY_KEY ?? "") && env.CLOUDFLARE_API_TOKEN, "MANAGED_RECOVERY_CREDENTIALS_REQUIRED");
  const key = Buffer.from(env.PUNCTUM_MANAGED_RECOVERY_KEY, "hex");
  const saved = await createManagedBackup(config);
  const archive = join(dirname(saved.archiveFile), ".transfer-" + prefix.slice(-32) + ".tar");
  const encrypted = archive + ".bin";
  const owned = [];
  const call = async (name, method, body) => {
    const response = await request(endpoint + encodeURIComponent(prefix + "/" + name), {
      method, headers: { Authorization: "Bearer " + env.CLOUDFLARE_API_TOKEN, "Content-Type": "application/octet-stream" },
      body, redirect: "error", signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw Error("MANAGED_RECOVERY_R2_HTTP_" + response.status);
    return response;
  };
  try {
    const sqlite = new DatabaseSync(join(saved.restoredRoot, "application.sqlite"), { readOnly: true });
    let exported;
    try { exported = exportD1Snapshot(sqlite); } finally { sqlite.close(); }
    writeFileSync(join(saved.restoredRoot, "managed-d1.sql"), exported.sql, { mode: 0o600, flag: "wx" });
    const manifest = { schema: "punctum-managed-recovery-v1", sqlSha256: exported.sqlSha256, tables: saved.tables,
      objects: saved.objects, bytes: saved.bytes, backupSha256: saved.archiveSha256 };
    writeFileSync(join(saved.restoredRoot, "recovery-manifest.json"), JSON.stringify(manifest), { mode: 0o600, flag: "wx" });
    const fd = openSync(archive, "wx", 0o600);
    try {
      execFileSync("tar", ["-cf", "-", "-C", saved.restoredRoot, "application.sqlite", "originals", "managed-d1.sql", "recovery-manifest.json"],
        { stdio: ["ignore", fd, "ignore"], timeout: 120_000 });
    } finally { closeSync(fd); }
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
    writeFileSync(encrypted, iv, { mode: 0o600, flag: "wx" });
    await pipeline(createReadStream(archive), cipher, createWriteStream(encrypted, { flags: "a" }));
    appendFileSync(encrypted, cipher.getAuthTag());
    const chunks = [], hash = createHash("sha256");
    let total = 0;
    for await (const bytes of createReadStream(encrypted, { highWaterMark: 16 * 1024 * 1024 })) {
      total += bytes.length;
      assert(total <= 1_100_000_000, "MANAGED_RECOVERY_SIZE_CAP");
      const name = String(chunks.length).padStart(4, "0") + ".bin";
      // Record the unique owned key before PUT so uncertain responses can still be cleaned.
      owned.push(name);
      await (await call(name, "PUT", bytes)).arrayBuffer();
      const downloaded = Buffer.from(await (await call(name, "GET")).arrayBuffer());
      assert(downloaded.equals(bytes), "MANAGED_RECOVERY_TRANSPORT_MISMATCH");
      hash.update(bytes);
      chunks.push({ name, bytes: bytes.length, sha256: sha(bytes) });
    }
    const receipt = { status: "MANAGED_ENCRYPTED_RECOVERY_EXPORTED", prefix, cipherSha256: hash.digest("hex"),
      cipherBytes: total, keySha256: sha(key), chunks, manifest };
    owned.push("receipt.json");
    const document = Buffer.from(JSON.stringify(receipt));
    await (await call("receipt.json", "PUT", document)).arrayBuffer();
    assert(Buffer.from(await (await call("receipt.json", "GET")).arrayBuffer()).equals(document), "MANAGED_RECOVERY_RECEIPT_MISMATCH");
    return receipt;
  } catch (error) {
    let failed = false;
    for (const name of owned.reverse()) {
      try { await (await call(name, "DELETE")).arrayBuffer(); } catch { failed = true; }
    }
    if (failed) throw Error("MANAGED_RECOVERY_PARTIAL_CLEANUP_FAILED", { cause: error });
    throw error;
  } finally {
    rmSync(archive, { force: true });
    rmSync(encrypted, { force: true });
    saved.cleanup();
    key.fill(0);
  }
}
