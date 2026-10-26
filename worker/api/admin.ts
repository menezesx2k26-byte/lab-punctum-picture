import { z } from "zod";
import { siteConfigSchema } from "../../shared/config";
import { SITE_DEFAULTS, readPublishedArchive } from "../../shared/public-content";
import {
  DraftRevisionConflictError,
  InvalidStoredSiteConfigError,
  PublishedVersionNotFoundError,
  discardDraftSiteConfig,
  listPublishedSiteConfigVersions,
  publishDraftSiteConfig,
  publishVisualPresetPreservingDraft,
  readDraftSiteConfigState,
  restorePublishedSiteConfig,
  saveDraftSiteConfig,
} from "../../shared/site-config-storage";
import { writeAudit } from "../utils/audit";
import { AdminIdentity, assertAllowedOrigin, requireAdmin } from "../utils/auth";
import {
  envNumber,
  envString,
  requireDb,
  requireOriginals,
} from "../utils/env";
import { AppError } from "../utils/errors";
import { assertRateLimit } from "../utils/rate-limit";
import { canPublish, evaluatePublishChecklist } from "../utils/publish";
import { orderedPositions } from "../utils/reorder";
import { json } from "../utils/response";
import { slugify, uniqueAlbumSlug } from "../utils/slug";
import {
  albumCreateSchema,
  albumUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  coverSchema,
  imageUpdateSchema,
  parseJson,
  reorderSchema,
  settingsSchema,
  uploadCompleteSchema,
  uploadIntentSchema,
} from "../utils/validation";

type AdminAlbumRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  location: string | null;
  shootDate: string | null;
  status: "draft" | "published" | "archived";
  coverImageId: string | null;
  featured: number;
  seoTitle: string | null;
  seoDescription: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  imageCount?: number;
  readyImageCount?: number;
};

type UploadIntentRow = {
  id: string;
  albumId: string;
  imageId: string;
  objectKey: string;
  expectedMime: string;
  expectedSize: number;
  status: "pending" | "uploaded" | "completed" | "expired" | "failed";
  expiresAt: string;
};

const studioUpdateSchema = z
  .object({ siteConfig: siteConfigSchema, revision: z.number().int().min(1) })
  .strict();

const studioRevisionSchema = z
  .object({ revision: z.number().int().min(1) })
  .strict();

const studioRestoreSchema = studioRevisionSchema.extend({
  versionId: z.string().trim().min(1).max(128),
}).strict();

const visualReleaseSchema = z.object({
  presetId: z.literal("colagem-autoral"),
  expectedPublishedVersionId: z.string().trim().min(1).max(128),
  expectedDraftRevision: z.number().int().min(1),
}).strict();

function albumJson(row: AdminAlbumRow) {
  return {
    ...row,
    featured: Boolean(row.featured),
    coverUrl: row.coverImageId ? `/admin/media/${row.coverImageId}/card` : null,
  };
}

async function auditAndRespond(
  db: D1Database,
  identity: AdminIdentity,
  action: string,
  entityType: string,
  entityId: string | null,
  response: Response,
  data?: unknown,
): Promise<Response> {
  await writeAudit(db, identity.email, action, entityType, entityId, data);
  return response;
}

async function getAlbumOrThrow(db: D1Database, id: string): Promise<AdminAlbumRow> {
  const album = await db
    .prepare(
      `SELECT
        id, slug, title, subtitle, description, location,
        shoot_date AS shootDate, status, cover_image_id AS coverImageId,
        featured, seo_title AS seoTitle, seo_description AS seoDescription,
        published_at AS publishedAt, created_at AS createdAt, updated_at AS updatedAt
       FROM albums
       WHERE id = ? AND deleted_at IS NULL`,
    )
    .bind(id)
    .first<AdminAlbumRow>();
  if (!album) {
    throw new AppError(404, "ALBUM_NOT_FOUND", "Ensaio não encontrado.");
  }
  return album;
}

async function listAlbums(db: D1Database): Promise<Response> {
  const result = await db
    .prepare(
      `SELECT
        a.id, a.slug, a.title, a.subtitle, a.description, a.location,
        a.shoot_date AS shootDate, a.status, a.cover_image_id AS coverImageId,
        a.featured, a.seo_title AS seoTitle, a.seo_description AS seoDescription,
        a.published_at AS publishedAt, a.created_at AS createdAt, a.updated_at AS updatedAt,
        COUNT(i.id) AS imageCount,
        SUM(CASE WHEN i.status = 'ready' AND i.deleted_at IS NULL THEN 1 ELSE 0 END) AS readyImageCount
       FROM albums a
       LEFT JOIN images i ON i.album_id = a.id AND i.deleted_at IS NULL
       WHERE a.deleted_at IS NULL
       GROUP BY a.id
       ORDER BY a.updated_at DESC`,
    )
    .all<AdminAlbumRow>();
  return json({ albums: result.results.map(albumJson) }, { admin: true });
}

