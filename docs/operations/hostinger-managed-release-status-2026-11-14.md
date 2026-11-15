# Punctum Picture — managed Hostinger release status

Session dates: 2026-11-14–15, America/Sao_Paulo. Individual workflow receipts use UTC.

**Verdict: `NO_GO_SAFETY`.** Production has not moved. Do not change public routing, remove Cloudflare resources or call this a production release. The existing public site and adjacent MCP remain operational.

## Effective origins and Git

- Public production: https://punctumpicture.com — HTTPS200, Cloudflare response headers. Existing Studio credential was actually accepted against this origin.
- Selected destination: https://aliceblue-locust-999458.hostingersite.com — Conthabil managed Node hosting, username `u571409090`, order `1008628483`, Node24. HTTPS health200, HCDN, served source `c10e35fdba8815531cede35104b5e2cb57c3e4d8`.
- Original verified managed build: `01a1dd1b-a01e-70de-a7d6-fdfc8f06814c`. A subsequent connected Hostinger readback confirmed build `01a1dd88-8fec-7385-96ec-f97e10e109e3` completed on 2026-11-15 04:52:20 UTC using Node24 and `build:hostinger:managed-runtime`; this alone is not a public release or final-origin TLS proof.
- Branch: `codex/punctum-managed-production-20261114`; draft PR https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/39, base `feat/hostinger-production-candidate-20261113`. No merge or force push.
- Runtime/maintenance source passed full managed checks at `8e417011ada8279bd643c2b5cd98f2e9509c0306`; the deployed descendant changes only the bounded operation request. Later documentation and removal of an unqualified, unused ACME experiment do not change the application runtime.
- VPS2135319 is a historical rehearsal environment, not the approved destination. Its running services were inspected; none was replaced or stopped.

## Gates

PASS below is scoped to the tested managed candidate. Public production acceptance remains gated by cutover.

| Gate | Status | Verified evidence / remaining limit |
|---|---|---|
| 00 — takeover | PASS | Worktrees, local/remote branch, draft PR, managed account/build, private store and source/destination differences recorded; approved work preserved. |
| 01 — Clerk production | PARTIAL_VERIFIED / production BLOCKED | [43678214459](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43678214459) proved real production Clerk SDK **ticket** login with canonical `azp`, linked-admin Studio, denial, replay/logout and legacy fallback against an **isolated application**. This was not user password/MFA acceptance or Hostinger public TLS; managed runtime remains legacy. |
| 02 — D1/R2 final parity | BLOCKED | Full snapshot and all230 original hashes verified; fresh source delta audit found no changes at its observation. Subsequent login/audit/scheduled writes require a controlled final reconciliation. No source freeze occurred. |
| 03 — application E2E | PASS |35 actual HTTP assertions on the managed host, uploads, Sharp WebP/JPEG, R4 ownership/isolation, limits, logout and mobile/desktop Studio. Legacy login/Studio retested after the latest build/restart. |
| 04 — HTTPS/routing | BLOCKED | Temporary origin HTTPS works; apex ownership/alias verified. Hostinger TLS reports `Domain challenge failed`. Correct apex-SNI readiness is not established. MCP remains HTTPS200. |
| 05 — rollback | PARTIAL_VERIFIED / production FAIL | Managed-to-encrypted-offsite-to-**local isolated D1** restore [43678814265](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43678814265) passed all table row/hash and 230 original SHA-256 checks (`remoteD1RestoreVerified:false`). Complete **remote D1/R2 recovery** including new Hostinger writes remains unproven; DNS rollback alone is insufficient. |
| 06 — operations | BLOCKED | Real hourly/daily job receipts, physical daily backup, seven-day retention and restart proof exist. Final writer cutover, full managed quota/log-retention qualification and post-cutover operation remain open. |
| 07 — performance | BLOCKED | Moderate read-only concurrency2,13 samples per route, p50/p95 measured. Authentication/upload/final-origin load qualification and sufficiently sampled p99 remain open. |
| 08 — DNS preflight | PASS | Correct Cloudflare account/zone, Worker custom-domain routes, relevant DNS and TLS settings inventoried; only the authorized five Clerk CNAMEs and ownership TXT published. This does not authorize cutover. |
| 09 — production cutover | BLOCKED | Unexecuted: critical prerequisite gates fail and public-routing authorization is absent. |
| 10 — release | BLOCKED | General CI and full managed verification passed; real Clerk acceptance correctly remains blocked. No production release verdict. |
| 11 — handoff | PASS | Repository checkpoint, exact action/build/test references and this report; private Drive copy/readback recorded when completed. PersistFlow/Gabriel tools currently unavailable. |

