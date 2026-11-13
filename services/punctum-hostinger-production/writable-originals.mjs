import { createHash, timingSafeEqual } from "node:crypto";
import { privateOriginals, stageOriginal } from "./originals.mjs";

const MAX_BYTES = 25 * 1024 * 1024;
const MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const HEX = /^[a-f0-9]{64}$/;

function matchDigest(expected, actual) {
  let bytes = null;
  if (expected instanceof Uint8Array) bytes = expected;
  else if (expected instanceof ArrayBuffer) bytes = new Uint8Array(expected);
  if (!bytes || bytes.byteLength !== 32 || !HEX.test(actual)) return false;
  return timingSafeEqual(
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    Buffer.from(actual, "hex"),
  );
}
async function bounded(body) {
  if (body instanceof Uint8Array) {
    if (!body.byteLength || body.byteLength > MAX_BYTES) throw Error("PRIVATE_ORIGINAL_UPLOAD_SIZE");
    return Buffer.from(body);
  }
  if (!body || typeof body.getReader !== "function")
    throw Error("PRIVATE_ORIGINAL_UPLOAD_STREAM_REQUIRED");
  const reader = body.getReader();
  const chunks = [];
  let total = 0, nonempty = 0, empty = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) throw Error("PRIVATE_ORIGINAL_UPLOAD_CHUNK");
      if (item.value.byteLength === 0) {
        if (++empty > 64) throw Error("PRIVATE_ORIGINAL_UPLOAD_EMPTY_LIMIT");
        continue;
      }
      if (++nonempty > 8192) throw Error("PRIVATE_ORIGINAL_UPLOAD_FRAGMENT_LIMIT");
      if (item.value.byteLength > MAX_BYTES - total) throw Error("PRIVATE_ORIGINAL_UPLOAD_SIZE");
      total += item.value.byteLength;
      chunks.push(Buffer.from(item.value));
    }
    if (!total) throw Error("PRIVATE_ORIGINAL_UPLOAD_EMPTY");
    return Buffer.concat(chunks, total);
  } catch (error) {
    try { await reader.cancel(error); } catch { /* already interrupted */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

export function writableOriginals(root) {
  // Verifies root canonicalization, permissions and immutable read-back.
  const read = privateOriginals(root);
  return {
    ...read,
    async put(key, body, options) {
      const conditional = options?.onlyIf;
      if (!conditional || conditional instanceof Headers ||
          conditional.etagDoesNotMatch !== "*" ||
          Object.keys(conditional).length !== 1) {
        throw Error("PRIVATE_ORIGINAL_CONDITIONAL_WRITE_REQUIRED");
      }
      const type = options.httpMetadata instanceof Headers
        ? options.httpMetadata.get("content-type")
        : options.httpMetadata?.contentType;
      if (!MIMES.has(type)) throw Error("PRIVATE_ORIGINAL_MIME_INVALID");
      if (await read.head(key)) return null;
      const bytes = await bounded(body);
      const digest = createHash("sha256").update(bytes).digest("hex");
      if (options.sha256 !== undefined && !matchDigest(options.sha256, digest))
        throw Error("PRIVATE_ORIGINAL_NATIVE_SHA256_MISMATCH");
      if (options.customMetadata?.sha256 !== undefined &&
          options.customMetadata.sha256 !== digest)
        throw Error("PRIVATE_ORIGINAL_CUSTOM_SHA256_MISMATCH");
      if (await read.head(key)) return null;
      try {
        stageOriginal(root, key, bytes, type, digest);
      } catch(error) {
        // A concurrent immutable insertion is not an overwrite permission.
        if (/STAGED_ORIGINAL_ALREADY_EXISTS/.test(String(error)) && await read.head(key))
          return null;
        throw error;
      }
      const stored = await read.head(key);
      if (!stored || stored.size !== bytes.byteLength || stored.etag !== digest ||
          stored.httpMetadata?.contentType !== type) {
        throw Error("PRIVATE_ORIGINAL_COMMIT_READBACK_FAILED");
      }
      return stored;
    },
    async delete() { throw Error("PRIVATE_ORIGINAL_DELETE_REQUIRES_RETENTION_POLICY"); },
    async list() { throw Error("PRIVATE_ORIGINAL_LIST_UNIMPLEMENTED"); },
  };
}