async function getAlbumDetail(db: D1Database, id: string): Promise<Response> {
  const album = await getAlbumOrThrow(db, id);
  const [images, categories] = await Promise.all([
    db
      .prepare(
        `SELECT
          id, status, alt_text AS altText, focal_x AS focalX, focal_y AS focalY,
          width, height, size_bytes AS sizeBytes, position, created_at AS createdAt
         FROM images
         WHERE album_id = ? AND deleted_at IS NULL
         ORDER BY position`,
      )
      .bind(id)
      .all<{
        id: string;
        status: "pending" | "ready" | "failed";
        altText: string | null;
        focalX: number | null;
        focalY: number | null;
        width: number | null;
        height: number | null;
        sizeBytes: number;
        position: number;
        createdAt: string;
      }>(),
    db
      .prepare(
        `SELECT c.id, c.name, c.slug
         FROM categories c
         INNER JOIN album_categories ac ON ac.category_id = c.id
         WHERE ac.album_id = ?
         ORDER BY c.sort_order, c.name`,
      )
      .bind(id)
      .all(),
  ]);

  return json(
    {
      album: {
        ...albumJson(album),
        categories: categories.results,
        images: images.results.map((image) => ({
          ...image,
          thumbUrl:
            image.status === "ready" ? `/admin/media/${image.id}/thumb` : null,
          cardUrl:
            image.status === "ready" ? `/admin/media/${image.id}/card` : null,
        })),
      },
    },
    { admin: true },
  );
}

async function createAlbum(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
): Promise<Response> {
  const input = await parseJson(request, albumCreateSchema);
  const id = crypto.randomUUID();
  const slug = await uniqueAlbumSlug(db, input.title);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO albums (
        id, slug, title, status, featured, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, 'draft', 0, 0, ?, ?)`,
    )
    .bind(id, slug, input.title, now, now)
    .run();
  return auditAndRespond(
    db,
    identity,
    "album.created",
    "album",
    id,
    json({ album: { id, slug, status: "draft" } }, { status: 201, admin: true }),
    { title: input.title },
  );
}

async function updateAlbum(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
  id: string,
): Promise<Response> {
  await getAlbumOrThrow(db, id);
  const input = await parseJson(request, albumUpdateSchema);
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  const columns = {
    title: "title",
    subtitle: "subtitle",
    description: "description",
    location: "location",
    shootDate: "shoot_date",
    featured: "featured",
    seoTitle: "seo_title",
    seoDescription: "seo_description",
  } as const;

  for (const [field, column] of Object.entries(columns)) {
    const value = input[field as keyof typeof columns];
    if (value !== undefined) {
      assignments.push(`${column} = ?`);
      values.push(typeof value === "boolean" ? Number(value) : value);
    }
  }

  const statements: D1PreparedStatement[] = [];
  if (assignments.length > 0) {
    assignments.push("updated_at = ?");
    values.push(new Date().toISOString());
    statements.push(
      db
        .prepare(`UPDATE albums SET ${assignments.join(", ")} WHERE id = ? AND deleted_at IS NULL`)
        .bind(...values, id),
    );
  }
  if (input.categoryIds) {
    statements.push(db.prepare("DELETE FROM album_categories WHERE album_id = ?").bind(id));
    for (const categoryId of input.categoryIds) {
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO album_categories (album_id, category_id) VALUES (?, ?)",
          )
          .bind(id, categoryId),
      );
    }
  }
  if (statements.length > 0) {
    await db.batch(statements);
  }

  const album = await getAlbumOrThrow(db, id);
  await writeAudit(db, identity.email, "album.updated", "album", id, input);
  return json({ album: albumJson(album) }, { admin: true });
}

async function deleteAlbum(
  db: D1Database,
  identity: AdminIdentity,
  id: string,
): Promise<Response> {
  await getAlbumOrThrow(db, id);
  const now = new Date().toISOString();
  await db
    .prepare("UPDATE albums SET deleted_at = ?, status = 'archived', updated_at = ? WHERE id = ?")
    .bind(now, now, id)
    .run();
  return auditAndRespond(
    db,
    identity,
    "album.deleted",
    "album",
    id,
    json({ ok: true }, { admin: true }),
  );
}

async function publishAlbum(
  db: D1Database,
  identity: AdminIdentity,
  id: string,
): Promise<Response> {
  const album = await getAlbumOrThrow(db, id);
  const readyImages = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM images WHERE album_id = ? AND status = 'ready' AND deleted_at IS NULL",
    )
    .bind(id)
    .first<{ count: number }>();
  const cover = album.coverImageId
    ? await db
        .prepare(
          `SELECT id FROM images
           WHERE id = ? AND album_id = ? AND status = 'ready' AND deleted_at IS NULL`,
        )
        .bind(album.coverImageId, id)
        .first<{ id: string }>()
    : null;
  const checks = evaluatePublishChecklist({
    title: album.title,
    slug: album.slug,
    coverBelongsToAlbum: Boolean(cover),
    readyImageCount: readyImages?.count ?? 0,
  });
  if (!canPublish(checks)) {
    throw new AppError(
      409,
      "PUBLISH_CHECKLIST_INCOMPLETE",
      "Complete o checklist de publicação antes de publicar.",
    );
  }
  const publishedAt = album.publishedAt ?? new Date().toISOString();
  await db
    .prepare(
      "UPDATE albums SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(publishedAt, new Date().toISOString(), id)
    .run();
  await writeAudit(db, identity.email, "album.published", "album", id, checks);
  return json({ albumId: id, status: "published", publishedAt, checks }, { admin: true });
}

async function archiveAlbum(
  db: D1Database,
  identity: AdminIdentity,
  id: string,
): Promise<Response> {
  await getAlbumOrThrow(db, id);
  await db
    .prepare("UPDATE albums SET status = 'archived', updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();
  return auditAndRespond(
    db,
    identity,
    "album.archived",
    "album",
    id,
    json({ albumId: id, status: "archived" }, { admin: true }),
  );
}

async function reorderImages(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
  albumId: string,
): Promise<Response> {
  await getAlbumOrThrow(db, albumId);
  const input = await parseJson(request, reorderSchema);
  const placeholders = input.imageIds.map(() => "?").join(",");
  const owned = await db
    .prepare(
      `SELECT id FROM images
       WHERE album_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
    )
    .bind(albumId, ...input.imageIds)
    .all<{ id: string }>();
  if (owned.results.length !== input.imageIds.length) {
    throw new AppError(400, "INVALID_IMAGE_ORDER", "A ordem contém imagens inválidas.");
  }
  await db.batch(
    orderedPositions(input.imageIds).map(({ imageId, position }) =>
      db
        .prepare("UPDATE images SET position = ?, updated_at = ? WHERE id = ? AND album_id = ?")
        .bind(position, new Date().toISOString(), imageId, albumId),
    ),
  );
  await writeAudit(db, identity.email, "album.images_reordered", "album", albumId, input);
  return json({ albumId, updated: input.imageIds.length }, { admin: true });
}

