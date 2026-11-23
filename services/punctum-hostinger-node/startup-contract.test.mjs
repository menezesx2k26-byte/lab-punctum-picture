import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Node web request process cannot run SQLite stress tests or snapshots automatically', () => {
  const entry = readFileSync(new URL('./server.mjs', import.meta.url), 'utf8');
  assert.match(entry, /ensureManagedQaDatabase/, 'the private QA DB guard must remain');
  assert.doesNotMatch(entry, /prepareManagedQaDatabase|managed-diagnostics\.mjs/,
    'expensive tests must not run in the one-core web server lifecycle');
  assert.doesNotMatch(entry, /spawn\(/,
    'post-listen child stress tests must be explicit rather than automatic');
});
