import { z } from "zod";
import {
  clientAccountCreateSchema,
  clientGalleryCreateSchema,
  clientGalleryOwnerTransferSchema,
  clientGalleryUpdateSchema,
} from "../../shared/client-galleries";
import {
  getActiveClient,
  getGallery,
  getReadyGalleryImage,
  listAllGalleries,
  listGalleryImages,
  serializeGallery,
  serializeImage,
} from "../client/repository";
import { generateTemporaryPassword } from "../client/passwords";
import { hashClientPasswordWithProvider } from "../client/password-provider";
import { privateJson } from "../client/response";
import { assertAllowedOrigin, auditPrincipal, requireAdmin } from "../utils/auth";
import { prepareAudit, writeAudit } from "../utils/audit";
import { requireDb } from "../utils/env";
import { AppError } from "../utils/errors";
import { assertRateLimit } from "../utils/rate-limit";
import { parseJson } from "../client/validation";
import { clientAuthMode } from "../client/auth-mode";
import { loadSanitizedTitularExport } from "../client/lgpd";
import { providerImageInputLimit } from "../media/provider-input-limit";
import {
  isClerkAuthEnabled,
  linkClerkClientAccount,
  unlinkClerkClientAccount,
} from "../auth/clerk-auth";
import {
  inviteClerkClientByEmail,
  lookupClerkUsersByEmail,
  type ClerkAdminDirectoryClient,
} from "../auth/clerk-admin-directory";

const accountColumns =
  "c.id,c.name,c.email,c.disabled_at AS disabledAt,c.must_change_password AS mustChangePassword,c.created_at AS createdAt,l.clerk_user_id AS clerkUserId";