async function setCover(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
  albumId: string,
): Promise<Response> {
  await getAlbumOrThrow(db, albumId);
  const input = await parseJson(request, coverSchema);
  const image = await db
    .prepare(
      `SELECT id FROM images
       WHERE id = ? AND album_id = ? AND status = 'ready' AND deleted_at IS NULL`,
    )
    .bind(input.imageId, albumId)
    .first<{ id: string }>();
  if (!image) {
    throw new AppError(400, "INVALID_COVER_IMAGE", "Escolha uma foto pronta deste ensaio.");
  }
  await db
    .prepare("UPDATE albums SET cover_image_id = ?, updated_at = ? WHERE id = ?")
    .bind(input.imageId, new Date().toISOString(), albumId)
    .run();
  return auditAndRespond(
    db,
    identity,
    "album.cover_changed",
    "album",
    albumId,
    json({ albumId, coverImageId: input.imageId }, { admin: true }),
    input,
  );
}

async function updateImage(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
  imageId: string,
): Promise<Response> {
  const input = await parseJson(request, imageUpdateSchema);
  const image = await db
    .prepare("SELECT id, album_id AS albumId FROM images WHERE id = ? AND deleted_at IS NULL")
    .bind(imageId)
    .first<{ id: string; albumId: string }>();
  if (!image) {
    throw new AppError(404, "IMAGE_NOT_FOUND", "Imagem não encontrada.");
  }
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  if (input.altText !== undefined) {
    assignments.push("alt_text = ?");
    values.push(input.altText);
  }
  if (input.focalX !== undefined) {
    assignments.push("focal_x = ?");
    values.push(input.focalX);
  }
  if (input.focalY !== undefined) {
    assignments.push("focal_y = ?");
    values.push(input.focalY);
  }
  if (assignments.length > 0) {
    assignments.push("updated_at = ?");
    values.push(new Date().toISOString());
    await db
      .prepare(`UPDATE images SET ${assignments.join(", ")} WHERE id = ?`)
      .bind(...values, imageId)
      .run();
  }
  return auditAndRespond(
    db,
    identity,
    "image.updated",
    "image",
    imageId,
    json({ image: { id: imageId, ...input } }, { admin: true }),
    input,
  );
}

