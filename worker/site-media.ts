import { z } from "zod";
import { writeAudit } from "./utils/audit";
import { assertAllowedOrigin, auditPrincipal, requireAdmin } from "./utils/auth";
import { envNumber, requireDb, requireOriginals } from "./utils/env";
import { AppError } from "./utils/errors";
import { assertRateLimit } from "./utils/rate-limit";
import { json } from "./utils/response";

const MAX_UPLOAD_BYTES = 26_214_400;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const intentSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().positive(),
  role: z.literal("hero"),
}).strict();

const completionSchema = z.object({ etag: z.string().optional() }).strict();

type SiteMediaRow = {
  id: string;
  role: "hero";
  storageKey: string;
  originalFilename: string;
  mimeType: (typeof ALLOWED_MIME_TYPES)[number];
  sizeBytes: number;
  status: "pending" | "ready" | "failed";
  width: number | null;
  height: number | null;
};

function extensionForMime(mimeType: SiteMediaRow["mimeType"]): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

function serializeMedia(media: SiteMediaRow) {
  return {
    id: media.id,
    role: media.role,
    status: media.status,
    width: media.width,
    height: media.height,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    originalFilename: media.originalFilename,
    url: media.status === "ready" ? `/media/${media.id}/display` : null,
  };
}

async function readMedia(db: D1Database, id: string): Promise<SiteMediaRow> {
  const media = await db.prepare(
    `SELECT id, role, storage_key AS storageKey,
            original_filename AS originalFilename, mime_type AS mimeType,
            size_bytes AS sizeBytes, status, width, height
     FROM site_media WHERE id = ?`,
  ).bind(id).first<SiteMediaRow>();
  if (!media) {
    throw new AppError(404, "SITE_MEDIA_NOT_FOUND", "Imagem do Hero não encontrada.");
  }
  return media;
}

