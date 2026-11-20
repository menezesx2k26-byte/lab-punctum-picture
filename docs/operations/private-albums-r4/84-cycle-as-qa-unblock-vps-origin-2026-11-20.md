# Cycle AS — GitHub QA unblocked; VPS origin still not approved

Date: 2026-11-20 (America/Sao_Paulo)  
Project: `menezesx2k26-byte/lab-punctum-picture`, PR #42  
Status: **PARTIAL_VERIFIED / PRODUCTION_NO_GO**.

## Verified changes and evidence

- `c5de36420bbfca33ce8a0bd62a6e097b91b3917b` widened the `hostinger-node-qa` PR-branch condition to both `agent/hostinger-*` and `cursor/r4-*`. Previously the QA job had been skipped.
- After that change, [run 44772044801](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44772044801) executed the job, surfacing 39 passing tests and one stale assertion `26 !== 23` in `managed-bootstrap.test.mjs`.
- `c7a479860ee03bc25d663cec0cda8fdf433a7748` replaced the hard-coded 23-table expectation with comparison against the actual SQLite schema (excluding `sqlite_%`) plus a lower-bound guard against loss of tables.
- [CI run 44772621541](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44772621541) for commit `c7a4798`: **verify SUCCESS; hostinger-node-qa SUCCESS**. This proves tests on the PR checkout, not a production deployment.

## VPS observations (read-only except SSH authorization)

- The dedicated `VPS Hostinger MCP` connection enumerated VPS `2135319` (`srv2135319.hstgr.cloud`; IPv4 `179.236.241.135`) as running on Ubuntu 24.04 / Docker, 2 vCPU and 8 GiB RAM. Three distinct Hostinger Composio account connections returned empty VPS lists; the credentials are scoped differently.
- The authorized public SSH key list initially did **not** match the existing agent private key on MARTHA. The agent's matching **public** key was added through the VPS management API; batch-mode SSH from host MARTHA / user ODETE to `root@179.236.241.135` then succeeded. No private key or token was transmitted in the project records. This changed the authorized-key list and should be audited or revoked once it is no longer required.
- `docker ps` showed `punctum-production-candidate` running and **healthy**, on image `punctum-hostinger-candidate:20261114-clerk`. It is an older candidate image and **not proof that the PR #42 SHA was deployed**. Multiple non-Punctum Docker services share the VPS and must remain undisturbed.
- Inside that existing candidate container, requests to `http://127.0.0.1:3025/api/health` and `http://127.0.0.1:3025/` both returned **HTTP 200**. This is an **internal origin smoke check**, not browser/remote-certificate acceptance.
- Caddy `validate --config /etc/caddy/Caddyfile` returned **Valid configuration** (plus formatting warning). Nevertheless, an external HTTPS connection using `punctumpicture.com` as SNI and resolving it to `179.236.241.135` failed at TLS handshake; response code 000. A syntactically valid Caddyfile is not equivalent to a valid domain certificate or public origin.
- Public `https://punctumpicture.com/api/health` returned **HTTP 200 via Cloudflare**. The public production Worker was **not** reconfigured.

## Gates not promoted

- **G05, G07, G08 and G18** still require remote/real integration evidence (25 MiB upload, real OTP/Clerk session, real revocation, backup restore where applicable), beyond isolated tests.
- **G15, G19, G20 and G22** require physical accessibility, independent security, legal/controller approval and explicit deployment authorization respectively.
- **G17** remains **FAILED_VERIFIED** on the previously measured *deployed Cloudflare Worker* CPU p99 156.5 ms, against a 10 ms criterion. It is not a measurement of the PR candidate.
- **G21** code CI can now be considered successful on `c7a4798`, but independent PR review and merge are still open. A subsequent documentation-only commit requires checking its own tip CI.
- No production D1/R2 writes, DNS cutover, Worker deployment, Git merge, container restart, data restoration or TLS config mutation were performed as part of this cycle.

## Safe continuation

1. Verify the current PR HEAD and its own CI. Distinguish exact commit CI from earlier successful runs.
2. Use the recovered VPS access for *isolated non-production QA only*. Do not conflate image `20261114-clerk` with current R4 source.
3. Qualify an HTTPS origin for a **staging hostname** and test full Clerk login, remote upload, restore, browser access and rollback while preserving shared VPS services and production traffic.
4. Obtain independent security and controller sign-offs, explicit cutover authorization and repeatable rollback evidence. Only then consider a scheduled domain migration.

**Production verdict:** `NO_GO`. Passing CI and two internal HTTP 200 responses remove useful engineering blockers but do not satisfy the required public-origin and authorization gates.
