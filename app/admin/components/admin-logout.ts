/** Shared admin logout sequencing: Punctum session first, then optional Clerk signOut. */

export type AdminLogoutResult =
  | { ok: true; authSource?: string }
  | { ok: false; error: string };

export function shouldClerkSignOutAfterAdminLogout(args: {
  clerkPublishableKey?: string | null;
  authSource?: string | null;
}): boolean {
  return Boolean(args.clerkPublishableKey) && args.authSource === "clerk";
}

export async function performAdminLogout(options: {
  fetchImpl?: typeof fetch;
  clerkPublishableKey?: string | null;
  signOut?: () => Promise<unknown>;
}): Promise<AdminLogoutResult> {
  const fetchFn = options.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchFn("/admin/api/session", {
      method: "DELETE",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Não foi possível encerrar a sessão." };
  }
  if (!response.ok) {
    return { ok: false, error: "Não foi possível encerrar a sessão." };
  }

  let authSource: string | undefined;
  try {
    const body = (await response.json()) as { authSource?: unknown };
    if (typeof body.authSource === "string") authSource = body.authSource;
  } catch {
    authSource = undefined;
  }

  // Fail-closed: only clear the Clerk browser session after Punctum revocation succeeded.
  if (
    shouldClerkSignOutAfterAdminLogout({
      clerkPublishableKey: options.clerkPublishableKey,
      authSource,
    }) &&
    options.signOut
  ) {
    await options.signOut();
  }

  return { ok: true, ...(authSource ? { authSource } : {}) };
}
