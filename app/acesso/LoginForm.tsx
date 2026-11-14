"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { ClerkAdminLogin } from "./ClerkAdminLogin";

export type AdminLoginProps = {
  clerkEnabled?: boolean;
  clerkOnly?: boolean;
  publishableKey?: string;
};

export function LoginForm({
  clerkEnabled = false,
  clerkOnly = false,
  publishableKey,
}: AdminLoginProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/admin/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Não foi possível entrar.");
      }

      const requested = new URLSearchParams(window.location.search).get("next");
      window.location.href = requested?.startsWith("/admin") ? requested : "/admin";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível entrar.");
      setBusy(false);
    }
  }

  const showClerk = Boolean(clerkEnabled && publishableKey);

  return (
    <div className="access-form">
      <div className="access-lock" aria-hidden="true">
        <LockKeyhole size={18} />
      </div>
      <div>
        <p className="eyebrow">Acesso reservado</p>
        <h1>Entrar no painel</h1>
        <p className="access-description">Área de administração da Punctum Picture.</p>
      </div>
      {showClerk && publishableKey && (
        <ClerkAdminLogin publishableKey={publishableKey} />
      )}
      {!clerkOnly && (
        <form className="access-form" style={{ padding: 0, border: 0 }} onSubmit={submit}>
          <label className="field">
            <span>E-mail</span>
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="seuemail@gmail.com"
              required
            />
          </label>
          <label className="field">
            <span>Senha</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button className="button access-submit" type="submit" disabled={busy}>
            {busy ? "Entrando…" : "Entrar"}
            {!busy && <ArrowRight size={16} aria-hidden="true" />}
          </button>
          <p className="access-status" role="alert" aria-live="polite">
            {message}
          </p>
        </form>
      )}
    </div>
  );
}
