import { createClerkClient } from "@clerk/backend";
import { envString } from "../utils/env";
import { AppError } from "../utils/errors";

export const CLERK_USER_ID_PATTERN = /^user_[a-zA-Z0-9_-]{3,180}$/;

export type ClerkRuntimeConfig = {
  origin: string;
  authorizedParties: string[];
  issuer: string;
  publishableKey: string;
  jwtKey: string;
  secretKey?: string;
};

export type VerifiedClerkSession = {
  clerkUserId: string;
  sessionId: string | null;
  revocationKeys?: string[];
};

export type ClerkRequestVerifier = (
  request: Request,
  config: ClerkRuntimeConfig,
) => Promise<VerifiedClerkSession | null>;

export type LinkedClerkAdmin = {
  clerkUserId: string;
  adminPrincipalId: string;
  role: "admin";
  sessionVersion: number;
  revocationKeys?: string[];
};

export type LinkedClerkClient = {
  id: string;
  name: string;
  mustChangePassword: number;
  sessionVersion: number;
  clerkUserId: string;
  revocationKeys?: string[];
};

export function isValidClerkUserId(value: unknown): value is string {
  return typeof value === "string" && CLERK_USER_ID_PATTERN.test(value);
}

export function isClerkAuthEnabled(env: Env): boolean {
  return (
    envString(env, "CLERK_AUTH_ENABLED") === "true" ||
    envString(env, "ADMIN_AUTH_MODE") === "clerk" ||
    envString(env, "CLIENT_AUTH_MODE") === "clerk"
  );
}

export function normalizePemKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

export function resolveClerkRuntimeConfig(
  request: Request,
  env: Env,
): ClerkRuntimeConfig | null {
  const origin = envString(env, "SITE_ORIGIN");
  const issuer =
    envString(env, "CLERK_ISSUER") ?? envString(env, "CLERK_PILOT_ISSUER");
  const publishableKey =
    envString(env, "CLERK_PUBLISHABLE_KEY") ??
    envString(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const rawJwtKey = envString(env, "CLERK_JWT_KEY");
  const secretKey = envString(env, "CLERK_SECRET_KEY");

  if (!origin || !issuer || !publishableKey || !rawJwtKey) return null;

  try {
    const canonical = new URL(origin);
    const identityIssuer = new URL(issuer);
    const requestOrigin = new URL(request.url).origin;
    if (canonical.origin !== requestOrigin) return null;
    if (
      identityIssuer.protocol !== "https:" ||
      identityIssuer.origin !== issuer
    ) {
      return null;
    }

    const extraParties = (envString(env, "CLERK_AUTHORIZED_PARTIES") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    const authorizedParties = Array.from(
      new Set([canonical.origin, ...extraParties]),
    );

    return {
      origin: canonical.origin,
      authorizedParties,
      issuer,
      publishableKey,
      jwtKey: normalizePemKey(rawJwtKey),
      ...(secretKey ? { secretKey } : {}),
    };
  } catch {
    return null;
  }
}

export function extractClerkToken(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  const bearerMatch = auth.match(/^Bearer\s+(\S+)$/i);
  if (bearerMatch?.[1]) return bearerMatch[1];
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith("__session=") && trimmed.length > "__session=".length) {
      return trimmed.slice("__session=".length);
    }
  }
  return null;
}

export async function clerkTokenRevocationKey(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(rawToken),
  );
  const hex = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  return `tk:${hex}`;
}

export async function collectClerkRevocationKeys(
  request: Request,
  existingKeys: Array<string | null | undefined> = [],
): Promise<string[]> {
  const keys = new Set<string>();
  for (const key of existingKeys) {
    if (typeof key === "string" && key.length > 0) keys.add(key);
  }
  const rawToken = extractClerkToken(request);
  if (rawToken) {
    keys.add(await clerkTokenRevocationKey(rawToken));
  }
  return Array.from(keys);
}

export async function revokeClerkSessionKeys(
  db: D1Database | undefined,
  keys: Array<string | null | undefined>,
  ttlSeconds = 86_400,
): Promise<void> {
  if (!db) return;
  const unique = Array.from(
    new Set(keys.filter((k): k is string => typeof k === "string" && k.length > 0)),
  );
  if (unique.length === 0) return;
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  try {
    await db
      .prepare("DELETE FROM revoked_clerk_tokens WHERE expires_at <= ?")
      .bind(nowIso)
      .run();
    for (const key of unique) {
      await db
        .prepare(
          `INSERT INTO revoked_clerk_tokens (revocation_key, expires_at)
           VALUES (?, ?)
           ON CONFLICT(revocation_key) DO UPDATE SET expires_at = excluded.expires_at`,
        )
        .bind(key, expiresIso)
        .run();
    }
  } catch (error) {
    // Allow graceful compatibility only if migration 0015 table doesn't exist in legacy test fixtures
    if (!String(error).includes("no such table")) throw error;
  }
}

