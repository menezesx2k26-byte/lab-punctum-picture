import {test} from "node:test";
import assert from "node:assert/strict";
import worker from "./r4-images-probe-worker.mjs";

const origin="https://synthetic-qa.example.test";
const request=(token,method="GET",path="/probe")=>new Request(origin+path,{method,headers:{"X-R4-QA-Probe-Token":token}});
test("synthetic probe is hidden unless exact ephemeral token, path and method are correct",async()=>{
  const env={R4_QA_PROBE_TOKEN:"secret"};
  assert.equal((await worker.fetch(request("wrong"),env)).status,404);
  assert.equal((await worker.fetch(request("secret","POST"),env)).status,404);
  assert.equal((await worker.fetch(request("secret","GET","/"),env)).status,404);
  assert.equal((await worker.fetch(request("secret"),{})).status,404);
});
test("synthetic probe fails closed if Images binding is absent",async()=>{
 const r=await worker.fetch(request("secret"),{R4_QA_PROBE_TOKEN:"secret"});
 assert.equal(r.status,503);
 assert.equal(r.headers.get("Cache-Control"),"no-store");
});
test("synthetic probe executes exactly one free metadata read and one 1x1 transform",async()=>{
  const events=[];
  const images={
    async info(input){events.push("info");assert.ok(input);return {width:2,height:2};},
    input(input){events.push("input");assert.ok(input);return {
      transform(arg){events.push("transform");assert.deepEqual(arg,{width:1,height:1,fit:"scale-down"});return this;},
      output(arg){events.push("output");assert.deepEqual(arg,{format:"image/png"});return {response:()=>new Response(Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUkZFhYGBgYmBgYGBgAAAEGgBYbf/S0wAAAABJRU5ErkJggg=="),c=>c.charCodeAt(0)),{headers:{"Content-Type":"image/png"}})};}
    };}
  };
  const result=await worker.fetch(request("secret"),{R4_QA_PROBE_TOKEN:"secret",IMAGES:images});
  assert.equal(result.status,200);
  assert.deepEqual(events,["info","input","transform","output"]);
  assert.equal((await result.json()).ok,true);
});
