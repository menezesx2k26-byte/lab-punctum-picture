# Punctum authentication homologation implementation plan

**Goal:** select and verify authentication without Workers Paid, updating PR #13 without changing production.
**Spec:** owner mission, 2026-10-24; existing private album design and deployment guards remain binding.
**Baseline:** branch `agent/private-client-albums-20261022`, HEAD `5b5e1934c62bcb7f0876afb406990522fcbfd3a9`.

## Constraints

- No merge/main deployment, billing changes, resource deletion or PersistFlow changes.
- Preserve public lens/carousel/self-portrait/portfolio; D1 authorization and private R2 originals remain authoritative.
- Keep PBKDF2-SHA256 at 310000 iterations, existing hashes compatible, bridge disabled.
- Current-source evidence takes precedence over historical CI; OTP must be real to close identity QA.

## Tasks

- [x] Identify HEAD, diff, workflows, Hostinger and Access inventory. Hostinger target serves PersistFlow; do not reuse it. Access Free exists; QA application and OTP IdP absent.
- [x] Add failing regressions for mandatory JWT expiry/application identity; implement strict claims and failure handling.
- [x] Add failing regressions for bridge cross-process/restart replay and concurrent request admission; implement persistent atomic nonce reservation, bounded requests and safe startup.
- [x] Add failing regressions for secret segregation and streamed response bounds; implement fail-closed Worker adapter.
- [x] Run local baseline/final typecheck, lint, unit/integration tests, Node service tests and build.
- [x] Configure only dedicated QA Access app; observe real provider UI and run synthetic domain/D1/R2 pilot. Record distinction from real identity.
- [ ] Complete real OTP and negative/provider checks through secure owner authentication; do not read email codes or substitute synthetic identity.
- [ ] Review final diff, push with branch-head check, verify CI, update PR body and versioned report/cost/rollback/DoD.
- [ ] Resolve newly verified lockfile advisories with compatible updates, repeat audit/full verification/CI/isolated QA; never use forced downgrades or unrelated framework migrations.

## Review focus

- Signed JWT without expiry or wrong token type must never create a session.
- Concurrent incomplete bodies must not bypass the bridge admission limit.
- Captured signed requests must remain unusable across process restart/replicas sharing the nonce store.
- Unknown, disabled and revoked clients stay denied without disclosing account existence.
- Provider outages and oversized responses fail closed without local PBKDF2 fallback or secrets in logs.

## Execution ledger

- Ruling: execute inline and continuously under the owner's autonomous mission; no additional plan approval is needed.
- Ruling: use an independent clone in an approved workspace; preserve all pre-existing checkouts. A clone on D: could not be used through the connector's approved roots and was left untouched.
- Runtime readback: Hostinger `/` and `/healthz` report `service=persistflow`, `authority=file`, `durable=true`; no mutation performed.
- PersistFlow checkpoint service returned internal error on run creation; do not claim continuity active.
- 8dbe294 pushed and read back on PR13; local final 164 + 10 tests/typecheck/lint/build PASS. CI 40123116360 PASS; isolated preview 40123168662 PASS for domain (70 D1 rows/30 R2 objects), partial-access-otp-required.
- Ruling: extend the security pass to dependencies after fresh npm audit confirmed 20 affected package entries (1 critical,12 high,7 moderate). Apply supported patch/minor versions and compatible transitive updates; do not infer exploitation of the deployed app from package advisories. No public deploy.
- Dependency fixes locally verified: npm audit zero; typecheck/lint/build, 164 Worker + 10 Node tests and drizzle-kit check PASS. New CI/QA required for updated lockfile.
