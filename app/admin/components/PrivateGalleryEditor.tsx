/* eslint-disable @next/next/no-img-element -- Private media must use authenticated Worker endpoints, without the public image optimizer. */
"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Eye, UploadCloud } from "lucide-react";
import type {
  ClientGallery,
  ClientTheme,
  ClientGalleryLayout,
} from "../../../shared/client-galleries";
import {
  CLIENT_MAX_UPLOAD_BYTES,
  CLIENT_MAX_UPLOAD_LABEL,
  CLIENT_SPEC_MAX_UPLOAD_BYTES,
  CLIENT_SPEC_MAX_UPLOAD_LABEL,
  IMAGES_BINDING_MAX_INPUT_BYTES,
  IMAGES_BINDING_LIMIT_MESSAGE,
  CLIENT_MIME_TYPES,
  clientGalleryLayoutLabel,
} from "../../../shared/client-galleries";
import {
  privateApi,
  errorMessage,
  PrivateApiError,
} from "../../albuns/components/api";
import { privateImageUrl } from "../../albuns/components/routes";
import {
  buildClientInviteMessage,
  canSubmitPrivateGallery,
  runPrivateUploadQueue,
  isSuccessfulPrivateUpload,
  privateGalleryFileSha256,
  PRIVATE_GALLERY_STATUS,
  type ClientAccountSummary,
} from "./private-gallery-utils";
import { PrivateGalleryTemplatePicker } from "./PrivateGalleryTemplatePicker";
import { PrivateGalleryClientPreview } from "./PrivateGalleryClientPreview";

type ClerkDirectoryMatch = {
  clerkUserId: string;
  email: string;
  fullName: string;
};