## 2026-11-15 reconciled evidence (no release authorization)

Read-only GitHub/Hostinger verification after the initial report found no production cutover. PR #39 was still draft/open at `16d1500ae919f64e1941214ea2b59f145b632672` and CI run [43678817776](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43678817776) passed. Hostinger SSL for `punctumpicture.com` remained `waiting_for_retry` / `Domain challenge failed`. The Node24 managed application build was completed, but the canonical domain was not proven to serve it.

The real Clerk browser proof run [43678214459](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43678214459) completed all scoped assertions, including real SDK ticket issuance, correct authorized-party origin, admin permissions, denial for unrelated users, replay rejection, and legacy fallback. The test substituted an isolated local TLS-backed application at the canonical origin using a pinned test certificate. **It is not evidence that Hostinger apex TLS, MFA login, or real-domain cutover passed.** Its explicit `limit` field states this.

The initial encrypted export workflow [43678214437](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43678214437) ended `failure` at its integrated restore stage despite a completed export. A subsequent independent restore [43678814265](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43678814265) reused that exact acknowledged ciphertext and passed D1-local table parity and 230/230 original hashes (372,040,548 bytes). Its receipt says `MANAGED_R2_TO_LOCAL_D1_RESTORE_VERIFIED` and `remoteD1RestoreVerified:false`. Do not label remote rollback PASS, target occupied production/QA resources, or imply this tests post-cutover mutable data.

Outstanding gates before any public routing: preflight of the actual canonical-domain TLS and Clerk Studio; remote **isolated, clearly-owned** D1/R2 reverse recovery; controlled source delta/writer freeze; final observability and load checks; independent explicit routing authorization. Until all gates pass, retain Cloudflare production, backups, tenant isolation and the legacy Studio entry path.

## 2026-11-15 supplementary origin and recovery preflights

- CI for the prior recovery-inventory fix [43749941935](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43749941935) passed; read-only Cloudflare capacity inventory [43749935434](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43749935434) passed. Its retained report enumerated **10 D1 databases** and three QA-named D1 candidates, **none** established empty/exclusively owned; six QA-named R2 buckets, several nonempty. It explicitly approved **zero write targets**. Avoid resets, database creation or claims of completed remote restore until ownership, quota, and absence of unrelated data are demonstrated.
- Read-only origin/relay checks [43750468095](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43750468095) found Cloudflare `/api/health` HTTP 200 but the legacy temporary hostname gave `RemoteDisconnected`. Follow-on provider-suggested CDN hostname probe [43750678998](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43750678998) failed external HTTPS connectivity (`URLError`). No SNI/TLS bypass or routing change occurred. This does **not** prove that the deployed Hostinger application itself is down; it proves these public entrypoints cannot yet be qualified.
- Hostinger currently lists `punctumpicture.com` as the **main** managed Node website. The old temporary domain is no longer listed as a separate site. A bounded attempt to restore `aliceblue-locust-999458.hostingersite.com` as an alias on the existing site was rejected by Hostinger (`HTTP 422 / Provided domain cannot be used`); no alias was created. Managed SSL remained `waiting_for_retry` with `Domain challenge failed`. No production DNS, custom domains, Cloudflare data, or Hostinger application runtime were intentionally modified.
- Follow-on code changes remove obsolete temporary-website hPanel reads from the diagnostics and leave the **public** Cloudflare Worker intact. The zero-traffic-change path requires a genuinely reachable HTTPS Hostinger origin before even prototyping a proxy. A canonical-domain route change remains a separate, explicitly gated production operation.
- The remote reverse recovery, final source-write freeze/delta, actual apex-SNI, and operational release remain `NO_GO_SAFETY`. Passing CI or a read-only preflight cannot make them PASS.

## Data and integrity

Source snapshot:339 images,20 albums,10 categories,12 site media,139 upload intents,323 audit rows and83 backup-run rows. Candidate maintenance/authentication append their own audit/backup records and may expire incomplete intents; their current hashes must not be substituted for a frozen source snapshot.

