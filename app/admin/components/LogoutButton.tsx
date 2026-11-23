"use client";

import { ClerkProvider, useClerk } from "@clerk/react";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { performAdminLogout } from "./admin-logout";

function LogoutControls({
  clerkPublishableKey,
  signOut,
}: {
  clerkPublishableKey?: string;
  signOut?: () => Promise<unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    setBusy(true);
    setError("");
    const result = await performAdminLogout({
      clerkPublishableKey,
      signOut,
    });
    if (!result.ok) {
      setError("A sessão ainda pode estar ativa. Tente sair novamente.");
      setBusy(false);
      return;
    }
    router.replace("/acesso");
    router.refresh();
  }

  return (
    <>
      <button className="admin-logout" type="button" onClick={() => void logout()} disabled={busy}>
        <LogOut size={15} aria-hidden="true" />
        {busy ? "Saindo…" : "Sair"}
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}

function ClerkAwareLogout({ clerkPublishableKey }: { clerkPublishableKey: string }) {
  const { signOut } = useClerk();
  return (
    <LogoutControls
      clerkPublishableKey={clerkPublishableKey}
      signOut={() => signOut()}
    />
  );
}

export function LogoutButton({
  clerkPublishableKey,
}: {
  clerkPublishableKey?: string;
} = {}) {
  if (clerkPublishableKey) {
    return (
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <ClerkAwareLogout clerkPublishableKey={clerkPublishableKey} />
      </ClerkProvider>
    );
  }
  return <LogoutControls />;
}
