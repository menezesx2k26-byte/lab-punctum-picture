"use client";

import {
  Camera,
  CircleAlert,
  Images,
  Inbox,
  LockKeyhole,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  clientGalleryLayoutLabel,
  type ClientGallery,
} from "../../../shared/client-galleries";
import {
  PRIVATE_GALLERY_STATUS,
  type ClientAccountSummary,
} from "./private-gallery-utils";

type Album = {
  id: string;
  title: string;
  status: string;
  readyImageCount: number;
  updatedAt: string;
};

type DashboardResponse = {
  albums?: Album[];
  inquiries?: { status: string }[];
  error?: { message?: string };
};

export function AdminDashboard() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [contacts, setContacts] = useState(0);
  const [privateGalleries, setPrivateGalleries] = useState<ClientGallery[]>([]);
  const [clients, setClients] = useState<ClientAccountSummary[]>([]);
  const [privateEnabled, setPrivateEnabled] = useState(false);
  const [clerkEnabled, setClerkEnabled] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/admin/api/albums").then(
        (response) => response.json() as Promise<DashboardResponse>,
      ),
      fetch("/admin/api/inquiries").then(
        (response) => response.json() as Promise<DashboardResponse>,
      ),
      fetch("/admin/api/albuns-privados")
        .then(async (response) =>
          response.ok
            ? ((await response.json()) as { galleries?: ClientGallery[] })
            : null,
        )
        .catch(() => null),
      fetch("/admin/api/clientes")
        .then(async (response) =>
          response.ok
            ? ((await response.json()) as {
                clients?: ClientAccountSummary[];
                clerkEnabled?: boolean;
                authMode?: string;
              })
            : null,
        )
        .catch(() => null),
    ])
      .then(([albumBody, inquiryBody, privateBody, clientBody]) => {
        if (albumBody.error) throw new Error(albumBody.error.message);
        setAlbums(albumBody.albums ?? []);
        setContacts(
          (inquiryBody.inquiries ?? []).filter(
            (inquiry: { status: string }) => inquiry.status === "new",
          ).length,
        );
        if (privateBody && clientBody) {
          setPrivateEnabled(true);
          setPrivateGalleries(privateBody.galleries ?? []);
          setClients(clientBody.clients ?? []);
          setClerkEnabled(
            Boolean(clientBody.clerkEnabled) || clientBody.authMode === "clerk",
          );
        }
      })
      .catch((reason) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar.",
        ),
      );
  }, []);

  const drafts = albums.filter((album) => album.status === "draft").length;
  const published = albums.filter((album) => album.status === "published").length;
  const publishedPrivate = privateGalleries.filter(
    (g) => g.status === "published",
  ).length;
  const draftPrivate = privateGalleries.filter(
    (g) => g.status === "draft",
  ).length;
  const activeClients = clients.filter((c) => !c.disabledAt);
  const unlinkedClients = clerkEnabled
    ? activeClients.filter((c) => !c.clerkUserId).length
    : 0;
  const clientNameMap = new Map(clients.map((c) => [c.id, c.name]));

  return (
    <>
      <div className="admin-topbar">
        <div>
          <p className="eyebrow">Olá, Maria Helena</p>
          <h1>Seu estúdio, em um só lugar.</h1>
        </div>
        <div className="admin-quick-actions">
          {privateEnabled && (
            <>
              <Link className="button" href="/admin/albuns-privados">
                <LockKeyhole size={16} aria-hidden="true" /> + Entregar álbum privado
              </Link>
              <Link className="button secondary" href="/admin/clientes">
                <Users size={16} aria-hidden="true" /> + Novo cliente
              </Link>
            </>
          )}
          <Link className="button ghost" href="/admin/ensaios">
            <Plus size={16} aria-hidden="true" /> Ensaio público
          </Link>
          <Link className="button ghost" href="/admin/studio">
            <Sparkles size={16} aria-hidden="true" /> Studio
          </Link>
        </div>
      </div>
      {error ? (
        <div className="admin-card full" role="alert">
          <CircleAlert size={20} />
          <p>{error}</p>
          <p className="admin-muted">
            No primeiro uso local, aplique as migrations do banco.
          </p>
        </div>
      ) : (
        <div className="admin-grid">
          <section className="admin-card">
            <Images size={19} aria-hidden="true" />
            <span className="admin-metric">{published}</span>
            <span className="admin-muted">
              {published === 1 ? "ensaio público no ar" : "ensaios públicos no ar"} ({drafts}{" "}
              {drafts === 1 ? "rascunho" : "rascunhos"})
            </span>
          </section>
          {privateEnabled && (
            <section className="admin-card">
              <Camera size={19} aria-hidden="true" />
              <span className="admin-metric">{publishedPrivate}</span>
              <span className="admin-muted">
                {publishedPrivate === 1 ? "álbum privado entregue" : "álbuns privados entregues"} (
                {draftPrivate} {draftPrivate === 1 ? "rascunho" : "rascunhos"})
              </span>
            </section>
          )}
          {privateEnabled && (
            <section className="admin-card">
              <Users size={19} aria-hidden="true" />
              <span className="admin-metric">{activeClients.length}</span>
              <span className="admin-muted">
                {unlinkedClients > 0
                  ? `${activeClients.length === 1 ? "cliente ativo" : "clientes ativos"} (${unlinkedClients} aguardando vínculo)`
                  : activeClients.length === 1
                    ? "cliente ativo com acesso pronto"
                    : "clientes ativos com acesso pronto"}
              </span>
            </section>
          )}
          <section className="admin-card">
            <Inbox size={19} aria-hidden="true" />
            <span className="admin-metric">{contacts}</span>
            <span className="admin-muted">
              {contacts === 1 ? "novo contato" : "novos contatos"}
            </span>
          </section>

          {privateEnabled && (
            <section className="admin-card wide">
              <div className="admin-filter-bar">
                <h2>Álbuns privados recentes</h2>
                <Link className="button small ghost" href="/admin/albuns-privados">
                  Ver todos ↗
                </Link>
              </div>
              <div className="admin-list">
                {privateGalleries.slice(0, 5).map((g) => {
                  const photoCount = g.readyImageCount ?? 0;
                  const favCount = g.favoriteCount ?? 0;
                  return (
                    <Link
                      key={g.id}
                      href={`/admin/albuns-privados/${g.id}`}
                      className="admin-list-item"
                    >
                      <div>
                        <strong>{g.title}</strong>
                        <div className="admin-muted">
                          {clientNameMap.get(g.clientId) ?? "Cliente"} ·{" "}
                          {clientGalleryLayoutLabel(g.layoutPreset)} · {photoCount}{" "}
                          {photoCount === 1 ? "foto" : "fotos"} · {favCount}{" "}
                          {favCount === 1 ? "favorita" : "favoritas"}
                        </div>
                      </div>
                      <span className={`status-pill ${g.status}`}>
                        {PRIVATE_GALLERY_STATUS[g.status]}
                      </span>
                    </Link>
                  );
                })}
                {!privateGalleries.length && (
                  <p className="admin-muted">
                    Nenhum álbum privado ainda. Clique em &ldquo;+ Entregar álbum
                    privado&rdquo; para começar.
                  </p>
                )}
              </div>
            </section>
          )}

          <section className="admin-card wide">
            <div className="admin-filter-bar">
              <h2>Ensaios públicos recentes</h2>
              <Link className="button small ghost" href="/admin/ensaios">
                Ver todos ↗
              </Link>
            </div>
            <div className="admin-list">
              {albums.slice(0, 5).map((album) => (
                <Link
                  key={album.id}
                  href={`/admin/ensaios/${album.id}`}
                  className="admin-list-item"
                >
                  <div>
                    <strong>{album.title}</strong>
                    <div className="admin-muted">
                      {album.readyImageCount ?? 0} fotos prontas
                    </div>
                  </div>
                  <span className={`status-pill ${album.status}`}>
                    {album.status === "published"
                      ? "Publicado"
                      : album.status === "archived"
                        ? "Arquivado"
                        : "Rascunho"}
                  </span>
                </Link>
              ))}
              {!albums.length && (
                <p className="admin-muted">Nenhum ensaio criado ainda.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
