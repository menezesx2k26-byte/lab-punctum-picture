import { createClerkClient } from "@clerk/backend";
import {
  clerkTokenRevocationKey,
  extractClerkToken,
  isClerkTokenRevoked,
  isValidClerkUserId,
} from "../auth/clerk-auth";
import { envString } from "../utils/env";
import { privateJson, privateResponse } from "./response";

export const CLERK_PILOT_API_PATH = "/api/clerk-pilot/me";

type PilotConfig = {
  origin: string;
  issuer: string;
  publishableKey: string;
  jwtKey: string;
};

export type PilotVerifiedIdentity = {
  clerkUserId: string;
  sessionId: string;
};

export type PilotIdentityVerifier = (
  request: Request,
  config: PilotConfig,
) => Promise<PilotVerifiedIdentity | null>;

const deny = (status: number) => privateResponse(new Response(null, { status }));

function configFor(request: Request, env: Env): PilotConfig | null {
  const origin = envString(env, "SITE_ORIGIN");
  const issuer = envString(env, "CLERK_PILOT_ISSUER");
  const publishableKey =
    envString(env, "CLERK_PUBLISHABLE_KEY") ??
    envString(env, "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const jwtKey = envString(env, "CLERK_JWT_KEY");
  if (!origin || !issuer || !publishableKey || !jwtKey) return null;
  try {
    const canonical = new URL(origin);
    const identityIssuer = new URL(issuer);
    // A request on an unexpected host must never authorize an identity mapping.
    if (canonical.origin !== new URL(request.url).origin) return null;
    if (identityIssuer.protocol !== "https:" || identityIssuer.origin !== issuer) return null;
    return { origin: canonical.origin, issuer, publishableKey, jwtKey };
  } catch {
    return null;
  }
}

/** Signed Clerk identity only; never trust arbitrary email or client-provided role claims. */
export async function verifyClerkPilotIdentity(
  request: Request,
  config: PilotConfig,
): Promise<PilotVerifiedIdentity | null> {
  try {
    const client = createClerkClient({ publishableKey: config.publishableKey });
    const state = await client.authenticateRequest(request, {
      acceptsToken: "session_token",
      authorizedParties: [config.origin],
      issuer: config.issuer,
      jwtKey: config.jwtKey,
    });
    if (!state.isAuthenticated) return null;
    const auth = state.toAuth();
    if (!isValidClerkUserId(auth.userId)) return null;
    // Align with the main Clerk verifier: session tokens must carry a sid.
    if (typeof auth.sessionId !== "string" || auth.sessionId.length < 3) return null;
    return { clerkUserId: auth.userId, sessionId: auth.sessionId };
  } catch {
    return null;
  }
}

/** Explicitly isolated read-only verification; does not issue Punctum legacy cookies. */
export async function handleClerkPilotRequest(
  request: Request,
  env: Env,
  verifier: PilotIdentityVerifier = verifyClerkPilotIdentity,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== CLERK_PILOT_API_PATH) return null;
  if (envString(env, "CLERK_PILOT_ENABLED") !== "true") return deny(404);
  if (request.method !== "GET") return deny(405);

  const expectedOrigin = envString(env, "SITE_ORIGIN");
  if (!expectedOrigin || new URL(request.url).origin !== expectedOrigin) return deny(403);

  const config = configFor(request, env);
  if (!config || !env.DB) return deny(503);

  let verified: PilotVerifiedIdentity | null;
  try {
    verified = await verifier(request, config);
  } catch {
    verified = null;
  }
  if (
    !verified ||
    !isValidClerkUserId(verified.clerkUserId) ||
    typeof verified.sessionId !== "string" ||
    verified.sessionId.length < 3
  ) {
    return deny(401);
  }

  const rawToken = extractClerkToken(request);
  const revocationKeys = [
    ...(rawToken ? [await clerkTokenRevocationKey(rawToken)] : []),
    `sid:${verified.sessionId}`,
  ];
  try {
    if (await isClerkTokenRevoked(env.DB, revocationKeys)) return deny(401);
  } catch {
    return deny(503);
  }

  // Neither email nor token metadata can link accounts. D1 association is
  // provisioned in a separately authorized verified migration transaction.
  const linked = await env.DB.prepare(
    `SELECT c.id AS clientId, c.disabled_at AS disabledAt,
      c.session_version AS sessionVersion,
      l.session_version_at_link AS versionAtLink
    FROM clerk_pilot_identity_links l
    JOIN client_accounts c ON c.id = l.client_id
    WHERE l.clerk_user_id = ?`,
  ).bind(verified.clerkUserId).first<{
    clientId: string;
    disabledAt: string | null;
    sessionVersion: number;
    versionAtLink: number;
  }>();
  if (!linked || linked.disabledAt !== null ||
    linked.sessionVersion !== linked.versionAtLink) return deny(403);

  return privateJson({
    authenticated: true,
    linked: true,
    clientId: linked.clientId,
  });
}