- Original objects:230; total372040548 bytes. Every original was checked by key, size and SHA256, not just count.
- Source SQL SHA256: `b3d7b220aab9cf15cc5d8652a1bd699ebcbf2ee6d64f6680df61d3041cbbbeff`.
- Key/size/content-type/SHA256 manifest: `c6524fdd07ca8fc624b731ea21b609a292ef4d044ffcae3c973a8d8e0f76bf92`.
- SQLite integrity/FK checks passed in import, rebuild and isolated restore. Historical incomplete/nonready references were preserved; fixture cleanup was ownership-scoped.
- Sample WebP:56190 bytes, SHA256 `50f624c241a02f093763dae342248e139e5de0fd15a7796e72d6f73d93c7bd08`, identical across build rollback/rollforward and latest restart.
- Sample JPEG:94512 bytes, SHA256 `fd31c7f9330ef89caf55089c9deb50fa6707e3df0c157a9572b8032e448ee852`.
- Private root: `/home/u571409090/punctum-managed-storage/punctum-managed-private-20261114`; SQLite/originals are outside public roots. HTTP database/seed probes returned404.

## Authentication and authorization

The initially selected instruction was “same email as Studio”; the new Clerk signup used a different verified email. The backend refused to link it. The user then explicitly authorized that newly verified account. Its exact immutable user ID and verified email are kept in private secret selectors. The managed operation inserted an explicit link to the existing internal administrator principal and an audit record, with collision/disabled-link checks and a preceding physical backup.

Operation [43669393167](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43669393167) passed. It removed the temporary twenty-two-key build environment, verified the original fifteen runtime keys, restarted and successfully logged into legacy Studio. No incomplete Clerk runtime was enabled. No other identity/client link was created. No real user session was revoked.

BAPI-issued session tokens from the earlier direct exchange lacked the authorized-party origin and were correctly rejected by the SDK. The later **browser ticket flow** supplied the correct canonical `azp` and passed isolated-application checks in workflow 43678214459, without bypassing origin verification. Hostinger-domain TLS and MFA/user-password acceptance are still unproven; do not promote the legacy runtime based on this scoped proof. The in-app browser connection was unavailable, the alternative helper failed to retain its connection, and automatic execution review blocked direct Chrome launch. Repeated portal login is not a substitute for a production-origin Studio session.

Six Linux focused tests cover input boundaries, real SDK execution with an explicitly labeled offline fixture, anonymous/unlinked denial, explicit binding, cookie flags, role isolation, tampered signature, logout/replay, legacy fallback, collisions and idempotency. These are regression coverage and do not replace the missing real browser/backend acceptance.

## HTTP and performance

Managed E2E [43658779117](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43658779117) passed35 assertions and cleaned its owned fixture records/files. It proved private cross-tenant404, client-to-admin403, anonymous client401, invalid/interrupted upload retry and original download hashes. Public oversize remains the existing `400 FILE_TOO_LARGE`; R4 oversize is413 at20000001 bytes. Preview's25MiB setting is separate.

Six public routes returned200; anonymous Studio303; private filesystem probes404. Archive pagination24→48 of329 visible entries worked at390px and1440px without overflow. Temporary HTML/sitemap stays noindex; public cutover still needs canonical/sitemap/robots checks against the final origin.

Measured Cloudflare versus managed p50/p95 milliseconds (13 responses per route/origin, concurrency2):

| Route | Cloudflare | Managed |
|---|---|---|
| Home |2416 /3742 |243 /500 |
| Portfolio |2047 /2353 |123 /306 |
| Archive |2046 /2558 |71 /279 |
| Health |27 /49 |24 /237 |
| WebP sample |541 /1032 |17 /480 |

All observations were200. Cache/runtime conditions differ. This sample does not qualify p99 or final authentication/upload load.

## Backup, jobs and rollback

[43662472112 attempt2](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43662472112) proved hourly/daily execution, physical daily backup, isolated restore and current→previous→current application rollback on the same private storage. Studio and the media hash passed on both versions. Final rollforward build was `01a1dcd7-af2f-71f5-a9d3-5b6233c3ef77`; the newer approved-link build is recorded above.

