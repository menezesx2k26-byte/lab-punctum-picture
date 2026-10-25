# Nonconformity register

## NC-001 — non-atomic shared rate-limit check

| Field | Record |
| --- | --- |
| Requirement | ALB-010 (abuse control), OPS-001 (current CI); worker shared rate limit contract |
| Severity / status | P1 (availability/quota risk identified by independent review) / corrected locally; effectiveness pending final full CI and reviewer acceptance |
| Environment / configuration | Local Cloudflare Workers Vitest pool with isolated Miniflare D1; PR #13 branch; baseline `dd8831fe16a5a14b8ab47e22bb4e05d84183e216`; code fix commit `87329b1ead652dc2569a8ca881abed7e745ffe0c` |
| Scenario | Eight concurrent calls to one previously unused bucket, configured maximum 2 |
| Expected | Exactly 2 calls resolve; 6 return `AppError` status 429; saturated counter remains at 2 and later 429s do not update it |
| Observed before patch | RED test: all 8 calls resolved. Existing SELECT read the empty bucket in every call; separate UPSERTs each initialized count to 1. |
| Root cause | Read/compare/write is a multi-statement race. First-use requests overwrite one another with `request_count=1`; established buckets can also admit simultaneous calls based on the same count. |
| Containment | No remote action. Fixed on the PR #13 code branch only. |
| Correction | One D1 `INSERT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING` atomically increments or resets the window only while below max. Saturated buckets return no row and are rejected without a row update. |
| RED/GREEN proof | Initial regression was RED (all 8 admitted). Initial atomic implementation was green but independent review found blocked attempts still wrote. After adding the SQL `WHERE` guard, `npx vitest run tests/integration/rate-limit.spec.ts` passed 2/2; the test asserts count stays at 2 after eight concurrent calls and a ninth blocked call. Final full suite passed 41 files / 166 tests at 2026-10-25 04:31 UTC. |
| Prevention | Keep admission and counter mutation in one conditional atomic D1 statement; the regression barrier synchronizes the first database result across all contenders and checks post-limit stability. |
| Independent validation | Reviewer re-reviewed amended SQL and eight binds, confirmed capped transitions/expiry reset and no row update at max, and found no remaining P1 in the diff. Final CI must still pass on the pushed SHA. |
| Residual | Local Miniflare behavior has not been retested against a current remote Worker; no evidence of exploitation or customer impact. |

No other new code nonconformities were confirmed in this turn. Browser, Access, quota and infrastructure gates are blocked/unrun, not code failures and not closed CAPAs.
