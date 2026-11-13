import test from 'node:test';
import assert from 'node:assert/strict';
import { traceQaWorker } from './worker-phase-trace.mjs';

test('the synthetic Studio handler is measured without logging its response, cookies or URL query', async () => {
  const messages = [];
  const response = new Response(JSON.stringify({ secret: 'NEVER_LOG' }), { status: 200 });
  const result = await traceQaWorker('/admin/api/studio', async () => response, {
    enabled: true,
    emit: (message) => messages.push(message),
  });
  assert.equal(result, response);
  const events = messages.map((line) => JSON.parse(line.replace(/^PUNCTUM_QA_PHASE /, '')));
  assert.deepEqual(events.map(({ phase }) => phase), ['start', 'returned']);
  assert.deepEqual(events.map(({ route }) => route), ['/admin/api/studio', '/admin/api/studio']);
  assert.equal(events[1].status, 200);
  assert.ok(Number.isSafeInteger(events[1].ms) && events[1].ms >= 0);
  assert.doesNotMatch(messages.join(' '), /NEVER_LOG|cookie|token/i);
});

test('worker phase instrumentation is disabled outside exact synthetic QA Studio route', async () => {
  const messages = [];
  const execute = async () => new Response(null, { status: 204 });
  await traceQaWorker('/admin/api/studio?secret=1', execute, { enabled: true, emit: (message) => messages.push(message) });
  await traceQaWorker('/admin/api/studio', execute, { enabled: false, emit: (message) => messages.push(message) });
  await traceQaWorker('/admin/api/albums', execute, { enabled: true, emit: (message) => messages.push(message) });
  assert.deepEqual(messages, []);
});

test('Studio handler failures are rethrown and recorded without exception messages', async () => {
  const messages = [];
  await assert.rejects(
    () => traceQaWorker('/admin/api/studio', async () => { throw new Error('SECRET_EXCEPTION'); }, {
      enabled: true, emit: (message) => messages.push(message),
    }),
    /SECRET_EXCEPTION/,
  );
  const events = messages.map((line) => JSON.parse(line.replace(/^PUNCTUM_QA_PHASE /, '')));
  assert.equal(events.at(-1).phase, 'error');
  assert.doesNotMatch(messages.join(' '), /SECRET_EXCEPTION/);
});

test('managed worker trace measures readiness, login, archive and home', async () => {
  const output = [];
  for (const route of ['/api/health', '/admin/api/session', '/arquivo', '/']) {
    await traceQaWorker(route, async () => new Response(null, { status: 204 }), {
      enabled: true, emit: (message) => output.push(message),
    });
  }
  const events = output.map((line) => JSON.parse(line.replace(/^PUNCTUM_QA_PHASE /, '')));
  assert.deepEqual(events.filter(({ phase }) => phase === 'returned').map(({ route }) => route),
    ['/api/health', '/admin/api/session', '/arquivo', '/']);
});
