import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { probePrivateStorage } from './persistence-probe.mjs';

test('private SQLite and media survive independent opens with verified backup', async () => {
  const root = mkdtempSync(join(tmpdir(), 'punctum-managed-storage-'));
  const directory = join(root, 'private');
  const first = await probePrivateStorage(directory);
  const second = await probePrivateStorage(directory);
  assert.equal(first.boots, 1);
  assert.equal(second.boots, 2);
  assert.equal(first.fixtureSha256, second.fixtureSha256);
  assert.notEqual(first.bootId, second.bootId);
  assert.equal(second.integrity, 'ok');
  assert.equal(second.backupVerified, true);
  assert.equal(second.privateOutsideDeployment, true);
  assert.equal(statSync(directory).mode & 0o777, 0o700);
  for (const name of readdirSync(directory)) assert.equal(statSync(join(directory, name)).mode & 0o777, 0o600);
});

test('an existing broad directory is refused without writing anything', async () => {
  const root = mkdtempSync(join(tmpdir(), 'punctum-managed-storage-'));
  const directory = join(root, 'broad');
  mkdirSync(directory, { mode: 0o755 });
  await assert.rejects(probePrivateStorage(directory), /private directory/);
  assert.deepEqual(readdirSync(directory), []);
});

test('an existing unmarked database is never adopted', async () => {
  const root = mkdtempSync(join(tmpdir(), 'punctum-managed-storage-'));
  writeFileSync(join(root, 'capability.sqlite'), 'unrelated', {mode: 0o600});
  await assert.rejects(probePrivateStorage(root));
});