export async function handleClientAdminApi(
  request: Request,
  url: URL,
  env: Env,
  options: { clerkClient?: ClerkAdminDirectoryClient } = {},
): Promise<Response | null> {
  if (/^\/admin\/api\/albuns-privados(?:\/|$)/.test(url.pathname))
    return handleGalleryAdminApi(request, url, env);
  if (!/^\/admin\/api\/clientes(?:\/|$)/.test(url.pathname)) return null;
  const actor = await requireAdmin(request, env);
  assertAllowedOrigin(request, env);
  const db = requireDb(env);
  const mode = clientAuthMode(env);
  await assertRateLimit(request, db, "client-admin", 200, 60);
  if (url.pathname === "/admin/api/clientes/clerk-lookup") {
    if (request.method !== "GET")
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
    const email = url.searchParams.get("email") ?? "";
    const matches = await lookupClerkUsersByEmail(email, env, options);
    return privateJson({ matches });
  }
  const match = url.pathname.match(
    /^\/admin\/api\/clientes(?:\/([^/]+)(?:\/(reset-password|lgpd-export|clerk-link|clerk-invite))?)?$/,
  );
  if (!match) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  const id = match[1];
  if (!id && request.method === "GET") {
    return privateJson({
      authMode: mode,
      clerkEnabled: isClerkAuthEnabled(env),
      clients: (
        await db
          .prepare(
            `SELECT ${accountColumns}
             FROM client_accounts c
             LEFT JOIN clerk_pilot_identity_links l ON l.client_id = c.id
             ORDER BY c.created_at DESC, c.id`,
          )
          .all()
      ).results,
    });
  }
  if (!id && request.method === "POST") {
    const input = await parseJson(request, clientAccountCreateSchema);
    if (
      await db
        .prepare("SELECT id FROM client_accounts WHERE email=?")
        .bind(input.email)
        .first()
    )
      throw new AppError(
        409,
        "EMAIL_EXISTS",
        "Já existe um cliente com este e-mail.",
      );
    const temporaryPassword =
      mode === "password" ? generateTemporaryPassword() : undefined;
    const credential =
      temporaryPassword
        ? await hashClientPasswordWithProvider(temporaryPassword, env)
        : { passwordHash: "ACCESS_ONLY", passwordSalt: "ACCESS_ONLY", passwordIterations: 310_000 };
    const clientId = crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      await db.batch([
        db.prepare(
          `INSERT INTO client_accounts
        (id,name,email,password_hash,password_salt,password_iterations,must_change_password,session_version,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,1,?,?)`,
        )
        .bind(
          clientId,
          input.name,
          input.email,
          credential.passwordHash,
          credential.passwordSalt,
          credential.passwordIterations,
          mode === "password" ? 1 : 0,
          now,
          now,
        ),
        prepareAudit(db, auditPrincipal(actor), "client.created", "client_account", clientId),
      ]);
    } catch (e) {
      if (String(e).includes("UNIQUE constraint"))
        throw new AppError(
          409,
          "EMAIL_EXISTS",
          "Já existe um cliente com este e-mail.",
        );
      throw e;
    }
    return privateJson(
      {
        client: { id: clientId, name: input.name, email: input.email },
        ...(temporaryPassword ? { temporaryPassword } : {}),
        authMode: mode,
      },
      { status: 201 },
    );
  }
  const existing = await db
    .prepare("SELECT id, email, disabled_at AS disabledAt FROM client_accounts WHERE id=?")
    .bind(id ?? "")
    .first<{ id: string; email: string; disabledAt: string | null }>();
  if (!existing)
    throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  if (match[2] === "clerk-invite") {
    if (request.method !== "POST")
      throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
    if (existing.disabledAt !== null) {
      throw new AppError(
        404,
        "NOT_FOUND",
        "Cliente desativado não pode receber convites.",
      );
    }
    const result = await inviteClerkClientByEmail(
      existing.email,
      request,
      env,
      options,
    );
    if (result.status === "invited") {
      await writeAudit(
        db,
        auditPrincipal(actor),
        "client.clerk_invited",
        "client_account",
        id,
        { email: existing.email, invitationId: result.invitationId },
      );
    }
    return privateJson(result);
  }
  if (match[2] === "lgpd-export" && request.method === "GET") {
    const exported = await loadSanitizedTitularExport(db, id);
    await writeAudit(
      db,
      auditPrincipal(actor),
      "client.lgpd_exported",
      "client_account",
      id,
    );
    return privateJson(exported);
  }
  if (match[2] === "reset-password" && request.method === "POST") {
    if (mode === "access" || mode === "clerk") {
      await db.batch([
        db
          .prepare(
            `UPDATE client_accounts SET password_hash='ACCESS_ONLY',password_salt='ACCESS_ONLY',
          password_iterations=310000,must_change_password=0,
          session_version=session_version+1,updated_at=? WHERE id=?`,
          )
          .bind(new Date().toISOString(), id),
        prepareAudit(
          db,
          auditPrincipal(actor),
          mode === "clerk" ? "client.clerk_sessions_revoked" : "client.access_reauthorized",
          "client_account",
          id,
        ),
      ]);
      return privateJson({ ok: true, authMode: mode });
    }
    const temporaryPassword = generateTemporaryPassword();
    const c = await hashClientPasswordWithProvider(temporaryPassword, env);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        `UPDATE client_accounts SET password_hash=?,password_salt=?,password_iterations=?,
      must_change_password=1,session_version=session_version+1,updated_at=? WHERE id=?`,
      )
      .bind(
        c.passwordHash,
        c.passwordSalt,
        c.passwordIterations,
        now,
        id,
      ),
      prepareAudit(db, auditPrincipal(actor), "client.password_reset", "client_account", id),
    ]);
    return privateJson({ temporaryPassword });
  }
  if (match[2] === "clerk-link") {
    if (request.method === "GET") {
      const link = await db
        .prepare(
          `SELECT clerk_user_id AS clerkUserId, session_version_at_link AS sessionVersionAtLink, created_at AS createdAt
           FROM clerk_pilot_identity_links WHERE client_id=?`,
        )
        .bind(id)
        .first<{
          clerkUserId: string;
          sessionVersionAtLink: number;
          createdAt: string;
        }>();
      return privateJson({ linked: Boolean(link), link: link ?? null });
    }
    if (request.method === "PUT") {
      const input = await parseJson(
        request,
        z.object({ clerkUserId: z.string().trim().min(5).max(200) }).strict(),
      );
      const linked = await linkClerkClientAccount(db, id, input.clerkUserId, auditPrincipal(actor));
      return privateJson({ ok: true, ...linked });
    }
    if (request.method === "DELETE") {
      const result = await unlinkClerkClientAccount(db, id, auditPrincipal(actor));
      return privateJson({ ok: true, ...result });
    }
  }
  if (!match[2] && request.method === "PATCH") {
    const input = await parseJson(
      request,
      z.object({ disabled: z.boolean() }).strict(),
    );
    const now = new Date().toISOString();
    await db.batch([
      db
        .prepare(
          "UPDATE client_accounts SET disabled_at=?,session_version=session_version+1,updated_at=? WHERE id=?",
        )
        .bind(input.disabled ? now : null, now, id),
      prepareAudit(
        db,
        auditPrincipal(actor),
        input.disabled ? "client.disabled" : "client.enabled",
        "client_account",
        id,
      ),
    ]);
    return privateJson({ ok: true });
  }
  throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
}

