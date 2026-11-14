/**
 * Read-only preflight for Punctum production D1 image references and R2 metadata.
 * No object bytes, keys, credentials or private identifiers leave the runner.
 * A cross-service listing is not an atomic snapshot or an integrity verification.
 */
import { createHash } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function summarizeParity(images, intents, objects, pages) {
  if (![images, intents, objects].every(Array.isArray) || !Number.isSafeInteger(pages) || pages < 1)
    throw new Error('inventory_inputs_incomplete');
  const byKey = new Map();
  let duplicateObjects = 0;
  let bytes = 0;
  for (const item of objects) {
    if (!item || typeof item.key !== 'string' || !Number.isSafeInteger(item.size) || item.size < 0)
      throw new Error('invalid_r2_object');
    if (byKey.has(item.key)) duplicateObjects++;
    byKey.set(item.key, item);
    bytes += item.size;
  }
  const imageKeys = new Set();
  const intentKeys = new Set();
  const imageStatuses = {};
  let missingImages = 0, missingReadyImages = 0, missingNonReadyImages = 0, staticReferences = 0;
  let sizeMismatch = 0, malformedImages = 0, duplicateImages = 0;
  const imageCategories = {};
  for (const row of images) {
    const key = row?.original_key;
    if (typeof key !== 'string' || !key) { malformedImages++; continue; }
    if (imageKeys.has(key)) duplicateImages++;
    const category = row.kind || 'album';
    imageCategories[category] = (imageCategories[category] || 0) + 1;
    imageKeys.add(key);
    const status = typeof row.status === 'string' ? row.status : 'unknown';
    imageStatuses[status] = (imageStatuses[status] || 0) + 1;
    if (key.startsWith('static:')) { staticReferences++; continue; }
    const object = byKey.get(key);
    if (!object) {
      missingImages++;
      if (status === 'ready') missingReadyImages++;
      else missingNonReadyImages++;
    } else if (Number.isSafeInteger(Number(row.size_bytes)) && object.size !== Number(row.size_bytes))
      sizeMismatch++;
  }
  let missingIntents = 0, missingCompletedIntents = 0, malformedIntents = 0;
  for (const row of intents) {
    const key = row?.object_key;
    if (typeof key !== 'string' || !key) { malformedIntents++; continue; }
    intentKeys.add(key);
    if (!byKey.has(key)) {
      missingIntents++;
      if (row.status === 'completed') missingCompletedIntents++;
    }
  }
  const referenced = new Set([...imageKeys, ...intentKeys]);
  const unreferenced = objects.filter(o => !referenced.has(o.key)).length;
  const prefixes = { publicOriginals: 0, clientGalleries: 0, other: 0 };
  for (const item of objects) {
    if (item.key.startsWith('originals/')) prefixes.publicOriginals++;
    else if (item.key.startsWith('client-galleries/')) prefixes.clientGalleries++;
    else prefixes.other++;
  }
  const listingDigest = createHash('sha256').update(
    objects.map(o => [o.key, o.size, o.etag ?? ''].join('\t')).sort().join('\n')
  ).digest('hex');
  const schemaOk = malformedImages === 0 && malformedIntents === 0 && duplicateImages === 0 && duplicateObjects === 0;
  const referencedPresent = missingReadyImages === 0 && missingCompletedIntents === 0 && sizeMismatch === 0;
  return {
    schemaVersion: 1,
    scope: 'PUNCTUM_D1_R2_METADATA_READ_ONLY',
    status: schemaOk && referencedPresent ? 'METADATA_PARITY_ONLY' : 'BLOCKED_MISSING_OR_CONFLICTING_REFERENCES',
    imagesCount: images.length, imageStatuses, imageCategories, staticReferences,
    intentsCount: intents.length, distinctIntentKeys: intentKeys.size,
    objectsCount: objects.length, r2Pages: pages, totalR2Bytes: bytes,
    prefixes, missingImages, missingReadyImages, missingNonReadyImages,
    missingIntents, missingCompletedIntents, sizeMismatch,
    malformedImages, malformedIntents, duplicateImages, duplicateObjects, unreferenced,
    listingDigest, d1AndR2AtomicSnapshot: false,
    byteSha256Verified: false, privateAlbumAuthVerified: false,
    migrationOrCutoverAuthorized: false, sourceMutations: 0,
    limitations: [
      'Object metadata/ETag is not byte-level SHA-256 evidence',
      'D1 and R2 scans are not atomic; repeat with frozen writers for cutover',
      'D1 image references do not cover all private-gallery states by themselves',
      'R2-only keys may be recoverable objects: never delete from this report',
    ],
  };
}

