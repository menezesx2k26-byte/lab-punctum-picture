import {
  clientImageIntentSchema,
  CLIENT_MAX_UPLOAD_BYTES,
  IMAGES_BINDING_MAX_INPUT_BYTES,
  IMAGES_BINDING_LIMIT_MESSAGE,
  type ClientImageIntentInput,
} from "../../shared/client-galleries";
import { validateGalleryRaster, isGalleryRasterTransientError } from "../client/gallery-raster.mjs";
import {
  hasMatchingOriginalDigest,
  hasMatchingR2Sha256,
  privateOriginalSha256,
  privateOriginalSha256Bytes,
} from "../client/gallery-integrity";
import { privateGalleryStorageKey } from "../client/gallery-storage-key";
import {
  getGallery,
  serializeImage,
  getReadyGalleryImage,
} from "../client/repository";
import { base64Url } from "../client/passwords";
import { requireClientSessionSecret } from "../client/secret";
import { privateJson } from "../client/response";
import { assertAllowedOrigin, auditPrincipal, requireAdmin } from "../utils/auth";
import { requireDb, requireOriginals } from "../utils/env";
import { AppError } from "../utils/errors";
import { parseJson } from "../client/validation";
import { writeAudit } from "../utils/audit";
import { assertRateLimit } from "../utils/rate-limit";

type IntentRow = {
  id: string;
  galleryId: string;
  imageId: string;
  expectedMime: string;
  expectedSize: number;
  storageKey: string;
  status: string;
  expiresAt: string;
  sha256: string | null;
  uploadTokenVersion: number;
};
async function signature(intent: IntentRow, env: Env) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requireClientSessionSecret(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const payload = intent.uploadTokenVersion === 3
    ? [
        "private-gallery-direct-v3",
        intent.id,
        intent.galleryId,
        intent.imageId,
        intent.storageKey,
        intent.expectedMime,
        intent.expectedSize,
        intent.expiresAt,
        intent.sha256,
      ]
    : [
        // Preserve the exact v2 token payload for intents already issued.
        "private-gallery-direct-v2",
        intent.id,
        intent.galleryId,
        intent.imageId,
        intent.storageKey,
        intent.expectedMime,
        intent.expectedSize,
        intent.expiresAt,
      ];
  return base64Url(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(JSON.stringify(payload)),
      ),
    ),
  );
}
function matchesMime(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg")
    return (
      bytes.length >= 4 &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255
    );
  if (mime === "image/png")
    return (
      bytes.length >= 24 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
    );
  return (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}
async function cancelInvalidUpload(reader: ReadableStreamDefaultReader<Uint8Array>) {
  // Cancellation is best effort: a disconnected/failed upstream may reject
  // cancel() as well. Never replace our explicit fail-closed 400 with an
  // unclassified error or make a pending signed intent non-retryable.
  try { await reader.cancel(); } catch { /* transport already interrupted */ }
}
async function readBounded(request: Request, size: number) {
  if (!request.body || request.headers.get("content-length") !== String(size))
    throw new AppError(400, "UPLOAD_SIZE", "O tamanho da foto não confere.");
  let total = 0;
  let emptyChunks = 0;
  let nonemptyChunks = 0;
  let bytes: Uint8Array | null = null;
  const reader = request.body.getReader();
  while (true) {
    const item = await reader.read().catch(() => {
      // Transport interruption is a bad incoming body, not an internal 500.
      // No R2 write or D1 state change has happened yet; the signed intent
      // remains available for an authenticated retry until expiry.
      throw new AppError(400, "UPLOAD_STREAM", "Fluxo de envio interrompido.");
    });
    if (item.done) break;
    // Empty chunks make no progress toward the signed byte count. A hostile
    // stream could otherwise consume CPU indefinitely before any R2 write.
    if (item.value.byteLength === 0) {
      if (++emptyChunks > 64) {
        await cancelInvalidUpload(reader);
        throw new AppError(400, "UPLOAD_STREAM", "Fluxo de envio inválido.");
      }
      continue;
    }
    // Extremely fragmented nonempty streams can consume CPU far beyond the
    // signed upload size (one byte per read). Preserve the pending intent for
    // a normal retry, without writing any partial object to private R2.
    if (++nonemptyChunks > 8192) {
      await cancelInvalidUpload(reader);
      throw new AppError(400, "UPLOAD_STREAM", "Fluxo de envio inválido.");
    }
    if (item.value.byteLength > size - total) {
      await cancelInvalidUpload(reader);
      throw new AppError(400, "UPLOAD_SIZE", "O tamanho da foto não confere.");
    }
    // Allocate only after a first chunk arrives, then copy each chunk once.
    // This avoids retaining the full chunk list *and* a second full-size copy
    // during upload, while still enforcing the exact expected byte count.
    if (!bytes) bytes = new Uint8Array(size);
    bytes.set(item.value, total);
    total += item.value.byteLength;
  }
  if (total !== size)
    throw new AppError(400, "UPLOAD_SIZE", "O tamanho da foto não confere.");
  return bytes!;
}

type UploadStreamState = { failure: AppError | null; validated: boolean };
function cancellationSafeBody(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const item = await reader.read();
        if (item.done) controller.close();
        else controller.enqueue(item.value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      try { await reader.cancel(reason); } catch { /* upstream cancellation is best effort */ }
    },
  });
}
function validatedUploadStream(
  request: Request,
  size: number,
  mime: string,
): { stream: ReadableStream<Uint8Array>; state: UploadStreamState } {
  if (!request.body || request.headers.get("content-length") !== String(size))
    throw new AppError(400, "UPLOAD_SIZE", "O tamanho da foto não confere.");
  const state: UploadStreamState = { failure: null, validated: false };
  let total = 0;
  let emptyChunks = 0;
  let nonemptyChunks = 0;
  const prefix = new Uint8Array(24);
  let prefixLength = 0;
  const fail = (error: AppError): never => {
    state.failure = error;
    throw error;
  };
  const guarded = cancellationSafeBody(request.body).pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      if (chunk.byteLength === 0) {
        if (++emptyChunks > 64)
          fail(new AppError(400, "UPLOAD_STREAM", "Fluxo de envio inválido."));
        return;
      }
      if (++nonemptyChunks > 8192)
        fail(new AppError(400, "UPLOAD_STREAM", "Fluxo de envio inválido."));
      if (chunk.byteLength > size - total)
        fail(new AppError(400, "UPLOAD_SIZE", "O tamanho da foto não confere."));
      const copyLength = Math.min(prefix.byteLength - prefixLength, chunk.byteLength);
      if (copyLength > 0) {
        prefix.set(chunk.subarray(0, copyLength), prefixLength);
        prefixLength += copyLength;
      }
      total += chunk.byteLength;
      controller.enqueue(chunk);
    },
    flush() {
      if (total !== size)
        fail(new AppError(400, "UPLOAD_SIZE", "O tamanho da foto não confere."));
      if (!matchesMime(prefix.subarray(0, prefixLength), mime))
        fail(new AppError(400, "INVALID_IMAGE", "Envie uma imagem JPG, PNG ou WebP válida."));
      state.validated = true;
    },
  }));
  return { stream: guarded.pipeThrough(new FixedLengthStream(size)), state };
}

