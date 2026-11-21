# Punctum Picture — Unlimited/domain unblock and R4 release implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the complete Punctum Picture public site on Hostinger Unlimited under https://punctumpicture.com, preserving the existing public Studio/portfolio/media/SEO, and separately deliver secure private client galleries (R4) after each release gate is independently satisfied.

**Architecture:** Reuse the existing Node 24/Vinext/SQLite/Sharp candidate and isolated Unlimited HTTPS staging, which already passed synthetic remote E2E. Keep Cloudflare production and D1/R2 as the authoritative live source until data parity, destination qualification, custom-domain ownership, TLS and rollback are established. Resolve Hostinger domain association without treating DNS changes as domain release. Stage public cutover with R4 disabled, then approve R4 activation independently.

**Tech Stack:** GitHub PR #42; Node 24/Vinext; TypeScript/Vitest/Playwright; Hostinger managed Node; SQLite and private media; Cloudflare Worker/D1/R2/DNS; Clerk. Cost increment ceiling: R$ 0.00.

**Spec:** `docs/operations/private-albums-r4/16-original-g01-g24-reconciliation.md`; `docs/operations/private-albums-r4/execution-state.json` (canonical G01–G24); original client album design at https://docs.google.com/document/d/1A4iAg4DRYX23_7p5REn9ojab_oWkIB4o/edit ; `docs/operations/PUNCTUM-ROLLBACK.md`. Existing plan `docs/superpowers/plans/2026-11-20-punctum-r4-final-dod.md` is a prior technical plan, not a fresh environment audit.

## Global Constraints

- This document **does not** authorize production DNS edits, registrar transfer, destructive changes, billing, production data writes, merge to main, changing the live Clerk instance or turning R4 on.
- Preserve live public Worker `punctum-picture-migration`, Studio, Colagem, hero, portfolio, drafts, SEO, every original, backups and customer permissions until verified replacement and authorized release.
- Do not repurpose Conthabil VPS 2135319 or use credentials of other Hostinger accounts. The correct target is the authorized Unlimited account; managed Premium and Unlimited are distinct.
- Never treat old historical gate PASS, local tests, a green workflow, a synthetic QA identity, or a 200 health response as a production release proof.
- No browser dependency in the critical path. Codex reports “Local browser access is unavailable for this chat”. Prefer already-present GitHub Actions preflights, Hostinger/Clerk APIs and existing instrumented synthetic HTTPS QA. Human hPanel/support is a bounded last-mile operation, not a loop of browser retries.
- Keep customer media private: authenticated GET/HEAD only, no public optimizer, Cache-Control private/no-store, no PII/keys in logs, screenshots or GitHub artifacts. Test cross-account A/B isolation and deny old sessions.
- Two releases, two authorizations: (1) public site on Hostinger at unchanged domain with R4 disabled; (2) private albums enabled only after all R4-critical gates and approvals. Staging does not imply either release.
- If a release blocker remains, stop only that unsafe action, preserve evidence and continue independent safe tasks. Do not upgrade any plan without explicit authorization.

## Evidence already established, not to repeat blindly

- At PR #42 head `c15e548eababf37e567a84377223f55bbbe6c609`, status still draft/unmerged, `NO_GO_PRODUCTION`. The 20 Nov ledger `currentCycle20261120AV` reports Unlimited order `1008583103`, account user `u775492464`, staging `https://magic-lime-guanaco-79.hostingersite.com`, Node v24.22.3, isolated HTTPS response 200, 48 remote **synthetic** E2E checks including exact 26,214,400-byte upload, A/B isolation, favorites and downloads, plus SQLite/original hash preservation after same-archive redeploy. Remote backup/restore and real Clerk OTP are **not proven**.
- The older managed Premium Punctum order is `1008628483`, user `u571409090`, with site bound to `punctumpicture.com`; it is a different account/hosting arrangement. Its historical availability is not proof of present domain ownership or registrar status.
- Unlimited account read-only GitHub Actions preflight `44837527835` returned `is_accessible=false` with **no TXT challenge** when trying to associate `punctumpicture.com`. This proves a *linking obstacle*, not its root cause. Current live custom domain responded through Cloudflare, without DNS writes.
- The Hostinger connector visible to this ChatGPT session returned zero websites and no matching order; it is not sufficient to disprove the Punctum account identified by separately scoped repo secrets.
- The original 230 originals / 372,040,548 bytes and earlier D1 state are **historical** parity data, not evidence of a final incremental sync at cutover.
- The existing `docs/superpowers/plans/2026-11-20-punctum-r4-final-dod.md` predates Unlimited remote E2E; avoid recreating QA, a second paid site, or a new stack.
- Official Hostinger guidance: https://www.hostinger.com/support/8947528-how-to-fix-the-domain-already-used-at-hostinger-error/ ; https://www.hostinger.com/support/4771440-how-to-verify-domain-ownership-at-hostinger/ ; https://www.hostinger.com/support/10085905-how-to-connect-a-preferred-domain-name-instead-of-a-temporary-one-at-hostinger/ . DNS/NS changes alone do NOT release a domain bound to another Hostinger site.

