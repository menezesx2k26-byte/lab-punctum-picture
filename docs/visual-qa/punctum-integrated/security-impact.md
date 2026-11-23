# Security impact and review

## PR #13

- Changed `worker/utils/rate-limit.ts` and added `tests/integration/rate-limit.spec.ts`; no schema migration, new dependency, credential, or remote binding change.
- Uses one conditional D1 UPSERT with `RETURNING`; atomic transition admits only while the stored request count is below max, resets an expired bucket to 1, and leaves a saturated row unchanged. A missing returned row is denied as 429.
- Race before correction: concurrent callers could all pass a stale SELECT. The regression reproduced eight admissions for a limit of two. Independent review then identified write amplification from the initial atomic form; the final SQL `WHERE` guard prevents a row update after the limit is reached.
- Local security suite covers concurrency, no counter growth after repeated 429, and expiry reset. Independent re-review found no remaining issue in SQL/bind order/test. Full local suite passed 41 files / 166 tests, typecheck, lint and build; final CI must be recorded before CAPA closure.
- `npm audit --json` on the PR #13 clean install reported 0 known advisories at 2026-10-25 04:27 UTC. This is point-in-time registry evidence, not proof of vulnerability absence.

## PR #14

Only PR #14 owns the mobile collage and dependency refresh. At SHA `bddeec3a74a341f9002d9e9bb3b3253fdb67c878`, CI run `40161708958` succeeded; production dependency audit was zero. Full audit retained 13 development-toolchain advisories (8 high, 5 moderate). Code was not cherry-picked into PR #13.

## Environment boundary

Cloudflare, Hostinger, Access and PersistFlow operations were read-only; production remained unchanged. The historical isolated QA pilot used a synthetic HMAC cookie exclusively in QA, so identity verification remains `BLOCKED_REAL_OTP`. No cross-client bypass was found in the independent read-only source review summarized in the PR #13 homologation record. No customer-impact claim or exploit finding is made.
