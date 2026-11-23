import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordAuthFixtureOptions } from "./client-auth-visual-qa.mjs";

test("visual QA creates a separate password-mode origin without changing Access fixture", () => {
  const parent = {
    name: "punctum-existing-access-e2e",
    modules: [{ type: "ESModule", path: "/synthetic/index.js" }],
    bindings: {
      CLIENT_AUTH_MODE: "access",
      CLERK_AUTH_ENABLED: "true",
      PUBLIC_HOME_SNAPSHOT_ENABLED: "true",
      PUBLIC_HOME_CACHE_ENABLED: "true",
      SITE_ORIGIN: "http://127.0.0.1:8111",
      PRIVATE_GALLERIES_ENABLED: "true",
    },
    d1Databases: { DB: "access-db" },
    r2Buckets: { ORIGINALS: "access-originals" },
  };
  const visual = passwordAuthFixtureOptions(parent, "http://127.0.0.1:8222", 8222);
  assert.equal(parent.bindings.CLIENT_AUTH_MODE, "access");
  assert.equal(parent.bindings.CLERK_AUTH_ENABLED, "true");
  assert.equal(parent.bindings.PUBLIC_HOME_SNAPSHOT_ENABLED, "true");
  assert.equal(parent.bindings.SITE_ORIGIN, "http://127.0.0.1:8111");
  assert.equal(visual.bindings.CLIENT_AUTH_MODE, "password");
  assert.equal(visual.bindings.CLERK_AUTH_ENABLED, "false");
  assert.equal(visual.bindings.PRIVATE_GALLERIES_ENABLED, "true");
  assert.equal(visual.bindings.PUBLIC_HOME_SNAPSHOT_ENABLED, "false");
  assert.equal(visual.bindings.PUBLIC_HOME_CACHE_ENABLED, "false");
  assert.equal(visual.bindings.SITE_ORIGIN, "http://127.0.0.1:8222");
  assert.equal(visual.bindings.PUBLIC_SITE_URL, "http://127.0.0.1:8222");
  assert.equal(visual.port, 8222);
  assert.notEqual(visual.d1Databases.DB, parent.d1Databases.DB);
  assert.notEqual(visual.r2Buckets.ORIGINALS, parent.r2Buckets.ORIGINALS);
});