async function deleteImage(
  db: D1Database,
  identity: AdminIdentity,
  imageId: string,
): Promise<Response> {
  const image = await db
    .prepare("SELECT id, album_id AS albumId FROM images WHERE id = ? AND deleted_at IS NULL")
    .bind(imageId)
    .first<{ id: string; albumId: string }>();
  if (!image) {
    throw new AppError(404, "IMAGE_NOT_FOUND", "Imagem não encontrada.");
  }
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("UPDATE images SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, imageId),
    db
      .prepare(
        `UPDATE albums SET cover_image_id = NULL, updated_at = ?
         WHERE id = ? AND cover_image_id = ?`,
      )
      .bind(now, image.albumId, imageId),
  ]);
  return auditAndRespond(
    db,
    identity,
    "image.deleted",
    "image",
    imageId,
    json({ ok: true }, { admin: true }),
  );
}

function extensionForMime(mime: string): string {
  return mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
}

async function buildUploadUrl(
  request: Request,
  intentId: string,
): Promise<string> {
  return `${new URL(request.url).origin}/admin/api/uploads/${intentId}/direct`;
}

async function createUploadIntent(
  request: Request,
  env: Env,
  db: D1Database,
  identity: AdminIdentity,
): Promise<Response> {
  const input = await parseJson(request, uploadIntentSchema);
  const allowedMimes = (envString(env, "ALLOWED_MIME_TYPES") ?? "image/jpeg,image/png,image/webp")
    .split(",")
    .map((value) => value.trim());
  if (!allowedMimes.includes(input.mimeType)) {
    throw new AppError(400, "INVALID_MIME_TYPE", "Este tipo de arquivo não é aceito.", "mimeType");
  }
  if (input.sizeBytes > envNumber(env, "MAX_UPLOAD_BYTES", 26_214_400)) {
    throw new AppError(400, "FILE_TOO_LARGE", "O arquivo excede o tamanho permitido.", "sizeBytes");
  }
  const album = await getAlbumOrThrow(db, input.albumId);
  if (album.status === "archived") {
    throw new AppError(409, "ALBUM_DELETED", "Este ensaio está arquivado.");
  }
  const maxPosition = await db
    .prepare(
      "SELECT COALESCE(MAX(position), 0) AS position FROM images WHERE album_id = ? AND deleted_at IS NULL",
    )
    .bind(input.albumId)
    .first<{ position: number }>();

  const intentId = crypto.randomUUID();
  const imageId = crypto.randomUUID();
  const objectKey = `originals/${input.albumId}/${imageId}.${extensionForMime(input.mimeType)}`;
  const ttl = Math.min(3600, envNumber(env, "PRESIGNED_URL_TTL_SECONDS", 900));
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  const uploadUrl = await buildUploadUrl(
    request,
    intentId,
  );

  await db.batch([
    db
      .prepare(
        `INSERT INTO images (
          id, album_id, original_key, original_filename, mime_type, size_bytes,
          position, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .bind(
        imageId,
        input.albumId,
        objectKey,
        input.filename,
        input.mimeType,
        input.sizeBytes,
        (maxPosition?.position ?? 0) + 1000,
        now.toISOString(),
        now.toISOString(),
      ),
    db
      .prepare(
        `INSERT INTO upload_intents (
          id, album_id, image_id, object_key, original_filename, expected_mime,
          expected_size, status, created_by, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      )
      .bind(
        intentId,
        input.albumId,
        imageId,
        objectKey,
        input.filename,
        input.mimeType,
        input.sizeBytes,
        identity.email,
        expiresAt,
        now.toISOString(),
      ),
  ]);

  await writeAudit(db, identity.email, "upload.intent_created", "image", imageId, {
    intentId,
    albumId: input.albumId,
    sizeBytes: input.sizeBytes,
    mimeType: input.mimeType,
  });
  return json(
    {
      intentId,
      imageId,
      objectKey,
      uploadUrl,
      expiresAt,
      requiredHeaders: { "Content-Type": input.mimeType },
    },
    { status: 201, admin: true },
  );
}

async function getIntent(db: D1Database, intentId: string): Promise<UploadIntentRow> {
  const intent = await db
    .prepare(
      `SELECT
        id, album_id AS albumId, image_id AS imageId, object_key AS objectKey,
        expected_mime AS expectedMime, expected_size AS expectedSize, status, expires_at AS expiresAt
       FROM upload_intents WHERE id = ?`,
    )
    .bind(intentId)
    .first<UploadIntentRow>();
  if (!intent) {
    throw new AppError(404, "INTENT_NOT_FOUND", "Envio não encontrado.");
  }
  return intent;
}

async function directUpload(
  request: Request,
  env: Env,
  db: D1Database,
  intentId: string,
): Promise<Response> {
  const intent = await getIntent(db, intentId);
  if (intent.status !== "pending" || new Date(intent.expiresAt) <= new Date()) {
    throw new AppError(409, "INTENT_EXPIRED", "O prazo deste envio expirou.");
  }
  if (request.headers.get("content-type") !== intent.expectedMime) {
    throw new AppError(409, "OBJECT_TYPE_MISMATCH", "O tipo do arquivo não confere.");
  }
  const body = request.body;
  if (!body) {
    throw new AppError(400, "EMPTY_UPLOAD", "O arquivo está vazio.");
  }
  const originals = requireOriginals(env);
  await originals.put(intent.objectKey, body, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: intent.expectedMime },
  });
  await db
    .prepare("UPDATE upload_intents SET status = 'uploaded' WHERE id = ?")
    .bind(intentId)
    .run();
  return new Response(null, { status: 200, headers: { ETag: `"${intent.imageId}"` } });
}

