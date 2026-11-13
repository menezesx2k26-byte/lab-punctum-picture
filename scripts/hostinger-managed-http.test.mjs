import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requestQa, responseStatus } from './hostinger-managed-http.mjs';

test('status-only checks consume the response and retain its status', async () => {
  const response = new Response('response to read', { status: 201 });
  assert.equal(await responseStatus(Promise.resolve(response)), 201);
  assert.equal(response.bodyUsed, true);
  assert.equal((await response.body.getReader().read()).done, true);
});

test('status-only checks fail when the response body is interrupted', async () => {
  const body = new ReadableStream({
    start(controller) { controller.error(new Error('interrupted response')); },
  });
  await assert.rejects(responseStatus(new Response(body)), /interrupted response/);
});

test('managed checks close each HTTP connection before the next request', async () => {
  const sockets = new Set();
  const server = createServer((request, response) => {
    assert.equal(request.headers.connection, 'close');
    assert.equal(request.headers['x-punctum-qa-request'], 'synthetic-id');
    sockets.add(request.socket);
    response.end('synthetic response');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    for (let i = 0; i < 2; i++) {
      const response = await requestQa(origin, {
        headers: { 'x-punctum-qa-request': 'synthetic-id' },
        signal: AbortSignal.timeout(2000),
      });
      assert.equal(await response.text(), 'synthetic response');
    }
    assert.equal(sockets.size, 2);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
