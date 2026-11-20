# Cycle AR — P0 execution on PR #42

Parent: `66b2c9958de14d685f561b1d0e0f2a967d28e3e2`  
Branch: `cursor/r4-aj-security-phase-b-ae72`  
PR: https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/42  
Verdict: **PARTIAL_VERIFIED**. Production stays on the Cloudflare Worker. No DNS write, no VPS mutation, no production D1/R2 write.

Evidence: [2026-11-20-cycle-ar-p0.json](evidence/2026-11-20-cycle-ar-p0.json).

## What was re-proven

- Public `https://punctumpicture.com` is HTTP 200 from `punctum-picture-migration`. `www` is 308 to the apex. Nameservers are `nia` and `pedro`. Apex and www AAAA are proxied `100::`.
- Live worker deployment `276eb966-4561-4c95-b35c-3b461ff0c18d` is version `e9b62f5d-acc5-4ad3-8319-24a0c7e98ee7` at 100%, created 2026-10-27. The September rollback note (`cc6a8fb3` / `17ac1008`) is not this version.
- Since 2026-11-19 the live script had 978 requests, 0 errors, cpuTime p50 864 µs and p99 156462 µs. p99 is above the 10 ms G17 rule. This sample is the deployed worker, not the PR candidate.
- Production D1 `punctum-picture` has migrations `0001`–`0008` only. Counts match the 2026-11-20 03:00 logical backup except `backup_runs` 89 vs 88, which is the row inserted after the snapshot. Images 339, albums 20, site_media 12.
- All 15 migration files apply on a disposable sqlite database (25 tables, `integrity_check=ok`, `foreign_key_check=0`). That database was not copied onto production.
- Local Node QA after `build:hostinger:qa`: public HTML routes, studio login, album create/cover/publish/archive, WebP card, logout cookie `Max-Age=0`, sqlite backup restore. `PUNCTUM_QA_BROWSER=1` passed. Vitest 333/333, typecheck and lint passed on this tree.
- Clerk production instance `ins_3M6H9ktM3jO84RvEu5BmKFokCfr` is the connected app. `session` config is null. The schema `lifetime` field is the session **token** lifetime (default 60 seconds), not a maximum session lifetime. No live Clerk login was performed. The vitest security matrix still shows Clerk logout replay returning 403.

## VPS 2135319

`srv2135319.hstgr.cloud` resolves to `179.236.241.135`. Port 80 answers `308` with `Server: Caddy`. TLS fails with alert 80 for the bare IP, the srv name, and a `punctumpicture.com` SNI. The Punctum Hostinger connection `hostinger_usings-moko` (order `1008628483`, user `u571409090`) lists the Node website `punctumpicture.com` and lists zero virtual machines. The custom connection `custom_punctum_picture_administra_o_stamen-form` returns HTTP 401 on the VPS list. The other two Hostinger connections also list zero virtual machines. This VM had no authenticated hPanel tab. No SSH key is configured. Nothing on the VPS was changed.

## Cutover not applied

Do not point `punctumpicture.com` or `www` at `179.236.241.135`. Caddy on that address does not complete TLS, and the public hostname already terminates on the Worker. A future cutover would replace the Worker custom-domain route with an A/AAAA to the VPS only after a certificate and an authorized QA origin exist.

## Official gates

| Gate | Prior | Now | Why |
| --- | --- | --- | --- |
| G01 | PASS | PASS_VERIFIED | Git, PR head, DNS, D1, R2, Hostinger order re-read |
| G02–G04, G06, G08–G14, G16 | NOT_RUN | PARTIAL_VERIFIED | Local suites and the Node QA server; not the remote target |
| G05 | FAIL / NOT_RUN_REMOTE | PARTIAL_VERIFIED | Local exact 26214400-byte stream and a small Sharp WebP upload. Remote 25 MiB on the VPS was not run |
| G07 | BLOCKED_EXTERNAL | BLOCKED_EXTERNAL | No real OTP session |
| G15, G19, G20, G22 | BLOCKED_EXTERNAL / BLOCKED_SECURITY | BLOCKED_EXTERNAL | Human acceptance still required. G19 is not self-signed |
| G17 | FAIL | FAILED_VERIFIED | Live worker p99 CPU 156.5 ms over 978 requests. Candidate SHA was not the measured script |
| G18 | NOT_RUN_REMOTE | PARTIAL_VERIFIED | Backup/live counts match, explained `backup_runs` +1. Local sqlite restore passed. The production object was not restored into a new database |
| G21 | NOT_RUN | PARTIAL_VERIFIED | PR remains open. CI must be read on the commit that adds this file, not on `66b2c99` |
| G23 | BLOCKED_EXTERNAL | PARTIAL_VERIFIED | Local QA restore passed. Remote Worker rollback was not run. September baseline is not current production |
| G24 | NOT_RUN | PARTIAL_VERIFIED | This record and the store handoff. No Drive readback |
