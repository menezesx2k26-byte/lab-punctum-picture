# Initial configuration inspection

This software inspection is adapted from AS9102C concepts; it is not an official FAI form or certification.

## FAI-1 — identity

Product: Punctum Picture website and private client-gallery feature. Two separate GitHub draft PRs were inspected against `main` `af55e1526b731be099e804335eb143d2b5cfa95e`: PR #13 private albums and PR #14 mobile collage. Branch names and starting/current HEADs are in `configuration-baseline.md`; final PR heads are authoritative in GitHub and `evidence-manifest.json`. Environments observed: Linux local worker/Vite build, local Miniflare D1/R2, read-only Cloudflare/Hostinger inventory, and historical isolated QA run. No production mutation occurred.

## FAI-2 — materials, processes and tools

| Characteristic | Source / version | Result |
| --- | --- | --- |
| Node | `v24.19.0` | Local tests/build ran |
| Package lock | PR #13 branch `package-lock.json`; clean `npm ci --no-audit --no-fund` | 541 packages installed |
| Worker SQL | `migrations/0003_operations.sql` defines `rate_limit_buckets` with primary key on `bucket_key` | Atomic D1 UPSERT uses existing schema; no migration change |
| Local test process | `vitest.config.ts`, `@cloudflare/vitest-pool-workers@0.23.0`, Miniflare | 41 files / 166 tests passed |
| Build process | Vite/Vinext build | Completed; nonfatal source-map and dynamic route-classification warnings |
| Cloudflare resources | Read-only APIs; names/IDs in `resource-authority-matrix.md` | No remote write/deploy/migration |
| Browser measurement | Managed browser requires prepaid minutes | Not run under R$0 incremental limit |

## FAI-3 — measured characteristics

| Characteristic | Measurable acceptance | Measurement and evidence | Result |
| --- | --- | --- | --- |
| Rate limit under contention | For N=8 and max=2, 2 fulfilled / 6 rejected with 429 | `tests/integration/rate-limit.spec.ts`, local Miniflare; RED before patch was 8 fulfilled, GREEN after patch passed | PASS local |
| Expiry reset | Expired row admits one request and returns count to 1 | Same integration spec, local Miniflare | PASS local |
| Full PR #13 code checks | TypeScript, ESLint, Vitest and build succeed | `npm run typecheck && npm run lint && npm test && npm run build`; 41 files/166 tests; Linux local | PASS local; final CI pending |
| Collage links | Semantic h3 and CSS minimum 48 × 48 px contract | PR #14 SSR/CSS tests and CI `40161708958`; no computed browser boxes | PASS static / BLOCKED visual |
| Real client identity | OTP, RS256 JWT claims and app session proven | No current OTP/JWT/session evidence | BLOCKED_REAL_OTP |
| Cross-client zero-byte denial | HTTP denial plus no private object bytes for A→B | Prior synthetic-identity QA only; no current real identity run | BLOCKED for current provider gate |
| Mobile responsiveness | No overflow at 8 specified widths/200% zoom | No current browser viewport, DPR, screenshot or dimensions | BLOCKED |