## Review Focus

1. **Wrong Hostinger account:** a valid token for the Conthabil or Premium account must never target Unlimited provisioning, DNS or a production secret. Test account/order/domain mismatch fails closed.
2. **Domain attached elsewhere:** if Hostinger reports inaccessible domain with no TXT value, do not invent a DNS challenge or edit nameservers. Test records an explicit provider/support blocker.
3. **Interrupted or oversized 25 MiB upload:** interrupted/duplicate uploads cannot publish a partial original; retry must preserve expected SHA and A/B isolation.
4. **Cutover with concurrent writes:** any new Studio writes during snapshot/sync must be detected and reconciled; DNS rollback alone must not be reported as data rollback.
5. **Private media behind CDN/custom domain:** anonymous/foreign GET and HEAD must serve zero original bytes, never cache shared private data, and logout/rebind must revoke old sessions.

## Task 0 — Freeze and reconcile the exact execution baseline (G01/G02/G21)

**Files:** Read `docs/operations/private-albums-r4/execution-state.json`, `docs/operations/private-albums-r4/86-cycle-au-p0-final-dod-2026-11-20.md`, `docs/operations/PUNCTUM-ROLLBACK.md`, PR #42 changes and CI. Change the ledger only when new evidence exists.

**Interfaces:** Produces immutable SHA+environment matrix for Tasks 1–9.

- [ ] Read `git status --short`, `git rev-parse HEAD`, exact PR head/base and GitHub Actions jobs. Record any changes since `c15e548`; never reset an active worktree or overwrite another agent.
- [ ] Reconcile ledger cycle AV and `publicHostingerCutoverIntent20261120`; separate verified synthetic staging, production proof, and human approvals. Keep the original 24 gate names.
- [ ] Enumerate current ownership boundaries: Cloudflare live, Premium legacy, Unlimited target, Clerk instance, DNS operator and independent reviewer. Bind each API token to the expected order/account before use.
- [ ] Record evidence in a new numbered operational note with source SHA, response code, timestamp, limitation and next action.
- [ ] Verify only the relevant files changed, lint `git diff --check`; commit documentation to an isolated plan/work branch, not main.

## Task 1 — Diagnose domain association without changing DNS

**Files:** Reuse `.github/workflows/punctum-domain-ownership.yml`, `.github/workflows/punctum-dns-preflight.yml`, `.github/workflows/punctum-hostinger-account-preflight.yml`, `scripts/punctum-hostinger-account-preflight.py` and its Python tests. Add a narrow read-only test/extension ONLY if these lack a needed check.

**Interfaces:** Produces domain registrar, authoritative DNS, current Hostinger attachment, Unlimited account check, provider error/request ID and a concrete recovery path.

