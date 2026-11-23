"use client";

import { useState } from "react";
import { ClerkProvider, Show, SignInButton, useAuth, useClerk } from "@clerk/react";

function ClerkClientSessionExchange() {
  const { getToken, isLoaded } = useAuth();
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function exchangeSession() {
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) {
        setError("Entre com sua conta para abrir os seus álbuns.");
        setBusy(false);
        return;
      }
      const response = await fetch("/api/client/clerk-session", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(
          body.error?.message ?? "Esta conta ainda não está vinculada a um álbum.",
        );
      }
      window.location.replace("/albuns");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível concluir o acesso.",
      );
      setBusy(false);
    }
  }

  async function switchAccount() {
    setBusy(true);
    setError("");
    try {
      // Clerk signOut alone leaves the independent Punctum cookie authorized.
      const response = await fetch("/api/client/session", {
        method: "DELETE", credentials: "same-origin", cache: "no-store",
      });
      if (!response.ok) throw new Error("Não foi possível encerrar a sessão privada.");
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível trocar de conta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="pa-primary" type="button" disabled={!isLoaded}>
            Continuar para meus álbuns <span aria-hidden="true">↗</span>
          </button>
        </SignInButton>
      </Show>
      <Show when="signed-in">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span>Conta conectada</span>
          <button
            type="button"
            disabled={busy}
            style={{ background: "none", border: 0, cursor: "pointer", textDecoration: "underline", font: "inherit" }}
            onClick={() => void switchAccount()}
          >
            Trocar conta
          </button>
        </div>
        <button
          className="pa-primary"
          type="button"
          disabled={busy}
          onClick={() => void exchangeSession()}
        >
          {busy ? "Aguarde…" : "Abrir meus álbuns"} <span aria-hidden="true">↗</span>
        </button>
      </Show>
      {error && (
        <p role="alert" className="pa-error">
          {error}
        </p>
      )}
    </div>
  );
}

export function ClerkClientLogin({ publishableKey }: { publishableKey: string }) {
  return (
    <ClerkProvider
      publishableKey={publishableKey}
      appearance={{
        variables: {
          colorPrimary: "#422079",
          colorPrimaryForeground: "#ffffff",
          colorBackground: "#f7f4ef",
          colorForeground: "#18131e",
          colorMutedForeground: "#46394d",
          colorInput: "#ffffff",
          colorInputForeground: "#18131e",
          colorBorder: "#a89ab2",
          borderRadius: "0px",
          fontFamily: "Figtree, Manrope, sans-serif",
        },
      }}
    >
      <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <ClerkClientSessionExchange />
      </div>
    </ClerkProvider>
  );
}
