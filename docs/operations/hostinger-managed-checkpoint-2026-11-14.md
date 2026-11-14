# Punctum managed Hostinger checkpoint — 2026-11-14

Destination selected by the user: existing managed Node site `aliceblue-locust-999458.hostingersite.com`, account `u571409090` (Conthabil). VPS 2135319 is a prior rehearsal and does not prove this destination.

## Verified takeover

- Candidate branch starts from `b629913cb0087360e66b7fb6f7c97b3c2e2323d9` (draft PR #38); dedicated integration branch `codex/punctum-managed-production-20261114`.
- Inventory commit `1869a4a58b9188a585b853a76499c5e042e55b5b`, Actions run `43608964994`: exact managed site, Node24/npm/other, QA entry `services/punctum-hostinger-node/server.mjs`, seven QA environment keys, latest build `01a1d5d8-8a9b-702c-a97d-0a6cddccdbb8` completed.
- Active HTTPS health reports source `7039dc5271e4472d6163874c676cd8d676c47aa5`, boot `9986c375-4830-4082-90f4-d6a140f70075`, noindex. This is synthetic QA; it has not imported the production library.
- Retained QA archive: `punctum-node-candidate-311371fbd4cd41d080709aafc81aeaae.zip`, historical SHA256 `d04a49c5276b0d6ce0068243d48029259a20630c478d3b16d1bd67726d713a36`. Preserve the original QA database and this archive.

## Implementation under verification

Reuses the production candidate, persistent SQLite/original adapters, Sharp and scheduled bundle. Managed mode binds the provider port and an exact allowed hostname. Read-only D1/R2 export is encrypted with AES-256-GCM before entering the source ZIP. The key travels only through managed environment settings. Import authenticates the package before extraction, rejects unsafe archive entries, verifies SQLite and every object, and atomically initializes a private home directory. Rebuilds preserve an already initialized database. Source changes after the snapshot still require final reconciliation.

Private destination: `/home/u571409090/punctum-managed-storage/punctum-managed-private-20261114`; absent-path initialization only. No source mutation, public DNS change or Cloudflare shutdown is included. Authentication flags remain legacy until real Clerk login and backend authorization are proven. Managed failure recovery rebuilds the retained synthetic QA archive, rotates only its disposable credentials, and preserves the imported private directory.

## Evidence and limits

- Local typecheck PASS for the working change. Initial native Linux import tests: 2 PASS (wrong key, original hashes, preservation of later DB writes, public destination rejection). Final CI remains required after edits.
- New Conthabil plugin has no callable tools in this session. Authorized existing GitHub workflow credentials provide the scoped Hostinger API path; invalid default `gh` authentication was recovered through the existing credential helper without printing it.
- CoS public-docs research: owner `01a1da2a-ce29-71a2-ac68-d03d85c8c473`, run `93aae617-dcd7-47cd-a6f8-dd7f239145bc`, worker-1, reports `89d59078`/`061905e4` consumed and acknowledged. No account access or changes. Gemini discovery returned an empty report and supplies no acceptance evidence.
- Official Hostinger documentation supports Node24 and Node cron, but does not establish private SQLite backup coverage. Actual managed restart/rebuild, private backup restore, cron activation and upload/R4 tests remain required.
- Public production remains Cloudflare. Public cutover/final write freeze requires point authorization after all critical gates pass. Existing authorization covers the five Clerk CNAMEs and temporary synthetic Clerk users; email/password was selected for launch.

Next operation: run the managed verification workflow; only after green evidence, set the request to `prepare-managed` with the verified commit. The workflow rejects deployment if code differs from that revision. Do not mistake the temporary-origin rehearsal for completed migration.