async function completeUpload(
  request: Request,
  env: Env,
  db: D1Database,
  identity: AdminIdentity,
  intentId: string,
): Promise<Response> {
  const input = await parseJson(request, uploadCompleteSchema);
  const intent = await getIntent(db, intentId);
  if (intent.status === "completed") {
    throw new AppError(409, "INTENT_ALREADY_COMPLETED", "Este envio já foi finalizado.");
  }
  if (new Date(intent.expiresAt) <= new Date()) {
    throw new AppError(409, "INTENT_EXPIRED", "O prazo deste envio expirou.");
  }
  const originals = requireOriginals(env);
  const head = await originals.head(intent.objectKey);
  if (!head) {
    throw new AppError(409, "OBJECT_NOT_FOUND", "O arquivo enviado não foi encontrado.");
  }
  if (head.size !== intent.expectedSize) {
    throw new AppError(409, "OBJECT_SIZE_MISMATCH", "O tamanho do arquivo não confere.");
  }
  if (head.httpMetadata?.contentType && head.httpMetadata.contentType !== intent.expectedMime) {
    throw new AppError(409, "OBJECT_TYPE_MISMATCH", "O tipo do arquivo não confere.");
  }

  let width: number | null = null;
  let height: number | null = null;
  const object = await originals.get(intent.objectKey);
  if (object) {
    try {
      const info = await env.IMAGES.info(object.body);
      if ("width" in info) {
        width = info.width;
        height = info.height;
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "Falha ao ler dimensões da imagem",
          imageId: intent.imageId,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `UPDATE images
         SET status = 'ready', width = ?, height = ?, checksum = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(width, height, input.clientChecksum ?? head.etag, now, intent.imageId),
    db
      .prepare(
        `UPDATE upload_intents
         SET status = 'completed', completed_at = ?
         WHERE id = ?`,
      )
      .bind(now, intentId),
  ]);
  await writeAudit(db, identity.email, "upload.completed", "image", intent.imageId, {
    intentId,
    etag: input.etag ?? head.etag,
  });

  const position = await db
    .prepare("SELECT position FROM images WHERE id = ?")
    .bind(intent.imageId)
    .first<{ position: number }>();
  return json(
    {
      image: {
        id: intent.imageId,
        albumId: intent.albumId,
        status: "ready",
        position: position?.position ?? 0,
        altText: "",
        urls: {
          thumb: `/admin/media/${intent.imageId}/thumb`,
          card: `/admin/media/${intent.imageId}/card`,
        },
      },
    },
    { admin: true },
  );
}

async function listCategories(db: D1Database): Promise<Response> {
  const result = await db
    .prepare(
      `SELECT id, name, slug, description, sort_order AS sortOrder, is_visible AS isVisible
       FROM categories ORDER BY sort_order, name`,
    )
    .all<{ id: string; name: string; slug: string; description: string | null; sortOrder: number; isVisible: number }>();
  return json(
    {
      categories: result.results.map((category) => ({
        ...category,
        isVisible: Boolean(category.isVisible),
      })),
    },
    { admin: true },
  );
}

async function createCategory(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
): Promise<Response> {
  const input = await parseJson(request, categoryCreateSchema);
  const id = crypto.randomUUID();
  const baseSlug = slugify(input.name) || "categoria";
  const existing = await db
    .prepare("SELECT id FROM categories WHERE slug = ?")
    .bind(baseSlug)
    .first();
  const slug = existing ? `${baseSlug}-${id.slice(0, 6)}` : baseSlug;
  const maxOrder = await db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) AS sortOrder FROM categories")
    .first<{ sortOrder: number }>();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO categories (
        id, name, slug, description, sort_order, is_visible, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .bind(id, input.name, slug, input.description ?? null, (maxOrder?.sortOrder ?? 0) + 1000, now, now)
    .run();
  return auditAndRespond(
    db,
    identity,
    "category.created",
    "category",
    id,
    json({ category: { id, name: input.name, slug, description: input.description ?? null } }, { status: 201, admin: true }),
    input,
  );
}

async function updateCategory(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
  id: string,
): Promise<Response> {
  const input = await parseJson(request, categoryUpdateSchema);
  const existing = await db.prepare("SELECT id FROM categories WHERE id = ?").bind(id).first();
  if (!existing) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
  }
  const assignments: string[] = [];
  const values: Array<string | number | null> = [];
  if (input.name !== undefined) {
    assignments.push("name = ?");
    values.push(input.name);
  }
  if (input.description !== undefined) {
    assignments.push("description = ?");
    values.push(input.description);
  }
  if (input.isVisible !== undefined) {
    assignments.push("is_visible = ?");
    values.push(Number(input.isVisible));
  }
  if (assignments.length > 0) {
    assignments.push("updated_at = ?");
    values.push(new Date().toISOString());
    await db
      .prepare(`UPDATE categories SET ${assignments.join(", ")} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }
  return auditAndRespond(
    db,
    identity,
    "category.updated",
    "category",
    id,
    json({ category: { id, ...input } }, { admin: true }),
    input,
  );
}

async function deleteCategory(
  db: D1Database,
  identity: AdminIdentity,
  id: string,
): Promise<Response> {
  const result = await db.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
  if (!result.meta.changes) {
    throw new AppError(404, "CATEGORY_NOT_FOUND", "Categoria não encontrada.");
  }
  return auditAndRespond(
    db,
    identity,
    "category.deleted",
    "category",
    id,
    json({ ok: true }, { admin: true }),
  );
}

async function getSettings(db: D1Database): Promise<Response> {
  const settings = await db
    .prepare(
      `SELECT
        brand_name AS brandName, tagline, about_text AS aboutText,
        whatsapp_e164 AS whatsappE164, whatsapp_message AS whatsappMessage,
        instagram_url AS instagramUrl, contact_email AS contactEmail,
        seo_title AS seoTitle, seo_description AS seoDescription, updated_at AS updatedAt
       FROM site_settings WHERE id = 1`,
    )
    .first();
  return json({ settings: settings ?? SITE_DEFAULTS }, { admin: true });
}

async function getStudio(db: D1Database): Promise<Response> {
  const state = await readDraftSiteConfigState(db);
  const history = await listPublishedSiteConfigVersions(db);
  return json(
    {
      siteConfig: state.config,
      source: state.source,
      issues: state.issues,
      updatedAt: state.updatedAt,
      revision: state.revision,
      hasUnpublishedChanges: state.hasUnpublishedChanges,
      history,
    },
    { admin: true },
  );
}

async function getStudioPhotos(db: D1Database): Promise<Response> {
  const images = await readPublishedArchive(db);
  return json(
    {
      photos: images.slice(0, 240).map((image) => ({
        id: image.id,
        altText: image.altText,
        width: image.width,
        height: image.height,
        albumTitle: image.albumTitle,
        thumbUrl: image.thumbUrl,
      })),
    },
    { admin: true },
  );
}

async function studioMutationError(
  error: unknown,
  db: D1Database,
): Promise<Response> {
  if (error instanceof DraftRevisionConflictError) {
    const latest = await readDraftSiteConfigState(db);
    return json(
      {
        error: {
          code: "STUDIO_CHANGED_ELSEWHERE",
          message:
            "O Studio foi alterado em outra aba. Suas mudanças continuam neste dispositivo.",
        },
        latestRevision: latest.revision,
      },
      { status: 409, admin: true },
    );
  }
  if (error instanceof PublishedVersionNotFoundError) {
    return json(
      {
        error: {
          code: "STUDIO_VERSION_NOT_FOUND",
          message: error.message,
        },
      },
      { status: 404, admin: true },
    );
  }
  if (error instanceof InvalidStoredSiteConfigError) {
    return json(
      {
        error: {
          code: "STUDIO_VERSION_INVALID",
          message: error.message,
        },
      },
      { status: 409, admin: true },
    );
  }
  throw error;
}

async function updateStudio(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
): Promise<Response> {
  const input = await parseJson(request, studioUpdateSchema);
  try {
    await saveDraftSiteConfig(
      db,
      input.siteConfig,
      input.revision,
      identity.email,
    );
    return getStudio(db);
  } catch (error) {
    return studioMutationError(error, db);
  }
}

async function publishStudio(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
): Promise<Response> {
  const input = await parseJson(request, studioRevisionSchema);
  try {
    await publishDraftSiteConfig(db, input.revision, identity.email);
    return getStudio(db);
  } catch (error) {
    return studioMutationError(error, db);
  }
}

async function publishVisualOnly(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
): Promise<Response> {
  const input = await parseJson(request, visualReleaseSchema);
  try {
    const result = await publishVisualPresetPreservingDraft(
      db, input.presetId, input.expectedPublishedVersionId,
      input.expectedDraftRevision, identity.email,
    );
    return json({ ...result, presetId: input.presetId, draftPreserved: true }, { admin: true });
  } catch (error) {
    return studioMutationError(error, db);
  }
}

async function discardStudio(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
): Promise<Response> {
  const input = await parseJson(request, studioRevisionSchema);
  try {
    await discardDraftSiteConfig(db, input.revision, identity.email);
    return getStudio(db);
  } catch (error) {
    return studioMutationError(error, db);
  }
}

async function restoreStudioVersion(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
): Promise<Response> {
  const input = await parseJson(request, studioRestoreSchema);
  try {
    await restorePublishedSiteConfig(
      db,
      input.versionId,
      input.revision,
      identity.email,
    );
    return getStudio(db);
  } catch (error) {
    return studioMutationError(error, db);
  }
}

async function updateSettings(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
): Promise<Response> {
  const input = await parseJson(request, settingsSchema);
  const mapping = {
    brandName: "brand_name",
    tagline: "tagline",
    aboutText: "about_text",
    whatsappE164: "whatsapp_e164",
    whatsappMessage: "whatsapp_message",
    instagramUrl: "instagram_url",
    contactEmail: "contact_email",
    seoTitle: "seo_title",
    seoDescription: "seo_description",
  } as const;
  const assignments: string[] = [];
  const values: Array<string | null> = [];
  await db
    .prepare(
      `INSERT INTO site_settings (
        id, brand_name, tagline, about_text, whatsapp_e164, whatsapp_message,
        instagram_url, contact_email, seo_title, seo_description, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      SITE_DEFAULTS.brandName,
      SITE_DEFAULTS.tagline,
      SITE_DEFAULTS.aboutText,
      SITE_DEFAULTS.whatsappE164,
      SITE_DEFAULTS.whatsappMessage,
      SITE_DEFAULTS.instagramUrl,
      SITE_DEFAULTS.contactEmail,
      SITE_DEFAULTS.seoTitle,
      SITE_DEFAULTS.seoDescription,
      new Date().toISOString(),
    )
    .run();
  for (const [field, column] of Object.entries(mapping)) {
    const value = input[field as keyof typeof mapping];
    if (value !== undefined) {
      assignments.push(`${column} = ?`);
      values.push(value);
    }
  }
  if (assignments.length > 0) {
    assignments.push("updated_at = ?");
    values.push(new Date().toISOString());
    await db
      .prepare(`UPDATE site_settings SET ${assignments.join(", ")} WHERE id = 1`)
      .bind(...values)
      .run();
  }
  await writeAudit(db, identity.email, "settings.updated", "site_settings", "1", input);
  return getSettings(db);
}

async function listInquiries(db: D1Database): Promise<Response> {
  const result = await db
    .prepare(
      `SELECT
        id, name, email, phone, instagram, service, desired_date AS desiredDate,
        message, status, created_at AS createdAt
       FROM inquiries ORDER BY created_at DESC LIMIT 250`,
    )
    .all();
  return json({ inquiries: result.results }, { admin: true });
}

async function updateInquiry(
  request: Request,
  db: D1Database,
  identity: AdminIdentity,
  id: string,
): Promise<Response> {
  const input = await parseJson(
    request,
    z.object({ status: z.enum(["new", "read", "archived"]) }).strict(),
  );
  const result = await db
    .prepare("UPDATE inquiries SET status = ? WHERE id = ?")
    .bind(input.status, id)
    .run();
  if (!result.meta.changes) {
    throw new AppError(404, "INQUIRY_NOT_FOUND", "Contato não encontrado.");
  }
  return auditAndRespond(
    db,
    identity,
    "inquiry.updated",
    "inquiry",
    id,
    json({ inquiry: { id, status: input.status } }, { admin: true }),
    input,
  );
}

export async function handleAdminApi(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/admin/api/")) {
    return null;
  }

  const identity = await requireAdmin(request, env);
  assertAllowedOrigin(request, env);
  const db = requireDb(env);
  if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) {
    await assertRateLimit(
      request,
      db,
      "admin-mutation",
      envNumber(env, "ADMIN_RATE_LIMIT_MAX", 60),
      envNumber(env, "ADMIN_RATE_LIMIT_WINDOW_SECONDS", 60),
    );
  }

  if (request.method === "GET" && url.pathname === "/admin/api/me") {
    return json(identity, { admin: true });
  }
  if (url.pathname === "/admin/api/albums") {
    if (request.method === "GET") return listAlbums(db);
    if (request.method === "POST") return createAlbum(request, db, identity);
  }

  const albumMatch = url.pathname.match(/^\/admin\/api\/albums\/([^/]+)$/);
  if (albumMatch) {
    const id = decodeURIComponent(albumMatch[1]);
    if (request.method === "GET") return getAlbumDetail(db, id);
    if (request.method === "PATCH") return updateAlbum(request, db, identity, id);
    if (request.method === "DELETE") return deleteAlbum(db, identity, id);
  }

  const albumActionMatch = url.pathname.match(
    /^\/admin\/api\/albums\/([^/]+)\/(publish|archive|reorder|cover)$/,
  );
  if (request.method === "POST" && albumActionMatch) {
    const id = decodeURIComponent(albumActionMatch[1]);
    const action = albumActionMatch[2];
    if (action === "publish") return publishAlbum(db, identity, id);
    if (action === "archive") return archiveAlbum(db, identity, id);
    if (action === "reorder") return reorderImages(request, db, identity, id);
    if (action === "cover") return setCover(request, db, identity, id);
  }

  const imageMatch = url.pathname.match(/^\/admin\/api\/images\/([^/]+)$/);
  if (imageMatch) {
    const imageId = decodeURIComponent(imageMatch[1]);
    if (request.method === "PATCH") return updateImage(request, db, identity, imageId);
    if (request.method === "DELETE") return deleteImage(db, identity, imageId);
  }

  if (url.pathname === "/admin/api/uploads/intents" && request.method === "POST") {
    return createUploadIntent(request, env, db, identity);
  }
  const uploadMatch = url.pathname.match(
    /^\/admin\/api\/uploads\/([^/]+)\/(complete|direct)$/,
  );
  if (uploadMatch) {
    const intentId = decodeURIComponent(uploadMatch[1]);
    if (request.method === "POST" && uploadMatch[2] === "complete") {
      return completeUpload(request, env, db, identity, intentId);
    }
    if (request.method === "PUT" && uploadMatch[2] === "direct") {
      return directUpload(request, env, db, intentId);
    }
  }

  if (url.pathname === "/admin/api/categories") {
    if (request.method === "GET") return listCategories(db);
    if (request.method === "POST") return createCategory(request, db, identity);
  }
  const categoryMatch = url.pathname.match(/^\/admin\/api\/categories\/([^/]+)$/);
  if (categoryMatch) {
    const id = decodeURIComponent(categoryMatch[1]);
    if (request.method === "PATCH") return updateCategory(request, db, identity, id);
    if (request.method === "DELETE") return deleteCategory(db, identity, id);
  }

  if (url.pathname === "/admin/api/settings") {
    if (request.method === "GET") return getSettings(db);
    if (request.method === "PATCH") return updateSettings(request, db, identity);
  }
  if (url.pathname === "/admin/api/studio") {
    if (request.method === "GET") return getStudio(db);
    if (request.method === "PATCH") return updateStudio(request, db, identity);
  }
  if (url.pathname === "/admin/api/studio/photos" && request.method === "GET") {
    return getStudioPhotos(db);
  }
  if (url.pathname === "/admin/api/studio/publish" && request.method === "POST") {
    return publishStudio(request, db, identity);
  }
  if (url.pathname === "/admin/api/studio/publish-visual" && request.method === "POST") {
    return publishVisualOnly(request, db, identity);
  }
  if (url.pathname === "/admin/api/studio/discard" && request.method === "POST") {
    return discardStudio(request, db, identity);
  }
  if (url.pathname === "/admin/api/studio/restore" && request.method === "POST") {
    return restoreStudioVersion(request, db, identity);
  }
  if (url.pathname === "/admin/api/inquiries" && request.method === "GET") {
    return listInquiries(db);
  }
  const inquiryMatch = url.pathname.match(/^\/admin\/api\/inquiries\/([^/]+)$/);
  if (inquiryMatch && request.method === "PATCH") {
    return updateInquiry(request, db, identity, decodeURIComponent(inquiryMatch[1]));
  }

  throw new AppError(404, "NOT_FOUND", "Rota administrativa não encontrada.");
}
