import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { prepareManagedQaDatabase } from './managed-bootstrap.mjs';

test('managed bootstrap preserves existing synthetic edits and verifies snapshots across boots', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'punctum-managed-bootstrap-'));
  const file = join(directory, 'application.sqlite');
  const first = await prepareManagedQaDatabase(file);
  assert.equal(first.manifest.integrity, 'ok');
  assert.equal(Object.keys(first.manifest.tables).length, 23);
  const sql = new DatabaseSync(file);
  sql.prepare('UPDATE site_settings SET seo_title=? WHERE id=1').run('Preserved synthetic edit');
  sql.close();
  const second = await prepareManagedQaDatabase(file);
  assert.notEqual(first.bootId, second.bootId);
  assert.notEqual(first.manifest.tables.site_settings.sha256, second.manifest.tables.site_settings.sha256);
  const reopened = new DatabaseSync(file, {readOnly:true});
  try { assert.equal(reopened.prepare('SELECT seo_title FROM site_settings WHERE id=1').get().seo_title, 'Preserved synthetic edit'); }
  finally { reopened.close(); }
  assert.equal(readdirSync(directory).filter(name => name.startsWith('application-snapshot-')).length, 2);
});