async function isClerkTokenRevoked(
  db: D1Database | undefined,
  keys: string[],
): Promise<boolean> {
  if (!db || keys.length === 0) return false;
  const nowIso = new Date().toISOString();
  const placeholders = keys.map(() => "?").join(",");
  try {
    const row = await db
      .prepare(
        `SELECT 1 AS revoked FROM revoked_clerk_tokens
         WHERE revocation_key IN (${placeholders}) AND expires_at > ? LIMIT 1`,
      )
      .bind(...keys, nowIso)
      .first<{ revoked: number }>();
    return Boolean(row);
  } catch (error) {
    if (String(error).includes("no such table")) return false;
    throw error;
  }
}

export function hasClerkCredential(request: Request): boolean {
  return extractClerkToken(request) !== null;
}

export async function verifyClerkRequestWithSdk(
  request: Request,
  config: ClerkRuntimeConfig,
): Promise<VerifiedClerkSession | null> {
  try {
    const client = createClerkClient({
      publishableKey: config.publishableKey,
      ...(config.secretKey ? { secretKey: config.secretKey } : {}),
    });
    const state = await client.authenticateRequest(request, {
      acceptsToken: "session_token",
      authorizedParties: config.authorizedParties,
      issuer: config.issuer,
      jwtKey: config.jwtKey,
    });
    if (!state.isAuthenticated) return null;
    const auth = state.toAuth();
    if (!isValidClerkUserId(auth.userId)) return null;
    return {
      clerkUserId: auth.userId,
      sessionId: typeof auth.sessionId === "string" ? auth.sessionId : null,
    };
  } catch {
    return null;
  }
}

export async function verifyClerkSessionFromRequest(
  request: Request,
  env: Env,
  options: {
    requireConfig?: boolean;
    verifier?: ClerkRequestVerifier;
  } = {},
): Promise<VerifiedClerkSession | null> {
  const config = resolveClerkRuntimeConfig(request, env);
  if (!config) {
    if (options.requireConfig) {
      throw new AppError(
        503,
        "CLERK_NOT_CONFIGURED",
        "Autenticação Clerk indisponível.",
      );
    }
    return null;
  }

  const verifier = options.verifier ?? verifyClerkRequestWithSdk;
  try {
    const verified = await verifier(request, config);
    if (!verified || !isValidClerkUserId(verified.clerkUserId)) return null;
    const rawToken = extractClerkToken(request);
    const revocationKeys = [
      ...(rawToken ? [await clerkTokenRevocationKey(rawToken)] : []),
      ...(verified.sessionId ? [`sid:${verified.sessionId}`] : []),
    ];
    if (await isClerkTokenRevoked(env.DB, revocationKeys)) {
      return null;
    }
    return {
      ...verified,
      revocationKeys,
    };
  } catch {
    return null;
  }
}

