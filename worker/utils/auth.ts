import { assertSeparateAccessAudiences } from "../client/audience";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { AppError } from "./errors";
import { envString, requiredEnvString } from "./env";

const ADMIN_SESSION_COOKIE = "punctum_admin_session";
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AdminIdentity = {
  email: string;
  roles: ["admin"];
};

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

async function hmacKey(env: Env): Promise<CryptoKey> {
  const secret = requiredEnvString(env, "ADMIN_SESSION_SECRET");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function verifyPasswordSession(
  request: Request,
  env: Env,
): Promise<AdminIdentity | null> {
  const token = parseCookies(request).get(ADMIN_SESSION_COOKIE);
  if (!token) return null;

  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(env),
      new Uint8Array(fromBase64Url(encodedSignature)).buffer,
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return null;

    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encodedPayload)),
    ) as { email?: unknown; exp?: unknown };
    if (typeof payload.email !== "string" || typeof payload.exp !== "number") {
      return null;
    }
    const email = payload.email.toLowerCase();
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (!allowedAdminEmails(env).includes(email)) return null;
    return { email, roles: ["admin"] };
  } catch {
    return null;
  }
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
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await hmacKey(env),
      new TextEncoder().encode(payload),
    ),
  );
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
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password)),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  if (digest.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < digest.length; index += 1) {
    difference |= digest.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function requireAdmin(request: Request, env: Env): Promise<AdminIdentity> {
  if (isLocalRequest(request, env)) {
    return { email: "maria.helena@local.dev", roles: ["admin"] };
  }

  const passwordIdentity = await verifyPasswordSession(request, env);
  if (passwordIdentity) return passwordIdentity;

  const assertion = request.headers.get("cf-access-jwt-assertion");
  if (!assertion) {
    throw new AppError(403, "ADMIN_UNAUTHORIZED", "Acesso administrativo não autorizado.");
  }

  assertSeparateAccessAudiences(env);
  const teamDomain = normalizeTeamDomain(requiredEnvString(env, "CLOUDFLARE_TEAM_DOMAIN"));
  const audience = requiredEnvString(env, "CLOUDFLARE_ACCESS_AUD");
  const issuer = `https://${teamDomain}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));

  try {
    const { payload } = await jwtVerify(assertion, jwks, {
      issuer,
      audience,
      algorithms: ["RS256"],
    });
    const email = typeof payload.email === "string" ? payload.email : null;
    if (!email) {
      throw new Error("JWT sem e-mail");
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
