"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { getPublicVisualAsset } from "../../lib/public-visuals";
import { privateApi, errorMessage } from "./api";
import { loginErrorMessage } from "./routes";
import { ClerkClientLogin } from "./ClerkClientLogin";

export function ClientLogin({
  changePassword = false,
  clerkEnabled = false,
  clerkOnly = false,
  publishableKey,
}: {
  changePassword?: boolean;
  clerkEnabled?: boolean;
  clerkOnly?: boolean;
  publishableKey?: string;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (changePassword && password !== confirmation) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    try {
      if (changePassword) {
        await privateApi("/api/client/password", "POST", { password });
        window.location.replace("/albuns");
      } else {
        const response = await fetch("/api/client/session", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok) throw new Error(loginErrorMessage(response.status));
        const data = (await response.json()) as { mustChangePassword: boolean };
        window.location.replace(
          data.mustChangePassword ? "/albuns/trocar-senha" : "/albuns",
        );
      }
      setPassword("");
      setConfirmation("");
    } catch (e) {
      setError(errorMessage(e));
      setPassword("");
      setConfirmation("");
      setBusy(false);
    }
  }

  const logo = getPublicVisualAsset("logo");
  const photograph = getPublicVisualAsset("cinematicHero");

  return (
    <main className="pa-auth-main">
      <section className="pa-auth-panel">
        <header className="pa-auth-brand">
          <Link
            href="/"
            className="pa-auth-logo"
            aria-label="Punctum Picture: página inicial"
          >
            <Image
              src={logo.src}
              alt=""
              width={logo.width}
              height={logo.height}
              priority
              sizes="66px"
            />
          </Link>
          <span>Fotografias por Maria Helena</span>
        </header>

        <div className="pa-auth-body">
          <p className="pa-eyebrow">
            {changePassword ? "Acesso protegido" : "Área do cliente"}
          </p>
          <h1>
            {changePassword ? (
              <>Suas memórias, <em>em segurança.</em></>
            ) : (
              <>Suas fotografias, <em>só suas.</em></>
            )}
          </h1>
          <p className="pa-auth-description">
            {changePassword
              ? "Escolha uma nova senha com pelo menos 12 caracteres."
              : "Entre para acessar seus álbuns privados."}
          </p>

          <section className="pa-auth-form" aria-labelledby="login-title">
            <h2 id="login-title">
              {changePassword ? "Escolha sua senha" : "Bem-vindo de volta"}
            </h2>
            {!changePassword && clerkEnabled && publishableKey && (
              <ClerkClientLogin publishableKey={publishableKey} />
            )}
            {(changePassword || !clerkOnly) && (
              <form onSubmit={submit}>
                {!changePassword && (
                  <label>
                    E-mail
                    <input
                      type="email"
                      name="email"
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      maxLength={180}
                      required
                    />
                  </label>
                )}
                <label>
                  {changePassword ? "Nova senha" : "Senha"}
                  <input
                    type="password"
                    name="password"
                    autoComplete={
                      changePassword ? "new-password" : "current-password"
                    }
                    minLength={changePassword ? 12 : 1}
                    maxLength={1024}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                {changePassword && (
                  <label>
                    Confirme a nova senha
                    <input
                      type="password"
                      name="confirmation"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={1024}
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      required
                    />
                  </label>
                )}
                {error && (
                  <p role="alert" className="pa-error">
                    {error}
                  </p>
                )}
                <button className="pa-primary" disabled={busy} type="submit">
                  {busy
                    ? "Aguarde…"
                    : changePassword
                      ? "Salvar senha e entrar"
                      : "Abrir meus álbuns"}
                  <span aria-hidden="true">↗</span>
                </button>
              </form>
            )}
            <p className="pa-caption">
              {changePassword
                ? "Sua senha é pessoal. Evite reutilizar senhas de outros serviços."
                : clerkOnly
                  ? "Use a conta autorizada pelo estúdio para abrir seus álbuns."
                  : "Primeiro acesso ou esqueceu a senha? Peça uma nova senha temporária ao estúdio."}
            </p>
          </section>
        </div>

        <footer className="pa-auth-footer">
          <span>Punctum Picture</span>
          <Link href="/acesso" prefetch={false}>Entrar no estúdio ↗</Link>
          <Link href="/">Voltar ao site ↗</Link>
        </footer>
      </section>

      <aside className="pa-auth-photo" aria-hidden="true">
        <Image
          src={photograph.src}
          alt=""
          fill
          priority
          sizes="(max-width: 800px) 100vw, 52vw"
        />
      </aside>
    </main>
  );
}
