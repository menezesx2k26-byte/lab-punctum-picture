import assert from "node:assert/strict";
import test from "node:test";
import { parseDevProofInputs } from "./clerk-dev-r4-templates-proof.mjs";

const devPk = "pk_test_" + Buffer.from("causal-leopard-4871.clerk.accounts.dev$").toString("base64");
const prodPk = "pk_live_" + Buffer.from("clerk.punctumpicture.com$").toString("base64");
const disguisedProdPk = "pk_test_" + Buffer.from("clerk.punctumpicture.com$").toString("base64");

test("parseDevProofInputs accepts valid Clerk Development inputs", () => {
  const parsed = parseDevProofInputs({
    CLERK_SECRET_KEY: "sk_test_example1234567890",
    CLERK_PUBLISHABLE_KEY: devPk,
    PUNCTUM_CLERK_DEV_ADMIN_USER_ID: "user_admin_12345",
    PUNCTUM_CLERK_DEV_CLIENT_USER_ID: "user_client_67890",
  });
  assert.equal(parsed.issuer, "https://causal-leopard-4871.clerk.accounts.dev");
  assert.equal(parsed.adminUserId, "user_admin_12345");
  assert.equal(parsed.clientUserId, "user_client_67890");
});

test("parseDevProofInputs refuses Clerk Production keys and production issuer", () => {
  assert.throws(
    () =>
      parseDevProofInputs({
        CLERK_SECRET_KEY: "sk_live_example1234567890",
        CLERK_PUBLISHABLE_KEY: prodPk,
        PUNCTUM_CLERK_DEV_ADMIN_USER_ID: "user_admin_12345",
        PUNCTUM_CLERK_DEV_CLIENT_USER_ID: "user_client_67890",
      }),
    /PROOF_PRODUCTION_KEY_FORBIDDEN/,
  );

  assert.throws(
    () =>
      parseDevProofInputs({
        CLERK_SECRET_KEY: "sk_test_example1234567890",
        CLERK_PUBLISHABLE_KEY: disguisedProdPk,
        PUNCTUM_CLERK_DEV_ADMIN_USER_ID: "user_admin_12345",
        PUNCTUM_CLERK_DEV_CLIENT_USER_ID: "user_client_67890",
      }),
    /PROOF_NON_DEV_ISSUER_FORBIDDEN/,
  );

  assert.throws(
    () =>
      parseDevProofInputs({
        CLERK_SECRET_KEY: "sk_test_example1234567890",
        CLERK_PUBLISHABLE_KEY: devPk,
        PUNCTUM_CLERK_DEV_ADMIN_USER_ID: "user_same_12345",
        PUNCTUM_CLERK_DEV_CLIENT_USER_ID: "user_same_12345",
      }),
    /PROOF_DISTINCT_USERS_REQUIRED/,
  );

  const ephemeral = parseDevProofInputs({
    CLERK_SECRET_KEY: "sk_test_example1234567890",
    CLERK_PUBLISHABLE_KEY: devPk,
    PUNCTUM_CLERK_DEV_EPHEMERAL_USERS: "1",
    PUNCTUM_CLERK_DEV_ORG_ID: "org_3MNtO768q73RF4fdLpOvHHLrMEC",
  });
  assert.equal(ephemeral.ephemeralUsers, true);
  assert.equal(ephemeral.devOrganizationId, "org_3MNtO768q73RF4fdLpOvHHLrMEC");

  assert.throws(
    () =>
      parseDevProofInputs({
        CLERK_SECRET_KEY: "sk_test_example1234567890",
        CLERK_PUBLISHABLE_KEY: devPk,
        PUNCTUM_CLERK_DEV_EPHEMERAL_USERS: "1",
        PUNCTUM_CLERK_DEV_ORG_ID: "invalid-org",
      }),
    /PROOF_DEV_ORG_ID_INVALID/,
  );
});