- [ ] Re-run the **existing** read-only preflight on a pinned SHA with `HOSTINGER_UNLIMITED_API` held in GitHub Secrets. Assert account/order `1008583103`, website `magic-lime-guanaco-79.hostingersite.com`. Never echo the key or use `HOSTINGER_API` from the other account.
- [ ] Query DNS authority and registrar by read-only sources; retain MX, SPF, DKIM, DMARC, TXT, CAA, A/AAAA/CNAME baseline. Distinguish registrar transfer from simply connecting an existing domain to a different hosting account.
- [ ] Determine whether `punctumpicture.com` remains bound to the old Hostinger site, to another account, or is subject to a different ownership policy. Use the **exact** API/GUI response, not the screenshot’s visibility or a guess.
- [ ] If there is a non-empty TXT challenge genuinely issued by Hostinger, record its exact host/value privately and request a narrowly authorized ownership TXT addition (non-routing); verify authoritative readback before continuing. **If no challenge exists, add nothing.**
- [ ] If bound to another Hostinger account, prepare provider-supported release/transfer-of-association request. Support may require title/registrar proof and may free the link. Do not delete the old website or change NS/A records to simulate release.
- [ ] Negative-test account mismatch and no-TXT behavior using `python -m unittest discover -s scripts -p punctum_hostinger_account_preflight_test.py`; expected: mismatch is FAIL-CLOSED, no invented challenge.
- [ ] Exit criterion: Hostinger accepts association to the specific Unlimited destination with provider confirmation, or record a single `BLOCKED_PROVIDER` issue containing the exact missing owner action and ticket, then advance Tasks 3–7 safely.

## Task 2 — Bind the custom domain to the destination, still without routing traffic

**Files:** Existing Hostinger account preflight/workflows; `docs/operations/PUNCTUM-ROLLBACK.md`; domain-readiness evidence. Avoid changes to public HTML and database.

- [ ] Only after Task 1 resolves association, verify the custom-domain mapping points to **the intended Node site**. Hostinger `Connect domain` on existing temporary site is preferable to creating a second deployment or paying for another app.
- [ ] Inventory documented origin IP/target and certificate challenge method. Obtain HTTPS certificate validity for `punctumpicture.com` and `www` where required, using a safe provider-supported validation method that does not switch public traffic early. If issuance cannot occur pre-routing, create a DNS cutover-specific gated TLS plan with measurable downtime/fallback.
- [ ] Check external hostname expectations: Host header, app base URL, Clerk allowed origins and redirects, cookie domain/SameSite/Secure, CSP/CORS/CSRF, sitemap/canonical URLs, robots and CDN behavior. Keep staging `noindex`.
- [ ] Use a controlled hostname override/Host-header test if supported without exposing secrets or breaking TLS; capture exact HTTPS behavior. Do not claim TLS for the custom domain solely from the `.hostingersite.com` certificate.
- [ ] Exit criterion: verified domain association and a tested TLS/origin strategy, without public routing. `NO_GO_PRODUCTION` remains.

## Task 3 — Qualify the full public application on Unlimited (G02/G16/G17)

**Files:** `services/punctum-hostinger-production/candidate-server.mjs`; `services/punctum-hostinger-production/candidate-runtime.mjs`; current build equivalence harness; existing `app/` and `worker/` public tests. No replacement of proven runtime merely to change providers.

- [ ] Create an isolated working copy from an exact SHA in the PR #42 stack. Run `npm ci`, `npm audit --audit-level=low`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build:hostinger:managed-runtime` and `git diff --check`; keep actual counts and exit codes.
- [ ] Run the existing Vinext build-equivalence proof, SSR smoke, Node 24 managed tests and `npm run test:e2e` on synthetic QA. Record real skips. Existing 48 remote synthetic checks are baseline, not a command to repeat without a changed SHA/config or new question.
- [ ] Verify **full** public experience in remote staging: home/hero, portfolio, Studio auth and edits, Colagem, drafts, archive, image resizing, contact, scheduled jobs, mobile, canonical/meta/robots and public assets. Compare representative bytes/snapshots to live Cloudflare baseline.
- [ ] Verify bound physical limits at Unlimited (2 cores, 3072 MiB, 50 GB, 120 processes as historically reported), real current free budget, file and request concurrency, p95/p99, cold-start, log availability, restart/redeploy behavior and costs without upgrade. Measure Node criterion explicitly; do not pretend Worker 10ms CPU maps literally to Node.
- [ ] Exit criterion: remote candidate public parity, acceptable latency/capacity and no unapproved increase in cost. If G17 remains FAIL, quantify actual threshold and name the approval needed.

## Task 4 — Real Clerk authentication and private-galleries QA (G03–G14)

**Files:** `tests/integration/clerk-r4-security-matrix.spec.ts`, `tests/integration/clerk-pilot.spec.ts`, `worker/auth/clerk-auth.ts`, `worker/client/clerk-pilot.ts`, `worker/api/admin-auth.ts`, existing browser E2E. Do not invent new auth service or switch provider blindly.

