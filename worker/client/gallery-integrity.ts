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

export function hasMatchingOriginalDigest(
  expected: string | null,
  actual: string,
  metadata?: string,
): boolean {
  return (expected === null || expected === actual) &&
    (metadata === undefined || metadata === actual);
}
