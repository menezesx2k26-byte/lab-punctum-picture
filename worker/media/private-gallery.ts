import { requireClient } from "../client/auth";
import { CLIENT_MAX_UPLOAD_BYTES } from "../../shared/client-galleries";
import {
  getOwnedGallery,
  getGallery,
  getReadyGalleryImage,
} from "../client/repository";
import { privateResponse } from "../client/response";
import { hasMatchingOriginalDigest, privateOriginalSha256 } from "../client/gallery-integrity";
import { requireAdmin } from "../utils/auth";
import { requireDb, requireOriginals } from "../utils/env";
import { AppError } from "../utils/errors";
import { IMAGE_PRESETS, negotiateImageFormat } from "./presets";

export async function servePrivateGalleryImage(
  request: Request,
  env: Env,
  galleryId: string,
  imageId: string,
  preset: "thumb" | "gallery" | "download",
  audience: "client" | "admin",
  headOnly = false,
): Promise<Response> {
  const missing = () =>
    new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  const db = requireDb(env);
  let gallery;
  if (audience === "admin") {
    await requireAdmin(request, env);
    gallery = await getGallery(db, galleryId);
  } else {
    let identity;
    try {
      identity = await requireClient(request, env, db);
    } catch (e) {
      if (e instanceof AppError && (e.status === 401 || e.status === 403))
        throw missing();
      throw e;
    }
    gallery = await getOwnedGallery(db, identity.id, galleryId);
  }
  if (!gallery) throw missing();
  const image = await getReadyGalleryImage(db, galleryId, imageId);
  if (!image || !image.storageKey.startsWith(`client-galleries/${galleryId}/`))
    throw missing();
  if (preset === "download" && audience === "client" && !gallery.allowDownloads)
    throw new AppError(
      403,
      "DOWNLOAD_DISABLED",
      "O download deste álbum está desativado.",
    );
  // Historical ready rows can predate today's safe Images Binding limit.
  // Never feed their originals to Images even when a D1 row or its R2 object
  // is inconsistent. Downloads remain a separate authorized R2 operation.
  if (preset !== "download" && image.sizeBytes > CLIENT_MAX_UPLOAD_BYTES)
    throw new AppError(413, "IMAGE_INPUT_LIMIT", "A prévia desta foto ainda não está disponível.");
  const bucket = requireOriginals(env);
  if (headOnly) {
    if (preset !== "download" && !env.IMAGES)
      throw new AppError(
        503,
        "IMAGE_SERVICE_UNAVAILABLE",
        "A prévia desta foto está temporariamente indisponível.",
      );
    const head = await bucket.head(image.storageKey);
    if (!head) throw missing();
    if (preset !== "download" && head.size > CLIENT_MAX_UPLOAD_BYTES)
      throw new AppError(413, "IMAGE_INPUT_LIMIT", "A prévia desta foto ainda não está disponível.");
    // Even pre-migration ready rows without a D1 digest must never claim
    // success when R2 size or MIME contradicts their D1 original record.
    if (head.size !== image.sizeBytes ||
        head.httpMetadata?.contentType !== image.mimeType)
      throw new AppError(503, "ORIGINAL_INTEGRITY", "A integridade desta foto não pôde ser confirmada.");
    if (image.originalSha256) {
      if (head.customMetadata?.sha256 && head.customMetadata.sha256 !== image.originalSha256)
        throw new AppError(503, "ORIGINAL_INTEGRITY", "A integridade desta foto não pôde ser confirmada.");
      // R2 customMetadata is not an independent attestation: a replaced object
      // can carry the original digest unchanged. Verify bytes even on HEAD,
      // and never return an apparent success for a corrupt stored original.
      const original = await bucket.get(image.storageKey);
      if (!original || original.size !== image.sizeBytes ||
          original.httpMetadata?.contentType !== image.mimeType ||
          !hasMatchingOriginalDigest(image.originalSha256,
            await privateOriginalSha256(new Uint8Array(await original.arrayBuffer())),
            original.customMetadata?.sha256))
        throw new AppError(503, "ORIGINAL_INTEGRITY", "A integridade desta foto não pôde ser confirmada.");
    }
    const headers =
      preset === "download"
        ? {
            "Content-Type": image.mimeType,
            "Content-Disposition": `attachment; filename="foto-${image.id}.${image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg"}"`,
          }
        : {
            "Content-Type": negotiateImageFormat(request.headers.get("Accept")),
            "Content-Disposition": "inline",
          };
    return privateResponse(new Response(null, { status: 200, headers }));
  }
  const object = await bucket.get(image.storageKey);
  if (!object) throw missing();
  if (preset !== "download" && object.size > CLIENT_MAX_UPLOAD_BYTES)
    throw new AppError(413, "IMAGE_INPUT_LIMIT", "A prévia desta foto ainda não está disponível.");
  if (object.size !== image.sizeBytes ||
      object.httpMetadata?.contentType !== image.mimeType)
    throw new AppError(503, "ORIGINAL_INTEGRITY", "A integridade desta foto não pôde ser confirmada.");
  // Integrity is anchored in D1 when a verified private upload completed.
  // A changed R2 object must not be streamed as a valid original or derivative.
  // Historical rows without a digest remain readable, pending separate backfill.
  let original: ReadableStream<Uint8Array> = object.body;
  if (image.originalSha256) {
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength !== image.sizeBytes ||
        !hasMatchingOriginalDigest(image.originalSha256, await privateOriginalSha256(bytes),
          object.customMetadata?.sha256))
      throw new AppError(503, "ORIGINAL_INTEGRITY", "A integridade desta foto não pôde ser confirmada.");
    original = new Response(bytes).body!;
  }
  if (preset === "download")
    return privateResponse(
      new Response(original, {
        headers: {
          "Content-Type": image.mimeType,
          "Content-Disposition": `attachment; filename="foto-${image.id}.${image.mimeType === "image/png" ? "png" : image.mimeType === "image/webp" ? "webp" : "jpg"}"`,
        },
      }),
    );
  if (!env.IMAGES)
    throw new AppError(
      503,
      "IMAGE_SERVICE_UNAVAILABLE",
      "A prévia desta foto está temporariamente indisponível.",
    );
  const size = IMAGE_PRESETS[preset];
  const format = negotiateImageFormat(request.headers.get("Accept"));
  let transformed: Response;
  try {
    transformed = (
      await env.IMAGES.input(original)
        .transform({
          width: size.width,
          height: size.height,
          fit: "scale-down",
        })
        .output({ format, quality: size.quality })
    ).response();
  } catch {
    throw new AppError(
      502,
      "IMAGE_TRANSFORM_FAILED",
      "Não foi possível carregar esta foto.",
    );
  }
  return privateResponse(
    new Response(transformed.body, {
      status: transformed.status,
      headers: {
        "Content-Type": format,
        "Content-Disposition": "inline",
      },
    }),
  );
}