- [ ] Confirm the actual authorized Clerk instance and test clients/admin in QA; historical dashboard indicated seven-day maximum web session and email OTP but did not show a real complete user journey.
- [ ] Prove OTP sign-in, authorized admin and client binding, JWKS issuer/audience/sid, logout, expiry, disable/rebind, old-cookie revocation and fail-closed data-store errors on the real QA origin. Use synthetic client identities and sanitized recordings; do not retain OTP, cookies, personal photos or secrets.
- [ ] Execute admin create/edit/upload/cover/reorder/publish/archive/deny plus client login/library/lightbox/favorite/download/deny. Verify cross-client A/B, anonymous access, GET/HEAD zero private bytes through origin/CDN, cache-control, robots and private optimizer bypass.
- [ ] Run 25 MiB exact, 25 MiB+1, interruption, repeated intent, concurrent upload, invalid MIME and SHA, new deployment and restart. Prove byte hash roundtrip and SQLite foreign-key consistency.
- [ ] Record any Access→Clerk contract deviations requiring an explicit security/product decision; do not mark G07/G08 PASS from the older Access OTP evidence.
- [ ] Exit criterion: controlled remote positive/negative proof at exact release SHA, documented auth policy and zero unauthorized bytes. No real-client activation yet.

## Task 5 — Actual data parity, repeatable backups and reversible migration (G05/G18/G23)

**Files:** Existing managed import/verify adapter and `scripts/r4-g18-local-sqlite-restore-demo.mjs`; `docs/operations/PUNCTUM-ROLLBACK.md`; current D1/R2 and SQLite manifest tooling.

- [ ] Export *current* authorized live source snapshot with encryption and size/checksum inventory, leaving existing 230-object/372-MB values labeled **historical**. Enumerate D1 rows, albums, edits, drafts, favorites, originals, versions, scheduled jobs and pending intents; avoid outputting media or identities into CI artifacts.
- [ ] Import into isolated authorized destination. Compare every storage key, size, SHA-256, foreign key, publication status, ACL and sample public visual semantics. Ensure no unauthorized private media appears under public assets.
- [ ] Prove daily backup actually runs, persists outside deploy replacement, and has documented retention/cost; run a **disposable** remote restore of DB+media, integrity check, rotation/invalidation of recovered sessions and full app reopen after restart/rebuild.
- [ ] Design and rehearse an explicit final-delta/freeze or durable replay strategy for writes between last export and DNS switch. State RPO/RTO in measured terms. DNS rollback does **not** rewind SQLite/Cloudflare writes; ensure data convergence before permitting any reversible traffic switch.
- [ ] Restore **previously verified release version and config** in isolated QA, then reopen Studio/Colagem, private deny matrix and media; demonstrate rollback of app, data semantics and sessions without restoring over an occupied production database.
- [ ] Exit criterion: G18 and G23 each have their own remote evidence, not a shared claim; no missing/doubled assets or data-loss window left unexplained.

## Task 6 — Independent assurance and human evidence (G15/G19/G20/G21)

**Files:** `docs/operations/private-albums-r4/g19-independent-review-package-2026-11-20.md`, `docs/operations/private-albums-r4/11-lgpd-decisions.md`, original gate ledger, screenshot/a11y harness.

- [ ] Assign an independent technical reviewer to the **exact release SHA**, focusing on admin/client RBAC, IDOR, OTP/JWT/sid, private cache/media, path traversal, concurrent upload, rate limits, rotation, logging, backups and secrets. Every P0/P1 must be closed and re-reviewed; an agent cannot sign its own G19.
- [ ] Perform physical Android TalkBack and iOS VoiceOver client/admin journeys; keyboard, focus, Escape, 200% zoom, reduced-motion, touch, mobile 320–1440 px and contrast. Distinguish emulation evidence from real devices.
- [ ] Present Maria, as studio controller, decisions on purpose/legal basis, retention, subject requests, deletion/export, backups, processors, incident response and safe image delivery. Record express dated approval; do not invent approval or a legal retention period.
- [ ] Read CI on the **current** Git commit; review all stacked PRs and overlapping migration code before integration. A green old SHA is not G21.
- [ ] Exit criterion: G15/G19/G20/G21 backed by dated artifact, owner/reviewer and source SHA or explicitly BLOCKED.

## Task 7 — Public-site release to Hostinger, R4 stays OFF (G16/G17/G22/G23)

