import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeParity } from './punctum-r2-readonly-audit.mjs';

const image = (key, size = 5, status = 'ready') => ({
  original_key: key, size_bytes: size, status,
});
const intent = (key, status = 'completed') => ({ object_key: key, status });
const object = (key, size = 5) => ({ key, size, etag: 'opaque' });

test('all referenced D1 images and intents present yields metadata parity, never GO', () => {
  const result = summarizeParity(
    [image('originals/a/1.jpg'), image('originals/a/2.jpg', 8, 'pending')],
    [intent('originals/a/1.jpg')],
    [object('originals/a/1.jpg'), object('originals/a/2.jpg', 8)], 1);
  assert.equal(result.status, 'METADATA_PARITY_ONLY');
  assert.equal(result.imagesCount, 2);
  assert.equal(result.missingImages, 0);
  assert.equal(result.migrationOrCutoverAuthorized, false);
  assert.equal(result.byteSha256Verified, false);
  assert.equal(result.d1AndR2AtomicSnapshot, false);
});

test('missing objects and byte-length divergence fail closed', () => {
  const result = summarizeParity(
    [image('originals/a/1.jpg'), image('originals/b/2.webp')],
    [intent('originals/c/not-yet-uploaded.jpg', 'pending')],
    [object('originals/a/1.jpg', 99)], 2);
  assert.equal(result.status, 'BLOCKED_MISSING_OR_CONFLICTING_REFERENCES');
  assert.equal(result.missingImages, 1);
  assert.equal(result.missingIntents, 1);
  assert.equal(result.sizeMismatch, 1);
});

test('unreferenced and private R2 objects are retained for review, never removed', () => {
  const result = summarizeParity(
    [image('originals/a/1.jpg')], [],
    [object('originals/a/1.jpg'), object('client-galleries/private/1.webp')], 1);
  assert.equal(result.unreferenced, 1);
  assert.equal(result.prefixes.clientGalleries, 1);
  assert.equal(result.sourceMutations, 0);
  assert.equal(result.migrationOrCutoverAuthorized, false);
});

test('duplicate or malformed object metadata prevents a false complete inventory', () => {
  const result = summarizeParity(
    [image('originals/a/1.jpg')], [],
    [object('originals/a/1.jpg'), object('originals/a/1.jpg')], 1);
  assert.equal(result.status, 'BLOCKED_MISSING_OR_CONFLICTING_REFERENCES');
  assert.equal(result.duplicateObjects, 1);
  assert.throws(() => summarizeParity([], [], [{ key: 'x', size: -1 }], 1), /invalid_r2_object/);
  assert.throws(() => summarizeParity(null, [], [], 1), /inventory_inputs_incomplete/);
});

test('published report never includes original keys, customer identifiers, URLs or ETags', () => {
  const privateKey = 'client-galleries/customer-secret/photo.jpg';
  const result = summarizeParity([], [], [{key: privateKey, size: 12, etag: 'private-etag'}], 1);
  const json = JSON.stringify(result);
  assert.equal(json.includes(privateKey), false);
  assert.equal(json.includes('private-etag'), false);
  assert.equal(result.listingDigest.length, 64);
});
