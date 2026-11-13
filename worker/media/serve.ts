import { envString, requireDb, requireOriginals } from "../utils/env";
import { AppError } from "../utils/errors";
import {
  IMAGE_PRESETS,
  isImagePreset,
  negotiateImageFormat,
  resolveGravity,
} from "./presets";

type ImageRow = {
  id: string;
  originalKey: string;
  focalX: number | null;
  focalY: number | null;
  status: "pending" | "ready" | "failed";
  deletedAt: string | null;
  albumStatus: "draft" | "published" | "archived";
  albumDeletedAt: string | null;
};

type SiteMediaRow = {
  id: string;
  originalKey: string;
  status: "pending" | "ready" | "failed";
};

async function readSiteMediaFallback(db: D1Database, imageId: string): Promise<SiteMediaRow | null> {
  try {
    return await db
      .prepare(
        `SELECT id, storage_key AS originalKey, status
         FROM site_media
         WHERE id = ? AND role = 'hero'`,
      )
      .bind(imageId)
      .first<SiteMediaRow>();
  } catch (error) {
    if (String(error).includes("no such table: site_media")) return null;
    throw error;
  }
}

export async function serveMedia(
  request: Request,
  env: Env,
  imageId: string,
  presetName: string,
  options: { audience?: "public" | "admin" } = {},
): Promise<Response> {
  if (!isImagePreset(presetName)) {
    throw new AppError(400, "INVALID_IMAGE_PRESET", "O formato de imagem solicitado é inválido.");
  }

  const db = requireDb(env);
  let image = await db
    .prepare(
      `SELECT
        image.id,
        image.original_key AS originalKey,
        image.focal_x AS focalX,
        image.focal_y AS focalY,
        image.status,
        image.deleted_at AS deletedAt,
        album.status AS albumStatus,
        album.deleted_at AS albumDeletedAt
       FROM images image
       INNER JOIN albums album ON album.id = image.album_id
       WHERE image.id = ?`,
    )
    .bind(imageId)
    .first<ImageRow>();

  if (!image) {
    const siteMedia = await readSiteMediaFallback(db, imageId);
    if (siteMedia) {
      image = {
        ...siteMedia,
        focalX: null,
        focalY: null,
        deletedAt: null,
        albumStatus: "published",
        albumDeletedAt: null,
      };
    }
  }

  const publicRequest = options.audience !== "admin";
  if (
    !image ||
    image.deletedAt ||
    image.albumDeletedAt ||
    image.status !== "ready" ||
    (publicRequest && image.albumStatus !== "published")
  ) {
    throw new AppError(404, "IMAGE_NOT_FOUND", "Imagem não encontrada.");
  }

  const cacheControl = publicRequest
    ? "public, max-age=300, s-maxage=300"
    : "private, no-store";

  let sourceBody: ReadableStream;
  let sourceContentType = "image/jpeg";
  if (image.originalKey.startsWith("static:")) {
    const pathname = image.originalKey.slice("static:".length);
    if (!pathname.startsWith("/") || pathname.startsWith("//")) {
      throw new AppError(404, "IMAGE_NOT_FOUND", "Imagem não encontrada.");
    }
    const asset = await env.ASSETS.fetch(new Request(new URL(pathname, request.url)));
    if (!asset.ok || !asset.body) {
      throw new AppError(404, "IMAGE_NOT_FOUND", "Imagem não encontrada.");
    }
    sourceBody = asset.body;
    sourceContentType = asset.headers.get("content-type") ?? sourceContentType;
  } else {
    const object = await requireOriginals(env).get(image.originalKey);
    if (!object) {
      throw new AppError(404, "IMAGE_NOT_FOUND", "Imagem não encontrada.");
    }
    sourceBody = object.body;
    sourceContentType = object.httpMetadata?.contentType ?? sourceContentType;
  }

  if (!env.IMAGES) {
    return new Response(sourceBody, {
      headers: {
        "Cache-Control": cacheControl,
        "Content-Type": sourceContentType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        ETag: `"${imageId}-${presetName}-v1"`,
      },
    });
  }

  const preset = IMAGE_PRESETS[presetName];
  const format = negotiateImageFormat(request.headers.get("accept"), envString(env, "HOSTINGER_PREFER_WEBP") === "true");
  const transform: ImageTransform = {
    width: preset.width,
    height: preset.height,
    fit: preset.fit,
    ...(preset.fit === "cover"
      ? { gravity: resolveGravity(image.focalX, image.focalY) }
      : {}),
  };

  let transformed: Response;
  try {
    const result = await env.IMAGES.input(sourceBody)
      .transform(transform)
      .output({ format, quality: preset.quality });
    transformed = result.response();
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "Falha na transformação de imagem",
        imageId,
        preset: presetName,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw new AppError(502, "IMAGE_TRANSFORM_FAILED", "A imagem não pôde ser processada.");
  }

  const headers = new Headers(transformed.headers);
  headers.set("Cache-Control", cacheControl);
  headers.set("Content-Type", format);
  headers.set("Content-Disposition", "inline");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("ETag", `"${imageId}-${presetName}-v1"`);
  headers.delete("Set-Cookie");
  return new Response(transformed.body, {
    status: transformed.status,
    statusText: transformed.statusText,
    headers,
  });
}
