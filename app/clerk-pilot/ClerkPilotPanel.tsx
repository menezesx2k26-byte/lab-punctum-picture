"use client";

import { useState } from "react";
import Link from "next/link";
import { ClerkProvider, Show, SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/react";

function IdentityCheck() {
  const { getToken } = useAuth();
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    setStatus("");
    try {
      const token = await getToken();
      if (!token) {
        setStatus("Entre na sua conta Clerk para testar a autorização.");
        return;
      }
      const response = await fetch("/api/clerk-pilot/me", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.status === 403) {
        setStatus("Identidade validada, mas ainda sem vínculo autorizado no D1.");
      } else if (response.ok) {
        setStatus("Vínculo de laboratório confirmado. Nenhum álbum foi liberado.");
      } else {
        setStatus("Verificação indisponível ou sessão não autorizada.");
      }
    } catch {
      setStatus("Falha na consulta. Nenhuma autorização foi alterada.");
    } finally {
      setLoading(false);
    }
  }

  return <section style={{ marginTop: 24 }}>
    <button type="button" disabled={loading} onClick={check}>
      {loading ? "Verificando…" : "Testar vínculo de identidade"}
    </button>
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}

export function ClerkPilotPanel({ publishableKey }: { publishableKey: string }) {
  return (
    <ClerkProvider publishableKey={publishableKey}>
      <main style={{ maxWidth: 720, margin: "8vh auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
        <Link href="/">Punctum Picture</Link>
        <h1>Laboratório de autenticação Clerk</h1>
        <p>Ambiente isolado. Não concede acesso aos álbuns e não substitui o login atual.</p>
        <Show when="signed-out">
          <nav style={{ display: "flex", gap: 20, marginBlock: 24 }} aria-label="Acessar laboratório">
            <SignInButton mode="modal"><button type="button">Entrar</button></SignInButton>
            <SignUpButton mode="modal"><button type="button">Criar conta de laboratório</button></SignUpButton>
          </nav>
        </Show>
        <Show when="signed-in">
          <UserButton />
          <IdentityCheck />
        </Show>
      </main>
    </ClerkProvider>
  );
}
