import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { traceQaRequests } from './route-trace.mjs';

test('managed QA route trace keeps only bounded route, status and latency', () => {
  const server = new EventEmitter();
  const output = [];
  traceQaRequests(server, {enabled:true, emit:(message)=>output.push(message)});
  const request = {url:'/admin/studio?credential=SHOULD_NOT_LOG', headers:{cookie:'VERY_PRIVATE_SESSION'}};
  const response = new EventEmitter();
  response.statusCode = 200;
  response.writableFinished = true;
  server.emit('request',request,response);
  response.emit('finish');
  assert.equal(output.length,2);
  const received = output.map(line => JSON.parse(line.replace(/^PUNCTUM_QA_TRACE /,'')));
  assert.deepEqual(received.map(x=>x.event),['start','finish']);
  assert.deepEqual(received.map(x=>x.route),['/admin/studio','/admin/studio']);
  assert.equal(received[1].status,200);
  assert.equal(typeof received[1].ms,'number');
  assert.ok(received[1].ms >= 0);
  assert.doesNotMatch(output.join(' '),/credential|SHOULD_NOT_LOG|VERY_PRIVATE_SESSION/);
});

test('managed trace ignores unrelated paths and cannot attach outside explicit QA', () => {
  const server = new EventEmitter();
  const output = [];
  traceQaRequests(server, {enabled:false, emit:x=>output.push(x)});
  assert.equal(server.listenerCount('request'),0);
  traceQaRequests(server, {enabled:true, emit:x=>output.push(x)});
  const response = new EventEmitter();
  response.statusCode=200;
  server.emit('request',{url:'/some-private-path?secret=1'},response);
  response.emit('finish');
  assert.deepEqual(output,[]);
});