async function digestValidatedStream(
  stream: ReadableStream<Uint8Array>,
  state: UploadStreamState,
): Promise<string> {
  const digest = new (crypto as Crypto & {
    DigestStream: new (algorithm: "SHA-256") => WritableStream<Uint8Array> & { digest: Promise<ArrayBuffer> };
  }).DigestStream("SHA-256");
  try {
    await stream.pipeTo(digest);
    return Array.from(new Uint8Array(await digest.digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  } catch {
    throw state.failure ?? new AppError(400, "UPLOAD_STREAM", "Fluxo de envio interrompido.");
  }
}

function assertR2Digest(
  object: Pick<R2Object, "size" | "httpMetadata" | "customMetadata" | "checksums">,
  expectedSize: number,
  expectedMime: string,
  expectedDigest: string,
) {
  if (object.size !== expectedSize || object.httpMetadata?.contentType !== expectedMime ||
      !hasMatchingR2Sha256(expectedDigest, object.checksums.sha256) ||
      (object.customMetadata?.sha256 !== undefined && object.customMetadata.sha256 !== expectedDigest))
    throw new AppError(409, "UPLOAD_MISMATCH", "A integridade do original armazenado não confere.");
}
export async function handleClientGalleryUploadApi(
  request: Request,
  url: URL,
  env: Env,
): Promise<Response | null> {
  const match = url.pathname.match(
    /^\/admin\/api\/albuns-privados\/([^/]+)\/uploads\/(intents|([^/]+)\/(direct|complete))$/,
  );
  if (!match) return null;
  const actor = await requireAdmin(request, env);
  assertAllowedOrigin(request, env);
  const galleryId = match[1];
  let intentInput: ClientImageIntentInput | null = null;
  if (match[2] === "intents" && request.method === "POST") {
    // Parse and reject the provider-incompatible 20-25 MiB range before the
    // rate-limit D1 write, gallery reservation, or any R2 access. The public
    // product/schema maximum remains the canonical 25 MiB requirement.
    intentInput = await parseJson(request, clientImageIntentSchema);
    if (intentInput.sizeBytes > IMAGES_BINDING_MAX_INPUT_BYTES)
      throw new AppError(413, "UPLOAD_IMAGE_LIMIT", IMAGES_BINDING_LIMIT_MESSAGE);
  }
  const db = requireDb(env);
  const bucket = requireOriginals(env);
  await assertRateLimit(request, db, "private-upload", 200, 60);
  if (!(await getGallery(db, galleryId)))
    throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  if (match[2] === "intents" && request.method === "POST") {
    const input = intentInput!;
    // Reject before reserving an image or writing to R2 when this Worker cannot
    // validate and serve it. The existing completion guard stays fail-closed.
    if (!env.IMAGES)
      throw new AppError(
        503,
        "IMAGE_VALIDATION_UNAVAILABLE",
        "A validação de fotos está indisponível. Tente novamente mais tarde.",
      );
    const id = crypto.randomUUID();
    const imageId = crypto.randomUUID();
    const now = new Date().toISOString();
    const storageKey = privateGalleryStorageKey(galleryId, imageId, input.mimeType);
    if (!storageKey)
      throw new AppError(400, "UPLOAD_TYPE", "Identidade ou tipo de foto inválido.");
    const intent: IntentRow = {
      id,
      galleryId,
      imageId,
      expectedMime: input.mimeType,
      expectedSize: input.sizeBytes,
      storageKey,
      status: "pending",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
      sha256: input.sha256,
      uploadTokenVersion: 3,
    };
    const token = await signature(intent, env);
    await db.batch([
      db
        .prepare(
          `INSERT INTO client_gallery_images (id,gallery_id,storage_key,original_filename,mime_type,size_bytes,alt_text,position,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM client_gallery_images WHERE gallery_id=?),'pending',?,?)`,
        )
        .bind(
          imageId,
          galleryId,
          storageKey,
          input.filename,
          input.mimeType,
          input.sizeBytes,
          input.altText,
          galleryId,
          now,
          now,
        ),
      db
        .prepare(
          `INSERT INTO client_gallery_upload_intents
           (id,gallery_id,image_id,expected_mime,expected_size,storage_key,status,expires_at,created_at,sha256,upload_token_version)
        VALUES (?,?,?,?,?,?,'pending',?,?,?,3)`,
        )
        .bind(
          id,
          galleryId,
          imageId,
          input.mimeType,
          input.sizeBytes,
          storageKey,
          intent.expiresAt,
          now,
          input.sha256,
        ),
    ]);
    await writeAudit(db, auditPrincipal(actor), "client_gallery.upload_intent_created", "client_gallery", galleryId, { imageId });
    return privateJson(
      {
        intentId: id,
        imageId,
        uploadUrl: new URL(
          `/admin/api/albuns-privados/${galleryId}/uploads/${id}/direct`,
          request.url,
        ).href,
        requiredHeaders: {
          "Content-Type": input.mimeType,
          "X-Upload-Token": token,
        },
      },
      { status: 201 },
    );
  }
  const intent = await db
    .prepare(
      `SELECT id,gallery_id AS galleryId,image_id AS imageId,expected_mime AS expectedMime,expected_size AS expectedSize,
    storage_key AS storageKey,status,expires_at AS expiresAt,sha256,upload_token_version AS uploadTokenVersion
    FROM client_gallery_upload_intents WHERE id=? AND gallery_id=?`,
    )
    .bind(match[3] ?? "", galleryId)
    .first<IntentRow>();
  if (!intent) throw new AppError(404, "NOT_FOUND", "Recurso não encontrado.");
  // Older/externally restored D1 intents may predate today's provider ceiling.
  // Keep the 25 MiB product bound distinct, then fail closed at the Images
  // boundary before body allocation, R2 reads or Images calls.
  if (!Number.isSafeInteger(intent.expectedSize) || intent.expectedSize < 1 ||
      intent.expectedSize > CLIENT_MAX_UPLOAD_BYTES)
    throw new AppError(413, "UPLOAD_SIZE", "O tamanho do envio excede o requisito de 25 MiB.");
  if (intent.expectedSize > IMAGES_BINDING_MAX_INPUT_BYTES)
    throw new AppError(413, "UPLOAD_IMAGE_LIMIT", IMAGES_BINDING_LIMIT_MESSAGE);
  if (!["image/jpeg", "image/png", "image/webp"].includes(intent.expectedMime))
    throw new AppError(409, "UPLOAD_TYPE", "O tipo do envio não é suportado.");
  // An old/restored intent is not authority to read or put an arbitrary R2
  // key. Reconcile immutable intent fields with its image row and the exact
  // gallery-owned key before verifying signatures, reading request bodies or
  // accessing the private bucket. SQL FKs do not cover these shared fields.
  const linkedImage = await db.prepare(
    `SELECT storage_key AS storageKey, mime_type AS mimeType, size_bytes AS sizeBytes,
       status, deleted_at AS deletedAt FROM client_gallery_images WHERE gallery_id=? AND id=?`,
  ).bind(galleryId, intent.imageId).first<{
    storageKey:string; mimeType:string; sizeBytes:number; status:string; deletedAt:string|null;
  }>();
  const expectedKey = privateGalleryStorageKey(galleryId, intent.imageId, intent.expectedMime);
  if (!linkedImage || linkedImage.deletedAt !== null ||
      intent.storageKey !== expectedKey || linkedImage.storageKey !== expectedKey ||
      linkedImage.mimeType !== intent.expectedMime ||
      linkedImage.sizeBytes !== intent.expectedSize ||
      (intent.status === "completed" ? linkedImage.status !== "ready" :
        linkedImage.status !== "pending"))
    throw new AppError(409, "UPLOAD_INTENT_MISMATCH",
      "Os metadados persistidos deste envio não conferem.");
  if (
    intent.status === "completed" &&
    match[4] === "complete" &&
    request.method === "POST"
  ) {
    const image = await getReadyGalleryImage(db, galleryId, intent.imageId);
    if (image) return privateJson({ image: serializeImage(image) });
  }
  if (
    intent.expiresAt <= new Date().toISOString() ||
    !["pending", "uploaded"].includes(intent.status)
  )
    throw new AppError(
      409,
      "UPLOAD_CLOSED",
      "Este envio expirou ou já foi concluído.",
    );
  if (match[4] === "direct" && request.method === "PUT") {
    if (
      request.headers.get("X-Upload-Token") !== (await signature(intent, env))
    )
      throw new AppError(403, "UPLOAD_SIGNATURE", "Envio não autorizado.");
    if (request.headers.get("Content-Type") !== intent.expectedMime)
      throw new AppError(400, "UPLOAD_TYPE", "O tipo da foto não confere.");
    // Recheck the exact D1 tuple immediately before starting the stream into
    // R2. The later uploaded CAS still protects against a restore racing the
    // stream; D1 and R2 do not share an atomic transaction.
    const live = await db.prepare(
      `SELECT i.status, i.sha256 FROM client_gallery_upload_intents i
       JOIN client_gallery_images m ON m.gallery_id=i.gallery_id AND m.id=i.image_id
       WHERE i.id=? AND i.gallery_id=? AND i.image_id=? AND i.expires_at=?
         AND i.expires_at>? AND i.completed_at IS NULL
         AND i.storage_key=? AND i.expected_mime=? AND i.expected_size=?
         AND i.status IN ('pending','uploaded')
         AND m.status='pending' AND m.deleted_at IS NULL
         AND m.storage_key=? AND m.mime_type=? AND m.size_bytes=?`,
    ).bind(intent.id, galleryId, intent.imageId, intent.expiresAt,
      new Date().toISOString(), intent.storageKey, intent.expectedMime,
      intent.expectedSize, intent.storageKey, intent.expectedMime,
      intent.expectedSize).first<{status: string; sha256: string | null}>();
    if (!live)
      throw new AppError(409, "UPLOAD_INTENT_MISMATCH",
        "Os metadados persistidos deste envio não conferem.");

    let digest: string;
    if (intent.uploadTokenVersion === 3) {
      if (!intent.sha256 || live.sha256 !== intent.sha256)
        throw new AppError(409, "UPLOAD_INTENT_MISMATCH",
          "O resumo de integridade deste envio não confere.");
      const validated = validatedUploadStream(request, intent.expectedSize, intent.expectedMime);
      if (live.status === "pending") {
        // Recover an R2-success/D1-pending upload by validating this retry
        // stream against the signed digest and the existing native checksum.
        const existingBefore = await bucket.head(intent.storageKey);
        if (existingBefore) {
          digest = await digestValidatedStream(validated.stream, validated.state);
          if (digest !== intent.sha256)
            throw new AppError(409, "UPLOAD_MISMATCH", "Este envio não corresponde à foto recebida.");
          assertR2Digest(existingBefore, intent.expectedSize, intent.expectedMime, intent.sha256);
        } else {
          let object: R2Object | null;
          try {
            object = await bucket.put(intent.storageKey, validated.stream, {
              sha256: privateOriginalSha256Bytes(intent.sha256),
              onlyIf: { etagDoesNotMatch: "*" },
              httpMetadata: { contentType: intent.expectedMime },
              customMetadata: { sha256: intent.sha256 },
            });
          } catch (error) {
            if (validated.state.failure) throw validated.state.failure;
            if (!validated.state.validated)
              throw new AppError(400, "UPLOAD_STREAM", "Fluxo de envio interrompido.");
            if (/checksum/i.test(String(error)))
              throw new AppError(409, "UPLOAD_MISMATCH", "Este envio não corresponde à foto recebida.");
            throw error;
          }
          if (!validated.state.validated)
            throw new AppError(409, "UPLOAD_CLOSED", "Repita o envio para confirmar o original armazenado.");
          if (object) {
            assertR2Digest(object, intent.expectedSize, intent.expectedMime, intent.sha256);
          } else {
            // A concurrent identical request may have won the immutable R2
            // write. R2 verifies the supplied checksum while consuming the
            // stream; confirm the stored checksum before accepting the race.
            const existing = await bucket.head(intent.storageKey);
            if (!existing)
              throw new AppError(409, "UPLOAD_CLOSED", "Este envio já foi recebido.");
            assertR2Digest(existing, intent.expectedSize, intent.expectedMime, intent.sha256);
          }
          digest = intent.sha256;
        }
      } else {
        // A retry after R2 succeeded but before the D1 transition validates
        // its incoming stream, then compares the existing native R2 checksum.
        digest = await digestValidatedStream(validated.stream, validated.state);
        if (digest !== intent.sha256)
          throw new AppError(409, "UPLOAD_MISMATCH", "Este envio não corresponde à foto recebida.");
        const existing = await bucket.head(intent.storageKey);
        if (!existing)
          throw new AppError(409, "UPLOAD_CLOSED", "Este envio já foi recebido.");
        assertR2Digest(existing, intent.expectedSize, intent.expectedMime, intent.sha256);
      }
    } else {
      // Legacy v2 intents keep their original buffered protocol and signature.
      // New v2 re-attestations also ask R2 to retain a native checksum, while
      // old objects without one are verified byte-for-byte below.
      const bytes = await readBounded(request, intent.expectedSize);
      if (!matchesMime(bytes, intent.expectedMime))
        throw new AppError(400, "INVALID_IMAGE", "Envie uma imagem JPG, PNG ou WebP válida.");
      digest = await privateOriginalSha256(bytes);
      if (intent.sha256 && intent.sha256 !== digest)
        throw new AppError(409, "UPLOAD_MISMATCH", "Este envio não corresponde à foto recebida.");
      if (live.sha256 !== null && live.sha256 !== digest)
        throw new AppError(409, "UPLOAD_INTENT_MISMATCH",
          "Os metadados persistidos deste envio não conferem.");
      const object = live.status === "pending" ? await bucket.put(intent.storageKey, bytes, {
        sha256: privateOriginalSha256Bytes(digest),
        onlyIf: { etagDoesNotMatch: "*" },
        httpMetadata: { contentType: intent.expectedMime },
        customMetadata: { sha256: digest },
      }) : null;
      if (object) {
        if (object.checksums.sha256 && !hasMatchingR2Sha256(digest, object.checksums.sha256))
          throw new AppError(409, "UPLOAD_MISMATCH", "O resumo do original armazenado não confere.");
      } else {
        const existing = await bucket.head(intent.storageKey);
        if (!existing || existing.size !== bytes.length ||
            existing.httpMetadata?.contentType !== intent.expectedMime)
          throw new AppError(409, "UPLOAD_CLOSED", "Este envio já foi recebido.");
        if (existing.checksums.sha256) {
          if (!hasMatchingR2Sha256(digest, existing.checksums.sha256) ||
              (existing.customMetadata?.sha256 !== undefined && existing.customMetadata.sha256 !== digest))
            throw new AppError(409, "UPLOAD_MISMATCH", "Este envio não corresponde ao original armazenado.");
        } else {
          const savedObject = await bucket.get(intent.storageKey);
          if (!savedObject) throw new AppError(409, "UPLOAD_CLOSED", "Este envio já foi recebido.");
          const saved = new Uint8Array(await savedObject.arrayBuffer());
          if (saved.length !== bytes.length || saved.some((byte, i) => byte !== bytes[i]))
            throw new AppError(409, "UPLOAD_CLOSED", "Este envio já foi recebido.");
          if (!hasMatchingOriginalDigest(digest, digest, savedObject.customMetadata?.sha256))
            throw new AppError(409, "UPLOAD_MISMATCH", "Este envio não corresponde ao original armazenado.");
        }
      }
    }
    // The immutable R2 write can succeed while a concurrent restore changes
    // D1. Never mark the restored/rebound intent uploaded with this object's
    // digest. All D1 continuations use the same exact gallery/image/key/MIME/
    // size/expiry tuple and require the original image to remain pending.
    // On conflict, leave R2 intact for a safe, independently verified retry.
    const identityWhere = `id=? AND gallery_id=? AND image_id=?
      AND storage_key=? AND expected_mime=? AND expected_size=?
      AND expires_at=? AND expires_at>? AND completed_at IS NULL`;
    const originalPending = `EXISTS(SELECT 1 FROM client_gallery_images m
      WHERE m.gallery_id=? AND m.id=? AND m.storage_key=?
        AND m.mime_type=? AND m.size_bytes=?
        AND m.status='pending' AND m.deleted_at IS NULL)`;
    const ownerValues = [galleryId, intent.imageId, intent.storageKey,
      intent.expectedMime, intent.expectedSize] as const;
    const activeValues = [intent.id, galleryId, intent.imageId, intent.storageKey,
      intent.expectedMime, intent.expectedSize, intent.expiresAt] as const;
    const updated = await db.prepare(
      `UPDATE client_gallery_upload_intents SET status='uploaded',sha256=?
       WHERE ${identityWhere} AND status='pending'
         AND (sha256 IS NULL OR sha256=?)
         AND ${originalPending} RETURNING id`,
    ).bind(digest, ...activeValues, new Date().toISOString(), digest,
      ...ownerValues).first();
    if (!updated) {
      const current = await db.prepare(
        `SELECT status,sha256 FROM client_gallery_upload_intents
         WHERE ${identityWhere} AND status='uploaded'
           AND ${originalPending}`,
      ).bind(...activeValues, new Date().toISOString(),
        ...ownerValues).first<{ status:string; sha256:string|null }>();
      if (!current || (current.sha256 !== null && current.sha256 !== digest))
        throw new AppError(409, "UPLOAD_INTENT_MISMATCH",
          "Os metadados persistidos deste envio não conferem.");
      if (current.sha256 === null) {
        const resumed = await db.prepare(
          `UPDATE client_gallery_upload_intents SET sha256=?
           WHERE ${identityWhere} AND status='uploaded' AND sha256 IS NULL
             AND ${originalPending}`,
        ).bind(digest, ...activeValues, new Date().toISOString(),
          ...ownerValues).run();
        if (resumed.meta.changes !== 1) {
          const reread = await db.prepare(
            `SELECT sha256 FROM client_gallery_upload_intents
             WHERE ${identityWhere} AND status='uploaded'
               AND ${originalPending}`,
          ).bind(...activeValues, new Date().toISOString(),
            ...ownerValues).first<{sha256:string|null}>();
          if (reread?.sha256 !== digest)
            throw new AppError(409, "UPLOAD_INTENT_MISMATCH",
              "Os metadados persistidos deste envio não conferem.");
        }
      }
    }
    return privateJson({ ok: true });
  }
  if (match[4] === "complete" && request.method === "POST") {
    if (intent.status !== "uploaded")
      throw new AppError(409, "UPLOAD_INCOMPLETE", "Conclua o envio da foto.");
    // A pre-migration uploaded intent lacks an independent attestation of
    // the bytes initially submitted. Do not certify whatever is now in R2.
    // An authenticated signed PUT of identical immutable bytes must first
    // re-attest the object and fill the nullable digest.
    if (intent.sha256 === null)
      throw new AppError(409, "UPLOAD_REATTEST_REQUIRED", "Reenvie a mesma foto para confirmar sua integridade.");
    if (!env.IMAGES)
      throw new AppError(503, "IMAGE_VALIDATION_UNAVAILABLE", "A validação de fotos está indisponível. Tente novamente mais tarde.");
    const head = await bucket.head(intent.storageKey);
    if (
      !head ||
      head.size !== intent.expectedSize ||
      head.httpMetadata?.contentType !== intent.expectedMime ||
      (head.checksums.sha256 !== undefined &&
        !hasMatchingR2Sha256(intent.sha256, head.checksums.sha256)) ||
      (intent.uploadTokenVersion === 3 && !hasMatchingR2Sha256(intent.sha256, head.checksums.sha256)) ||
      (head.customMetadata?.sha256 !== undefined && head.customMetadata.sha256 !== intent.sha256)
    )
      throw new AppError(
        409,
        "UPLOAD_MISMATCH",
        "Não foi possível conferir o envio da foto.",
      );
    const object = await bucket.get(intent.storageKey);
    if (!object)
      throw new AppError(
        409,
        "UPLOAD_INCOMPLETE",
        "Não foi possível conferir o envio da foto.",
      );
    if (object.size !== intent.expectedSize ||
        object.httpMetadata?.contentType !== intent.expectedMime)
      throw new AppError(409, "UPLOAD_MISMATCH", "O tamanho ou tipo do original armazenado não confere.");
    // v3 objects carry R2's independently verified native checksum. Legacy v2
    // objects without that checksum retain the old full-byte re-attestation.
    let source: ReadableStream<Uint8Array>;
    if (object.checksums.sha256 !== undefined) {
      if (!hasMatchingR2Sha256(intent.sha256, object.checksums.sha256) ||
          (object.customMetadata?.sha256 !== undefined && object.customMetadata.sha256 !== intent.sha256))
        throw new AppError(409, "UPLOAD_MISMATCH", "A integridade do original armazenado não confere.");
      source = object.body;
    } else {
      if (intent.uploadTokenVersion === 3)
        throw new AppError(409, "UPLOAD_MISMATCH", "O checksum nativo do original não está disponível.");
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (bytes.byteLength !== intent.expectedSize ||
          !hasMatchingOriginalDigest(intent.sha256, await privateOriginalSha256(bytes), object.customMetadata?.sha256))
        throw new AppError(409, "UPLOAD_MISMATCH", "A integridade do original armazenado não confere.");
      source = new Response(bytes).body!;
    }
    const digest = intent.sha256;
    let width: number;
    let height: number;
    try {
      const raster = await validateGalleryRaster(env.IMAGES, source);
      width = raster.width;
      height = raster.height;
    } catch (error) {
      // A binding outage must leave the immutable R2 original and uploaded
      // intent intact so a later completion request can safely resume.
      if (isGalleryRasterTransientError(error))
        throw new AppError(503, "IMAGE_VALIDATION_UNAVAILABLE", "A validação de fotos está indisponível. Tente novamente mais tarde.");
      // A failed decode is not authorization to fail another image. Reconcile
      // the complete intent/image/R2 tuple again in the same D1 batch, just as
      // on the successful ready transition. If a restore changed ownership
      // during Images processing, leave R2 and both states recoverable.
      const failed = await db.batch([
        db
          .prepare(
            `UPDATE client_gallery_upload_intents SET status='failed'
             WHERE id=? AND gallery_id=? AND image_id=? AND storage_key=?
               AND expected_mime=? AND expected_size=? AND status='uploaded'
               AND sha256=? AND completed_at IS NULL AND expires_at>?
               AND EXISTS(SELECT 1 FROM client_gallery_images m
                 WHERE m.gallery_id=? AND m.id=? AND m.storage_key=?
                   AND m.mime_type=? AND m.size_bytes=?
                   AND m.status='pending' AND m.deleted_at IS NULL)`,
          )
          .bind(intent.id, galleryId, intent.imageId, intent.storageKey,
            intent.expectedMime, intent.expectedSize, digest, new Date().toISOString(),
            galleryId, intent.imageId, intent.storageKey,
            intent.expectedMime, intent.expectedSize),
        db
          .prepare(
            `UPDATE client_gallery_images SET status='failed',updated_at=?
             WHERE gallery_id=? AND id=? AND storage_key=? AND mime_type=?
               AND size_bytes=? AND status='pending' AND deleted_at IS NULL
               AND EXISTS(SELECT 1 FROM client_gallery_upload_intents i
                 WHERE i.id=? AND i.gallery_id=? AND i.image_id=?
                   AND i.storage_key=? AND i.expected_mime=? AND i.expected_size=?
                   AND i.status='failed' AND i.sha256=? AND i.completed_at IS NULL)`,
          )
          .bind(new Date().toISOString(), galleryId, intent.imageId,
            intent.storageKey, intent.expectedMime, intent.expectedSize,
            intent.id, galleryId, intent.imageId, intent.storageKey,
            intent.expectedMime, intent.expectedSize, digest),
      ]);
      if (failed.length !== 2 || failed.some(result => result.meta.changes !== 1))
        throw new AppError(409, "UPLOAD_INTENT_MISMATCH",
          "Os metadados persistidos deste envio não conferem.");
      throw new AppError(
        400,
        "INVALID_IMAGE",
        "Não foi possível ler esta foto. Tente outro arquivo.",
      );
    }
    const now = new Date().toISOString();
    // Both state transitions must revalidate the same immutable ownership
    // tuple inside ONE D1 batch. A restore may rebind an uploaded intent while
    // Images decodes the original; a stale image ID alone is not authority to
    // mark another image ready. This is D1 transactional coordination only,
    // not an atomic transaction with the already-written private R2 object.
    const completed = await db.batch([
      db
        .prepare(
        `UPDATE client_gallery_images
         SET status='ready',original_sha256=?,width=?,height=?,updated_at=?
         WHERE gallery_id=? AND id=? AND storage_key=? AND mime_type=?
           AND size_bytes=? AND status='pending' AND deleted_at IS NULL
           AND (original_sha256 IS NULL OR original_sha256=?)
           AND EXISTS(SELECT 1 FROM client_gallery_upload_intents i
             WHERE i.id=? AND i.gallery_id=? AND i.image_id=?
               AND i.storage_key=? AND i.expected_mime=? AND i.expected_size=?
               AND i.status='uploaded' AND i.completed_at IS NULL
               AND i.expires_at>? AND i.sha256=?)`,
        )
        .bind(digest, width, height, now, galleryId, intent.imageId,
          intent.storageKey, intent.expectedMime, intent.expectedSize, digest,
          intent.id, galleryId, intent.imageId, intent.storageKey,
          intent.expectedMime, intent.expectedSize, now, digest),
      db
        .prepare(
        `UPDATE client_gallery_upload_intents
         SET status='completed',completed_at=?
         WHERE id=? AND gallery_id=? AND image_id=? AND storage_key=?
           AND expected_mime=? AND expected_size=? AND status='uploaded'
           AND completed_at IS NULL AND expires_at>? AND sha256=?
           AND EXISTS(SELECT 1 FROM client_gallery_images m
             WHERE m.gallery_id=? AND m.id=? AND m.storage_key=?
               AND m.mime_type=? AND m.size_bytes=? AND m.status='ready'
               AND m.deleted_at IS NULL AND m.original_sha256=?)`,
        )
        .bind(now, intent.id, galleryId, intent.imageId, intent.storageKey,
          intent.expectedMime, intent.expectedSize, now, digest,
          galleryId, intent.imageId, intent.storageKey, intent.expectedMime,
          intent.expectedSize, digest),
    ]);
    if (completed.length !== 2 ||
        completed.some(result => result.meta.changes !== 1)) {
      // Two requests can decode the same immutable original concurrently.
      // A zero/zero CAS is idempotent only if the winner completed this exact
      // signed tuple, digest and decoded dimensions. A rebind, revocation or
      // partial transition remains a conflict; never retry writes blindly.
      const converged = completed.length === 2 &&
        completed.every(result => result.meta.changes === 0) &&
        await db.prepare(`SELECT i.id FROM client_gallery_upload_intents i
          JOIN client_gallery_images m ON m.gallery_id=i.gallery_id AND m.id=i.image_id
          WHERE i.id=? AND i.gallery_id=? AND i.image_id=? AND i.storage_key=?
            AND i.expected_mime=? AND i.expected_size=? AND i.expires_at=?
            AND i.status='completed' AND i.completed_at IS NOT NULL AND i.sha256=?
            AND m.storage_key=? AND m.mime_type=? AND m.size_bytes=?
            AND m.status='ready' AND m.deleted_at IS NULL AND m.original_sha256=?
            AND m.width=? AND m.height=?`)
          .bind(intent.id, galleryId, intent.imageId, intent.storageKey,
            intent.expectedMime, intent.expectedSize, intent.expiresAt, digest,
            intent.storageKey, intent.expectedMime, intent.expectedSize, digest,
            width, height).first();
      if (converged) {
        const image = await getReadyGalleryImage(db, galleryId, intent.imageId);
        if (image) return privateJson({ image: serializeImage(image) });
      }
      throw new AppError(409, "UPLOAD_INTENT_MISMATCH",
        "Os metadados persistidos deste envio não conferem.");
    }
    const image = await getReadyGalleryImage(db, galleryId, intent.imageId);
    if (!image) throw new AppError(409, "UPLOAD_CLOSED", "Este envio expirou.");
    await writeAudit(
      db,
      auditPrincipal(actor),
      "client_gallery.image_ready",
      "client_gallery",
      galleryId,
      { imageId: intent.imageId },
    );
    return privateJson({ image: serializeImage(image) });
  }
  throw new AppError(405, "METHOD_NOT_ALLOWED", "Operação não permitida.");
}
