import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

test('provider importing the entrypoint starts a real HTTP listener within its startup deadline', () => {
  const code=`
    import { Server } from 'node:http';
    import assert from 'node:assert/strict';
    let resolveListener;
    const ready=new Promise(resolve=>{resolveListener=resolve;});
    const deadline=setTimeout(()=>{console.error('Hosted import never called listen()');process.exit(1);},3000);
    const original=Server.prototype.listen;
    Server.prototype.listen=function(_port,_host,callback){
      const server=original.call(this,0,'127.0.0.1',callback);
      server.once('listening',()=>resolveListener(server));
      return server;
    };
    await import(${JSON.stringify(new URL('./server.mjs',import.meta.url).href)});
    const server=await ready;
    const response=await fetch('http://127.0.0.1:'+server.address().port+'/health?nonce=hosted-import');
    const body=await response.json();
    assert.equal(response.status,200);
    assert.equal(body.nonce,'hosted-import');
    assert.equal(body.service,'punctum-hostinger-qa-probe');
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    clearTimeout(deadline);
  `;
  const child=spawnSync(process.execPath,['--input-type=module','--eval',code],{encoding:'utf8',timeout:5000,env:{...process.env,PORT:'3000'}});
  assert.equal(child.status,0,child.stderr||child.error?.message);
});
