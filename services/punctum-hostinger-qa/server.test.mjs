import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQaServer } from './server.mjs';

test('QA health is live and uncached, exposes only bounded diagnostics and makes no SSR/release claim', async () => {
  const server=createQaServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try {
    const response=await fetch(origin+'/health?nonce=qa-20261028');
    assert.equal(response.status,200); assert.equal(response.headers.get('cache-control'),'no-store');
    const body=await response.json();
    assert.deepEqual(Object.keys(body).sort(),['service','version','node','uptimeSeconds','rssBytes','nonce','ssrValidated','production'].sort());
    assert.equal(body.service,'punctum-hostinger-qa-probe'); assert.equal(body.nonce,'qa-20261028');
    assert.equal(body.ssrValidated,false); assert.equal(body.production,false);
    assert.ok(body.rssBytes>0 && body.uptimeSeconds>=0);
    assert.equal((await fetch(origin+'/health',{method:'HEAD'})).status,200);
    assert.equal(await (await fetch(origin+'/health',{method:'HEAD'})).text(),'');
    assert.equal((await fetch(origin+'/not-a-route')).status,404);
    assert.equal((await fetch(origin+'/health',{method:'POST',body:'untrusted'})).status,405);
    assert.equal((await fetch(origin+'/health?nonce='+ 'x'.repeat(65))).status,400);
  } finally { await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});