- Daily physical archive SHA256: `a120fb3787733028c82fdd1a9ec695f5b2479ea71896937a5f9c2ec061dcc55e`;230 originals /372040548 bytes; restore6505ms; retention7 days, scoped to owned daily archives. Manual golden archives are preserved.
- Golden functional restore SHA256: `a5f5e4358255378ceeba2594957cf749895815cb736ff5881abf66eee1c6f5e6`; total9493ms including homepage/Sharp comparison through the isolated compiled application handler. Isolated TCP binding was refused by the provider and is not claimed proven.
- Pre-Clerk-link archive SHA256: `d989a22d3d2137ebf0e4ef911b1f4f54aac94379a8681bb37a4459e7b8e4a225`.
- Actual Hostinger schedules observed by [43661888957](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43661888957): hourly `15 * * * *`, daily `17 1 * * *`, both UTC, both on the staging clone through Node24 and the current-deployment symlink. Source Cloudflare jobs remain on their independent source database. Final production must have one controlled writer/job set.
- RPO: nominal24h for daily physical backups. The measured isolated functional restore took9.493s; complete incident RTO, remote/offsite recovery and DNS propagation are not measured. Returning DNS alone cannot restore new Hostinger data.

An encrypted offsite-to-local D1 restore of the complete dataset passed in workflow 43678814265; it does not restore a remote D1/R2 destination and therefore does not establish production rollback. No full **remote** SQLite/originals→D1/R2 reverse operation is yet proven. The POSIX sync is not a consistent live snapshot; the existing private-recovery helper covers only five R4 tables. Historical QA databases/buckets may be occupied and must not be reset without fresh ownership/vacancy evidence. Preserve source resources and golden snapshots until a complete reverse rehearsal passes.

## DNS, TLS and adjacent services

Cloudflare account `257bca437616da74ece1ce4bbaf0bd89`, zone `561d9796dd104b8563c9ab77fa4fae1d`. Apex/www still use Worker custom domains for `punctum-picture-migration`; this is not a simple VPS A-record switch. Mail and unrelated service records were preserved. Cloudflare SSL mode readback was Full.

The five Clerk CNAMEs are DNS-only. Ownership TXT publication [43662764315](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43662764315) created one apex TXT, TTL900, record `8d7484635b9bb95f214d25c66740f2b2`; challenge SHA256 `0250e09c99da68b527dbe4097bd8348808fa0b1940f055e3078f07ce28b3b5b3`. Hostinger ownership and the alias were verified.

Hostinger TLS remains `waiting_for_retry`, `Domain challenge failed`. A proposed ACME-only proxy passed focused tests but failed its actual hosting path preflight (marker404; mismatched Host reset). It was not deployed and its experimental repository files were removed. No public challenge routing, apex/www DNS cutover or nameserver change was attempted.

https://mcp.menezesdev.tech remained HTTPS200. Read-only VPS inspection found its proxy/adjacent services running; no public port, container or volume was changed. Public-source-only temporary rehearsal material was removed after exact-path/content guards; no credentials or real application data entered it.

## Verification and next safe boundary

- [Full managed check43669148015](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43669148015): typecheck, lint0 errors,322 Vitest /62 files,64 POSIX passes /1 platform skip,32 Python tests, both candidate/scheduled builds, audit0 findings.
- General CI also passed at `8e417011ada8279bd643c2b5cd98f2e9509c0306`. The real Clerk workflow remains explicitly blocked by its missing production-origin browser proof.
- Windows-only Python limitations (symlink privilege, CRLF-sensitive old ZIP) were separated from the all-green Linux result. No test or guard was weakened.
- Gitleaks8.30.1 found no credentials in the scanned candidate history after one exact reviewed historical fake-fixture fingerprint was excluded. Actual credentials remain private.
- Native draft work was preserved in its isolated branch, reviewed and completed by the parent after the worker hit a provider usage limit. Gemini supplied a read-only reverse-path review; no worker report substituted for execution.

Public cutover remains prohibited by the failed prerequisites. Resolve reliable application-origin browser access, real Hostinger TLS/challenge capability, full reverse data recovery and the final controlled write/delta window before requesting the public-routing approval. Do not ask the user to create another account or keep repeating an accounts-portal login without an operable application-origin test path.