async function handleGalleryAdminApi(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response> {
  const actor = await requireAdmin(request, env);
  assertAllowedOrigin(request, env);
  const db = requireDb(env);
  await assertRateLimit(request, db, "private-gallery-admin", 200, 60);
  const match = url.pathname.match(
    /^\/admin\/api\/albuns-privados(?:\/([^/]+)(?:\/(cover|order|publish|archive|unpublish|owner))?)?$/,
  );
  if (!match) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  const id = match[1];
  if (!id && request.method === "GET")
    return privateJson({
      galleries: (await listAllGalleries(db)).map(serializeGallery),
    });
  if (!id && request.method === "POST") {
    const input = await parseJson(request, clientGalleryCreateSchema);
    if (!(await getActiveClient(db, input.clientId)))
      throw new AppError(404, "NOT_FOUND", "Cliente indisponível.");
    const galleryId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        `INSERT INTO client_galleries (id,client_id,title,introduction,theme,layout_preset,allow_downloads,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'draft',?,?)`,
      )
      .bind(
        galleryId,
        input.clientId,
        input.title,
        input.introduction ?? "",
        input.theme,
        input.layoutPreset,
        input.allowDownloads ? 1 : 0,
        now,
        now,
      ),
      prepareAudit(db, auditPrincipal(actor), "client_gallery.created", "client_gallery", galleryId),
    ]);
    return privateJson(
      { gallery: serializeGallery((await getGallery(db, galleryId))!) },
      { status: 201 },
    );
  }
  const gallery = id ? await getGallery(db, id) : null;
  if (!gallery) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  const action = match[2];
  if (!action && request.method === "DELETE") {
    const now = new Date().toISOString();
    // Both statements execute in one transaction; audit only a live album
    // without an active upload. The tombstone cannot be republished.
    const eligible = "id=? AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM client_gallery_upload_intents i WHERE i.gallery_id=client_galleries.id AND i.status IN ('pending','uploaded') AND i.expires_at>?)";
    const result = await db.batch([
      db.prepare(
        `INSERT INTO audit_log (id,actor_email,action,entity_type,entity_id,data_json,created_at)
         SELECT ?,?,'client_gallery.deleted','client_gallery',id,NULL,?
         FROM client_galleries WHERE ${eligible}`,
      ).bind(crypto.randomUUID(), auditPrincipal(actor), now, id, now),
      db.prepare(
        `UPDATE client_galleries SET status='archived',deleted_at=?,updated_at=?
         WHERE ${eligible} RETURNING id`,
      ).bind(now, now, id, now),
    ]);
    if (!result[1]?.results?.length) {
      if (!(await getGallery(db, id)))
        throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
      throw new AppError(409, "CONFLICT", "Aguarde os envios de fotos ativos terminarem antes de excluir o álbum.");
    }
    return privateJson({ ok: true });
  }
  if (action === "cover" && request.method === "PUT") {
    const input = await parseJson(
      request,
      z.object({ imageId: z.uuid() }).strict(),
    );
    if (!(await getReadyGalleryImage(db, id, input.imageId)))
      throw new AppError(404, "NOT_FOUND", "Foto indisponível neste álbum.");
    const now = new Date().toISOString();
    await db.batch([
      db.prepare(
        "UPDATE client_galleries SET cover_image_id=?,updated_at=? WHERE id=? AND deleted_at IS NULL",
      )
      .bind(input.imageId, now, id),
      prepareAudit(db, auditPrincipal(actor), "client_gallery.cover_changed", "client_gallery", id),
    ]);
    return privateJson({ ok: true });
  }
  if (action === "order" && request.method === "PUT") {
    const input = await parseJson(
      request,
      z.object({ imageIds: z.array(z.uuid()).min(1).max(1000) }).strict(),
    );
    const images = await listGalleryImages(db, id);
    const unique = new Set(input.imageIds);
    if (
      unique.size !== input.imageIds.length ||
      images.length !== unique.size ||
      images.some((i) => !unique.has(i.id))
    )
      throw new AppError(
        400,
        "INVALID_ORDER",
        "Inclua cada foto do álbum uma única vez.",
      );
    const now = new Date().toISOString();
    await db.batch([
      ...input.imageIds.map((imageId, position) =>
        db
          .prepare(
            "UPDATE client_gallery_images SET position=?,updated_at=? WHERE id=? AND gallery_id=? AND EXISTS (SELECT 1 FROM client_galleries g WHERE g.id=client_gallery_images.gallery_id AND g.deleted_at IS NULL)",
          )
          .bind(position, now, imageId, id),
      ),
      prepareAudit(db, auditPrincipal(actor), "client_gallery.images_reordered", "client_gallery", id),
    ]);
    return privateJson({ ok: true });
  }
  if (action === "publish" && request.method === "POST") {
    const now = new Date().toISOString();
    const publishResults = await db.batch([
      db.prepare(
        `UPDATE client_galleries SET status='published',published_at=COALESCE(published_at,?),updated_at=?
      WHERE id=? AND deleted_at IS NULL AND length(trim(title))>0
      AND EXISTS(SELECT 1 FROM client_accounts c WHERE c.id=client_galleries.client_id AND c.disabled_at IS NULL)
      AND EXISTS(SELECT 1 FROM client_gallery_images i WHERE i.id=client_galleries.cover_image_id AND i.gallery_id=client_galleries.id AND i.status='ready' AND i.deleted_at IS NULL)
      RETURNING id`,
      )
      .bind(now, now, id),
      db.prepare(
        `INSERT INTO audit_log (id,actor_email,action,entity_type,entity_id,data_json,created_at)
         SELECT ?,?,'client_gallery.published','client_gallery',?,NULL,?
         FROM client_galleries WHERE id=? AND updated_at=? AND status='published'`,
      ).bind(crypto.randomUUID(), auditPrincipal(actor), id, now, id, now),
    ]);
    if (!publishResults[0]?.results?.length)
      throw new AppError(
        409,
        "PUBLISH_INCOMPLETE",
        "Defina título, cliente ativo e capa com uma foto pronta antes de publicar.",
      );
    return privateJson({ ok: true });
  }
  if (
    (action === "archive" || action === "unpublish") &&
    request.method === "POST"
  ) {
    await db.batch([
      db
        .prepare("UPDATE client_galleries SET status=?,updated_at=? WHERE id=? AND deleted_at IS NULL")
        .bind(
          action === "archive" ? "archived" : "draft",
          new Date().toISOString(),
          id,
        ),
      prepareAudit(
        db,
        auditPrincipal(actor),
        "client_gallery." + action,
        "client_gallery",
        id,
      ),
    ]);
    return privateJson({ ok: true });
  }
  if (!action && request.method === "GET") {
    const favorites = (
      await db
        .prepare(
          "SELECT image_id AS imageId,COUNT(*) AS count FROM client_gallery_favorites WHERE gallery_id=? GROUP BY image_id",
        )
        .bind(id)
        .all<{ imageId: string; count: number }>()
    ).results;
    const counts = new Map(favorites.map((f) => [f.imageId, f.count]));
    return privateJson({
      uploadMaxBytes: providerImageInputLimit(env),
      gallery: {
        ...serializeGallery(gallery),
        favoriteCount: favorites.reduce((sum, f) => sum + f.count, 0),
        images: (await listGalleryImages(db, id)).map((i) => ({
          ...serializeImage(i),
          favoriteCount: counts.get(i.id) ?? 0,
        })),
      },
    });
  }
  if (action === "owner" && request.method === "PUT") {
    const input = await parseJson(request, clientGalleryOwnerTransferSchema);
    if (input.clientId === gallery.clientId) {
      return privateJson({ gallery: serializeGallery(gallery) });
    }
    if (gallery.status !== "draft") {
      throw new AppError(
        409,
        "CONFLICT",
        "Volte o álbum para rascunho antes de transferir para outro cliente.",
      );
    }
    if (!(await getActiveClient(db, input.clientId))) {
      throw new AppError(404, "NOT_FOUND", "Cliente indisponível.");
    }
    const now = new Date().toISOString();
    await db.batch([
      db
        .prepare("UPDATE client_galleries SET client_id=?,updated_at=? WHERE id=? AND deleted_at IS NULL")
        .bind(input.clientId, now, id),
      prepareAudit(
        db,
        auditPrincipal(actor),
        "client_gallery.owner_changed",
        "client_gallery",
        id,
        { previousClientId: gallery.clientId, nextClientId: input.clientId },
      ),
    ]);
    const updatedGallery = await getGallery(db, id);
    if (!updatedGallery) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
    return privateJson({
      gallery: serializeGallery(updatedGallery),
    });
  }
  if (!action && request.method === "PATCH") {
    const input = await parseJson(request, clientGalleryUpdateSchema);
    const columns = {
      title: "title",
      introduction: "introduction",
      theme: "theme",
      layoutPreset: "layout_preset",
      allowDownloads: "allow_downloads",
    } as const;
    const assignments: string[] = [];
    const values: (string | number)[] = [];
    for (const field of Object.keys(columns) as (keyof typeof columns)[]) {
      const value = input[field];
      if (value === undefined) continue;
      assignments.push(columns[field] + "=?");
      values.push(typeof value === "boolean" ? Number(value) : value);
    }
    const now = new Date().toISOString();
    assignments.push("updated_at=?");
    values.push(now, id);
    await db.batch([
      db
        .prepare(
          "UPDATE client_galleries SET " + assignments.join(",") + " WHERE id=? AND deleted_at IS NULL",
        )
        .bind(...values),
      prepareAudit(
        db,
        auditPrincipal(actor),
        "client_gallery.updated",
        "client_gallery",
        id,
      ),
    ]);
    const updatedGallery = await getGallery(db, id);
    if (!updatedGallery) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
    return privateJson({
      gallery: serializeGallery(updatedGallery),
    });
  }
  throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
}
