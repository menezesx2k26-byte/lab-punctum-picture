/**
 * Optional cold-MISS path for a verified, independently rendered public
 * homepage. One D1 read replaces Vinext/React SSR once the editorial snapshot
 * has been staged for this exact build and publication epoch. Enabling this
 * feature does not generate an HTML snapshot or approve a production deploy.
 */

const MAX_HTML_BYTES = 1_500_000;

type SnapshotRow = {
  epoch: number;
  snapshotEpoch: number | null;
  buildId: string | null;
  htmlSha256: string | null;
  html: string | null;
};

function validBuildId(buildId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(buildId);
}

function validPublicSsrHtml(html: string): boolean {
  if (!html || new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) return false;
  // Common HTML/JSON/URL escaping cannot turn a known private-media path
  // into publicly cacheable markup. This is a defense-in-depth gate; the
  // snapshot producer must still be trusted and independently audited.
  // Snapshot HTML may contain nested URL encoding, JS string escaping or
  // HTML entities. Decode only separators used by known private markers;
  // never execute/evaluate HTML. The bounded loop fails closed if an attacker
  // nests more encodings than we can safely normalize in this CPU budget.
  let normalizedPaths = html;
  for (let pass = 0; pass < 8; pass++) {
    const next = normalizedPaths
      .replace(/(?:&amp;|&#0*38;|&#x0*26;)/gi, "&")
      .replace(/%25/gi, "%")
      .replace(/(?:\\u002f|\\x2f|\\\/|%2f|&#x0*2f;|&#0*47;|&sol;)/gi, "/")
      .replace(/(?:\\u002d|\\x2d|%2d|&#x0*2d;|&#0*45;)/gi, "-")
      .replace(/(?:\\u005f|\\x5f|%5f|&#x0*5f;|&#0*95;)/gi, "_");
    if (next === normalizedPaths) break;
    normalizedPaths = next;
    if (pass === 7) return false;
  }
  // A complete SSR document, including the RSC hydration footer, is required.
  // A preview, 404, JSON, login or partial streaming response is not a snapshot.
  return /<!doctype html\s*>/i.test(html) &&
    /<html(?:\s|>)/i.test(html) &&
    /<\/html\s*>/i.test(html) &&
    html.includes("Punctum Picture") &&
    html.includes("__VINEXT_RSC_DONE__") &&
    !/(?:Set-Cookie\s*:|CF-Access-Jwt-Assertion|punctum_client_session|punctum_admin_session|client-galleries\/|\/api\/client\/galleries\b|\/admin\/api\/albuns-privados\b|\/qa\/recover\b)/i.test(normalizedPaths);
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Returns null for absent, stale, incomplete, altered or cross-deploy output. */
export async function readPublicHomeSnapshot(db: D1Database, buildId: string): Promise<Response | null> {
  if (!validBuildId(buildId)) return null;
  let row: SnapshotRow | null;
  try {
    row = await db.prepare(
      `SELECT epoch, snapshot_epoch AS snapshotEpoch, build_id AS buildId,
         html_sha256 AS htmlSha256, html FROM public_home_snapshot WHERE id=1`,
    ).first<SnapshotRow>();
  } catch {
    // Migration/binding may be unavailable in an old deployment. Keep the
    // existing dynamic route working until the new path is provisioned.
    return null;
  }
  if (!row || row.epoch !== row.snapshotEpoch || row.buildId !== buildId ||
    typeof row.html !== "string" || !validPublicSsrHtml(row.html) ||
    !/^[a-f0-9]{64}$/.test(row.htmlSha256 ?? "")) return null;
  if (await sha256(row.html) !== row.htmlSha256) return null;
  return new Response(row.html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, must-revalidate" },
  });
}

/**
 * Call BEFORE an authenticated public-facing mutation. Epoch increments are
 * committed first, so cached/staged HTML from the old publication cannot be
 * revived by a concurrent snapshot producer. Failure aborts the mutation.
 */
export async function invalidatePublicHomeSnapshot(db: D1Database): Promise<void> {
  const result = await db.prepare(
    `UPDATE public_home_snapshot
     SET epoch=epoch+1, snapshot_epoch=NULL, build_id=NULL, html_sha256=NULL, html=NULL
     WHERE id=1`,
  ).run();
  if (result.meta.changes !== 1) throw new Error("Public home snapshot invalidation was not confirmed");
}

/**
 * For a trusted offline snapshot producer using the same D1 snapshot/epoch:
 * capture complete published HTML, pin the deployed bundle ID and stage via
 * an atomic compare-and-swap. Never call from a public/client HTTP route.
 */
export async function stagePublicHomeSnapshot(
  db: D1Database,
  expectedEpoch: number,
  buildId: string,
  html: string,
): Promise<boolean> {
  if (!Number.isSafeInteger(expectedEpoch) || expectedEpoch < 0 ||
      !validBuildId(buildId) || !validPublicSsrHtml(html)) return false;
  const digest = await sha256(html);
  const result = await db.prepare(
    `UPDATE public_home_snapshot
     SET html=?, html_sha256=?, build_id=?, snapshot_epoch=epoch
     WHERE id=1 AND epoch=?`,
  ).bind(html, digest, buildId, expectedEpoch).run();
  return result.meta.changes === 1;
}
