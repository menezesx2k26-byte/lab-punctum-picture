/** SHA-256 of the exact immutable R2 original, never of a resized derivative.
 * A missing digest is a legacy row, not evidence of integrity.
 */
export async function privateOriginalSha256(bytes: Uint8Array): Promise<string> {
  const data = bytes.buffer instanceof ArrayBuffer
    ? (bytes as Uint8Array<ArrayBuffer>)
    : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function privateOriginalSha256Bytes(hex: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/.test(hex))
    throw new TypeError("Invalid SHA-256 hex digest");
  return Uint8Array.from({ length: 32 }, (_, index) =>
    Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

export function hasMatchingR2Sha256(
  expected: string,
  checksum?: ArrayBuffer,
): boolean {
  if (!checksum || !/^[a-f0-9]{64}$/.test(expected)) return false;
  const actual = Array.from(new Uint8Array(checksum), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return actual === expected;
}

export function hasMatchingOriginalDigest(
  expected: string | null,
  actual: string,
  metadata?: string,
): boolean {
  return (expected === null || expected === actual) &&
    (metadata === undefined || metadata === actual);
}
