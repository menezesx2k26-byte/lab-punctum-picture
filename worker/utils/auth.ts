import { assertSeparateAccessAudiences } from "../client/audience";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import {
  hasClerkCredential,
  resolveLinkedClerkAdmin,
  type ClerkRequestVerifier,
  type LinkedClerkAdmin,
} from "../auth/clerk-auth";
import { AppError } from "./errors";
import { createAdminSessionKey, sha256Hex } from "./admin-session-crypto.mjs";
import { envString, requiredEnvString } from "./env";

const ADMIN_SESSION_COOKIE = "punctum_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AdminIdentity = {
  email: string;
  roles: ["admin"];
  /** The email on a shared-password login is self-declared, not verified identity. */
  authSource?: "shared-password" | "clerk";
  clerkUserId?: string;
  sessionVersion?: number;
  clerkRevocationKeys?: string[];
};

export function adminAuthMode(env: Env): "legacy" | "hybrid" | "clerk" {
  const mode = envString(env, "ADMIN_AUTH_MODE");
  if (mode === "clerk") return "clerk";
  if (mode === "legacy" || mode === "password") return "legacy";
  if (envString(env, "CLERK_AUTH_ENABLED") === "true") return "hybrid";
  return "legacy";
}

/** Audit attribution must not impersonate an individual through a shared secret. */
export function auditPrincipal(identity: Pick<AdminIdentity, "email" | "authSource">): string {
  if (identity.authSource === "shared-password") {
    return "shared-password@punctum.invalid";
  }
  if (identity.authSource === "clerk") {
    return `clerk:${identity.email}`;
  }
  return identity.email;
}

export function normalizeTeamDomain(value: string): string {
  const withoutProtocol = value.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return withoutProtocol.includes(".")
    ? withoutProtocol
    : `${withoutProtocol}.cloudflareaccess.com`;
}

function isLocalRequest(request: Request, env: Env): boolean {
  const hostname = new URL(request.url).hostname;
  return (
    (hostname === "localhost" || hostname === "127.0.0.1") &&
    envString(env, "ENVIRONMENT") === "local"
  );
}

function allowedAdminEmails(env: Env): string[] {
  return (envString(env, "ADMIN_ALLOWED_EMAILS") ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function parseCookies(request: Request): Map<string, string> {
  return new Map(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        return separator === -1
          ? [part, ""]
          : [part.slice(0, separator), part.slice(separator + 1)];
      }),
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(env: Env) {
  const secret = requiredEnvString(env, "ADMIN_SESSION_SECRET");
  // Bind password-auth cookies to the current credential revision. A password
  // rotation changes this signing key and invalidates previously copied cookies.
  // Never place the stored credential hash or salt in the cookie payload.
  const stored = env.DB ? await storedCredential(env.DB) : null;
  const credentialRevision = stored
    ? "d1:" + stored.passwordHash
    : "env:" + requiredEnvString(env, "ADMIN_PASSWORD_HASH");
  return createAdminSessionKey(
    new TextEncoder().encode(secret + "\u0000" + credentialRevision),
  );
}

async function clerkAdminHmacKey(env: Env) {
  const secret = requiredEnvString(env, "ADMIN_SESSION_SECRET");
  return createAdminSessionKey(
    new TextEncoder().encode(secret + "\u0000clerk-admin"),
  );
}

async function verifyPasswordSession(
  request: Request,
  env: Env,
  mark?: (phase: string) => void,
): Promise<AdminIdentity | null> {
  const token = parseCookies(request).get(ADMIN_SESSION_COOKIE);
  if (!token) return null;

  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encodedPayload)),
    ) as {
      email?: unknown;
      exp?: unknown;
      authSource?: unknown;
      clerkUserId?: unknown;
      sessionVersion?: unknown;
      rk?: unknown;
    };
    if (typeof payload.email !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    const email = payload.email.toLowerCase();
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!allowedAdminEmails(env).includes(email)) return null;

    const mode = adminAuthMode(env);
    if (payload.authSource === "clerk") {
      if (mode === "legacy") return null;
      if (
        typeof payload.clerkUserId !== "string" ||
        !Number.isInteger(payload.sessionVersion) ||
        !env.DB
      ) {
        return null;
      }
      const key = await clerkAdminHmacKey(env);
      const valid = await key.verify(
        new TextEncoder().encode(encodedPayload),
        fromBase64Url(encodedSignature),
      );
      if (!valid) return null;

      const link = await env.DB.prepare(
        `SELECT clerk_user_id AS clerkUserId,
                admin_principal_id AS adminPrincipalId,
                role,
                session_version AS sessionVersion,
                disabled_at AS disabledAt
         FROM clerk_admin_identity_links
         WHERE clerk_user_id = ?`,
      )
        .bind(payload.clerkUserId)
        .first<{
          clerkUserId: string;
          adminPrincipalId: string;
          role: string;
          sessionVersion: number;
          disabledAt: string | null;
        }>();
      if (
        !link ||
        link.disabledAt !== null ||
        link.role !== "admin" ||
        link.adminPrincipalId.toLowerCase() !== email ||
        link.sessionVersion !== payload.sessionVersion
      ) {
        return null;
      }
      return {
        email,
        roles: ["admin"],
        authSource: "clerk",
        clerkUserId: link.clerkUserId,
        sessionVersion: link.sessionVersion,
        ...(Array.isArray(payload.rk)
          ? {
              clerkRevocationKeys: payload.rk.filter(
                (item): item is string => typeof item === "string",
              ),
            }
          : {}),
      };
    }

    if (mode === "clerk") return null;
    const key = await hmacKey(env);
    mark?.("session-key-ready");
    const valid = await key.verify(
      new TextEncoder().encode(encodedPayload),
      fromBase64Url(encodedSignature),
    );
    mark?.("session-verified");
    if (!valid) return null;
    return { email, roles: ["admin"], authSource: "shared-password" };
  } catch {
    return null;
  }
}

