import { z } from "zod";
import {
  adminAuthMode,
  adminSessionCookie,
  clearAdminSessionCookie,
  createAdminSession,
  createClerkAdminSession,
  auditPrincipal,
  requireAdmin,
  setAdminPassword,
  verifyAdminPassword,
} from "../utils/auth";
import {
  collectClerkRevocationKeys,
  resolveLinkedClerkAdmin,
  revokeClerkSessionKeys,
} from "../auth/clerk-auth";
import { writeAudit } from "../utils/audit";
import { envNumber, requireDb } from "../utils/env";
import { AppError } from "../utils/errors";
import { assertRateLimit } from "../utils/rate-limit";
import { json } from "../utils/response";
import { parseJson } from "../utils/validation";

const LOGIN_PATH = "/admin/api/session";
const CLERK_LOGIN_PATH = "/admin/api/clerk-session";
const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(12).max(128),
  })
  .strict();

export async function handleAdminAuth(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (url.pathname !== LOGIN_PATH && url.pathname !== CLERK_LOGIN_PATH) return null;

  if (url.pathname === CLERK_LOGIN_PATH) {
    if (adminAuthMode(env) === "legacy") {
      throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
    }
    if (request.method !== "POST") {
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Método não permitido.");
    }
    const origin = request.headers.get("origin");
    const expectedOrigin = new URL(request.url).origin;
    if (!origin || origin !== expectedOrigin) {
      throw new AppError(403, "INVALID_ORIGIN", "A origem desta operação não é permitida.");
    }
    const db = requireDb(env);
    await assertRateLimit(
      request,
      db,
      "admin-clerk-login",
      envNumber(env, "ADMIN_LOGIN_RATE_LIMIT_MAX", 10),
      envNumber(env, "ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS", 900),
    );
    const linked = await resolveLinkedClerkAdmin(request, env, { requireConfig: true });
    if (!linked) {
      throw new AppError(403, "ADMIN_UNAUTHORIZED", "Acesso administrativo não autorizado.");
    }
    const token = await createClerkAdminSession(linked, env);
    await writeAudit(
      db,
      `clerk:${linked.adminPrincipalId}`,
      "admin.clerk_login",
      "admin",
      linked.clerkUserId,
    );
    return json(
      { ok: true, authSource: "clerk" },
      {
        admin: true,
        headers: { "Set-Cookie": adminSessionCookie(token) },
      },
    );
  }

  if (request.method === "DELETE") {
    if (env.DB) {
      try {
        const identity = await requireAdmin(request, env);
        if (identity.authSource === "clerk" && identity.clerkUserId) {
          await env.DB.prepare(
            `UPDATE clerk_admin_identity_links
             SET session_version = session_version + 1, updated_at = ?
             WHERE clerk_user_id = ?`,
          )
            .bind(new Date().toISOString(), identity.clerkUserId)
            .run();
          const revocationKeys = await collectClerkRevocationKeys(
            request,
            identity.clerkRevocationKeys ?? [],
          );
          await revokeClerkSessionKeys(env.DB, revocationKeys);
          await writeAudit(
            env.DB,
            auditPrincipal(identity),
            "admin.clerk_logout",
            "admin",
            identity.clerkUserId,
          );
        }
      } catch {
        /* Idempotent logout preserves cookie clearing even for expired sessions. */
      }
    }
    return json(
      { ok: true },
      {
        admin: true,
        headers: { "Set-Cookie": clearAdminSessionCookie() },
      },
    );
  }

  if (request.method !== "POST" && request.method !== "PATCH") {
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Método não permitido.");
  }
  if (adminAuthMode(env) === "clerk") {
    throw new AppError(405, "METHOD_NOT_ALLOWED", "Use a autenticação Clerk.");
  }

  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) {
    throw new AppError(403, "INVALID_ORIGIN", "A origem desta operação não é permitida.");
  }

  const db = requireDb(env);
  if (request.method === "PATCH") {
    const identity = await requireAdmin(request, env);
    await assertRateLimit(request, db, "admin-password-change", 5, 3600);
    const input = await parseJson(request, passwordChangeSchema);
    if (input.currentPassword === input.newPassword) {
      throw new AppError(400, "PASSWORD_UNCHANGED", "Escolha uma senha diferente da atual.");
    }
    if (!(await verifyAdminPassword(input.currentPassword, env, db))) {
      throw new AppError(401, "ADMIN_LOGIN_FAILED", "A senha atual está incorreta.");
    }
    await setAdminPassword(input.newPassword, db, auditPrincipal(identity));
    await writeAudit(db, auditPrincipal(identity), "admin.password_changed", "admin", null);
    return json(
      { ok: true },
      {
        admin: true,
        headers: { "Set-Cookie": clearAdminSessionCookie() },
      },
    );
  }

  await assertRateLimit(
    request,
    db,
    "admin-login",
    envNumber(env, "ADMIN_LOGIN_RATE_LIMIT_MAX", 10),
    envNumber(env, "ADMIN_LOGIN_RATE_LIMIT_WINDOW_SECONDS", 900),
  );

  const input = await parseJson(
    request,
    z.object({ email: z.string().email(), password: z.string().min(1).max(256) }).strict(),
  );
  if (!(await verifyAdminPassword(input.password, env, db))) {
    throw new AppError(401, "ADMIN_LOGIN_FAILED", "E-mail ou senha incorretos.");
  }

  const token = await createAdminSession(input.email, env);
  return json(
    { ok: true },
    {
      admin: true,
      headers: { "Set-Cookie": adminSessionCookie(token) },
    },
  );
}
