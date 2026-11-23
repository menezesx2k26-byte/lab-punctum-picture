"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { privateApi, errorMessage } from "./api";
export function ClientHeader() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"password" | "access" | "clerk" | null>(null);
  const [clientName, setClientName] = useState("");
  useEffect(() => {
    let active = true;
    void privateApi<{
      authMode: "password" | "access" | "clerk";
      client?: { name?: string };
    }>("/api/client/me")
      .then((data) => {
        if (!active) return;
        setAuthMode(data.authMode);
        if (data.client?.name) setClientName(data.client.name);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  async function logout() {
    setBusy(true);
    try {
      const result = await privateApi<{ logoutUrl: string }>("/api/client/session", "DELETE");
      window.location.replace(result.logoutUrl);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }
  const firstName = clientName.trim().split(/\s+/)[0] ?? "";
  return (
    <>
      <header className="pa-header">
        <Link className="pa-wordmark" href="/albuns" prefetch={false}>
          PUNCTUM <span>PICTURE</span>
        </Link>
        <nav aria-label="Seus álbuns">
          {firstName && <span className="pa-user-pill">Olá, {firstName}</span>}
          <Link href="/albuns" prefetch={false}>
            Meus álbuns
          </Link>
          <Link href="/">Site principal</Link>
          {authMode === "password" && (
            <Link href="/albuns/trocar-senha" prefetch={false}>
              Senha
            </Link>
          )}
          <button onClick={logout} disabled={busy}>
            {busy ? "Saindo…" : "Sair"}
          </button>
        </nav>
      </header>
      {error && (
        <p role="alert" className="pa-error">
          {error}
        </p>
      )}
    </>
  );
}