export function PrivateGalleriesManager() {
  const [galleries, setGalleries] = useState<ClientGallery[]>([]);
  const [clients, setClients] = useState<ClientAccountSummary[]>([]);
  const [clerkEnabled, setClerkEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [layoutPreset, setLayoutPreset] =
    useState<ClientGalleryLayout>("classico");
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickEmail, setQuickEmail] = useState("");
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickNotice, setQuickNotice] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "published" | "draft" | "archived"
  >("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    const [g, c] = await Promise.all([
      privateApi<{ galleries: ClientGallery[] }>("/admin/api/albuns-privados"),
      privateApi<{
        clients: ClientAccountSummary[];
        clerkEnabled?: boolean;
        authMode?: string;
      }>("/admin/api/clientes"),
    ]);
    setGalleries(g.galleries);
    setClients(c.clients);
    setClerkEnabled(Boolean(c.clerkEnabled) || c.authMode === "clerk");
    setLoading(false);
    return c.clients;
  }, []);

  useEffect(() => {
    const requestedClientId =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("clientId") ?? ""
        : "";
    void Promise.resolve()
      .then(() => loadAll())
      .then((loadedClients) => {
        if (
          requestedClientId &&
          loadedClients.some(
            (c) => c.id === requestedClientId && !c.disabledAt,
          )
        ) {
          setClientId(requestedClientId);
        }
      })
      .catch((e) => {
        setError(errorMessage(e));
        setLoading(false);
      });
  }, [loadAll]);

  async function createQuickClient(event: FormEvent) {
    event.preventDefault();
    setQuickBusy(true);
    setError("");
    setQuickNotice("");
    try {
      const created = await privateApi<{
        client: ClientAccountSummary;
        temporaryPassword?: string;
        authMode?: string;
      }>("/admin/api/clientes", "POST", {
        name: quickName,
        email: quickEmail,
      });
      await loadAll();
      setClientId(created.client.id);
      setQuickName("");
      setQuickEmail("");
      setQuickClientOpen(false);
      setQuickNotice(
        created.temporaryPassword
          ? `Cliente "${created.client.name}" cadastrado com senha temporária: ${created.temporaryPassword}`
          : `Cliente "${created.client.name}" cadastrado e selecionado. Você poderá vincular ou convidar no próximo passo.`,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setQuickBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await privateApi<{ gallery: ClientGallery }>(
        "/admin/api/albuns-privados",
        "POST",
        { title, clientId, layoutPreset },
      );
      window.location.replace("/admin/albuns-privados/" + data.gallery.id);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGalleries = galleries.filter((g) => {
    if (statusFilter !== "all" && g.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    const owner = clientMap.get(g.clientId);
    return (
      g.title.toLowerCase().includes(normalizedQuery) ||
      (owner?.name.toLowerCase().includes(normalizedQuery) ?? false) ||
      (owner?.email.toLowerCase().includes(normalizedQuery) ?? false)
    );
  });

  return (
    <div className="pga">
      <div className="admin-topbar">
        <div>
          <p className="eyebrow">Coleções particulares</p>
          <h1>Álbuns privados</h1>
        </div>
        <Link href="/admin/clientes" className="button secondary">
          Clientes e acessos ↗
        </Link>
      </div>
      {error && (
        <p role="alert" className="pga-error">
          {error}
        </p>
      )}
      {quickNotice && (
        <p role="status" className="pga-note">
          {quickNotice}
        </p>
      )}
      <section className="admin-card">
        <h2>Novo álbum privado</h2>
        <form className="pga-form" onSubmit={create}>
          <label>
            Título
            <input
              className="admin-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Ensaio Clara — Outono"
              required
              maxLength={120}
            />
          </label>
          <label>
            Cliente dono
            <select
              className="admin-select"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              <option value="">Selecione um cliente</option>
              {clients
                .filter((c) => !c.disabledAt)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.email}
                  </option>
                ))}
            </select>
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <button
              type="button"
              className="button ghost small"
              onClick={() => setQuickClientOpen((open) => !open)}
            >
              {quickClientOpen
                ? "Fechar cadastro rápido"
                : "+ Cliente novo? Cadastrar rápido aqui"}
            </button>
          </div>
          {quickClientOpen && (
            <div className="pga-quick-client">
              <strong>Cadastro rápido de cliente</strong>
              <div className="pga-quick-client-fields">
                <label>
                  Nome completo
                  <input
                    className="admin-input"
                    value={quickName}
                    onChange={(e) => setQuickName(e.target.value)}
                    minLength={2}
                    maxLength={120}
                    placeholder="Nome do cliente"
                  />
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    className="admin-input"
                    value={quickEmail}
                    onChange={(e) => setQuickEmail(e.target.value)}
                    maxLength={180}
                    placeholder="cliente@exemplo.com"
                  />
                </label>
              </div>
              <div className="pga-actions">
                <button
                  type="button"
                  className="button secondary small"
                  disabled={
                    quickBusy ||
                    quickName.trim().length < 2 ||
                    !quickEmail.includes("@")
                  }
                  onClick={(e) => void createQuickClient(e)}
                >
                  {quickBusy ? "Salvando…" : "Salvar cliente e selecionar"}
                </button>
              </div>
            </div>
          )}
          <PrivateGalleryTemplatePicker
            value={layoutPreset}
            onChange={setLayoutPreset}
          />
          <button
            className="button"
            disabled={busy || !canSubmitPrivateGallery({ title, clientId })}
          >
            {busy ? "Criando…" : "Criar rascunho"}
          </button>
        </form>
      </section>

      <div className="admin-filter-bar" style={{ marginTop: "0.75rem" }}>
        <div
          className="admin-filter-chips"
          role="group"
          aria-label="Filtrar álbuns privados"
        >
          {(
            [
              ["all", "Todos"],
              ["published", "Publicados"],
              ["draft", "Rascunhos"],
              ["archived", "Arquivados"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={
                "admin-filter-chip" +
                (statusFilter === key ? " is-active" : "")
              }
              aria-pressed={statusFilter === key}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="admin-input"
          style={{ maxWidth: "18rem" }}
          placeholder="Buscar por álbum ou cliente…"
          aria-label="Buscar por álbum ou cliente"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && <p role="status">Carregando álbuns…</p>}
      {!loading && galleries.length === 0 && (
        <p className="pga-note">
          Os álbuns criados aqui ficam separados do portfólio público.
        </p>
      )}
      {!loading && galleries.length > 0 && visibleGalleries.length === 0 && (
        <p className="pga-note">Nenhum álbum encontrado neste filtro.</p>
      )}
      <div className="pga-list">
        {visibleGalleries.map((g) => {
          const owner = clientMap.get(g.clientId);
          return (
            <Link
              className="admin-card pga-client"
              key={g.id}
              href={"/admin/albuns-privados/" + g.id}
              prefetch={false}
            >
              <div>
                <div className="pga-badges">
                  <span className="pga-badge">
                    {PRIVATE_GALLERY_STATUS[g.status]}
                  </span>
                  <span className="pga-badge pga-badge--template">
                    {clientGalleryLayoutLabel(g.layoutPreset)}
                  </span>
                  {clerkEnabled && owner && !owner.disabledAt && (
                    <span
                      className={
                        "pga-badge " +
                        (owner.clerkUserId ? "pga-badge--ok" : "pga-badge--warn")
                      }
                    >
                      {owner.clerkUserId ? "Acesso pronto" : "Falta vincular Clerk"}
                    </span>
                  )}
                </div>
                <h2>{g.title}</h2>
                <p>
                  {owner ? `${owner.name} (${owner.email})` : "Cliente"} ·{" "}
                  {g.readyImageCount ?? 0} fotos · {g.favoriteCount ?? 0}{" "}
                  favoritas
                </p>
              </div>
              <span>Editar álbum ↗</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
type UploadIntent = {
  intentId: string;
  imageId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
};
type UploadJob = {
  id: string;
  file: File;
  status: "queued" | "uploading" | "completed" | "failed";
  progress: number;
  error?: string;
  intent?: UploadIntent;
  uploaded?: boolean;
  sha256?: string;
};
function directUpload(
  intent: UploadIntent,
  file: File,
  onProgress: (n: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", intent.uploadUrl);
    xhr.withCredentials = true;
    for (const [key, value] of Object.entries(intent.requiredHeaders))
      xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () =>
      reject(new Error("Conexão interrompida. Tente novamente."));
    xhr.ontimeout = () =>
      reject(new Error("O envio demorou demais. Tente novamente."));
    xhr.timeout = 180000;
    xhr.onload = () => {
      if (isSuccessfulPrivateUpload(xhr.status))
        resolve();
      else {
        let message = "Não foi possível enviar a foto.";
        try {
          message = JSON.parse(xhr.responseText).error?.message ?? message;
        } catch {}
        reject(new Error(message));
      }
    };
    xhr.send(file);
  });
}
export function PrivateGalleryEditor({ galleryId }: { galleryId: string }) {
  const base = "/admin/api/albuns-privados/" + encodeURIComponent(galleryId);
  const [gallery, setGallery] = useState<ClientGallery | null>(null);
  const [clients, setClients] = useState<ClientAccountSummary[]>([]);
  const [clerkEnabled, setClerkEnabled] = useState(false);
  const [nextClientId, setNextClientId] = useState("");
  const [clerkLookup, setClerkLookup] = useState<{
    matches: ClerkDirectoryMatch[];
    message?: string;
  } | null>(null);
  const [clerkBusy, setClerkBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copiedDelivery, setCopiedDelivery] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState({
    title: "",
    introduction: "",
    theme: "noir" as ClientTheme,
    layoutPreset: "classico" as ClientGalleryLayout,
    allowDownloads: false,
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [uploadMaxBytes, setUploadMaxBytes] = useState(CLIENT_MAX_UPLOAD_BYTES);
  const uploadMaxLabel =
    uploadMaxBytes === CLIENT_SPEC_MAX_UPLOAD_BYTES
      ? CLIENT_SPEC_MAX_UPLOAD_LABEL
      : CLIENT_MAX_UPLOAD_LABEL;

  const load = useCallback(
    async (resetForm = true) => {
      const [data, clientsRes] = await Promise.all([
        privateApi<{ gallery: ClientGallery; uploadMaxBytes?: number }>(base),
        privateApi<{
          clients: ClientAccountSummary[];
          clerkEnabled?: boolean;
          authMode?: string;
        }>("/admin/api/clientes").catch(() => null),
      ]);
      setUploadMaxBytes(
        data.uploadMaxBytes === CLIENT_SPEC_MAX_UPLOAD_BYTES
          ? CLIENT_SPEC_MAX_UPLOAD_BYTES
          : CLIENT_MAX_UPLOAD_BYTES,
      );
      setGallery(data.gallery);
      setNextClientId(data.gallery.clientId);
      if (clientsRes) {
        setClients(clientsRes.clients);
        setClerkEnabled(
          Boolean(clientsRes.clerkEnabled) || clientsRes.authMode === "clerk",
        );
      }
      if (resetForm) {
        setForm({
          title: data.gallery.title,
          introduction: data.gallery.introduction,
          theme: data.gallery.theme,
          layoutPreset: data.gallery.layoutPreset ?? "classico",
          allowDownloads: data.gallery.allowDownloads,
        });
      }
    },
    [base],
  );

  useEffect(() => {
    void Promise.resolve()
      .then(() => load())
      .catch((e) => setError(errorMessage(e)));
  }, [load]);

  async function action(path: string, method = "POST", body?: unknown) {
    setBusy(true);
    setError("");
    setNotice("");
    setCopiedDelivery(false);
    try {
      if (path === "/publish") await privateApi(base, "PATCH", form);
      await privateApi(base + path, method, body);
      await load(path === "" || path === "/publish");
      setNotice("Álbum atualizado.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    await action("", "PATCH", form);
  }

  async function transferOwner() {
    if (!gallery || !nextClientId || nextClientId === gallery.clientId) return;
    await action("/owner", "PUT", { clientId: nextClientId });
  }

  async function lookupOwnerClerk(owner: ClientAccountSummary) {
    setClerkBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await privateApi<{ matches: ClerkDirectoryMatch[] }>(
        `/admin/api/clientes/clerk-lookup?email=${encodeURIComponent(owner.email)}`,
      );
      setClerkLookup({
        matches: data.matches,
        message:
          data.matches.length === 0
            ? `Nenhuma conta Clerk encontrada ainda com ${owner.email}. Clique em "Enviar convite por e-mail".`
            : undefined,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setClerkBusy(false);
    }
  }

  async function inviteOwnerClerk(owner: ClientAccountSummary) {
    setClerkBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await privateApi<
        | { status: "already_registered"; user: ClerkDirectoryMatch }
        | { status: "invited"; invitationId: string }
      >(`/admin/api/clientes/${owner.id}/clerk-invite`, "POST");
      if (data.status === "already_registered") {
        setClerkLookup({
          matches: [data.user],
          message:
            "Esta pessoa já tem cadastro no Clerk. Clique em \"Vincular acesso agora\".",
        });
      } else {
        setClerkLookup({
          matches: clerkLookup?.matches ?? [],
          message:
            "Convite oficial enviado por e-mail! Assim que o cliente entrar em /albuns/entrar, clique em \"Buscar no Clerk\" para vincular.",
        });
        setNotice(`Convite enviado para ${owner.email}.`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setClerkBusy(false);
    }
  }

  async function linkOwnerClerk(owner: ClientAccountSummary, clerkUserId: string) {
    setClerkBusy(true);
    setError("");
    setNotice("");
    try {
      await privateApi(`/admin/api/clientes/${owner.id}/clerk-link`, "PUT", {
        clerkUserId,
      });
      setClerkLookup(null);
      setNotice(`Acesso liberado para ${owner.name}.`);
      await load(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setClerkBusy(false);
    }
  }

  async function copyDeliveryMessage(ownerName: string, ownerEmail?: string) {
    if (!gallery) return;
    const message = buildClientInviteMessage({
      clientName: ownerName,
      albumTitle: gallery.title,
      portalUrl: `${window.location.origin}/albuns/entrar`,
      email: ownerEmail,
    });
    try {
      await navigator.clipboard.writeText(message);
      setCopiedDelivery(true);
      setNotice("Mensagem pronta para WhatsApp copiada!");
    } catch {
      setError("Não foi possível copiar automaticamente.");
    }
  }

  async function sendJobs(queue: UploadJob[]) {
    setUploading(true);
    setError("");
    setNotice("");
    await runPrivateUploadQueue(queue, async (original) => {
      let job = { ...original };
      const patch = (values: Partial<UploadJob>) => {
        job = { ...job, ...values };
        setJobs((current) => current.map((j) => (j.id === job.id ? job : j)));
      };
      patch({ status: "uploading", error: undefined });
      try {
        if (!job.sha256)
          patch({ sha256: await privateGalleryFileSha256(job.file) });
        if (!job.intent)
          patch({
            intent: await privateApi<UploadIntent>(
              base + "/uploads/intents",
              "POST",
              {
                filename: job.file.name,
                mimeType: job.file.type,
                sizeBytes: job.file.size,
                sha256: job.sha256!,
                altText: job.file.name.replace(/\.[^.]+$/, ""),
              },
            ),
          });
        if (!job.uploaded) {
          await directUpload(job.intent!, job.file, (n) =>
            patch({ progress: n }),
          );
          patch({ uploaded: true });
        }
        await privateApi(
          base + "/uploads/" + job.intent!.intentId + "/complete",
          "POST",
        );
        patch({ status: "completed", progress: 100 });
      } catch (e) {
        patch({
          status: "failed",
          error: errorMessage(e),
          ...(e instanceof PrivateApiError && [400, 409].includes(e.status)
            ? { intent: undefined, uploaded: false, progress: 0 }
            : {}),
        });
      }
    });
    try {
      await load(false);
    } catch (e) {
      setError(errorMessage(e));
    }
    setUploading(false);
  }

  function choose(files: FileList | null) {
    if (!files || uploading) return;
    const queue: UploadJob[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "queued",
      progress: 0,
    }));
    const providerBlocked = queue.find(
      (j) =>
        uploadMaxBytes === IMAGES_BINDING_MAX_INPUT_BYTES &&
        j.file.size > IMAGES_BINDING_MAX_INPUT_BYTES &&
        j.file.size <= CLIENT_SPEC_MAX_UPLOAD_BYTES,
    );
    if (providerBlocked) {
      setError(
        IMAGES_BINDING_LIMIT_MESSAGE + " Arquivo: " + providerBlocked.file.name,
      );
      return;
    }
    const invalid = queue.find(
      (j) =>
        j.file.size > uploadMaxBytes ||
        !(CLIENT_MIME_TYPES as readonly string[]).includes(j.file.type),
    );
    if (invalid) {
      setError(
        "Escolha somente fotos JPG, PNG ou WebP de até " +
          uploadMaxLabel +
          ": " +
          invalid.file.name,
      );
      return;
    }
    setJobs((current) => [...current, ...queue]);
    void sendJobs(queue);
  }

  async function move(index: number, offset: number) {
    const images = [...(gallery?.images ?? [])];
    const target = index + offset;
    if (target < 0 || target >= images.length) return;
    [images[index], images[target]] = [images[target], images[index]];
    await action("/order", "PUT", { imageIds: images.map((i) => i.id) });
  }

  const blocked = busy || uploading;
  const images = gallery?.images ?? [];
  const readyImages = images.filter((i) => i.status === "ready");
  const owner = gallery
    ? clients.find((c) => c.id === gallery.clientId) ?? null
    : null;
  const activeOwner = Boolean(owner && !owner.disabledAt);
  const titleReady = form.title.trim().length > 0;
  const coverReady = Boolean(gallery?.coverImageId);

  return (
    <div className="pga">
      <div className="admin-topbar">
        <div>
          <Link href="/admin/albuns-privados">← Álbuns privados</Link>
          <h1>{gallery?.title ?? "Carregando álbum…"}</h1>
        </div>
        {gallery && (
          <div className="admin-quick-actions">
            <span className="pga-badge">
              {PRIVATE_GALLERY_STATUS[gallery.status]}
            </span>
            <button
              type="button"
              className="button secondary small"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye size={15} aria-hidden="true" /> Pré-visualizar como cliente
            </button>
          </div>
        )}
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
      {gallery && (
        <>
          <section className="admin-card pga-owner-card">
            <div className="pga-owner-head">
              <div>
                <h2>Cliente e acesso</h2>
                <p style={{ margin: "0.25rem 0 0" }}>
                  <strong>{owner?.name ?? "Cliente"}</strong>
                  {owner ? ` · ${owner.email}` : ""}
                </p>
                <div className="pga-badges" style={{ marginTop: "0.5rem" }}>
                  {owner?.disabledAt ? (
                    <span className="pga-badge pga-badge--warn">
                      Cliente desativado
                    </span>
                  ) : clerkEnabled && owner ? (
                    owner.clerkUserId ? (
                      <span className="pga-badge pga-badge--ok">
                        Acesso Clerk ativo
                      </span>
                    ) : (
                      <span className="pga-badge pga-badge--warn">
                        Falta ativar login no Clerk
                      </span>
                    )
                  ) : (
                    <span className="pga-badge pga-badge--ok">
                      Cliente ativo
                    </span>
                  )}
                </div>
              </div>
              <div className="pga-actions">
                {gallery.status === "published" && (
                  <button
                    type="button"
                    className="button small"
                    onClick={() =>
                      void copyDeliveryMessage(
                        owner?.name ?? "",
                        owner?.email,
                      )
                    }
                  >
                    {copiedDelivery
                      ? "Mensagem copiada!"
                      : "Copiar mensagem pronta (WhatsApp)"}
                  </button>
                )}
                <Link href="/admin/clientes" className="button ghost small">
                  Ver em Clientes ↗
                </Link>
              </div>
            </div>

            {clerkEnabled && owner && !owner.clerkUserId && !owner.disabledAt && (
              <div className="pga-clerk-flow">
                <div className="pga-actions">
                  <button
                    type="button"
                    className="button small"
                    disabled={blocked || clerkBusy}
                    onClick={() => void lookupOwnerClerk(owner)}
                  >
                    {clerkBusy ? "Buscando…" : "Buscar no Clerk"}
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    disabled={blocked || clerkBusy}
                    onClick={() => void inviteOwnerClerk(owner)}
                  >
                    Enviar convite por e-mail
                  </button>
                </div>
                {clerkLookup?.message && (
                  <p className="pga-lookup-note" role="status">
                    {clerkLookup.message}
                  </p>
                )}
                {clerkLookup && clerkLookup.matches.length > 0 && (
                  <div className="pga-lookup-matches">
                    {clerkLookup.matches.map((match) => (
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
                          disabled={blocked || clerkBusy}
                          onClick={() =>
                            void linkOwnerClerk(owner, match.clerkUserId)
                          }
                        >
                          Vincular acesso agora
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {gallery.status === "draft" ? (
              <div className="pga-owner-transfer">
                <label>
                  Trocar cliente dono deste rascunho
                  <select
                    className="admin-select"
                    value={nextClientId}
                    onChange={(e) => setNextClientId(e.target.value)}
                    disabled={blocked}
                  >
                    {clients
                      .filter((c) => !c.disabledAt || c.id === gallery.clientId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.email}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button secondary small"
                  disabled={
                    blocked || !nextClientId || nextClientId === gallery.clientId
                  }
                  onClick={() => void transferOwner()}
                >
                  Transferir álbum
                </button>
              </div>
            ) : (
              <p className="pga-note" style={{ margin: 0 }}>
                Este álbum está {PRIVATE_GALLERY_STATUS[gallery.status].toLowerCase()}.
                Para transferir para outro cliente, volte primeiro para rascunho.
              </p>
            )}
          </section>

          <section className="admin-card">
            <h2>A apresentação</h2>
            <form className="pga-form pga-editor-form" onSubmit={save}>
              <label>
                Título
                <input
                  className="admin-input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                  maxLength={120}
                />
              </label>
              <label>
                Tema
                <select
                  className="admin-select"
                  value={form.theme}
                  onChange={(e) =>
                    setForm({ ...form, theme: e.target.value as ClientTheme })
                  }
                >
                  <option value="noir">Noir · escuro</option>
                  <option value="ivory">Ivory · claro</option>
                  <option value="warm">Warm · acolhedor</option>
                </select>
              </label>
              <PrivateGalleryTemplatePicker
                value={form.layoutPreset}
                onChange={(layoutPreset) => setForm({ ...form, layoutPreset })}
              />
              <label className="pga-wide">
                Introdução
                <textarea
                  className="admin-input"
                  value={form.introduction}
                  onChange={(e) =>
                    setForm({ ...form, introduction: e.target.value })
                  }
                  rows={4}
                  maxLength={5000}
                />
              </label>
              <label className="pga-checkbox pga-wide">
                <input
                  type="checkbox"
                  checked={form.allowDownloads}
                  onChange={(e) =>
                    setForm({ ...form, allowDownloads: e.target.checked })
                  }
                />
                Permitir download das fotos originais
              </label>
              <div className="pga-actions pga-wide">
                <button className="button" disabled={blocked}>
                  Salvar alterações
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye size={15} aria-hidden="true" /> Pré-visualizar como cliente
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={
                    blocked || !gallery.coverImageId || readyImages.length === 0
                  }
                  onClick={() => action("/publish")}
                >
                  Publicar para o cliente
                </button>
                {gallery.status === "published" && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={blocked}
                    onClick={() => action("/unpublish")}
                  >
                    Despublicar
                  </button>
                )}
                {gallery.status !== "archived" && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={blocked}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Arquivar este álbum e revogar o acesso do cliente?",
                        )
                      ) {
                        void action("/archive");
                      }
                    }}
                  >
                    Arquivar
                  </button>
                )}
              </div>
            </form>
            <ul className="pga-checklist" aria-label="Checklist para publicação">
              <li data-done={titleReady ? "true" : "false"}>
                {titleReady ? "✓" : "○"} Título definido
              </li>
              <li data-done={activeOwner ? "true" : "false"}>
                {activeOwner ? "✓" : "○"} Cliente ativo
              </li>
              <li data-done={readyImages.length > 0 ? "true" : "false"}>
                {readyImages.length > 0 ? "✓" : "○"} Fotos prontas (
                {readyImages.length})
              </li>
              <li data-done={coverReady ? "true" : "false"}>
                {coverReady ? "✓" : "○"} Capa definida
              </li>
            </ul>
            <p className="pga-note">
              Favoritas do cliente: {gallery.favoriteCount ?? 0}. Arquivar ou
              despublicar interrompe o acesso imediatamente.
            </p>
          </section>

          <section className="admin-card pga-upload">
            <h2>As fotografias</h2>
            <div
              className={"pga-dropzone" + (dragging ? " is-dragging" : "")}
              onDragOver={(e) => {
                e.preventDefault();
                if (!blocked) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!blocked) choose(e.dataTransfer.files);
              }}
            >
              <UploadCloud size={26} aria-hidden="true" />
              <p style={{ margin: 0 }}>
                Arraste suas fotografias para cá ou selecione no aparelho
              </p>
              <label className="pga-file-label">
                Adicionar fotos
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  disabled={blocked}
                  onChange={(e) => {
                    choose(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="pga-note">
              JPG, PNG ou WebP · até {uploadMaxLabel} por foto · até 3 envios
              simultâneos.
            </p>
            {uploadMaxBytes === IMAGES_BINDING_MAX_INPUT_BYTES && (
              <p className="pga-note" role="note">
                {IMAGES_BINDING_LIMIT_MESSAGE}
              </p>
            )}
            {jobs.length > 0 && (
              <ul className="pga-queue" aria-label="Progresso dos envios">
                {jobs.map((j) => (
                  <li key={j.id}>
                    <span>{j.file.name}</span>
                    <progress
                      value={j.progress}
                      max={100}
                      aria-label={"Envio de " + j.file.name}
                    />
                    <span>
                      {j.status === "completed"
                        ? "Concluído"
                        : j.status === "failed"
                          ? j.error
                          : j.progress === 100
                            ? "Conferindo foto…"
                            : j.progress + "%"}
                    </span>
                    {j.status === "failed" && (
                      <button
                        className="button secondary"
                        disabled={blocked}
                        onClick={() => sendJobs([j])}
                      >
                        Tentar novamente
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pga-photo-grid" aria-label="Fotos do álbum">
            {images.map((image, index) => (
              <article className="admin-card pga-photo" key={image.id}>
                {image.status === "ready" ? (
                  <img
                    src={privateImageUrl(galleryId, image.id, "thumb", true)}
                    alt={image.altText || image.originalFilename}
                    loading="lazy"
                  />
                ) : (
                  <div className="pga-placeholder">
                    {image.status === "pending"
                      ? "Envio pendente"
                      : "Envio não concluído"}
                  </div>
                )}
                <p>{image.originalFilename}</p>
                <span className="pga-badge">
                  {gallery.coverImageId === image.id ? "Capa · " : ""}
                  {image.favoriteCount ?? 0} favoritas
                </span>
                <div className="pga-actions">
                  <button
                    className="button secondary"
                    disabled={
                      blocked ||
                      image.status !== "ready" ||
                      gallery.coverImageId === image.id
                    }
                    onClick={() =>
                      action("/cover", "PUT", { imageId: image.id })
                    }
                  >
                    Usar na capa
                  </button>
                  <button
                    className="button secondary"
                    aria-label={
                      "Mover " + image.originalFilename + " para cima"
                    }
                    disabled={blocked || index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="button secondary"
                    aria-label={
                      "Mover " + image.originalFilename + " para baixo"
                    }
                    disabled={blocked || index === images.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                </div>
              </article>
            ))}
          </section>

          <PrivateGalleryClientPreview
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            galleryId={gallery.id}
            galleryTitle={form.title}
            introduction={form.introduction}
            theme={form.theme}
            layoutPreset={form.layoutPreset}
            allowDownloads={form.allowDownloads}
            images={images}
            clientName={owner?.name ?? ""}
            onChangeTheme={(theme) => setForm((cur) => ({ ...cur, theme }))}
            onChangeLayout={(layoutPreset) =>
              setForm((cur) => ({ ...cur, layoutPreset }))
            }
          />
        </>
      )}
    </div>
  );
}
