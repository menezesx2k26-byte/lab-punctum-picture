import { createClerkClient } from "@clerk/backend";
import { z } from "zod";
import { envString } from "../utils/env";
import { AppError } from "../utils/errors";

export const clerkLookupEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(180);

export type ClerkDirectoryUserSummary = {
  clerkUserId: string;
  email: string;
  fullName: string;
  createdAt: string | null;
};

export type ClerkInviteResult =
  | {
      status: "already_registered";
      user: ClerkDirectoryUserSummary;
    }
  | {
      status: "invited";
      invitationId: string;
    };

export type ClerkAdminDirectoryClient = {
  users: {
    getUserList: (params: {
      emailAddress?: string[];
      limit?: number;
    }) => Promise<{
      data: Array<{
        id: string;
        firstName?: string | null;
        lastName?: string | null;
        fullName?: string | null;
        createdAt?: number | null;
        emailAddresses?: Array<{ emailAddress?: string | null }>;
      }>;
    }>;
  };
  invitations: {
    createInvitation: (params: {
      emailAddress: string;
      redirectUrl?: string;
      ignoreExisting?: boolean;
    }) => Promise<{ id: string }>;
  };
};

function resolveDirectoryClient(
  env: Env,
  override?: ClerkAdminDirectoryClient,
): ClerkAdminDirectoryClient {
  const secretKey = envString(env, "CLERK_SECRET_KEY");
  if (!secretKey) {
    throw new AppError(
      503,
      "CLERK_NOT_CONFIGURED",
      "Integração de busca no Clerk indisponível neste ambiente.",
    );
  }
  if (override) return override;
  return createClerkClient({ secretKey }) as unknown as ClerkAdminDirectoryClient;
}

function summarizeClerkUser(
  user: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    createdAt?: number | null;
    emailAddresses?: Array<{ emailAddress?: string | null }>;
  },
  fallbackEmail: string,
): ClerkDirectoryUserSummary {
  const parts = [user.firstName?.trim(), user.lastName?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  const fullName = user.fullName?.trim() || parts.join(" ") || fallbackEmail;
  const email =
    user.emailAddresses?.[0]?.emailAddress?.trim().toLowerCase() ||
    fallbackEmail;
  const createdAt =
    typeof user.createdAt === "number" && Number.isFinite(user.createdAt)
      ? new Date(user.createdAt).toISOString()
      : null;
  return {
    clerkUserId: user.id,
    email,
    fullName,
    createdAt,
  };
}

export async function lookupClerkUsersByEmail(
  rawEmail: string,
  env: Env,
  options: { clerkClient?: ClerkAdminDirectoryClient } = {},
): Promise<ClerkDirectoryUserSummary[]> {
  const parsed = clerkLookupEmailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_EMAIL", "Informe um e-mail válido.");
  }
  const email = parsed.data;
  const client = resolveDirectoryClient(env, options.clerkClient);
  const result = await client.users.getUserList({
    emailAddress: [email],
    limit: 5,
  });
  return (result.data ?? []).map((user) => summarizeClerkUser(user, email));
}

export async function inviteClerkClientByEmail(
  rawEmail: string,
  request: Request,
  env: Env,
  options: { clerkClient?: ClerkAdminDirectoryClient } = {},
): Promise<ClerkInviteResult> {
  const parsed = clerkLookupEmailSchema.safeParse(rawEmail);
  if (!parsed.success) {
    throw new AppError(400, "INVALID_EMAIL", "Informe um e-mail válido.");
  }
  const email = parsed.data;
  const client = resolveDirectoryClient(env, options.clerkClient);
  const existing = await client.users.getUserList({
    emailAddress: [email],
    limit: 1,
  });
  if ((existing.data?.length ?? 0) > 0) {
    return {
      status: "already_registered",
      user: summarizeClerkUser(existing.data[0], email),
    };
  }
  const baseOrigin =
    envString(env, "PUBLIC_SITE_URL") ??
    envString(env, "SITE_ORIGIN") ??
    new URL(request.url).origin;
  const redirectUrl = new URL("/albuns/entrar", baseOrigin).toString();
  try {
    const invitation = await client.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      ignoreExisting: false,
    });
    return {
      status: "invited",
      invitationId: invitation.id,
    };
  } catch (error) {
    const message = String(error);
    if (
      message.includes("duplicate") ||
      message.includes("already exists") ||
      message.includes("pending invitation")
    ) {
      throw new AppError(
        409,
        "INVITATION_EXISTS",
        "Já existe um convite pendente para este e-mail no Clerk.",
      );
    }
    throw error;
  }
}
