import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { runIsolatedSharp } from "./isolated-sharp.mjs";
import { readImageInfo, transformImage } from "./sharp-worker.mjs";
import { AppError } from "../../worker/utils/errors";
import { publicPaths } from "./public-files";
import { markQaMediaPhase } from "./worker-phase-trace.mjs";
import { sha256Hex } from "./admin-session-crypto.mjs";

const maxUploadBytes = 26_214_400;
const managedSharpWorker = () => process.env.PUNCTUM_QA_SHARP_WORKER;
const imageFormats = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
} as const;
const assetFormats = { ...imageFormats, "image/svg+xml": "svg" };
const mimeByExtension = new Map<string, string>(
  Object.entries(assetFormats).map(([mime, extension]) => [extension, mime]),
);
mimeByExtension.set("jpg", "image/jpeg");

type MediaRow = {
  bytes: Uint8Array;
  mime: string;
  etag: string;
};

function nativeQaChecksum(sha256: string): ArrayBuffer {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("QA_MEDIA_CHECKSUM_INVALID");
  return Uint8Array.from(Buffer.from(sha256, "hex")).buffer;
}

function qaObjectFields(row: { size: number; mime: string; etag: string }) {
  return {
    size: row.size, etag: row.etag,
    checksums: { sha256: nativeQaChecksum(row.etag) },
    customMetadata: { sha256: row.etag },
    httpMetadata: { contentType: row.mime },
  };
}

async function boundedBytes(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maxUploadBytes) {
        await reader.cancel();
        throw new AppError(413, "FILE_TOO_LARGE", "O arquivo excede o tamanho permitido.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export const qaAssets = {
  async fetch(request: Request) {
    const path = new URL(request.url).pathname;
    if (!publicPaths.has(path)) return new Response(null, { status: 404 });
    const directory = process.env.PUNCTUM_QA_CLIENT_DIRECTORY;
    if (!directory) throw new Error("QA client bundle path is unavailable");
    const file = resolve(directory, path.slice(1));
    const info = await stat(file);
    const mime = mimeByExtension.get(path.split(".").at(-1) ?? "") ?? "application/octet-stream";
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
      headers: { "Content-Type": mime, "Content-Length": String(info.size) },
    });
  },
};

export function qaOriginals(db: D1Database) {
  return {
    async head(key: string) {
      const row = await db.prepare("SELECT length(bytes) AS size, mime, etag FROM node_qa_media WHERE key = ?")
        .bind(key).first<{ size: number; mime: string; etag: string }>();
      return row && qaObjectFields(row);
    },
    async get(key: string) {
      markQaMediaPhase("media-original-start");
      const row = await db.prepare("SELECT bytes, mime, etag FROM node_qa_media WHERE key = ?")
        .bind(key).first<MediaRow>();
      markQaMediaPhase("media-original-end");
      if (row && sha256Hex(row.bytes) !== row.etag)
        throw new Error("QA_MEDIA_STORED_BYTES_CHECKSUM_MISMATCH");
      return row && {
        ...qaObjectFields({size:row.bytes.byteLength,mime:row.mime,etag:row.etag}),
        body: new Response(row.bytes as Uint8Array<ArrayBuffer>).body,
        arrayBuffer: async () => new Uint8Array(row.bytes).buffer,
      };
    },
    async put(key: string, body: ReadableStream<Uint8Array> | Uint8Array, options: R2PutOptions) {
      const onlyIf = options.onlyIf;
      const mime = options.httpMetadata instanceof Headers
        ? options.httpMetadata.get("Content-Type")
        : options.httpMetadata?.contentType;
      if (!onlyIf || onlyIf instanceof Headers || onlyIf.etagDoesNotMatch !== "*" ||
          !mime || !Object.hasOwn(imageFormats, mime)) {
        throw new Error("QA originals require a conditional image insert");
      }
      const bytes = body instanceof Uint8Array ? Buffer.from(body) : await boundedBytes(body);
      if (bytes.byteLength > maxUploadBytes) throw new Error("QA_ORIGINAL_TOO_LARGE");
      const etag = sha256Hex(bytes);
      if (options.sha256 && !Buffer.from(options.sha256).equals(Buffer.from(etag,"hex")))
        throw new Error("QA_ORIGINAL_NATIVE_CHECKSUM_MISMATCH");
      const result = await db.prepare("INSERT INTO node_qa_media (key, bytes, mime, etag) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO NOTHING")
        .bind(key, bytes, mime, etag).run();
      return result.meta.changes ? qaObjectFields({etag,size:bytes.byteLength,mime}) : null;
    },
  };
}

export const qaImages = {
  async info(body: ReadableStream<Uint8Array>) {
    markQaMediaPhase("media-body-start");
    const bytes = await boundedBytes(body);
    markQaMediaPhase("media-body-end");
    const worker = managedSharpWorker();
    if (!worker) return readImageInfo(bytes, markQaMediaPhase);
    markQaMediaPhase("media-sharp-start");
    const result = await runIsolatedSharp(worker, "info", bytes);
    markQaMediaPhase("media-sharp-end");
    return JSON.parse(result.toString());
  },
  input(body: ReadableStream<Uint8Array>) {
    return {
      transform({ width, height, fit, gravity }: ImageTransform) {
        return {
          async output({ format, quality }: ImageOutputOptions) {
            const output = imageFormats[format as keyof typeof imageFormats];
            if (!output) throw new Error("Unsupported QA image output");
            markQaMediaPhase("media-body-start");
            const bytes = await boundedBytes(body);
            markQaMediaPhase("media-body-end");
            const options = {
              resize: {
                width,
                height,
                fit: fit === "cover" || fit === "crop" ? "cover" : "inside",
                position: gravity === "auto" ? "attention" : "centre",
                withoutEnlargement: fit === "scale-down" || fit === "crop",
              },
              format: output,
              quality,
            };
            const worker = managedSharpWorker();
            markQaMediaPhase("media-sharp-start");
            const resized = worker
              ? await runIsolatedSharp(worker, "transform", bytes, options)
              : await transformImage(bytes, options);
            markQaMediaPhase("media-sharp-end");
            return {
              response: () => new Response(Uint8Array.from(resized), { headers: { "Content-Type": format } }),
            };
          },
        };
      },
    };
  },
};
