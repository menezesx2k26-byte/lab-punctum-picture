# Cycles BE/BF: parity, audit integrity and bounded Linux QA

2026-11-21, America/Sao_Paulo. `PARTIAL_VERIFIED / PRODUCTION_NO_GO` for both releases. Branch `codex/punctum-unlimited-release-20261120`, PR #45. Baseline `12cfaa34108c7b66ef0a4004e73dcc5df62c5e45`; correction `e4e5f1ac0ed8f28e8a845d82f6aed7030365cc7f`.

## Correction and reproduction

The parity audit accepted identical XML containing relative URLs, protocol-relative URLs, a non-web scheme, missing host, whitespace, an invalid port, excessive location length, mixed hosts or duplicate `loc` children. Ten new negative fixtures reproduced that false positive on the baseline, exit 1. The existing embedded Python now uses `urllib.parse.urlsplit` and rejects those inputs. Positive controls cover `urlset`, `sitemapindex`, escaped query parameters and a canonical hostname independent of the fetched QA origin. No dependency or serving-route change.

Contract: [Sitemaps protocol](https://www.sitemaps.org/protocol.html), required absolute locations under 2,048 characters and one hostname. This focused validator is not a complete XSD/RFC validator.

Windows command `node --test scripts/live-parity-audit.test.mjs scripts/ci-evidence.test.mjs`: 26 PASS, exit 0, 15.16 seconds. `git diff --check`: exit 0. Correction to the original validation record: local ESLint did not run because the conditional command skipped the absent executable. Lint was subsequently verified by CI at `0ffb03d7`, not locally. Callers remain the existing v2 parity workflow, main CI and isolated VPS smoke.

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

## Cycle BF: independent findings and follow-up

The preceding turn made progress through a committed correction, measured Linux QA and verified Drive persistence. No blocked-goal decision is warranted while review findings can be corrected safely.

Both jobs of [CI 44879855658](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44879855658) passed at exactly `0ffb03d7e5ad18f4235faad1be7a90d1eb0e4020`. Both artifact ZIPs were downloaded through the connector, their API SHA-256 digests matched and ZIP integrity passed:

| Artifact | SHA-256 | Verified scope |
| --- | --- | --- |
| `14697209677` | `4b29f054ed519b4891822f8fd04c713e7d715be81df7a397cc063c0b20b60f5c` | 23 synthetic Worker Chromium checks, seven axe audits, real zoom; zero page/console/server errors. |
| `14698055222` | `af2a7c1ffc3a05b760e84793c002e1659c97ddb8f003c23e76f8c498a38bba8b` | Synthetic Node mobile/desktop HTTP 200, no overflow or page errors; `managedQa=NOT_TESTED`. |

Both reports name the exact CI SHA and retain `checkoutDirtyAtRun=true`. No completely clean-checkout or managed-provider claim is made. Manual inspection used candidate synthetic captures only: public mobile/desktop hero, private mobile gallery/editor and zoomed lightbox. Those views retain their incumbent layout and show no obvious horizontal clipping. Private media are solid synthetic fixtures, which cannot qualify photographic content/crops. The admin full-page capture has an unexplained white band in its upload area; its cause is not established. The gallery also shows the minor pre-existing copy issue `1 favoritas`. T04 remains partial; there is no new frontend approval, redesign or physical assistive proof.

Native reviewers inspected the baseline read-only:

- Franklin, agent `01a1fcfc-bbb8-7e52-a7b4-30eda72d1689`, reproduced mixed-scheme, mixed-port and nested-`loc` false positives. The correction in `28d0c7581987013bf044246dcd388d5d5e9c6cdf` compares normalized internal origins and forbids child elements in `loc`. A positive control preserves implicit/explicit default HTTPS-port equivalence and the independent canonical QA hostname. Three negative HTTP fixtures failed before the patch and passed afterward. [Protocol](https://www.sitemaps.org/protocol.html#location).
- Confucius, agent `01a1fcfc-cef4-7122-af4e-9e026a706c7b`, reproduced archive committing before its audit insert failed. `a81c07a6f91fe965b6981e3ffd07ab3b1ae08e4b` prepares the existing audit insert and submits it with archive/unpublish updates in the existing D1 batch. The `writeAudit` signature, payload and identity contract remain compatible. `4d8d87207144cebdbe50bb7277c77ce725d404a5` prepares the test trigger as one D1 statement, avoiding `exec` newline splitting. The two integration regressions require HTTP 500, unchanged gallery state/timestamp, no audit row, then a successful retry and attributed event after removing the failure trigger. These versioned integration cases are pending CI; the prior independent reproduction is not a claim that those cases ran locally. [D1 transaction contract](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

This follow-up corrects the reviewed archive/unpublish paths. It does not claim transactional auditing for every other administrative write; other mutation-then-audit paths need separate qualification. Neither scoped reviewer granted formal G19 or LGPD controller approval. Follow-up review of the corrective diffs is pending.

Local follow-up: 29 focused parity/CI-evidence tests PASS, exit 0, 18.07 seconds. Native Node syntax checks passed for the three changed audit TypeScript files. Direct assertions against the actual audit utility verified that preparing an event defers execution and the legacy writer executes once with unchanged data serialization. Typecheck, ESLint and the D1 integration/runtime tests were not run locally because dependencies are absent; they are routed to CI.

VPS follow-up preflight at 07:35 UTC: 2,856,628 KiB available RAM, zero swap, load 0.04/0.05/0.08, 54,624,040 KiB available disk, 319 processes, 26 containers, no running auxiliary job. Thirteen QA source files from `a81c07a6` were staged with TAR SHA-256 `3c04195edba962ec91a2639b7720fb1ddc37152e0b1d04e4e6321f89e4ef7f5c`, verified before extraction into the same dedicated root. Those selected source files are unchanged in `4d8d8720`.

The nonadmin fixed `smoke` command passed 28 tests and the separate exact 25 MiB decode/hash fixture, exit 0. Unit `punctum-vps-qa@15-336871-999.service`; SSH duration 10,766 ms, journal CPU 8.476 seconds, sampled cgroup peak 95,100,928 bytes (90.7 MiB), zero PID-limit hits. Limits remain 1 vCPU/384 MiB/64 tasks/30 seconds/32 MiB tmpfs/zero swap. Work mount inactive, socket active, 26 containers afterward and zero Windows WSL/vmmem processes. The VPS smoke covers parity, SQLite restore and Sharp, not the newly added administrative HTTP rollback tests.

The final documentary HEAD needs its own CI receipt. T02/T05 remain partial until the new integration cases and reviewer follow-up pass. The previous T00-T06 matrix otherwise remains applicable, and all 24 AY release decisions are preserved. Both phases remain `PARTIAL_VERIFIED / PRODUCTION_NO_GO`. Existing association, real Clerk, target recovery/rollback, capacity, physical accessibility and human approval gates remain open. Drive BE was updated and read back after the original BE commit; BF mirror and final PR receipt are still pending at this checkpoint.


## Cycle BH: Access audit integrity and dual-provider takeover

Baseline `1d14ee29db93b67deb2f37efdb60d02c45d46683`, branch `codex/punctum-unlimited-release-20261120`, clean at takeover. The complete local BG report and Drive checkpoint through BF were reconciled with PR45 and issue44/comments. Baseline CI44881312603 remains exact-SHA green; no baseline suite or VPS smoke was rerun. Process command inspection identified only Punctum kernel.js/trusted-worker.js services, without controller markers; these services were left running. No supervisor/PersistFlow activation is claimed.

Fresh quota telemetry supersedes the historical92% snapshot: primary8% and weekly63%, deterministic guard CONSERVE. After scoped work: primary20%, weekly65%, context202165/475000; deterministic guard PRESSURE / INTEGRATION_FIRST, no model polling or new heavy fan-out. Gemini health1.5.14 passed, but its credit-blocked model request was not repeated. CoS health/actions passed and prior failed workers had zero pending/ack reports. New read-only inventory worker3 in run `d9d82862-0654-44fb-8cea-aa285d8fb80c` failed startup; message `e436c67b` was acknowledged. No worker result was invented. Native reviewer `01a1fd64-e161-72e0-af46-78bbe7403b41` returned the bounded inventory and test review; final corrective-diff review/CI receipts belong to PR45 and the existing local closeout directory.

The Access reset-password branch now submits its unchanged account UPDATE and `prepareAudit(client.access_reauthorized)` in one D1 batch. Actor identity, client_account entity/id, ACCESS_ONLY fields,310000 iterations, must_change_password=0, session_version increment, timestamp and response contract are preserved. No dependency/schema/authentication change. The new integration case uses a local environment object (no global configuration mutation), real D1 and the existing private router. A synthetic INSERT trigger fails the audit. RED reproduced HTTP500 with persisted credential/session/timestamp changes. After the patch GREEN passed17tests across4files, including all5administrative audit cases, Access flow/identity and admin rotation. The failed request preserves the complete account row and leaves zero audit events; retry after try/finally trigger cleanup returns200, increments7to8 and writes exactly one event with the local administrator attribution. This proves one failed request followed by one retry, not deduplication of repeated successful calls. Initial fixture iterations below the schema minimum were corrected to620000 before the valid RED run; no assertion was weakened. Typecheck, scoped ESLint and git diff --check passed. Full integration/build/browser verification is reserved for the new exact-SHA CI; no duplicate local full matrix.

Read-only sibling inventory retains10risks: client creation; non-Access password reset; Clerk link/unlink; account enable/disable; gallery creation,cover,reorder,publish and metadata/download-setting updates. These mutate before a separate writeAudit; reorder batches its updates but not audit. Their dynamic failure behavior and Clerk helper internals were not qualified. Existing archive/unpublish transactional proof is preserved. No global administrative atomicity claim or formal G19 approval.

| Source | Verified identity/state | Remaining limitation |
| --- | --- | --- |
| Git | Baseline SHA, existing draft/open PR45, unchanged24AY gate records | Correction CI and scoped final review require their own receipt |
| Hostinger browser | Existing Node `magic-lime-guanaco-79.hostingersite.com`, Unlimited Web Hosting, FTP username `u775492464`; installed synthetic ZIP `punctum-r4-synthetic-a136f721.zip`, Node24.x, environment variables None | Registrar resource `punctumpicture.com` remains separate. Issue44 continues BLOCKED_PROVIDER; no fresh provider release, association retry, DNS, support message or deployment |
| Clerk browser | Personal Workspace, My Application linked to punctumpicture.com, app `app_3M14L9JyjaJ9ySitVTsQFf6xJ2A`, Production instance `ins_3M6H9ktM3jO84RvEu5BmKFokCfr`, public-key prefix only `pk_live_` | No isolated Development/QA instance, synthetic user creation, session or A/B authorization qualification |
| Clerk public discovery | HTTP200, issuer `https://clerk.punctumpicture.com`, JWKS at `/.well-known/jwks.json` | Issuer discovery alone does not prove Worker runtime configuration or authenticated acceptance |
| Worker public read | GET `/api/clerk-pilot/me` returns404,9bytes | Disabled behavior observed; no activation or runtime-secret value claim |

Clerk Frontend API, Account portal and Email3/3 show Verified, certificates Issued (dashboard last checked7d ago). DNS requirements read only: clerk -> frontend-api.clerk.services; accounts -> accounts.clerk.services; clkmail -> mail.5d5oc5l07g8f.clerk.services; clk._domainkey -> dkim1.5d5oc5l07g8f.clerk.services; clk2._domainkey -> dkim2.5d5oc5l07g8f.clerk.services. No record was published. The Email setup banner recommends a second provider; that toggle is OFF, while primary email records already show Verified. Canonical site origin, Clerk Frontend API, account portal and email DNS are separate configurations. Sessions show maximum7days, inactivityOFF, reverification10minutes, native same-as-web and multisessionOFF. This is configuration evidence, not logout/expiration/revocation testing. Account portal sign-in/sign-up/sign-out paths are selected; no application home or unauthorized-sign-in URL value is displayed. Versioned Worker production defaults retain canonical https://punctumpicture.com, Access mode and private galleries false; Clerk variables are absent there. Effective remote secret/runtime values, additional authorized parties, and QA instance selection remain unverified. No production configuration or identity was modified.

| Task | BH scope |
| --- | --- |
| T00 | Baseline/BG/DriveBF/GitHub reconciliation verified |
| T01 | Reuse prior bounded VPS28tests/25MiB; no VPS job |
| T02 | Local Access fix and rollback/retry verified; exact-SHA CI receipt follows |
| T03 | Browser Unlimited identity verified; managed association/TLS BLOCKED_PROVIDER |
| T04 | Preserve prior synthetic evidence and open findings; no UI work or approval |
| T05 | Focused17tests,typecheck,scoped lint,diff check PASS; final exact-SHA CI/review readback required |
| T06 | Incremental versioned report/ledger;24gates unchanged; final SHA,CI,hashes and Drive readback in existing closeout receipts |

G01-G24 retain every canonical AY record unchanged, including G03 NOT_VERIFIED,G06-G10 BLOCKED,G13 NOT_VERIFIED,G19/G20/G21/G22 HOLD. Identifying a Production Clerk instance does not qualify isolated QA or authorize its activation. Both releases remain PARTIAL_VERIFIED / PRODUCTION_NO_GO. Public candidate private galleries OFF and Clerk pilot OFF remain required. Incremental spend R$0; no merge, deploy, DNS/NS/TXT, cutover, production data migration, Clerk changes, R4 activation, billing or destructive restore. No stable cross-project user fact arose; only project execution evidence was persisted.


## BH verified closeout and continuation references

This verified receipt supersedes the earlier pending CI/review/Drive statements in the BH section. Product SHA `f020e1b1a1e1667029fc0bb50c7073d23a117d79`, branch `codex/punctum-unlimited-release-20261120`, was pushed and the worktree was clean. [CI 44889674474](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44889674474) completed successfully in both jobs: verify `136802555900` and hostinger-node-qa `136802555730`. The Linux log names the new Access rollback/retry regression and reports five administrative audit cases, 336 tests across 64 files, seven Colagem tests and zero dependency-audit vulnerabilities. Lint succeeded with ten pre-existing warnings outside the two changed TypeScript files.

Native reviewer `01a1fd64-e161-72e0-af46-78bbe7403b41` completed the corrective diff review at `2026-11-21T09:22:11.412Z`: scoped approval, no blockers. This is separate from the ten-path residual inventory and does not grant formal G19 approval. Local RED/GREEN, typecheck and focused lint are retained from BH; no new product validation was run to prepare these documentation references.

| Artifact | SHA-256 | Verified scope |
| --- | --- | --- |
| `14700793626` / r4-browser-evidence | `a0e653ca6571ac75cf7b6712213076e7c1c02cef082d2279335fdd4851143170` | ZIP intact, exact sourceSha, PASS_LOCAL, 23 checks, seven axe audits, no page/console/server errors; synthetic sessions only; no physical device/screen reader |
| `14700733774` / punctum-hostinger-node-browser | `ed5521dbf408caf29d5ee1c65fc96a25138a1b8aff37a92e663b3823e03b9bf4` | ZIP intact, exact sourceSha, managedQa NOT_TESTED, manifest integrity ok, zero missing originals/FK violations |

Both artifacts preserve checkoutDirtyAtRun=true. No clean-checkout, real managed-provider, real Clerk or visual/human approval is inferred. Direct gh download returned401; the existing authenticated GitHub connector supplied the verified archives without changing authentication.

The existing [Sgtmenezes checkpoint](https://drive.google.com/file/d/1x7-qc48BbWYdCvVuuXZKD4UOazuIMtWe/view) was updated at `2026-11-21T09:34:12.977Z` with every previous character preserved. Exact UTF-8 readback matched all 17,699 bytes; SHA-256 `03ce67007c3c46b030d948f78ba527a16631fa44ba04327dd499df31ffe5efc5`. PR45 description was updated and read back, OPEN/DRAFT/not merged. Final historical guard was PRESSURE, primary33%, weekly67%, context52.10%; sample again before new implementation.

Effective task state: T00 reconciled; T01 prior VPS proof reused; T02 Access correction/RED-GREEN/CI/scoped review verified; T03 association/TLS BLOCKED_PROVIDER; T04 prior synthetic evidence retained with no new UI approval; T05 exact-SHA jobs/logs/artifacts verified; T06 versioned report/ledger and Drive byte readback verified. All24AY release records remain unchanged. The technical takeover DoD is verified; the project remains PARTIAL_VERIFIED / PRODUCTION_NO_GO for both releases.

The [complete next-agent prompt](../../superpowers/plans/2026-11-21-punctum-continuation-bh-tasks-gates.md) publishes the operational continuation, T00-T06, all24gates, supplemental Hero checks, source files, commands, dependencies and explicit release boundaries. The [historical Hero plan](../../superpowers/plans/2026-08-25-direct-hero-upload.md) now points to its real implementation and records the migration/component/test/resolution/transport differences. This reconciliation changes documentation only; it does not replace the incumbent1280x720/720x1280 rule, accept new visuals, execute a deployment or prove the missing Hero contracts. Supplemental H01-H06 are NOT_VERIFIED and do not renumber or replace G01-G24.

Clerk application/instance identity is reconciled as recorded above. Its Allowed subdomains restriction is OFF; remote Worker authorizedParties and a separately authorized QA instance remain unverified. Issue44 still governs association to the existing Unlimited Node. Cost incrementR$0; no production action or support contact. No stable cross-project memory fact arose; these facts are project-specific.
