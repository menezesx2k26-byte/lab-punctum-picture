import test from 'node:test';
import assert from 'node:assert/strict';
import { compareObjectDigest } from './punctum-r2-byte-audit.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const observed = { bytes: 10, sha256: A };
const metadata = { size: 10 };
test('exact byte lengths and digest match a D1 checksum', () => {
  assert.deepEqual(compareObjectDigest(metadata, observed, A), {
    verified: true, checksumCompared: true,
  });
});
test('no D1 checksum is a partial byte read, never a fabricated comparison', () => {
  assert.deepEqual(compareObjectDigest(metadata, observed, null), {
    verified: true, checksumCompared: false,
  });
});
test('D1 checksum mismatch and truncated object are failures', () => {
  assert.equal(compareObjectDigest(metadata, observed, B).reason, 'd1_checksum_mismatch');
  assert.equal(compareObjectDigest({size: 11}, observed, A).reason, 'size_mismatch');
  assert.equal(compareObjectDigest(metadata, {bytes: 10, sha256: 'bad'}, A).verified, false);
});
test('invalid object metadata fails closed', () => {
  assert.equal(compareObjectDigest({size: -1}, observed, A).reason, 'invalid_metadata');
});
