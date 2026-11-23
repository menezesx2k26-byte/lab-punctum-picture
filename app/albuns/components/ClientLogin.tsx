"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
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
  return (
    <main id="conteudo" className="pa-entry">
      <header className="pa-entry-topbar">
        <Link href="/" className="pa-brand" aria-label="Punctum Picture, voltar à página inicial">
          <Image
            src={getPublicVisualAsset("logo").src}
            alt=""
            width={70}
            height={70}
            priority
          />
          <span>PUNCTUM <strong>PICTURE</strong></span>
        </Link>
        <Link href="/" className="pa-top-link">
          <span aria-hidden="true">←</span> Voltar ao portfólio
        </Link>
      </header>

      <div className="pa-entry-grid">
        <section className="pa-entry-copy" aria-labelledby="pa-entry-title">
          <p className="pa-eyebrow">Punctum Picture / Área reservada</p>
          <h1 id="pa-entry-title">
            {changePassword ? (
              <>Seu acesso, <em>seu momento.</em></>
            ) : (
              <>Suas imagens. <em>Seu olhar.</em></>
            )}
          </h1>
          <p>
            {changePassword
              ? "Escolha uma senha pessoal para continuar a explorar suas fotografias."
              : "Um lugar para rever seus ensaios, escolher favoritas e guardar os detalhes que importam."}
          </p>
          <span className="pa-entry-signature">Fotografia por Maria Helena</span>
        </section>

        <section className="pa-login-card" aria-labelledby="login-title">
          <p className="pa-eyebrow">Acesso aos álbuns</p>
          <h2 id="login-title">
            {changePassword ? "Defina sua senha" : "Entre no seu arquivo"}
          </h2>
          {!changePassword && (
            <p className="pa-form-intro">Use o e-mail cadastrado com o estúdio para acessar suas fotografias.</p>
          )}
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
                  autoComplete={changePassword ? "new-password" : "current-password"}
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
              {error && <p role="alert" className="pa-error">{error}</p>}
              <button className="pa-primary" disabled={busy} type="submit">
                {busy ? "Aguarde…" : changePassword ? "Salvar senha e entrar" : "Acessar meus álbuns"}
                <span aria-hidden="true">↗</span>
              </button>
            </form>
          )}
          <p className="pa-caption">
            {changePassword
              ? "Sua senha é pessoal. Evite reutilizar senhas de outros serviços."
              : clerkOnly
                ? "Seu acesso é pessoal. Se ainda não recebeu um convite, entre em contato com o estúdio."
                : "Primeiro acesso ou esqueceu a senha? Peça uma nova senha temporária ao estúdio."}
          </p>
        </section>

        <figure className="pa-entry-art">
          <Image
            src={getPublicVisualAsset("hero").src}
            alt={getPublicVisualAsset("hero").alt}
            width={getPublicVisualAsset("hero").width}
            height={getPublicVisualAsset("hero").height}
            sizes="(max-width: 760px) 100vw, 46vw"
          />
          <figcaption>O olhar de Maria Helena. As suas histórias.</figcaption>
        </figure>
      </div>

      <footer className="pa-entry-footer">
        <span>© {new Date().getFullYear()} Punctum Picture</span>
        <div className="pa-entry-links">
          <Link href="/acesso" prefetch={false} className="pa-studio-link">
            Acesso do estúdio
          </Link>
          <Link href="/">Página inicial ↗</Link>
        </div>
      </footer>
    </main>
  );
}
