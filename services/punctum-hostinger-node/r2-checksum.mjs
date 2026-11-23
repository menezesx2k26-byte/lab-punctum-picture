import { timingSafeEqual } from "node:crypto";

/**
 * The Worker upload protocol supplies Uint8Array, while the R2 checksum
 * response uses an ArrayBuffer. Accept only these exact 32-byte forms.
 */
export function qaProvidedSha256Matches(provided, expectedHex) {
  if (!/^[0-9a-f]{64}$/.test(expectedHex)) return false;
  let bytes;
  if (provided instanceof Uint8Array) bytes = provided;
  else if (provided instanceof ArrayBuffer) bytes = new Uint8Array(provided);
  else return false;
  if (bytes.byteLength !== 32) return false;
  return timingSafeEqual(
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    Buffer.from(expectedHex, "hex"),
  );
}
