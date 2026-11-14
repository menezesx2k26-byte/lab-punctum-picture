import { z } from "zod";
import { parseJson } from "../worker/client/validation";
import { captureClientRecovery, restoreClientRecovery, type ClientRecovery } from "./lib/private-recovery";

// Standalone, transient QA entry point. Never imported by worker/index.ts.
type RecoveryEnv = {
  ENVIRONMENT: string; QA_RECOVERY_ENABLED: string; SITE_ORIGIN: string; QA_RECOVERY_SECRET: string; QA_RECOVERY_CLIENT_ID: string;
  SOURCE_DB: D1Database; RESTORE_DB: D1Database;
  SOURCE_ORIGINALS: R2Bucket; RESTORE_ORIGINALS: R2Bucket; BACKUPS: R2Bucket;
};
const inputSchema = z.object({ clientIds: z.array(z.uuid()).min(1).max(2) }).strict();
function response(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" } });
}
async function digest(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))).map((v) => v.toString(16).padStart(2, "0")).join("");
}
export async function handleQaRecovery(request: Request, env: RecoveryEnv): Promise<Response> {
  const url = new URL(request.url);
  if (env.ENVIRONMENT !== "preview" || env.QA_RECOVERY_ENABLED !== "true" || url.pathname !== "/qa/recover") return response(404, { error: "NOT_FOUND" });
  if (request.method !== "POST") return response(405, { error: "METHOD_NOT_ALLOWED" });
  if (!env.QA_RECOVERY_SECRET || env.QA_RECOVERY_SECRET.length < 32 || request.headers.get("Authorization") !== "Bearer " + env.QA_RECOVERY_SECRET ||
      request.headers.get("Origin") !== env.SITE_ORIGIN || url.origin !== env.SITE_ORIGIN ||
      !/^https:\/\/punctum-picture-albums-qa\.[a-z0-9-]+\.workers\.dev$/.test(env.SITE_ORIGIN))
    return response(403, { error: "QA_UNAUTHORIZED" });
  try {
    const { clientIds } = await parseJson(request, inputSchema);
    if (clientIds.length !== 1 || !env.QA_RECOVERY_CLIENT_ID || clientIds[0] !== env.QA_RECOVERY_CLIENT_ID) return response(403, { error: "QA_RUN_SCOPE_REQUIRED" });
    const marks = clientIds.map(() => "?").join(",");
    const accounts = (await env.SOURCE_DB.prepare(`SELECT email FROM client_accounts WHERE id IN (${marks})`).bind(...clientIds).all<{ email: string }>()).results;
    if (accounts.length !== clientIds.length || accounts.some((r) => !/^pilot-[a-f0-9-]{36}@example\.invalid$/i.test(r.email))) return response(403, { error: "QA_SYNTHETIC_SCOPE_REQUIRED" });
    if (await env.RESTORE_DB.prepare(`SELECT id FROM client_accounts WHERE id IN (${marks}) LIMIT 1`).bind(...clientIds).first()) return response(409, { error: "QA_DESTINATION_CONFLICT" });
    const size = await env.SOURCE_DB.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(i.size_bytes),0) AS bytes FROM client_gallery_images i JOIN client_galleries g ON g.id=i.gallery_id WHERE g.client_id IN (${marks})`).bind(...clientIds).first<{ count: number; bytes: number }>();
    if (!size || size.count > 50 || size.bytes > 2_097_152) return response(413, { error: "QA_RECOVERY_LIMIT" });
    const snapshot = await captureClientRecovery(env.SOURCE_DB, env.SOURCE_ORIGINALS, clientIds);
    const encoded = new TextEncoder().encode(JSON.stringify({ ...snapshot, objects: snapshot.objects.map((o) => ({ ...o, bytes: Array.from(o.bytes) })) }));
    if (encoded.length > 8_388_608) return response(413, { error: "QA_BACKUP_LIMIT" });
    const key = `qa-recovery/${crypto.randomUUID()}.json`;
    const stored = await env.BACKUPS.put(key, encoded, { onlyIf: { etagDoesNotMatch: "*" }, httpMetadata: { contentType: "application/json" } });
    if (!stored) return response(409, { error: "QA_BACKUP_CONFLICT" });
    const backup = await env.BACKUPS.get(key);
    if (!backup) throw new Error("Backup missing");
    const saved = new Uint8Array(await backup.arrayBuffer());
    const backupHash = await digest(encoded);
    if (await digest(saved) !== backupHash) throw new Error("Backup mismatch");
    const decoded = JSON.parse(new TextDecoder().decode(saved));
    const restored: ClientRecovery = { ...decoded, objects: decoded.objects.map((o: ClientRecovery["objects"][number] & { bytes: number[] }) => ({
      ...o, bytes: Uint8Array.from(o.bytes), httpMetadata: { ...o.httpMetadata, ...(o.httpMetadata.cacheExpiry ? { cacheExpiry: new Date(o.httpMetadata.cacheExpiry) } : {}) },
    })) };
    const result = await restoreClientRecovery(restored, env.RESTORE_DB, env.RESTORE_ORIGINALS);
    return response(200, { ...result, backupHash, backupVerified: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return response(/exists|conflict/.test(message) ? 409 : 400, { error: "QA_RECOVERY_FAILED" });
  }
}
const recoveryWorker = { fetch: handleQaRecovery };
export default recoveryWorker;
