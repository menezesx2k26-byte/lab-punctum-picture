"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { privateApi, errorMessage } from "../../albuns/components/api";
import {
  buildClientInviteMessage,
  type ClientAccountSummary,
} from "./private-gallery-utils";

type ClerkDirectoryMatch = {
  clerkUserId: string;
  email: string;
  fullName: string;
  createdAt: string | null;
};

type ClerkLookupState = {
  matches: ClerkDirectoryMatch[];
  checked: boolean;
  message?: string;
};

export function ClientAccountsManager() {
  const [clients, setClients] = useState<ClientAccountSummary[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<
    "all" | "ready" | "pending_link" | "disabled"
  >("all");
  const [credential, setCredential] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedWhatsappId, setCopiedWhatsappId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"password" | "access" | "clerk">(
    "password",
  );
  const [clerkEnabled, setClerkEnabled] = useState(false);
  const [clerkInputs, setClerkInputs] = useState<Record<string, string>>({});
  const [lookupStates, setLookupStates] = useState<
    Record<string, ClerkLookupState>
  >({});
  const [lookupBusyId, setLookupBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const data = await privateApi<{
      clients: ClientAccountSummary[];
      authMode: "password" | "access" | "clerk";
      clerkEnabled?: boolean;
    }>("/admin/api/clientes");
    setClients(data.clients);
    setAuthMode(data.authMode);
    setClerkEnabled(Boolean(data.clerkEnabled) || data.authMode === "clerk");
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch((e) => {
        setError(errorMessage(e));
        setLoading(false);
      });
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCredential(null);
    setCopied(false);
    setNotice("");
    try {
      const data = await privateApi<{
        temporaryPassword?: string;
        authMode?: "password" | "access" | "clerk";
      }>("/admin/api/clientes", "POST", { name, email });
      const effectiveMode = data.authMode ?? authMode;
      if (data.temporaryPassword) {
        setCredential({ email, password: data.temporaryPassword });
      } else if (effectiveMode === "clerk") {
        setNotice(
          "Cliente cadastrado. Clique em \"Buscar no Clerk\" ou \"Enviar convite por e-mail\" no cartão abaixo para liberar o acesso.",
        );
      } else {
        setNotice(
          "Cliente cadastrado. Envie o endereço /albuns/entrar para confirmar o e-mail pelo Cloudflare Access.",
        );
      }
      setName("");
      setEmail("");
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function manage(client: ClientAccountSummary, reset = false) {
    if (
      reset &&
      !window.confirm(
        authMode === "clerk"
          ? "Revogar todas as sessões deste cliente? Ele precisará entrar novamente com a conta Clerk vinculada."
          : authMode === "access"
            ? "Revogar todas as sessões deste cliente e confirmar novamente o acesso pelo e-mail?"
            : "Gerar uma nova senha temporária? Isso encerra todos os acessos atuais deste cliente.",
      )
    ) {
      return;
    }
    if (
      !reset &&
      !client.disabledAt &&
      !window.confirm("Desativar o cliente e encerrar todos os seus acessos?")
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setCredential(null);
    setCopied(false);
    setNotice("");
    try {
      if (reset) {
        const data = await privateApi<{ temporaryPassword?: string }>(
          "/admin/api/clientes/" + client.id + "/reset-password",
          "POST",
        );
        if (data.temporaryPassword) {
          setCredential({
            email: client.email,
            password: data.temporaryPassword,
          });
        } else if (authMode === "clerk") {
          setNotice(
            "Sessões revogadas. O próximo acesso exigirá nova validação no Clerk.",
          );
        } else {
          setNotice(
            "Sessões revogadas. O próximo acesso exigirá confirmação pelo e-mail.",
          );
        }
      } else {
        await privateApi("/admin/api/clientes/" + client.id, "PATCH", {
          disabled: !client.disabledAt,
        });
      }
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function lookupClerkByEmail(client: ClientAccountSummary) {
    setLookupBusyId(client.id);
    setError("");
    setNotice("");
    try {
      const data = await privateApi<{ matches: ClerkDirectoryMatch[] }>(
        `/admin/api/clientes/clerk-lookup?email=${encodeURIComponent(client.email)}`,
      );
      setLookupStates((current) => ({
        ...current,
        [client.id]: {
          matches: data.matches,
          checked: true,
          message:
            data.matches.length === 0
              ? `Nenhuma conta Clerk encontrada ainda com ${client.email}. Clique em "Enviar convite por e-mail".`
              : undefined,
        },
      }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLookupBusyId(null);
    }
  }

  async function inviteClerkClient(client: ClientAccountSummary) {
    setLookupBusyId(client.id);
    setError("");
    setNotice("");
    try {
      const data = await privateApi<
        | { status: "already_registered"; user: ClerkDirectoryMatch }
        | { status: "invited"; invitationId: string }
      >(`/admin/api/clientes/${client.id}/clerk-invite`, "POST");
      if (data.status === "already_registered") {
        setLookupStates((current) => ({
          ...current,
          [client.id]: {
            matches: [data.user],
            checked: true,
            message:
              "Esta pessoa já possui conta no Clerk. Confirme clicando em \"Vincular acesso agora\".",
          },
        }));
      } else {
        setLookupStates((current) => ({
          ...current,
          [client.id]: {
            matches: current[client.id]?.matches ?? [],
            checked: true,
            message:
              "Convite oficial enviado por e-mail! Assim que ela criar a conta em /albuns/entrar, clique em \"Buscar no Clerk\" para vincular.",
          },
        }));
        setNotice(`Convite enviado para ${client.email}.`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLookupBusyId(null);
    }
  }

  async function linkClerkWithId(
    client: ClientAccountSummary,
    clerkUserId: string,
  ) {
    const trimmed = clerkUserId.trim();
    if (!trimmed) {
      setError("Informe o identificador Clerk do cliente (ex.: user_...).");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await privateApi(
        "/admin/api/clientes/" + client.id + "/clerk-link",
        "PUT",
        { clerkUserId: trimmed },
      );
      setClerkInputs((current) => ({ ...current, [client.id]: "" }));
      setLookupStates((current) => {
        const next = { ...current };
        delete next[client.id];
        return next;
      });
      setNotice(`Acesso liberado para ${client.name}.`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function unlinkClerk(client: ClientAccountSummary) {
    if (
      !window.confirm(
        `Desvincular a conta Clerk de ${client.name} e revogar todas as sessões ativas?`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await privateApi(
        "/admin/api/clientes/" + client.id + "/clerk-link",
        "DELETE",
      );
      setNotice(`Vínculo removido de ${client.name}.`);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function copyWhatsappInvite(client: ClientAccountSummary) {
    const portalUrl = `${window.location.origin}/albuns/entrar`;
    const message = buildClientInviteMessage({
      clientName: client.name,
      portalUrl,
      email: client.email,
    });
    try {
      await navigator.clipboard.writeText(message);
      setCopiedWhatsappId(client.id);
      setNotice(`Mensagem de convite de ${client.name} copiada!`);
    } catch {
      setError("Não foi possível copiar automaticamente.");
    }
  }

  async function exportLgpd(client: ClientAccountSummary) {
    setError("");
    setNotice("");
    try {
      const data = await privateApi<unknown>(
        `/admin/api/clientes/${client.id}/lgpd-export`,
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `lgpd-${client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || client.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setNotice(`Dados LGPD de ${client.name} exportados.`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleClients = clients.filter((client) => {
    if (filter === "disabled" && !client.disabledAt) return false;
    if (filter === "ready") {
      if (client.disabledAt) return false;
      if (clerkEnabled && !client.clerkUserId) return false;
    }
    if (filter === "pending_link") {
      if (client.disabledAt || !clerkEnabled || Boolean(client.clerkUserId))
        return false;
    }
    if (!normalizedQuery) return true;
    return (
      client.name.toLowerCase().includes(normalizedQuery) ||
      client.email.toLowerCase().includes(normalizedQuery)
    );
  });

  const pendingLinkCount = clerkEnabled
    ? clients.filter((c) => !c.disabledAt && !c.clerkUserId).length
    : 0;

  return (
    <div className="pga">
      <div className="admin-topbar">
        <div>
          <p className="eyebrow">Entrega particular</p>
          <h1>Clientes e acessos</h1>
        </div>
        <Link className="button secondary" href="/admin/albuns-privados">
          Álbuns privados ↗
        </Link>
      </div>
      {error && (
        <p role="alert" className="pga-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="pga-note">
          {notice}
        </p>
      )}
      {authMode === "access" && (
        <p className="pga-note">
          O acesso é por código de e-mail, validado pelo Cloudflare Access. Não
          serão emitidas senhas temporárias.
        </p>
      )}
      {authMode === "clerk" && (
        <p className="pga-note">
          Cadastre o cliente, envie ou localize o login dele por e-mail abaixo e
          confirme o vínculo em um clique.
        </p>
      )}
      {credential && (
        <section
          className="admin-card pga-credential"
          aria-label="Credencial temporária"
        >
          <h2>Guarde esta senha agora</h2>
          <p>
            Ela aparece apenas nesta emissão. Compartilhe-a diretamente com o
            cliente por um canal de sua confiança.
          </p>
          <p>
            <strong>{credential.email}</strong>
          </p>
          <code>{credential.password}</code>
          <div className="pga-actions">
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(credential.password);
                  setCopied(true);
                } catch {
                  setError(
                    "Não foi possível copiar. Selecione a senha e copie manualmente.",
                  );
                }
              }}
            >
              {copied ? "Copiada" : "Copiar senha"}
            </button>
            <button
              className="button secondary"
              onClick={() => setCredential(null)}
            >
              Ocultar senha
            </button>
          </div>
          <p>
            Entrada do cliente:{" "}
            <a href="/albuns/entrar" target="_blank" rel="noreferrer">
              /albuns/entrar ↗
            </a>
            . No primeiro acesso, ele escolherá uma senha pessoal.
          </p>
        </section>
      )}
      <section className="admin-card">
        <h2>Novo cliente</h2>
        <form onSubmit={create} className="pga-form">
          <label>
            Nome
            <input
              className="admin-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              maxLength={120}
              required
              autoComplete="name"
            />
          </label>
          <label>
            E-mail
            <input
              className="admin-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={180}
              required
              autoComplete="email"
            />
          </label>
          <button className="button" disabled={busy} type="submit">
            {busy
              ? "Aguarde…"
              : authMode === "password"
                ? "Cadastrar e gerar senha"
                : "Cadastrar cliente"}
          </button>
        </form>
      </section>

      <div className="admin-filter-bar" style={{ marginTop: "0.75rem" }}>
        <div
          className="admin-filter-chips"
          role="group"
          aria-label="Filtrar clientes"
        >
          <button
            type="button"
            className={
              "admin-filter-chip" + (filter === "all" ? " is-active" : "")
            }
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            Todos ({clients.length})
          </button>
          <button
            type="button"
            className={
              "admin-filter-chip" + (filter === "ready" ? " is-active" : "")
            }
            aria-pressed={filter === "ready"}
            onClick={() => setFilter("ready")}
          >
            Acesso pronto
          </button>
          {clerkEnabled && (
            <button
              type="button"
              className={
                "admin-filter-chip" +
                (filter === "pending_link" ? " is-active" : "")
              }
              aria-pressed={filter === "pending_link"}
              onClick={() => setFilter("pending_link")}
            >
              Falta ativar login ({pendingLinkCount})
            </button>
          )}
          <button
            type="button"
            className={
              "admin-filter-chip" + (filter === "disabled" ? " is-active" : "")
            }
            aria-pressed={filter === "disabled"}
            onClick={() => setFilter("disabled")}
          >
            Desativados
          </button>
        </div>
        <input
          type="search"
          className="admin-input"
          style={{ maxWidth: "18rem" }}
          placeholder="Buscar por nome ou e-mail…"
          aria-label="Buscar cliente por nome ou e-mail"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <section className="pga-list" aria-label="Clientes cadastrados">
        {loading && <p role="status">Carregando clientes…</p>}
        {!loading && visibleClients.length === 0 && (
          <p className="pga-note">
            {clients.length === 0
              ? "Nenhum cliente cadastrado. Comece pelo formulário acima."
              : "Nenhum cliente encontrado neste filtro."}
          </p>
        )}
        {visibleClients.map((client) => {
          const lookup = lookupStates[client.id];
          const lookupBusy = lookupBusyId === client.id;
          return (
            <article className="admin-card pga-client" key={client.id}>
              <div className="pga-client-info">
                <h2>{client.name}</h2>
                <p>{client.email}</p>
                <div className="pga-badges">
                  {client.disabledAt ? (
                    <span className="pga-badge pga-badge--warn">Desativado</span>
                  ) : clerkEnabled ? (
                    client.clerkUserId ? (
                      <span className="pga-badge pga-badge--ok">
                        Acesso pronto
                      </span>
                    ) : (
                      <span className="pga-badge pga-badge--warn">
                        Falta ativar login
                      </span>
                    )
                  ) : (
                    <span className="pga-badge pga-badge--ok">
                      {authMode === "password" && client.mustChangePassword
                        ? "Aguardando troca de senha"
                        : "Acesso pronto"}
                    </span>
                  )}
                </div>

                {clerkEnabled && !client.disabledAt && (
                  <div className="pga-clerk-flow">
                    {client.clerkUserId ? (
                      <div className="pga-clerk-linked-row">
                        <span className="pga-caption-ok">
                          Conta Clerk conectada
                        </span>
                        <details className="pga-advanced-link">
                          <summary>Detalhes técnicos</summary>
                          <code>{client.clerkUserId}</code>
                        </details>
                        <button
                          type="button"
                          className="button secondary small"
                          disabled={busy}
                          onClick={() => void unlinkClerk(client)}
                        >
                          Desvincular Clerk
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="pga-actions">
                          <button
                            type="button"
                            className="button small"
                            disabled={busy || lookupBusy}
                            onClick={() => void lookupClerkByEmail(client)}
                          >
                            {lookupBusy ? "Buscando…" : "Buscar no Clerk"}
                          </button>
                          <button
                            type="button"
                            className="button secondary small"
                            disabled={busy || lookupBusy}
                            onClick={() => void inviteClerkClient(client)}
                          >
                            Enviar convite por e-mail
                          </button>
                        </div>

                        {lookup?.message && (
                          <p className="pga-lookup-note" role="status">
                            {lookup.message}
                          </p>
                        )}

                        {lookup && lookup.matches.length > 0 && (
                          <div className="pga-lookup-matches">
                            {lookup.matches.map((match) => (
                              <div
                                className="pga-lookup-match"
                                key={match.clerkUserId}
                              >
                                <div>
                                  <strong>{match.fullName}</strong>
                                  <span>{match.email}</span>
                                </div>
                                <button
                                  type="button"
                                  className="button small"
                                  disabled={busy}
                                  onClick={() =>
                                    void linkClerkWithId(
                                      client,
                                      match.clerkUserId,
                                    )
                                  }
                                >
                                  Vincular acesso agora
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        <details className="pga-advanced-link">
                          <summary>
                            Opção avançada: informar ID manualmente
                          </summary>
                          <div className="pga-clerk-link">
                            <label>
                              ID Clerk (user_…)
                              <input
                                className="admin-input"
                                value={clerkInputs[client.id] ?? ""}
                                onChange={(e) =>
                                  setClerkInputs((current) => ({
                                    ...current,
                                    [client.id]: e.target.value,
                                  }))
                                }
                                placeholder="user_..."
                                maxLength={200}
                                autoComplete="off"
                              />
                            </label>
                            <button
                              type="button"
                              className="button secondary small"
                              disabled={busy}
                              onClick={() =>
                                void linkClerkWithId(
                                  client,
                                  clerkInputs[client.id] ?? "",
                                )
                              }
                            >
                              Vincular Clerk
                            </button>
                          </div>
                        </details>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="pga-actions">
                {!client.disabledAt && (
                  <Link
                    className="button small"
                    href={`/admin/albuns-privados?clientId=${encodeURIComponent(client.id)}`}
                  >
                    + Criar álbum
                  </Link>
                )}
                {!client.disabledAt && (
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={busy}
                    onClick={() => void copyWhatsappInvite(client)}
                  >
                    {copiedWhatsappId === client.id
                      ? "Convite copiado"
                      : "Copiar convite WhatsApp"}
                  </button>
                )}
                <button
                  type="button"
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => void exportLgpd(client)}
                >
                  Exportar LGPD
                </button>
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => manage(client, true)}
                >
                  {authMode === "password" ? "Nova senha" : "Revogar sessões"}
                </button>
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => manage(client)}
                >
                  {client.disabledAt ? "Reativar" : "Desativar"}
                </button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
