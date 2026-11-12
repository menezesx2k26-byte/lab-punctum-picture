/**
 * Optional cold-MISS path for a verified, independently rendered public
 * homepage. One D1 read replaces Vinext/React SSR once the editorial snapshot
 * has been staged for this exact build and publication epoch. Enabling this
 * feature does not generate an HTML snapshot or approve a production deploy.
 */

const MAX_HTML_BYTES = 1_500_000;
const TEXT_ENCODER = new TextEncoder();
const HEX_BYTE = Array.from({ length: 256 }, (_, value) => value.toString(16).padStart(2, "0"));

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
  if (!html || TEXT_ENCODER.encode(html).byteLength > MAX_HTML_BYTES) return false;
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
      // Browsers discard ASCII tab/CR/LF while parsing URL attributes. An
      // encoded control inside a private route must not evade the public
      // snapshot guard (e.g. /api/cl&Tab;ient/galleries/...).
      .replace(/[\t\r\n]/g, "")
      .replace(/(?:&amp;|&#0*38;|&#x0*26;)/gi, "&")
      .replace(/&(?:Tab|NewLine);/gi, "")
      // Decode named ASCII HTML entities before checking private markers.
      // A browser turns &lowbar; into "_" and &percnt; into "%"; the
      // latter may reveal a nested URL-encoded private path on the next pass.
      .replace(/&(?:lowbar|underbar);/gi, "_")
      .replace(/&percnt;/gi, "%")
      .replace(/\\u\{([0-9a-f]{1,6})\}/gi, (whole, value: string) => {
        const code = Number.parseInt(value, 16);
        if (code === 9 || code === 10 || code === 13) return "";
        return code >= 32 && code <= 126 ? String.fromCharCode(code) : whole;
      })
      // ASCII letters can encode private path markers too. Decode only for
      // validation; never render the normalized string, and preserve any
      // non-ASCII escapes or entities without executing markup.
      .replace(/\\(?:u([0-9a-f]{4})|x([0-9a-f]{2}))/gi, (whole, u: string | undefined, x: string | undefined) => {
        const code = Number.parseInt(u ?? x ?? "", 16);
        if (code === 9 || code === 10 || code === 13) return "";
        return code >= 32 && code <= 126 ? String.fromCharCode(code) : whole;
      })
      .replace(/%([0-9a-f]{2})/gi, (whole, value: string) => {
        const code = Number.parseInt(value, 16);
        if (code === 9 || code === 10 || code === 13) return "";
        return code >= 32 && code <= 126 ? String.fromCharCode(code) : whole;
      })
      .replace(/&#(?:0*([0-9]+)|x0*([0-9a-f]+));?/gi, (whole, dec: string | undefined, hex: string | undefined) => {
        const code = Number.parseInt(dec ?? hex ?? "", hex === undefined ? 10 : 16);
        if (code === 9 || code === 10 || code === 13) return "";
        return code >= 32 && code <= 126 ? String.fromCharCode(code) : whole;
      })
      .replace(/(?:\\\/|&sol;)/gi, "/");
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
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", TEXT_ENCODER.encode(text)));
  let hex = "";
  for (const byte of bytes) hex += HEX_BYTE[byte];
  return hex;
}

/** Returns null for absent, stale, incomplete, altered or cross-deploy output. */
export async function readPublicHomeSnapshot(db: D1Database, buildId: string): Promise<Response | null> {
  if (!validBuildId(buildId)) return null;
  let row: SnapshotRow | null;
  try {
    row = await db.prepare(
      `SELECT epoch, snapshot_epoch AS snapshotEpoch, build_id AS buildId,
         html_sha256 AS htmlSha256, html FROM public_home_snapshot WHERE id=1
         AND NOT EXISTS(SELECT 1 FROM public_home_snapshot_mutations)`,
    ).first<SnapshotRow>();
  } catch {
    // Migration/binding may be unavailable in an old deployment. Keep the
    // existing dynamic route working until the new path is provisioned.
    return null;
  }
  if (!row || row.epoch !== row.snapshotEpoch || row.buildId !== buildId ||
    typeof row.html !== "string" || !/^[a-f0-9]{64}$/.test(row.htmlSha256 ?? "")) return null;
  // The only path that writes non-empty HTML is stagePublicHomeSnapshot(),
  // which performs the complete public-HTML/escape policy scan before the
  // atomic D1 write; invalidation paths only clear the staged content. Repeating that
  // eight-pass scan on every cold MISS adds CPU without strengthening the
  // trust boundary; the read still recomputes SHA-256 to detect post-stage
  // byte changes, and epoch/build/mutation fences remain mandatory.
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

/** Fence the complete mutation, not just its start. A producer can otherwise
 * capture pre-publication HTML under the NEW epoch and stage it after commit.
 * Distinct leases also keep overlapping publications fenced independently.
 * On process termination a retained lease disables snapshots (SSR fallback)
 * until an operator reconciles the publication; time is not proof of commit.
 */
export async function beginPublicHomeSnapshotMutation(db: D1Database): Promise<() => Promise<void>> {
  const id = crypto.randomUUID();
  const started = await db.batch([
    db.prepare("INSERT INTO public_home_snapshot_mutations (id,created_at) VALUES (?,?)")
      .bind(id, new Date().toISOString()),
    db.prepare(`UPDATE public_home_snapshot SET epoch=epoch+1,
      snapshot_epoch=NULL,build_id=NULL,html_sha256=NULL,html=NULL WHERE id=1`),
  ]);
  if (started.length !== 2 || started.some(result => result.meta.changes !== 1))
    throw new Error("Public home snapshot mutation fence was not confirmed");
  let finishing: Promise<void> | undefined;
  return () => finishing ??= (async () => {
    // Invalidation and removal are transactional: no render from inside this
    // publication may become eligible when the final active fence is removed.
    const finished = await db.batch([
      db.prepare(`UPDATE public_home_snapshot SET epoch=epoch+1,
        snapshot_epoch=NULL,build_id=NULL,html_sha256=NULL,html=NULL WHERE id=1`),
      db.prepare("DELETE FROM public_home_snapshot_mutations WHERE id=?").bind(id),
    ]);
    if (finished.length !== 2 || finished.some(result => result.meta.changes !== 1))
      throw new Error("Public home snapshot mutation completion was not confirmed");
  })();
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
     WHERE id=1 AND epoch=?
       AND NOT EXISTS(SELECT 1 FROM public_home_snapshot_mutations)`,
  ).bind(html, digest, buildId, expectedEpoch).run();
  return result.meta.changes === 1;
}
