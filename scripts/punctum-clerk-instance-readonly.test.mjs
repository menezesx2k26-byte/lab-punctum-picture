import assert from "node:assert/strict";
import test from "node:test";
import {
  assessR1,
  assertNoSecretMaterial,
  classifyCredential,
  extractSessionEvidence,
  jwtTemplateEvidence,
} from "./punctum-clerk-instance-readonly.mjs";

test("publishable keys are invalid backend secrets and are not callable", () => {
  const live = classifyCredential("pk_live_exampleplaceholder");
  assert.equal(live.classification, "INVALID_BACKEND_SECRET");
  assert.equal(live.publishable, true);
  assert.equal(live.backendCallable, false);
  const testKey = classifyCredential("pk_test_exampleplaceholder");
  assert.equal(testKey.prefix, "pk_test_");
  assert.equal(testKey.backendCallable, false);
});

test("backend key prefixes stay callable and are classified by environment", () => {
  assert.equal(classifyCredential("sk_live_exampleplaceholder").classification, "sk_live_");
  assert.equal(classifyCredential("sk_test_exampleplaceholder").classification, "sk_test_");
  assert.equal(classifyCredential("").classification, "ABSENT");
  assert.equal(classifyCredential("not-a-key").classification, "INVALID_BACKEND_SECRET");
});

test("session evidence keeps lifetime scalars and drops secret-shaped strings", () => {
  const evidence = extractSessionEvidence({
    id: "ins_example",
    environment_type: "production",
    session_settings: {
      maximum_lifetime_hours: 336,
      inactivity_timeout_days: 7,
      leaked: "sk_live_shouldneverprint",
    },
    unrelated: { nested: true },
  });
  assert.equal(evidence.sessionFields["session_settings.maximum_lifetime_hours"], 336);
  assert.equal(evidence.sessionFields["session_settings.inactivity_timeout_days"], 7);
  assert.equal(evidence.sessionFields["session_settings.leaked"], "[redacted]");
  assert.equal(evidence.sessionFields.unrelated, undefined);
});

test("token lifetime and unitless numbers do not prove the 14 day maximum", () => {
  const blocked = assessR1({
    "session.token_lifetime_seconds": 60,
    "session.maximum_lifetime": 1209600,
  });
  assert.equal(blocked.status, "BLOCKED_API_GAP");
  assert.equal(blocked.sessionTokenLifetime.unit, "seconds");
  assert.equal(blocked.sessionTokenLifetime.value, 60);
  assert.equal(blocked.maximumLifetime.within14d, null);
});

test("an explicit maximum at 14 days still needs a revocation replay", () => {
  const assessed = assessR1({ maximum_lifetime_hours: 336, inactivity_timeout_hours: 24 });
  assert.equal(assessed.status, "BLOCKED_REVOCATION_UNTESTED");
  assert.equal(assessed.maximumLifetime.within14d, true);
  assert.equal(assessed.sessionsRevoked, false);
  const tooLong = assessR1({ maximum_lifetime_days: 30 });
  assert.equal(tooLong.status, "MAX_LIFETIME_EXCEEDS_14D");
});

test("jwt template evidence records claim names only", () => {
  const evidence = jwtTemplateEvidence([
    { name: "punctum", lifetime: 60, claims: { sid: "{{session.id}}", email: "{{user.primary_email}}" } },
  ]);
  assert.equal(evidence.count, 1);
  assert.deepEqual(evidence.templates[0].claimNames, ["sid", "email"]);
  assert.equal(evidence.templates[0].hasSidClaim, true);
  assert.equal(JSON.stringify(evidence).includes("primary_email"), false);
  assert.equal(JSON.stringify(evidence).includes("{{"), false);
});

test("secret material in a serialized report is refused", () => {
  assert.doesNotThrow(() => assertNoSecretMaterial('{"keyPrefix":"sk_live_"}'));
  assert.throws(
    () => assertNoSecretMaterial('{"value":"sk_live_exampleplaceholder"}'),
    /REFUSING_TO_PRINT_SECRET_MATERIAL/,
  );
});
