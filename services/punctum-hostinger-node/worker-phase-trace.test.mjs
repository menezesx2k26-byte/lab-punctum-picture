import test from 'node:test';
import assert from 'node:assert/strict';
import { markQaMediaPhase, traceQaLoginBody, traceQaWorker } from './worker-phase-trace.mjs';

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

test('managed login traces JSON consumption without recording credentials', async () => {
  const messages = [];
  const request = new Request('https://qa.example.test/admin/api/session', {
    method: 'POST',
    body: JSON.stringify({ password: 'NEVER_LOG' }),
  });
  const result = traceQaLoginBody(request, { enabled: true, emit: (message) => messages.push(message) });
  assert.deepEqual(await result.json(), { password: 'NEVER_LOG' });
  const events = messages.map((line) => JSON.parse(line.replace(/^PUNCTUM_QA_PHASE /, '')));
  assert.deepEqual(events.map(({ phase }) => phase), ['body-start', 'body-read']);
  assert.doesNotMatch(messages.join(' '), /NEVER_LOG|password/);
});

test('managed Studio records only allowlisted phase markers and elapsed time', async () => {
  const messages = [];
  await traceQaWorker('/admin/api/studio', async (mark) => {
    assert.equal(typeof mark, 'function');
    mark('session-start');
    mark('session-cookie-is-private');
    mark('session-end');
    return new Response(null, { status: 200 });
  }, { enabled: true, emit: (message) => messages.push(message) });
  const events = messages.map((line) => JSON.parse(line.replace(/^PUNCTUM_QA_PHASE /, '')));
  assert.deepEqual(events.map(({ phase }) => phase), ['start', 'session-start', 'session-end', 'returned']);
  assert.ok(events.slice(1).every(({ ms }) => Number.isSafeInteger(ms) && ms >= 0));
  assert.doesNotMatch(messages.join(' '), /cookie-is-private/);
});

test('media tracing scopes concurrent callbacks to an allowlisted route without exposing the image ID', async () => {
  const messages = [];
  const id = '02fed4e1-47c8-47e5-825f-947f75b710b7';
  const path = '/media/' + id + '/card';
  const execute = async () => {
    await Promise.resolve();
    markQaMediaPhase('media-sharp-start');
    markQaMediaPhase('not-a-media-phase');
    markQaMediaPhase('media-sharp-end');
    return new Response(null, { status: 200 });
  };
  await Promise.all([
    traceQaWorker(path, execute, { enabled: true, emit: (message) => messages.push(message) }),
    traceQaWorker('/admin/api/studio', execute, { enabled: false, emit: (message) => messages.push(message) }),
  ]);
  const events = messages.map((line) => JSON.parse(line.replace(/^PUNCTUM_QA_PHASE /, '')));
  assert.deepEqual(events.map(({ phase }) => phase), ['start', 'media-sharp-start', 'media-sharp-end', 'returned']);
  assert.ok(events.every(({ route }) => route === '/media/:id/card'));
  assert.ok(Number.isSafeInteger(events.at(-1).cpuMs));
  assert.doesNotMatch(messages.join(' '), /02fed4e1|not-a-media-phase/);
});