**Files:** Existing deployment workflows, Cloudflare DNS readback/runbook, Hostinger candidate release manifest and rollback documentation. Do not change production until a separate, explicit owner release decision is captured.

- [ ] Assemble a release packet: exact approved SHA, public baseline, origin/TLS status, current data manifest, backup, tested rollback, flags, cost, DNS records, Clerk redirect/origin verification, on-call and health checks. Keep `PRIVATE_GALLERIES_ENABLED=false`.
- [ ] Request **specific** approval for public-site cutover, distinct from merge or private-gallery activation. Verify code integration path is safe: `main` workflows may automatically deploy and migrate D1; a merge is not harmless.
- [ ] When approved and all P0 gates pass, execute one authorized cutover with a snapshot/final delta and explicit clock/TTL and target values. Preserve authoritative DNS provider and unrelated MX/SPF/DKIM/DMARC/TXT records; do not infer an IP or alter nameservers by habit.
- [ ] Monitor HTTPS certificate/hostname, 200/3xx/4xx, real SSR, Studio read/write, public gallery/assets, canonical/SEO, image hashes, cookie auth, errors and jobs; verify both apex and www from independent clients.
- [ ] If smoke/traffic/data criteria fail, invoke tested rollback with explicit treatment of post-cutover writes and customer sessions. Do not pronounce success until both readback and invariants pass.
- [ ] Exit criterion: public Hostinger origin serves the unchanged domain with complete public functionality, provenance and rollback. R4 remains OFF and separately NO_GO until Task 8.

## Task 8 — Independent activation of the R4 product (G03–G24)

- [ ] Validate all 24 *canonical* gates on their required current environments; attach STATUS, OWNER, SHA, COMMAND, ENVIRONMENT, EVIDENCE, LIMITATIONS, NEXT ACTION. Do not erase failed or blocked historical attempts.
- [ ] Obtain express owner authorization for private client galleries with production-ready Clerk, LGPD, security and accessibility evidence and an audit trail distinct from public cutover.
- [ ] Apply narrowly scoped additive migrations/flags under authorized deployment; default OFF until final controlled activation. No sample credentials/media in production.
- [ ] Run a real owner-approved pilot with a test client: first login, assigned published gallery, favorite, authorized original download, logout, revocation, foreign-client deny, restart and restoration observation.
- [ ] Close with status `COMPLETED_VERIFIED` only if all relevant gates and approvals are actually proven. Otherwise `PARTIAL_VERIFIED / NO_GO` with exact remaining blockers.

## Task 9 — Durable handoff and anti-loop guard (G24)

- [ ] Write a short canonical recovery handoff in `docs/operations/private-albums-r4/`; update `execution-state.json` without rewriting historical evidence; link precise GitHub CI/artifact and Hostinger support ticket.
- [ ] Synchronize the final reviewed decision to Drive Sgtmenezes/Punctum Picture; record verified Engram entry and PersistFlow checkpoint only if write and readback succeed. Never claim persistence/takeover merely from a request.
- [ ] Track the **single next external action**: who can release Hostinger association or provide a real challenge. Do not ask the user to repeat login/browser trials if the same provider response persists.
- [ ] Final report: `RESULT / CHANGES / VALIDATION / GATES / BLOCKERS / COST / PRODUCTION / NEXT_SAFE_ACTION`. Mark old findings as history and unverified statements as hypotheses.

## Dependency order and stop rule

**Critical path for the public website:** Tasks 0 → 1 → 2 → 3 + 5 + 6 → 7. Tasks 3, 4, 5 and 6 can progress independently while Hostinger domain ownership is pending. Task 8 is an **independent release**, not a prerequisite to safely planning the public cutover, but the public release must preserve R4 and its existing data/flags.

**Immediate next action:** Use the current Unlimited API and existing read-only workflow to identify the precise domain association state. If provider response remains `is_accessible=false` with an empty TXT challenge, use the Hostinger-supported old-site-release or support ownership process. Do not touch Cloudflare DNS to “unlock” it; it cannot solve an association conflict. Resume existing completed Unlimited staging evidence instead of starting from zero.

**Current verdict at this plan's baseline:** `PARTIAL_VERIFIED / NO_GO_PRODUCTION`. This is a plan and contains **no** execution authorization for release.