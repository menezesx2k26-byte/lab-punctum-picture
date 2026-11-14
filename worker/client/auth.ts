import { AppError } from "../utils/errors";
import { envString } from "../utils/env";
import {
  hasClerkCredential,
  resolveLinkedClerkClient,
} from "../auth/clerk-auth";
import { requireClientSessionSecret } from "./secret";
import { clientAuthMode } from "./auth-mode";
import { base64Url, unbase64Url } from "./passwords";
import { getActiveClient } from "./repository";
export const CLIENT_SESSION_TTL = 43_200;
const COOKIE = "punctum_client_session";
export type ClientSessionAudience =
  | "punctum-client"
  | "punctum-client-access"
  | "punctum-client-clerk";
export type ClientIdentity = {
  id: string;
  name: string;
  mustChangePassword: boolean;
  sessionVersion: number;
  authSource?: ClientSessionAudience;
  clerkRevocationKeys?: string[];
};
async function key(env: Env) {
  const secret = requireClientSessionSecret(env);
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
export async function createClientSession(
  identity: { id: string; sessionVersion: number },
  env: Env,
  audienceOverride?: ClientSessionAudience,
  clerkRevocationKeys?: string[],
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const mode = clientAuthMode(env);
  const audience =
    audienceOverride ??
    (mode === "access"
      ? "punctum-client-access"
      : mode === "clerk"
        ? "punctum-client-clerk"
        : "punctum-client");
  const payload = base64Url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: identity.id,
        version: identity.sessionVersion,
        iat: now,
        exp: now + CLIENT_SESSION_TTL,
        audience,
        ...(clerkRevocationKeys?.length ? { rk: clerkRevocationKeys } : {}),
      }),
    ),
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      await key(env),
      new TextEncoder().encode(payload),
    ),
  );
  return payload + "." + base64Url(signature);
}
export function clientSessionCookie(token: string) {
  return `${COOKIE}=${token}; Path=/; Max-Age=${CLIENT_SESSION_TTL}; HttpOnly; Secure; SameSite=Strict`;
}
export function clearClientSessionCookie() {
  return `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}
function allowedClientAudiences(env: Env): ClientSessionAudience[] {
  const mode = clientAuthMode(env);
  if (mode === "access") return ["punctum-client-access"];
  if (mode === "clerk") return ["punctum-client-clerk"];
  if (envString(env, "CLERK_AUTH_ENABLED") === "true") {
    return ["punctum-client", "punctum-client-clerk"];
  }
  return ["punctum-client"];
}
export async function requireClient(
  request: Request,
  env: Env,
  db: D1Database,
  options: { allowPasswordChange?: boolean } = {},
): Promise<ClientIdentity> {
  const mode = clientAuthMode(env);
  const clerkHybrid = envString(env, "CLERK_AUTH_ENABLED") === "true";
  const token = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + "="))
    ?.slice(COOKIE.length + 1);
  const denied = () =>
    new AppError(401, "CLIENT_UNAUTHORIZED", "Entre para continuar.");
  if (!token) {
    if ((mode === "clerk" || clerkHybrid) && hasClerkCredential(request)) {
      const linked = await resolveLinkedClerkClient(request, env, db, {
        requireConfig: true,
      });
      return {
        id: linked.id,
        name: linked.name,
        mustChangePassword: false,
        sessionVersion: linked.sessionVersion,
        authSource: "punctum-client-clerk",
        clerkRevocationKeys: linked.revocationKeys,
      };
    }
    throw denied();
  }
  if (token.length > 2048) throw denied();
  let payload: {
    sub: string;
    version: number;
    exp: number;
    iat: number;
    audience: string;
    rk?: unknown;
  };
  try {
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) throw denied();
    const valid = await crypto.subtle.verify(
      "HMAC",
      await key(env),
      new Uint8Array(unbase64Url(signature)).buffer,
      new TextEncoder().encode(body),
    );
    if (!valid) throw denied();
    payload = JSON.parse(new TextDecoder().decode(unbase64Url(body)));
    const now = Math.floor(Date.now() / 1000);
    const allowedAudiences = allowedClientAudiences(env);
    if (
      typeof payload.sub !== "string" ||
      !Number.isInteger(payload.version) ||
      !Number.isInteger(payload.exp) ||
      !Number.isInteger(payload.iat) ||
      !allowedAudiences.includes(payload.audience as ClientSessionAudience) ||
      payload.exp <= now ||
      payload.iat > now + 30 ||
      payload.exp - payload.iat > CLIENT_SESSION_TTL
    )
      throw denied();
  } catch {
    throw denied();
  }
  const account = await getActiveClient(db, payload.sub);
  if (!account || account.sessionVersion !== payload.version) throw denied();
  if (payload.audience === "punctum-client-clerk") {
    const activeLink = await db
      .prepare(
        `SELECT session_version_at_link AS versionAtLink
         FROM clerk_pilot_identity_links
         WHERE client_id = ?`,
      )
      .bind(account.id)
      .first<{ versionAtLink: number }>();
    if (!activeLink || activeLink.versionAtLink !== account.sessionVersion) {
      throw denied();
    }
  }
  if (
    account.mustChangePassword &&
    !options.allowPasswordChange &&
    payload.audience !== "punctum-client-clerk"
  )
    throw new AppError(
      403,
      "PASSWORD_CHANGE_REQUIRED",
      "Troque sua senha para continuar.",
    );
  return {
    id: account.id,
    name: account.name,
    mustChangePassword:
      payload.audience === "punctum-client-clerk"
        ? false
        : Boolean(account.mustChangePassword),
    sessionVersion: account.sessionVersion,
    authSource: payload.audience as ClientSessionAudience,
    ...(Array.isArray(payload.rk)
      ? {
          clerkRevocationKeys: payload.rk.filter(
            (item): item is string => typeof item === "string",
          ),
        }
      : {}),
  };
}