const base = 'https://api.cloudflare.com/client/v4/accounts/';
async function api(accountId, token, suffix, init) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(base + accountId + suffix, {
      ...init,
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: AbortSignal.timeout(25000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 1000));
      continue;
    }
    if (!response.ok) throw new Error('cloudflare_http_' + response.status);
    const body = await response.json();
    if (!body || body.success !== true) throw new Error('cloudflare_request_not_successful');
    return body;
  }
  throw new Error('cloudflare_retries_exhausted');
}

export async function collectAudit({ accountId, d1Token, r2Token, databaseName = 'punctum-picture',
  bucketName = 'punctum-picture-originals' }) {
  if (!/^[0-9a-f]{32}$/i.test(accountId ?? '') || !d1Token || !r2Token)
    throw new Error('required_read_credentials_missing');
  const listing = await api(accountId, d1Token, '/d1/database?per_page=100');
  const db = (listing.result || []).find(row => row.name === databaseName);
  const dbId = db?.uuid || db?.id;
  if (!/^[0-9a-f-]{36}$/i.test(dbId ?? '')) throw new Error('d1_database_not_found');
  const query = async sql => {
    const reply = await api(accountId, d1Token, '/d1/database/' + dbId + '/query',
      { method: 'POST', body: JSON.stringify({ sql, params: [] }) });
    const result = reply.result?.[0];
    if (!result || result.success === false || !Array.isArray(result.results))
      throw new Error('d1_query_incomplete');
    return result.results;
  };
  const tables = new Set((await query("SELECT name FROM sqlite_master WHERE type='table'")).map(row => row.name));
  const images = (await query('SELECT original_key, size_bytes, status FROM images'))
    .map(row => ({ ...row, kind: 'album' }));
  const intents = await query('SELECT object_key, status FROM upload_intents');
  // Additional physical R2 references must be considered without disclosing private keys.
  if (tables.has('site_media')) {
    for (const row of await query('SELECT storage_key AS original_key, size_bytes, status FROM site_media'))
      images.push({ ...row, kind: 'hero' });
  }
  if (tables.has('client_gallery_images')) {
    for (const row of await query('SELECT storage_key AS original_key, size_bytes, status FROM client_gallery_images'))
      images.push({ ...row, kind: 'private' });
  }
  if (tables.has('client_gallery_upload_intents')) {
    for (const row of await query('SELECT storage_key AS object_key, status FROM client_gallery_upload_intents'))
      intents.push(row);
  }
  const objects = [];
  let cursor = null, pages = 0;
  const seen = new Set();
  do {
    if (++pages > 1000) throw new Error('r2_pagination_cap');
    const q = new URLSearchParams({ per_page: '1000' });
    if (cursor) q.set('cursor', cursor);
    const result = await api(accountId, r2Token,
      '/r2/buckets/' + encodeURIComponent(bucketName) + '/objects?' + q);
    if (!Array.isArray(result.result)) throw new Error('r2_listing_incomplete');
    for (const item of result.result) objects.push({
      key: item.key, size: item.size, etag: item.etag,
    });
    const info = result.result_info ?? {};
    if (info.is_truncated === true) {
      if (typeof info.cursor !== 'string' || !info.cursor || seen.has(info.cursor))
        throw new Error('r2_cursor_invalid');
      seen.add(info.cursor);
      cursor = info.cursor;
    } else cursor = null;
  } while (cursor);
  return summarizeParity(images, intents, objects, pages);
}

async function main() {
  const output = new URL('../outputs/punctum-r2-readonly-audit/report.json', import.meta.url);
  let report;
  try {
    report = await collectAudit({
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      d1Token: process.env.CLOUDFLARE_D1_API_TOKEN,
      r2Token: process.env.CLOUDFLARE_API_TOKEN,
    });
  } catch (error) {
    report = {
      schemaVersion: 1, status: 'BLOCKED_READ_ONLY',
      failureType: error instanceof Error && /^cloudflare_http_[0-9]+$/.test(error.message)
        ? error.message : 'INVENTORY_UNAVAILABLE',
      migrationOrCutoverAuthorized: false, sourceMutations: 0,
    };
    process.exitCode = 1;
  }
  await mkdir(new URL('../outputs/punctum-r2-readonly-audit/', import.meta.url), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report));
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  await main();
