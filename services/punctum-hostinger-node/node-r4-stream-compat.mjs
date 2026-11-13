import { createHash } from "node:crypto";

const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

/**
 * Node-only compatibility for Cloudflare's fixed-length and streaming digest
 * primitives. Never imported from the Cloudflare Worker source.
 */
export function installNodeR4StreamCompatibility(target = globalThis) {
  if (typeof target.TransformStream !== "function" ||
      typeof target.WritableStream !== "function" ||
      !target.crypto || typeof target.crypto.subtle?.digest !== "function") {
    throw new Error("NODE_R4_WEB_STREAMS_UNAVAILABLE");
  }
  const installed = [];

  if (typeof target.FixedLengthStream !== "function") {
    const Transform = target.TransformStream;
    class NodeFixedLengthStream extends Transform {
      constructor(expected) {
        if (!Number.isSafeInteger(expected) || expected < 0 || expected > MAX_IMAGE_BYTES) {
          throw new RangeError("R4_FIXED_LENGTH_INVALID");
        }
        let received = 0;
        super({
          transform(chunk, controller) {
            if (!(chunk instanceof Uint8Array)) throw new TypeError("R4_STREAM_CHUNK_INVALID");
            received += chunk.byteLength;
            if (received > expected) throw new RangeError("R4_STREAM_TOO_LARGE");
            controller.enqueue(chunk);
          },
          flush() {
            if (received !== expected) throw new RangeError("R4_STREAM_LENGTH_MISMATCH");
          },
        });
      }
    }
    Object.defineProperty(target, "FixedLengthStream", {
      configurable: true, writable: true, value: NodeFixedLengthStream,
    });
    installed.push("FixedLengthStream");
  }

  if (typeof target.crypto.DigestStream !== "function") {
    const Writable = target.WritableStream;
    class NodeDigestStream extends Writable {
      constructor(algorithm) {
        if (algorithm !== "SHA-256") throw new RangeError("R4_DIGEST_ALGORITHM_INVALID");
        const hash = createHash("sha256");
        let accept, reject;
        const digest = new Promise((resolve, rejectPromise) => {
          accept = resolve;
          reject = rejectPromise;
        });
        super({
          write(chunk) {
            if (!(chunk instanceof Uint8Array)) throw new TypeError("R4_DIGEST_CHUNK_INVALID");
            hash.update(chunk);
          },
          close() {
            const value = hash.digest();
            accept(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
          },
          abort(reason) {
            reject(reason ?? new Error("R4_DIGEST_ABORTED"));
          },
        });
        this.digest = digest;
      }
    }
    Object.defineProperty(target.crypto, "DigestStream", {
      configurable: true, writable: true, value: NodeDigestStream,
    });
    installed.push("DigestStream");
  }
  return installed;
}
