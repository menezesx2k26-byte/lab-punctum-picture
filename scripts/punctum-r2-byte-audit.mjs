/**
 * Bounded read-only SHA-256 audit of Punctum R2 originals.
 * Data is hashed in memory in small chunks, never written to disk.
 * Only sanitized aggregate results reach logs/artifacts.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const BUCKET = 'punctum-picture-originals';
const API = 'https://api.cloudflare.com/client/v4/accounts/';
const SHA256 = /^[0-9a-f]{64}$/i;
const MAX_OBJECT_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;

export function compareObjectDigest(metadata, observed, claimed) {
  if (!metadata || !Number.isSafeInteger(metadata.size) || metadata.size < 0)
    return { verified: false, reason: 'invalid_metadata' };
  if (!observed || !Number.isSafeInteger(observed.bytes) || !SHA256.test(observed.sha256 ?? ''))
    return { verified: false, reason: 'invalid_observation' };
  if (observed.bytes !== metadata.size)
    return { verified: false, reason: 'size_mismatch' };
  if (claimed && SHA256.test(claimed)) {
    if (claimed.toLowerCase() !== observed.sha256.toLowerCase())
      return { verified: false, reason: 'd1_checksum_mismatch' };
    return { verified: true, checksumCompared: true };
  }
  return { verified: true, checksumCompared: false };
}

async function jsonApi(accountId, token, path, init = {}) {
  const response = await fetch(API + accountId + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + token, Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    }, signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error('metadata_http_' + response.status);
  const body = await response.json();
  if (!body || body.success !== true) throw new Error('metadata_not_successful');
  return body;
}

async function fetchObjectDigest(accountId, token, key) {
  const path = '/r2/buckets/' + BUCKET + '/objects/' +
    key.split('/').map(encodeURIComponent).join('/');
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(API + accountId + path, {
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/octet-stream' },
      signal: AbortSignal.timeout(75000),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if (!response.ok || !response.body) throw new Error('object_http_' + response.status);
    let bytes = 0;
    const hash = createHash('sha256');
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > MAX_OBJECT_BYTES) {
        await response.body.cancel().catch(() => {});
        throw new Error('object_size_cap');
      }
      hash.update(chunk);
    }
    return { bytes, sha256: hash.digest('hex') };
  }
  throw new Error('object_retry_exhausted');
}

async function run() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const d1Token = process.env.CLOUDFLARE_D1_API_TOKEN;
  const r2Token = process.env.CLOUDFLARE_API_TOKEN;
  if (!/^[a-f0-9]{32}$/i.test(accountId ?? '') || !d1Token || !r2Token)
    throw new Error('required_credentials_missing');
  const dbs = await jsonApi(accountId, d1Token, '/d1/database?per_page=100');
  const database = (dbs.result || []).find(x => x.name === 'punctum-picture');
  const dbId = database?.uuid || database?.id;
  if (!/^[a-f0-9-]{36}$/i.test(dbId ?? '')) throw new Error('source_database_unavailable');
  const sql = async statement => {
    const reply = await jsonApi(accountId, d1Token, '/d1/database/' + dbId + '/query',
      { method: 'POST', body: JSON.stringify({ sql: statement, params: [] }) });
    const result = reply.result?.[0];
    if (!result || !Array.isArray(result.results) || result.success === false)
      throw new Error('d1_query_unavailable');
    return result.results;
  };
  const images = await sql('SELECT original_key, checksum, status FROM images');
  const claims = new Map(images.filter(x => x.status === 'ready' && typeof x.original_key === 'string'
      && !x.original_key.startsWith('static:'))
    .map(x => [x.original_key, x.checksum]));
  const pages = new Set(), objects = [];
  let cursor = null;
  do {
    if (pages.size >= 1000) throw new Error('pagination_cap');
    const query = new URLSearchParams({ per_page: '1000' });
    if (cursor) query.set('cursor', cursor);
    const body = await jsonApi(accountId, r2Token, '/r2/buckets/' + BUCKET + '/objects?' + query);
    if (!Array.isArray(body.result)) throw new Error('listing_incomplete');
    for (const row of body.result) {
      if (typeof row?.key !== 'string' || !Number.isSafeInteger(row?.size))
        throw new Error('listing_malformed');
      objects.push({ key: row.key, size: row.size });
    }
    const resultInfo = body.result_info || {};
    if (resultInfo.is_truncated) {
      const next = resultInfo.cursor;
      if (!next || typeof next !== 'string' || pages.has(next))
        throw new Error('pagination_cursor_invalid');
      pages.add(next);
      cursor = next;
    } else cursor = null;
  } while (cursor);

  const summary = {
    scope: 'PUNCTUM_R2_BYTE_SHA256_READ_ONLY',
    status: 'IN_PROGRESS', sourceMutations: 0, objectsListed: objects.length,
    objectBytesReported: objects.reduce((sum, o) => sum + o.size, 0),
    verifiedObjects: 0, verifiedBytes: 0, d1ChecksumsCompared: 0,
    missingD1Checksums: 0, checksumMismatches: 0, sizeMismatches: 0,
    objectReadErrors: 0, unknownErrors: 0,
    byteAuditComplete: false, migrationOrCutoverAuthorized: false,
  };
  if (summary.objectBytesReported > MAX_TOTAL_BYTES)
    throw new Error('total_size_cap');
  let next = 0;
  const worker = async () => {
    while (next < objects.length) {
      const object = objects[next++];
      try {
        const digest = await fetchObjectDigest(accountId, r2Token, object.key);
        const claim = claims.get(object.key);
        const verified = compareObjectDigest(object, digest, claim);
        if (!verified.verified) {
          if (verified.reason === 'size_mismatch') summary.sizeMismatches++;
          else if (verified.reason === 'd1_checksum_mismatch') summary.checksumMismatches++;
          else summary.unknownErrors++;
        } else {
          summary.verifiedObjects++;
          summary.verifiedBytes += digest.bytes;
          if (verified.checksumCompared) summary.d1ChecksumsCompared++;
          else summary.missingD1Checksums++;
        }
      } catch {
        summary.objectReadErrors++;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  summary.byteAuditComplete = summary.verifiedObjects === summary.objectsListed &&
    summary.checksumMismatches === 0 && summary.sizeMismatches === 0 &&
    summary.objectReadErrors === 0 && summary.unknownErrors === 0;
  summary.status = summary.byteAuditComplete ? 'BYTE_READ_VERIFIED_METADATA_CHECKSUMS_PARTIAL'
    : 'BLOCKED_BYTE_READ_OR_MISMATCH';
  return summary;
}

async function main() {
  let report;
  try {
    report = await run();
  } catch {
    report = { scope: 'PUNCTUM_R2_BYTE_SHA256_READ_ONLY', status: 'BLOCKED_AUDIT_UNAVAILABLE',
      sourceMutations: 0, byteAuditComplete: false, migrationOrCutoverAuthorized: false };
    process.exitCode = 1;
  }
  const baseDir = new URL('../outputs/punctum-r2-byte-audit/', import.meta.url);
  await mkdir(baseDir, { recursive: true });
  await writeFile(new URL('report.json', baseDir), JSON.stringify(report, null, 2) + '\n',
    { mode: 0o600 });
  console.log(JSON.stringify(report));
  if (!report.byteAuditComplete) process.exitCode = 1;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]))
  await main();
