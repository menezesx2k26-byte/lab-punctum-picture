"use client";

import { useState } from "react";
import { ClerkProvider, Show, SignInButton, UserButton, useAuth, useClerk } from "@clerk/react";
import { ArrowRight } from "lucide-react";

function ClerkAdminSessionExchange() {
  const { getToken, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function exchangeSession() {
    setBusy(true);
    setMessage("");
    try {
      const token = await getToken();
      if (!token) {
        setMessage("Entre com sua conta Clerk para acessar o painel.");
        setBusy(false);
        return;
      }
      const response = await fetch("/admin/api/clerk-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "Esta conta Clerk não está vinculada ao estúdio.",
        );
      }
      const requested = new URLSearchParams(window.location.search).get("next");
      window.location.href = requested?.startsWith("/admin") ? requested : "/admin";
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível validar sua sessão Clerk.",
      );
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="button access-submit" type="button" disabled={!isLoaded}>
            Entrar com Clerk
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <UserButton />
          <button
            type="button"
            className="access-back"
            style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }}
            onClick={() => void signOut()}
          >
            Trocar conta
          </button>
        </div>
        <button
          className="button access-submit"
          type="button"
          disabled={busy}
          onClick={() => void exchangeSession()}
        >
          {busy ? "Validando…" : "Abrir painel administrativo"}
          {!busy && <ArrowRight size={16} aria-hidden="true" />}
        </button>
      </Show>
      {message && (
        <p className="access-status" role="alert" aria-live="polite">
          {message}
        </p>
      )}
    </div>
  );
}

export function ClerkAdminLogin({ publishableKey }: { publishableKey: string }) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <div className="access-clerk-box" style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <ClerkAdminSessionExchange />
      </div>
    </ClerkProvider>
  );
}
