# Cycle BE: sitemap parity and bounded Linux QA

2026-11-21, America/Sao_Paulo. `PARTIAL_VERIFIED / PRODUCTION_NO_GO` for both releases. Branch `codex/punctum-unlimited-release-20261120`, PR #45. Baseline `12cfaa34108c7b66ef0a4004e73dcc5df62c5e45`; correction `e4e5f1ac0ed8f28e8a845d82f6aed7030365cc7f`.

## Correction and reproduction

The parity audit accepted identical XML containing relative URLs, protocol-relative URLs, a non-web scheme, missing host, whitespace, an invalid port, excessive location length, mixed hosts or duplicate `loc` children. Ten new negative fixtures reproduced that false positive on the baseline, exit 1. The existing embedded Python now uses `urllib.parse.urlsplit` and rejects those inputs. Positive controls cover `urlset`, `sitemapindex`, escaped query parameters and a canonical hostname independent of the fetched QA origin. No dependency or serving-route change.

Contract: [Sitemaps protocol](https://www.sitemaps.org/protocol.html), required absolute locations under 2,048 characters and one hostname. This focused validator is not a complete XSD/RFC validator.

Windows command `node --test scripts/live-parity-audit.test.mjs scripts/ci-evidence.test.mjs`: 26 PASS, exit 0, 15.16 seconds. Focused ESLint and `git diff --check`: exit 0. Callers remain the existing v2 parity workflow, main CI and isolated VPS smoke.

## VPS receipt

The trusted ED25519 fingerprint remains `SHA256:YDU8L01elnOngxVzl+B9HQyyuC09DWWdsJGvMZ3F6zg`. SSH used the pinned, separate known-hosts file with strict checking. No global SSH setting changed. The existing forced-command `codex-qa` account has only its own group. Administrative access staged source files and observed resources; routine tests ran through the nonadmin entry point.

Preflight at 07:15 UTC: 2,928,640 KiB available RAM, no swap, load 0.31/0.24/0.14, 54,624,308 KiB available disk. There were 26 active containers before this cycle's smoke and 26 afterward. Existing service configurations and containers were preserved.

Thirteen tracked QA files were archived from the correction commit. TAR SHA-256 `d44de46c656c3f7d1250028bfe8776cf7cf999549dfb1ffd24f4903c3aeb9d23` was verified remotely before extraction exclusively into `/opt/punctum-vps-qa/root/qa/release`. The Node binary and installed Sharp closure were reused; their source and lockfile were unchanged from the previously qualified runtime. The staged provenance file identifies the correction commit.

Command: SSH with the dedicated QA key to `codex-qa@179.236.241.135`, fixed command `smoke`. Unit `punctum-vps-qa@14-327471-999.service`, exit 0. Node 24.19.0, Sharp 0.35.5. Twenty-five tests passed: 21 parity assertions/subtests, one SQLite restore test, three Sharp tests. The additional fixture check decoded exactly 26,214,400 bytes with SHA-256 `c16e100efa8b3233461abdf30df0be13c291ed17c5cd4f6c4dbc40c562aab4ce`. This fixture check is not an HTTP upload test.

Limits: 1 vCPU, 384 MiB RAM, zero swap, 64 tasks, 30 seconds, 32 MiB temporary work volume, one connection. Measured SSH duration 9,441 ms; journal CPU 7.254 seconds; sampled cgroup peak 95,776,768 bytes (91.3 MiB); zero PID-limit hits. The work mount returned inactive and the socket remained active. Windows had zero WSL/vmmem processes after the job. No local Linux VM or full build was started.

## CI, browser evidence and review

Baseline [CI 44876223260](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44876223260) was independently read back: both jobs passed at `12cfaa34`. It covers npm installation/audit, lint/typecheck, tests, builds, build comparison, public R4 OFF and private synthetic R4 ON. This baseline does not validate the new correction.

Browser artifact `14696013041` was downloaded through the GitHub connector, SHA-256 `e1070df11309afe4d76c90c1029d0091562520de666a840e15c89985f7594a72`, ZIP integrity verified. Its report names the baseline SHA, 23 synthetic Chromium checks, seven axe audits, actual browser zoom, no page/console/server errors, and no physical devices or screen reader. It reports `checkoutDirtyAtRun=true`; the CI step immediately before browser QA shows no tracked changes. The report does not identify untracked paths, so do not describe it as a completely clean checkout. No new manual visual approval is claimed.

The correction and documentary head require their own exact-SHA CI readback on PR #45. Independent review is `DEGRADED`: CoS health and permissions passed, but both requested workers failed before startup because no extension page received the command. Run `b6d06dc6-c825-4c29-b445-472824baba58`, owner `01a1fcde-9753-76e3-9866-74f4d53fdb1c`; failure messages `f8a24c66` and `f70a20d6` were read and acknowledged. Gemini health/model discovery passed, but its read-only review exited 3. No worker findings or approval are claimed. A native read-only review is the next internal action; formal G19 remains HOLD.

Drive checkpoint `1x7-qc48BbWYdCvVuuXZKD4UOazuIMtWe` was read and reconciled through cycle BD. This cycle is canonical in Git; its Drive mirror has not been updated. No accessible PersistFlow tool provides a verified execution/checkpoint handle in this chat.

## T00-T06

| Task | Current result | Evidence and remaining work |
| --- | --- | --- |
| T00 | PASS baseline; BLOCKED_EXTERNAL provider | Issues #41/#44, PRs #39/#40/#42/#43/#45 and reviews/comments reconciled. PR #45 current baseline and CI read back. No provider change or support protocol permits another association retry. |
| T01 | PASS bounded auxiliary QA | Pinned SSH, existing isolation, 25 tests and measured job above. Builds remain in CI. |
| T02 | PARTIAL_VERIFIED | Reproduced and corrected sitemap false positives; existing recovery/LGPD/upload work preserved. Independent review pending. |
| T03 | PARTIAL_VERIFIED | Synthetic VPS SQLite/Sharp and baseline CI HTTP evidence. Managed-target Clerk, upload, restart, restore and operational rollback remain unverified. |
| T04 | PARTIAL_VERIFIED | Verified baseline automated browser report; no physical assistive or new manual visual acceptance. |
| T05 | PARTIAL_VERIFIED | Focused Windows and VPS checks passed. Final-head CI and independent review pending. |
| T06 | PARTIAL_VERIFIED | Git report and ledger checkpoint; Drive read only. PR receipt and final CI readback remain necessary. |

## G01-G24 release decisions

These are the unchanged AY decisions inherited by AZ through BD. New synthetic evidence does not promote a managed release gate.

| Gate | Status | Remaining release evidence |
| --- | --- | --- |
| G01 | PASS | Baseline reconciled. |
| G02 | HOLD | Integrated release review. |
| G03 | NOT_VERIFIED | Isolated Clerk QA identity. |
| G04 | NOT_VERIFIED | Target gallery journey. |
| G05 | BLOCKED | 25 MiB upload on isolated managed target. |
| G06 | BLOCKED | Real QA issuer/audience/JWKS. |
| G07 | BLOCKED | Authorized Clerk OTP identities. |
| G08 | BLOCKED | Real lifetime/logout/revocation. |
| G09 | BLOCKED | Real-target A/B denial matrix. |
| G10 | BLOCKED | Target private GET/HEAD and Clerk matrix. |
| G11 | NOT_VERIFIED | Provider-backed favorites reload. |
| G12 | NOT_VERIFIED | Remote browser download controls. |
| G13 | NOT_VERIFIED | Authenticated client browser on Unlimited. |
| G14 | NOT_VERIFIED | Authenticated Studio/Colagem parity. |
| G15 | BLOCKED | Physical VoiceOver/TalkBack acceptance. |
| G16 | FAIL | Live content/parity and public R4 OFF differ. |
| G17 | NOT_VERIFIED | Target latency, capacity, limits and cost. |
| G18 | BLOCKED | Unlimited retained backup, restore and final delta. |
| G19 | HOLD | Formal independent security approval. |
| G20 | HOLD | Controller's LGPD/retention approval. |
| G21 | HOLD | Final CI and independent release review. |
| G22 | HOLD | Separate release/activation authorizations. |
| G23 | BLOCKED | Application/data rollback and validated reopening. |
| G24 | PASS | Versioned continuity; this cycle's mirror remains pending. |

Next: read the correction's independent review and final CI. Externally, the owner/Hostinger must reconcile the existing Unlimited Node association in issue #44, preserving data and Cloudflare nameservers. Do not request another registration transfer. After an objective provider change, perform one exact-account readback, then qualify the managed target. No merge, deploy, cutover, production migration, billing, public R4 activation or contact with support was performed.
