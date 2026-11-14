# Corrective and preventive action register

| CAPA | Related NC | Correction | Prevention / effectiveness check | Gate |
| --- | --- | --- | --- | --- |
| CAPA-001 | NC-001 | Replaced check-then-update with conditional atomic D1 UPSERT/RETURNING; expired windows reset atomically; saturated buckets are not updated after max | Concurrency barrier test requires 2 admissions, 429 thereafter, stable count at max; expiry reset test; full suite and final PR #13 CI | Targeted tests, independent re-review and full local suite (41 files / 166 tests, typecheck/lint/build) PASS; CI 40162327230 on 6bd4410 and CI 40162525188 on 20984fd passed; current resource/readback docs need their own CI |
| CAPA-002 | PR #14 NC-001 | Changed collage story title from h4 to h3 and aligned scoped CSS | SSR regression test plus current browser reading order required | Code/CI PASS; browser still BLOCKED |
| CAPA-003 | PR #14 NC-002 | Wrapped collage nav and set 48 px minimum link dimensions | CSS contract test; actual viewport/zoom/touch measurement still required | CSS contract PASS; browser still BLOCKED |
| CAPA-004 | PR #14 NC-003 | Added isolated Node/Vitest config and included TSX SSR test in CI | CI run `40161708958` success at `bddeec3a74a341f9002d9e9bb3b3253fdb67c878` | CI PASS; manual QA still BLOCKED |
| CAPA-005 | PR #14 dependency alerts | Updated compatible runtime and toolchain packages; no forced major migration | `npm audit --omit=dev` has zero; full audit retains 13 dev-toolchain advisories; review majors before changing | Production dependency audit PASS; development alerts remain |

This record does not claim formal AS9100D CAPA closure. NC-001 remains open until independent review and final SHA CI are green; visual NC effectiveness remains open until browser evidence exists.