async function createIntent(
  request: Request,
  db: D1Database,
  identity: { email: string },
): Promise<Response> {
  const parsed = intentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError(400, "INVALID_SITE_MEDIA", "Envie uma foto JPG, PNG ou WebP válida.");
  }
  const input = parsed.data;
  if (input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new AppError(400, "FILE_TOO_LARGE", "A foto ultrapassa 25 MB.");
  }

  const id = crypto.randomUUID();
  const storageKey = `site-media/hero/${id}.${extensionForMime(input.mimeType)}`;
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO site_media (
      id, role, storage_key, original_filename, mime_type,
      size_bytes, status, created_at, updated_at
    ) VALUES (?, 'hero', ?, ?, ?, ?, 'pending', ?, ?)`,
  ).bind(
    id,
    storageKey,
    input.filename,
    input.mimeType,
    input.sizeBytes,
    now,
    now,
  ).run();

  await writeAudit(db, auditPrincipal(identity), "site_media.intent_created", "site_media", id, {
    role: "hero",
    sizeBytes: input.sizeBytes,
  });

  const media = await readMedia(db, id);
  return json({
    media: serializeMedia(media),
    uploadUrl: `${new URL(request.url).origin}/admin/api/site-media/${id}/direct`,
    requiredHeaders: { "Content-Type": input.mimeType },
  }, { status: 201, admin: true });
}

async function listHeroMedia(db: D1Database): Promise<Response> {
  const result = await db.prepare(
    `SELECT id, role, storage_key AS storageKey,
            original_filename AS originalFilename, mime_type AS mimeType,
            size_bytes AS sizeBytes, status, width, height
     FROM site_media
     WHERE role = 'hero'
     ORDER BY created_at DESC
     LIMIT 100`,
  ).all<SiteMediaRow>();
  return json({ media: result.results.map(serializeMedia) }, { admin: true });
}

async function directUpload(
  request: Request,
  env: Env,
  db: D1Database,
  id: string,
): Promise<Response> {
  const media = await readMedia(db, id);
  if (media.status !== "pending") {
    throw new AppError(409, "SITE_MEDIA_NOT_PENDING", "Este envio já foi finalizado.");
  }
  if (request.headers.get("content-type") !== media.mimeType) {
    throw new AppError(409, "OBJECT_TYPE_MISMATCH", "O tipo da foto não confere.");
  }
  if (!request.body) {
    throw new AppError(400, "EMPTY_UPLOAD", "A foto está vazia.");
  }
  await requireOriginals(env).put(media.storageKey, request.body, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: media.mimeType },
  });
  return new Response(null, { status: 200, headers: { ETag: `"${id}"` } });
}

export function isSuitableHeroSource(width: number, height: number): boolean {
  return width >= height
    ? width >= 1280 && height >= 720
    : width >= 720 && height >= 1280;
}

async function completeUpload(
  request: Request,
  env: Env,
  db: D1Database,
  identity: { email: string },
  id: string,
): Promise<Response> {
  const parsed = completionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    throw new AppError(400, "INVALID_COMPLETION", "Não foi possível finalizar esta foto.");
  }
  const media = await readMedia(db, id);
  if (media.status !== "pending") {
    throw new AppError(409, "SITE_MEDIA_NOT_PENDING", "Este envio já foi finalizado.");
  }

  const originals = requireOriginals(env);
  const head = await originals.head(media.storageKey);
  if (!head) throw new AppError(409, "OBJECT_NOT_FOUND", "A foto enviada não foi encontrada.");
  if (head.size !== media.sizeBytes) {
    throw new AppError(409, "OBJECT_SIZE_MISMATCH", "O tamanho da foto não confere.");
  }
  if (head.httpMetadata?.contentType && head.httpMetadata.contentType !== media.mimeType) {
    throw new AppError(409, "OBJECT_TYPE_MISMATCH", "O tipo da foto não confere.");
  }

  const object = await originals.get(media.storageKey);
  if (!object) throw new AppError(409, "OBJECT_NOT_FOUND", "A foto enviada não foi encontrada.");

  let width = 0;
  let height = 0;
  try {
    const info = await env.IMAGES.info(object.body);
    if (!("width" in info)) throw new Error("Metadados de imagem ausentes");
    width = info.width;
    height = info.height;
  } catch {
    await db.prepare("UPDATE site_media SET status = 'failed', updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), id).run();
    throw new AppError(400, "INVALID_IMAGE", "Não foi possível ler esta foto.");
  }

  if (!isSuitableHeroSource(width, height)) {
    await db.prepare(
      "UPDATE site_media SET status = 'failed', width = ?, height = ?, updated_at = ? WHERE id = ?",
    ).bind(width, height, new Date().toISOString(), id).run();
    throw new AppError(
      400,
      "HERO_IMAGE_TOO_SMALL",
      "Esta foto é pequena demais para o Hero. Use pelo menos 1280×720, ou 720×1280 em pé.",
    );
  }

  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE site_media SET status = 'ready', width = ?, height = ?, updated_at = ? WHERE id = ?",
  ).bind(width, height, now, id).run();
  await writeAudit(db, auditPrincipal(identity), "site_media.completed", "site_media", id, { width, height });
  return json({ media: serializeMedia(await readMedia(db, id)) }, { admin: true });
}

export async function handleSiteMediaApi(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  if (!url.pathname.startsWith("/admin/api/site-media")) return null;

  const identity = await requireAdmin(request, env);
  assertAllowedOrigin(request, env);
  const db = requireDb(env);
  if (["POST", "PUT", "DELETE"].includes(request.method)) {
    await assertRateLimit(
      request,
      db,
      "admin-mutation",
      envNumber(env, "ADMIN_RATE_LIMIT_MAX", 60),
      envNumber(env, "ADMIN_RATE_LIMIT_WINDOW_SECONDS", 60),
    );
  }

  if (url.pathname === "/admin/api/site-media/intents" && request.method === "POST") {
    return createIntent(request, db, identity);
  }
  if (url.pathname === "/admin/api/site-media" && request.method === "GET") {
    const role = url.searchParams.get("role");
    if (role && role !== "hero") {
      throw new AppError(400, "INVALID_SITE_MEDIA_ROLE", "Este tipo de mídia não existe.");
    }
    return listHeroMedia(db);
  }

  const match = url.pathname.match(/^\/admin\/api\/site-media\/([^/]+)\/(direct|complete)$/);
  if (match) {
    const id = decodeURIComponent(match[1]);
    if (match[2] === "direct" && request.method === "PUT") {
      return directUpload(request, env, db, id);
    }
    if (match[2] === "complete" && request.method === "POST") {
      return completeUpload(request, env, db, identity, id);
    }
  }

  throw new AppError(404, "NOT_FOUND", "Rota de mídia do site não encontrada.");
}
