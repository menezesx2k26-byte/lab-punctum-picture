# G19 independent review package — cycle AK/AL (2026-11-20)

**Status:** prepared for Bugbot / independent security reviewer. **Not** a G19 PASS.

**Cycle AP addendum:** the executing agent does not accept G19. R1 is still `BLOCKED_API_GAP` after a fresh Backend API read, and R3 is `AWAITING_A2` with no isolated Node origin. Package for the reviewer: `81-cycle-ap-qa-unblock-2026-11-20.md`.

**Cycle AQ addendum:** this agent does not accept G19. OpenAPI `bapi/2026-08-20` confirms `GET /v1/instance` has no maximum lifetime. The custom connection `custom_punctum_picture_administra_o_stamen-form` is ACTIVE and returns 401 on the Hostinger API, so R3 stays `AWAITING_A2`. Local CI-equivalent suites passed and are not a remote pass. Package: `82-cycle-aq-qa-unblock-2026-11-20.md`.  
**PR:** https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/42  
**Base:** `codex/punctum-r4-goal-20261115` @ `f0f951d9f30225d717c1f82df7661889e287ec34`  
**Branch:** `cursor/r4-aj-security-phase-b-ae72`

## Diff summary (security-relevant)

| Area | Change | Intent |
| --- | --- | --- |
| `worker/auth/clerk-auth.ts` | `sid:` revocation TTL 14d; `tk:` 24h; conflict extends only; logout extracts `sid` from raw token | Close post-24h Clerk session replay after logout |
| `worker/client/clerk-pilot.ts` | Require `sessionId`; check revocation; fail 401/503 | Align opt-in pilot with main verifier contract |
| `package.json` | `next` / `eslint-config-next` 16.4.6 | Clear Next GHSA that failed AJ tip CI audit |
| `services/punctum-hostinger-production/managed-d1-export.mjs` | Serialize TEXT via `typeof`+`hex` (not truncated JS strings) | Preserve embedded NUL / UTF-8 in reverse export |

Prior AJ (already on base tip before this PR): Clerk rebind bumps `session_version`; revocation/logout fail closed on missing table / D1 errors; Trocar conta signs out Punctum before Clerk.

## Test matrix for reviewer

| Suite | Scope | Result (local) |
| --- | --- | --- |
| `clerk-r4-security-matrix` + pilot + admin rotation + client security | Clerk RS256, rebind, revocation, logout, sid TTL, CSRF | 20/20 PASS |
| Full Worker Vitest | Regression | 326/326 PASS |
| Hostinger production `*.test.mjs` | Managed Node export/restore/security | 69 pass / 0 fail / 1 skip |
| G05 local 25 MiB proof | Exact 26214400 + SHA-256 | PASS_LOCAL only |
| G18 local SQLite demo | 2 clients / 2 galleries / 10 objects + NUL text | PASS_LOCAL_SYNTHETIC |

## Residual risks (do not clear without evidence)

1. **Upstream Clerk session revoke** — local `sid:` deny-list is necessary but not a substitute for Clerk Dashboard/API session revoke + contractual max lifetime ≤ 14d.
2. **Provider logout UX** — Trocar conta hardened; generic logout may leave Clerk browser session until separate signOut; needs real browser QA.
3. **Managed Hostinger remote** — aliceblue hostname gone; apex Node listed; no authorized remote private-media QA this cycle.
4. **G05/G17** — remain FAIL for remote/cost.
5. **Historical optimistic `gates` object** in `execution-state.json` — treat cycle overrides as authoritative; do not promote from local PASS alone.

## Reviewer asks

- [ ] Confirm sid TTL / logout key collection / pilot sid gate are sufficient for P1 close **or** request remaining changes.
- [ ] Confirm no secret material in diff.
- [ ] Sign off or request-changes on exact PR HEAD SHA after CI green.
- [ ] Do **not** authorize production merge/cutover (G22) from this package alone.
