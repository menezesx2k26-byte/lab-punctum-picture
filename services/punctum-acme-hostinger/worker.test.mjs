import test from "node:test";
import assert from "node:assert/strict";
import { proxyChallenge } from "./worker.mjs";

test("ACME forwarding is restricted to exact hosts, token paths and read methods", async () => {
  let calls = 0;
  const upstream = async () => { calls++; return new Response("unused"); };
  for (const url of ["https://other.invalid/.well-known/acme-challenge/token", "https://punctumpicture.com/",
    "https://punctumpicture.com/.well-known/acme-challenge/token?target=other.invalid",
    "https://punctumpicture.com/.well-known/acme-challenge/token/secret"])
    assert.equal((await proxyChallenge(new Request(url), upstream)).status, 404);
  assert.equal((await proxyChallenge(new Request("https://punctumpicture.com/.well-known/acme-challenge/token", { method: "POST" }), upstream)).status, 405);
  assert.equal(calls, 0);
});

test("ACME requests use the fixed HTTPS origin without forwarding credentials or following redirects", async () => {
  const response = await proxyChallenge(new Request("https://punctumpicture.com/.well-known/acme-challenge/token", {
    headers: { Cookie: "private-fixture", Authorization: "Bearer fixture" },
  }), async (url, options) => {
    assert.equal(url, "https://aliceblue-locust-999458.hostingersite.com/.well-known/acme-challenge/token");
    assert.equal(options.headers, undefined);
    assert.equal(options.redirect, "manual");
    return new Response("token.proof", { headers: { "Set-Cookie": "upstream-fixture" } });
  });
  assert.equal(await response.text(), "token.proof");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
});
