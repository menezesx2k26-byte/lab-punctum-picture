import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { AppError } from "../../worker/utils/errors";
import { publicPaths } from "./public-files";

const maxUploadBytes = 26_214_400;
const imageLimits = { limitInputPixels: 40_000_000, failOn: "warning" } as const;
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
      return row && { size: row.size, etag: row.etag, httpMetadata: { contentType: row.mime } };
    },
    async get(key: string) {
      const row = await db.prepare("SELECT bytes, mime, etag FROM node_qa_media WHERE key = ?")
        .bind(key).first<MediaRow>();
      return row && {
        size: row.bytes.byteLength,
        etag: row.etag,
        body: new Response(row.bytes as Uint8Array<ArrayBuffer>).body,
        httpMetadata: { contentType: row.mime },
      };
    },
    async put(key: string, body: ReadableStream<Uint8Array>, options: R2PutOptions) {
      const onlyIf = options.onlyIf;
      const mime = options.httpMetadata instanceof Headers
        ? options.httpMetadata.get("Content-Type")
        : options.httpMetadata?.contentType;
      if (!onlyIf || onlyIf instanceof Headers || onlyIf.etagDoesNotMatch !== "*" ||
          !mime || !Object.hasOwn(imageFormats, mime)) {
        throw new Error("QA originals require a conditional image insert");
      }
      const bytes = await boundedBytes(body);
      const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
      const etag = Buffer.from(digest).toString("hex");
      const result = await db.prepare("INSERT INTO node_qa_media (key, bytes, mime, etag) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO NOTHING")
        .bind(key, bytes, mime, etag).run();
      return result.meta.changes ? { etag, size: bytes.byteLength, httpMetadata: { contentType: mime } } : null;
    },
  };
}

export const qaImages = {
  async info(body: ReadableStream<Uint8Array>) {
    const bytes = await boundedBytes(body);
    const image = sharp(bytes, imageLimits);
    const { width, height, format } = await image.metadata();
    await image.stats(); // Decode the pixels before marking the upload valid.
    return { width, height, format, fileSize: bytes.length };
  },
  input(body: ReadableStream<Uint8Array>) {
    return {
      transform({ width, height, fit, gravity }: ImageTransform) {
        return {
          async output({ format, quality }: ImageOutputOptions) {
            const output = imageFormats[format as keyof typeof imageFormats];
            if (!output) throw new Error("Unsupported QA image output");
            const bytes = await boundedBytes(body);
            const image = sharp(bytes, imageLimits).autoOrient().resize({
              width,
              height,
              fit: fit === "cover" || fit === "crop" ? "cover" : "inside",
              position: gravity === "auto" ? "attention" : "centre",
              withoutEnlargement: fit === "scale-down" || fit === "crop",
            });
            const resized = await image.toFormat(output, { quality }).toBuffer();
            return {
              response: () => new Response(Uint8Array.from(resized), { headers: { "Content-Type": format } }),
            };
          },
        };
      },
    };
  },
};
