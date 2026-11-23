"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Settings = {
  brandName: string;
  tagline: string | null;
  aboutText: string | null;
  whatsappE164: string | null;
  whatsappMessage: string | null;
  instagramUrl: string | null;
  contactEmail: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

type SettingsResponse = {
  settings?: Settings;
  error?: { message?: string };
};

const empty: Settings = {
  brandName: "Punctum Picture",
  tagline: "",
  aboutText: "",
  whatsappE164: "",
  whatsappMessage: "",
  instagramUrl: "",
  contactEmail: "",
  seoTitle: "",
  seoDescription: "",
};

export function SettingsManager() {
  const [settings, setSettings] = useState<Settings>(empty);
  const [authSource, setAuthSource] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    fetch("/admin/api/settings")
      .then((response) => response.json())
      .then((body: unknown) => {
        const parsed = body as SettingsResponse;
        if (parsed.settings) setSettings(parsed.settings);
      })
      .catch(() => setStatus("Não foi possível carregar as configurações."));
    fetch("/admin/api/me", { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        const parsed = body as { authSource?: unknown } | null;
        if (parsed && typeof parsed.authSource === "string") {
          setAuthSource(parsed.authSource);
        }
      })
      .catch(() => {});
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setStatus("Salvando…");
    const editableSettings = {
      brandName: settings.brandName,
      whatsappE164: settings.whatsappE164,
      whatsappMessage: settings.whatsappMessage,
      instagramUrl: settings.instagramUrl,
      contactEmail: settings.contactEmail,
      seoTitle: settings.seoTitle,
      seoDescription: settings.seoDescription,
    };
    const response = await fetch("/admin/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editableSettings),
    });
    const body = (await response.json()) as SettingsResponse;
    if (!response.ok) {
      setStatus(body.error?.message ?? "Não foi possível salvar.");
      return;
    }
    if (body.settings) setSettings(body.settings);
    setStatus("Configurações salvas.");
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setPasswordStatus("A confirmação não corresponde à nova senha.");
      return;
    }

    const payload =
      authSource === "clerk"
        ? { newPassword }
        : { currentPassword, newPassword };

    setChangingPassword(true);
    setPasswordStatus("Alterando senha…");
    try {
      const response = await fetch("/admin/api/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Não foi possível alterar a senha.");
      }
      form.reset();
      setPasswordStatus("Senha definitiva salva. Entre novamente com a nova senha.");
      window.setTimeout(() => {
        window.location.replace("/acesso");
      }, 1600);
    } catch (error) {
      setPasswordStatus(
        error instanceof Error ? error.message : "Não foi possível alterar a senha.",
      );
      setChangingPassword(false);
    }
  }

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="eyebrow">Site</p>
          <h1>Configurações</h1>
        </div>
      </div>
      <form className="admin-grid" onSubmit={save}>
        <section className="admin-card wide">
          <h2>Marca e contato</h2>
          <div className="admin-form">
            <label>
              <span>Nome da marca</span>
              <input
                className="admin-input"
                value={settings.brandName}
                onChange={(event) =>
                  setSettings({ ...settings, brandName: event.target.value })
                }
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <p className="admin-muted">
              A frase da marca, o texto “Sobre” e os demais textos públicos agora ficam no{" "}
              <Link href="/admin/studio">Studio</Link>, com prévia e publicação segura.
            </p>
            <div className="admin-form-row">
              <label>
                <span>WhatsApp com DDI</span>
                <input
                  className="admin-input"
                  value={settings.whatsappE164 ?? ""}
                  onChange={(event) =>
                    setSettings({ ...settings, whatsappE164: event.target.value })
                  }
                  placeholder="5511999999999"
                />
              </label>
              <label>
                <span>E-mail de contato</span>
                <input
                  className="admin-input"
                  type="email"
                  value={settings.contactEmail ?? ""}
                  onChange={(event) =>
                    setSettings({ ...settings, contactEmail: event.target.value })
                  }
                />
              </label>
            </div>
            <label>
              <span>Mensagem padrão do WhatsApp</span>
              <input
                className="admin-input"
                value={settings.whatsappMessage ?? ""}
                onChange={(event) =>
                  setSettings({ ...settings, whatsappMessage: event.target.value })
                }
              />
            </label>
            <label>
              <span>Instagram</span>
              <input
                className="admin-input"
                type="url"
                value={settings.instagramUrl ?? ""}
                onChange={(event) =>
                  setSettings({ ...settings, instagramUrl: event.target.value })
                }
              />
            </label>
          </div>
        </section>
        <aside className="admin-card">
          <h2>SEO básico</h2>
          <div className="admin-form">
            <label>
              <span>Título do site</span>
              <input
                className="admin-input"
                value={settings.seoTitle ?? ""}
                onChange={(event) =>
                  setSettings({ ...settings, seoTitle: event.target.value })
                }
                maxLength={70}
              />
            </label>
            <label>
              <span>Descrição</span>
              <textarea
                className="admin-input"
                value={settings.seoDescription ?? ""}
                onChange={(event) =>
                  setSettings({ ...settings, seoDescription: event.target.value })
                }
                maxLength={180}
              />
            </label>
            <button className="button" type="submit">
              Salvar
            </button>
            <p className="admin-muted" role="status">
              {status}
            </p>
          </div>
        </aside>
      </form>
      <form className="admin-card full admin-password-card" onSubmit={changePassword}>
        <div>
          <p className="eyebrow">Segurança</p>
          <h2>Senha definitiva</h2>
          <p className="admin-muted">
            {authSource === "clerk"
              ? "Você entrou pelo Clerk. Defina abaixo uma senha com pelo menos 12 caracteres para entrar com os e-mails autorizados no painel."
              : "Defina uma senha com pelo menos 12 caracteres. Ela será usada pelos dois e-mails autorizados e poderá ser trocada novamente aqui."}
          </p>
        </div>
        <div className="admin-password-fields">
          {authSource !== "clerk" && (
            <label>
              <span>Senha atual</span>
              <input
                className="admin-input"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
          )}
          <label>
            <span>Nova senha</span>
            <input
              className="admin-input"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <label>
            <span>Confirmar nova senha</span>
            <input
              className="admin-input"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          <button className="button" type="submit" disabled={changingPassword}>
            {changingPassword ? "Salvando…" : "Salvar nova senha"}
          </button>
          <p className="admin-muted" role="status" aria-live="polite">
            {passwordStatus}
          </p>
        </div>
      </form>
    </>
  );
}