export async function createClerkAdminSession(
  link: LinkedClerkAdmin,
  env: Env,
): Promise<string> {
  const normalizedEmail = link.adminPrincipalId.trim().toLowerCase();
  if (!allowedAdminEmails(env).includes(normalizedEmail)) {
    throw new AppError(403, "ADMIN_UNAUTHORIZED", "Acesso administrativo não autorizado.");
  }

  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        email: normalizedEmail,
        exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
        authSource: "clerk",
        clerkUserId: link.clerkUserId,
        sessionVersion: link.sessionVersion,
        ...(link.revocationKeys?.length ? { rk: link.revocationKeys } : {}),
      }),
    ),
  );
  const key = await clerkAdminHmacKey(env);
  const signature = await key.sign(new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function createAdminSession(email: string, env: Env): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!allowedAdminEmails(env).includes(normalizedEmail)) {
    throw new AppError(401, "ADMIN_LOGIN_FAILED", "E-mail ou senha incorretos.");
  }

  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        email: normalizedEmail,
        exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS,
      }),
    ),
  );
  const key = await hmacKey(env);
  const signature = await key.sign(new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(signature)}`;
}

export function adminSessionCookie(token: string): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; Path=/admin; Max-Age=${ADMIN_SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export function clearAdminSessionCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

type StoredAdminCredential = {
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
};

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt).buffer,
      iterations,
    },
    material,
    256,
  );
  return new Uint8Array(bits);
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function storedCredential(db: D1Database): Promise<StoredAdminCredential | null> {
  return db
    .prepare(
      `SELECT
        password_hash AS passwordHash,
        password_salt AS passwordSalt,
        password_iterations AS passwordIterations
       FROM admin_credentials WHERE id = 1`,
    )
    .first<StoredAdminCredential>();
}

export async function setAdminPassword(
  password: string,
  db: D1Database,
  updatedBy: string,
): Promise<void> {
  const iterations = 60_000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, iterations);
  await db
    .prepare(
      `INSERT INTO admin_credentials (
        id, password_hash, password_salt, password_iterations, updated_at, updated_by
       ) VALUES (1, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
        password_hash = excluded.password_hash,
        password_salt = excluded.password_salt,
        password_iterations = excluded.password_iterations,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by`,
    )
    .bind(
      toBase64Url(hash),
      toBase64Url(salt),
      iterations,
      new Date().toISOString(),
      updatedBy,
    )
    .run();
}

export async function verifyAdminPassword(
  password: string,
  env: Env,
  db?: D1Database,
): Promise<boolean> {
  const credential = db ? await storedCredential(db) : null;
  if (credential) {
    const actual = await derivePassword(
      password,
      fromBase64Url(credential.passwordSalt),
      credential.passwordIterations,
    );
    return equalBytes(actual, fromBase64Url(credential.passwordHash));
  }

  const expected = requiredEnvString(env, "ADMIN_PASSWORD_HASH").toLowerCase();
  const digest = await sha256Hex(new TextEncoder().encode(password));
  if (digest.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < digest.length; index += 1) {
    difference |= digest.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function requireAdmin(
  request: Request,
  env: Env,
  jwksOverride?: JWTVerifyGetKey,
  mark?: (phase: string) => void,
  clerkVerifierOverride?: ClerkRequestVerifier,
): Promise<AdminIdentity> {
  if (isLocalRequest(request, env)) {
    return { email: "maria.helena@local.dev", roles: ["admin"] };
  }

  mark?.("session-start");
  const passwordIdentity = await verifyPasswordSession(request, env, mark);
  mark?.("session-end");
  if (passwordIdentity) return passwordIdentity;

  const mode = adminAuthMode(env);
  if (mode !== "legacy") {
    if (hasClerkCredential(request)) {
      const linked = await resolveLinkedClerkAdmin(request, env, {
        requireConfig: mode === "clerk",
        verifier: clerkVerifierOverride,
      });
      if (linked) {
        return {
          email: linked.adminPrincipalId,
          roles: ["admin"],
          authSource: "clerk",
          clerkUserId: linked.clerkUserId,
          sessionVersion: linked.sessionVersion,
          clerkRevocationKeys: linked.revocationKeys,
        };
      }
      if (mode === "clerk") {
        throw new AppError(403, "ADMIN_UNAUTHORIZED", "Acesso administrativo não autorizado.");
      }
    } else if (mode === "clerk") {
      throw new AppError(403, "ADMIN_UNAUTHORIZED", "Acesso administrativo não autorizado.");
    }
  }

  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) {
    throw new AppError(403, "ADMIN_UNAUTHORIZED", "Acesso administrativo não autorizado.");
  }

  assertSeparateAccessAudiences(env);
  const teamDomain = normalizeTeamDomain(requiredEnvString(env, "CLOUDFLARE_TEAM_DOMAIN"));
  const audience = requiredEnvString(env, "CLOUDFLARE_ACCESS_AUD");
  const issuer = `https://${teamDomain}`;
  const jwks = jwksOverride ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  try {
    const { payload } = await jwtVerify(assertion, jwks, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "iat", "sub", "email", "type"],
    });
    if (
      payload.type !== "app" ||
      typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 256 ||
      !Number.isInteger(payload.iat) ||
      payload.iat! > Math.floor(Date.now() / 1000) + 30 ||
      payload.exp! <= payload.iat!
    ) throw new Error("JWT administrativo sem identidade e validade completas");
    const email =
      typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
    const allowed = allowedAdminEmails(env);
    if (!email || !allowed.includes(email)) {
      throw new Error("JWT sem e-mail administrativo permitido");
    }
    return { email, roles: ["admin"] };
  } catch {
    throw new AppError(403, "ADMIN_UNAUTHORIZED", "Acesso administrativo não autorizado.");
  }
}

export function assertAllowedOrigin(request: Request, env: Env): void {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
    return;
  }
  const origin = request.headers.get("origin");
  const expected = envString(env, "SITE_ORIGIN");
  if (!origin || !expected || origin !== expected) {
    throw new AppError(403, "INVALID_ORIGIN", "A origem desta operação não é permitida.");
  }
}