export async function resolveLinkedClerkAdmin(
  request: Request,
  env: Env,
  options: {
    requireConfig?: boolean;
    verifier?: ClerkRequestVerifier;
  } = {},
): Promise<LinkedClerkAdmin | null> {
  if (!env.DB) return null;
  const verified = await verifyClerkSessionFromRequest(request, env, options);
  if (!verified) return null;

  const link = await env.DB.prepare(
    `SELECT clerk_user_id AS clerkUserId,
            admin_principal_id AS adminPrincipalId,
            role,
            session_version AS sessionVersion,
            disabled_at AS disabledAt
     FROM clerk_admin_identity_links
     WHERE clerk_user_id = ?`,
  )
    .bind(verified.clerkUserId)
    .first<LinkedClerkAdmin & { disabledAt: string | null }>();

  if (!link || link.disabledAt !== null || link.role !== "admin") {
    return null;
  }

  const allowedEmails = (envString(env, "ADMIN_ALLOWED_EMAILS") ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (
    allowedEmails.length > 0 &&
    !allowedEmails.includes(link.adminPrincipalId.trim().toLowerCase())
  ) {
    return null;
  }

  return {
    clerkUserId: link.clerkUserId,
    adminPrincipalId: link.adminPrincipalId.trim().toLowerCase(),
    role: "admin",
    sessionVersion: link.sessionVersion,
    revocationKeys: verified.revocationKeys,
  };
}

export async function resolveLinkedClerkClient(
  request: Request,
  env: Env,
  db: D1Database,
  options: {
    requireConfig?: boolean;
    verifier?: ClerkRequestVerifier;
  } = {},
): Promise<LinkedClerkClient> {
  const verified = await verifyClerkSessionFromRequest(request, env, options);
  if (!verified) {
    throw new AppError(401, "CLIENT_UNAUTHORIZED", "Entre para continuar.");
  }

  const linked = await db
    .prepare(
      `SELECT c.id AS id,
              c.name AS name,
              c.must_change_password AS mustChangePassword,
              c.session_version AS sessionVersion,
              c.disabled_at AS disabledAt,
              l.session_version_at_link AS versionAtLink,
              l.clerk_user_id AS clerkUserId
       FROM clerk_pilot_identity_links l
       JOIN client_accounts c ON c.id = l.client_id
       WHERE l.clerk_user_id = ?`,
    )
    .bind(verified.clerkUserId)
    .first<
      LinkedClerkClient & {
        disabledAt: string | null;
        versionAtLink: number;
      }
    >();

  if (!linked) {
    throw new AppError(
      403,
      "CLIENT_CLERK_UNLINKED",
      "Esta conta não possui vínculo autorizado com um álbum.",
    );
  }
  if (
    linked.disabledAt !== null ||
    linked.sessionVersion !== linked.versionAtLink
  ) {
    throw new AppError(
      403,
      "CLIENT_UNAUTHORIZED",
      "Sessão ou conta de cliente desativada.",
    );
  }

  return {
    id: linked.id,
    name: linked.name,
    mustChangePassword: linked.mustChangePassword,
    sessionVersion: linked.sessionVersion,
    clerkUserId: linked.clerkUserId,
    revocationKeys: verified.revocationKeys,
  };
}

export async function linkClerkClientAccount(
  db: D1Database,
  clientId: string,
  clerkUserId: string,
): Promise<{ clientId: string; clerkUserId: string; sessionVersion: number }> {
  if (!isValidClerkUserId(clerkUserId)) {
    throw new AppError(
      400,
      "INVALID_CLERK_USER_ID",
      "Identificador Clerk inválido.",
    );
  }

  const adminConflict = await db
    .prepare(
      "SELECT clerk_user_id FROM clerk_admin_identity_links WHERE clerk_user_id = ?",
    )
    .bind(clerkUserId)
    .first<{ clerk_user_id: string }>();
  if (adminConflict) {
    throw new AppError(
      409,
      "CLERK_IDENTITY_ALREADY_LINKED",
      "Este identificador Clerk já está associado a outro principal.",
    );
  }

  const existingClientLink = await db
    .prepare(
      "SELECT client_id AS clientId FROM clerk_pilot_identity_links WHERE clerk_user_id = ?",
    )
    .bind(clerkUserId)
    .first<{ clientId: string }>();
  if (existingClientLink && existingClientLink.clientId !== clientId) {
    throw new AppError(
      409,
      "CLERK_IDENTITY_ALREADY_LINKED",
      "Este identificador Clerk já está vinculado a outro cliente.",
    );
  }

  const client = await db
    .prepare(
      "SELECT id, session_version AS sessionVersion, disabled_at AS disabledAt FROM client_accounts WHERE id = ?",
    )
    .bind(clientId)
    .first<{ id: string; sessionVersion: number; disabledAt: string | null }>();
  if (!client || client.disabledAt !== null) {
    throw new AppError(404, "NOT_FOUND", "Cliente indisponível.");
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO clerk_pilot_identity_links (clerk_user_id, client_id, session_version_at_link, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(client_id) DO UPDATE SET
         clerk_user_id = excluded.clerk_user_id,
         session_version_at_link = excluded.session_version_at_link,
         created_at = excluded.created_at`,
    )
    .bind(clerkUserId, clientId, client.sessionVersion, now)
    .run();

  return {
    clientId,
    clerkUserId,
    sessionVersion: client.sessionVersion,
  };
}

export async function unlinkClerkClientAccount(
  db: D1Database,
  clientId: string,
): Promise<{ clientId: string; unlinked: boolean }> {
  const existing = await db
    .prepare(
      "SELECT clerk_user_id AS clerkUserId FROM clerk_pilot_identity_links WHERE client_id = ?",
    )
    .bind(clientId)
    .first<{ clerkUserId: string }>();
  if (!existing) {
    return { clientId, unlinked: false };
  }

  await db
    .prepare("DELETE FROM clerk_pilot_identity_links WHERE client_id = ?")
    .bind(clientId)
    .run();
  await db
    .prepare(
      "UPDATE client_accounts SET session_version = session_version + 1, updated_at = ? WHERE id = ?",
    )
    .bind(new Date().toISOString(), clientId)
    .run();

  return { clientId, unlinked: true };
}
