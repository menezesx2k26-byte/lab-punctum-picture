import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';
import { createAdminSessionKey, sha256Hex } from './admin-session-crypto.mjs';

const encoder = new TextEncoder();
const material = encoder.encode('synthetic-secret\u0000env:synthetic-credential-revision');
const payload = encoder.encode('eyJlbWFpbCI6ImFkbWluQGV4YW1wbGUudGVzdCIsImV4cCI6MjAwMDAwMDAwMH0');

test('Node signs and verifies the existing WebCrypto session format without a worker pool', async () => {
  const webKey = await webcrypto.subtle.importKey(
    'raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
  const webSignature = new Uint8Array(await webcrypto.subtle.sign('HMAC', webKey, payload));
  const nodeKey = createAdminSessionKey(material);
  const signature = nodeKey.sign(payload);
  assert.ok(signature instanceof Uint8Array);
  assert.deepEqual(new Uint8Array(signature), webSignature);
  assert.equal(await webcrypto.subtle.verify('HMAC', webKey, signature, payload), true);
  assert.equal(nodeKey.verify(payload, webSignature), true);
  assert.equal(nodeKey.verify(payload, webSignature.subarray(1)), false);
  const changedSignature = Uint8Array.from(webSignature);
  changedSignature[0] ^= 1;
  assert.equal(nodeKey.verify(payload, changedSignature), false);
  assert.equal(nodeKey.verify(encoder.encode('changed payload'), webSignature), false);
  const rotated = createAdminSessionKey(encoder.encode('synthetic-secret\u0000env:rotated-revision'));
  assert.equal(rotated.verify(payload, webSignature), false);
});

test('the Node digest preserves rate-limit and legacy credential hashes', async () => {
  for (const value of ['admin-mutation:unknown', 'synthetic-ação', '']) {
    const bytes = encoder.encode(value);
    const expected = Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
    assert.equal(sha256Hex(bytes), expected);
  }
});
