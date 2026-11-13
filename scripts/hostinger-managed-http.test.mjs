import assert from 'node:assert/strict';
import { test } from 'node:test';
import { responseStatus } from './hostinger-managed-http.mjs';

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
