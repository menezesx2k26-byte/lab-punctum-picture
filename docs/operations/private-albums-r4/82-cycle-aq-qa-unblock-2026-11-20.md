# Ciclo AQ | R1/R3 QA unblock — 2026-11-20

**Mission:** `PUNCTUM-R1-R3-QA-UNBLOCK-20261120`  
**Verdict:** `PARTIAL_VERIFIED`  
**Production:** `NO_GO`  
**Completion:** not `COMPLETED_VERIFIED`. This cycle does not merge, cut over DNS, or deploy.

Prior package kept: `docs/operations/private-albums-r4/81-cycle-ap-qa-unblock-2026-11-20.md`.  
Prior evidence files are kept. This cycle adds new files.

Tip CI for this commit is claimed only after the Actions run on this commit's SHA. Until that run is success, this file is the evidence record and the PR description carries the run link.

---

## 1. Refs

| Item | Value |
| --- | --- |
| Draft PR | https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/42 |
| Branch | `cursor/r4-aj-security-phase-b-ae72` |
| Takeover HEAD | `f5dddb49853883a239ff737a111e7cfe3cfd21f2` (matches `origin`) |
| Known mission start | `7834423e40296d04894ecc5ade203a6f56847afd` |
| Preserved after that start | `dc3e555` (script) and `f5dddb4` (AP record) |
| Base | `codex/punctum-r4-goal-20261115` @ `f0f951d9f30225d717c1f82df7661889e287ec34` |
| Last confirmed CI before this cycle | [44682873959](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44682873959) success on `f5dddb4` |

---

## 2. Clerk secret validation (G01)

GitHub secret list and `workflow_dispatch` both returned **403** to this token. The secret-using script is unchanged since `dc3e555`. The trusted run is still [44682640472](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44682640472) at **05:41:14 UTC**, after the owner update of `CLERK_SECRET_KEY` at **2026-11-20 05:24:43 UTC**.

| Secret name | Classification | HTTP | Environment | Instance | Matches `ins_3M6H9ktM3jO84RvEu5BmKFokCfr` |
| --- | --- | --- | --- | --- | --- |
| `CLERK_SECRET_KEY` | `sk_live_` | 200 | production | `ins_3M6H9ktM3jO84RvEu5BmKFokCfr` | yes |
| `PUNCTUM_CLERK_PRODUCTION_SECRET_KEY` | `sk_live_` | 200 | production | `ins_3M6H9ktM3jO84RvEu5BmKFokCfr` | yes |

`PUNCTUM_CLERK_PRODUCTION_PUBLISHABLE_KEY` was present and was not sent to the Backend API. Classification of the updated secret: **`sk_live_`**. It is not `INVALID_BACKEND_SECRET`. No secret value, header, or JWT was copied into git.

Evidence kept: `docs/operations/private-albums-r4/evidence/2026-11-20-clerk-r1-revalidation-ap.json`.

---

## 3. R1 maximum session lifetime

**State: `BLOCKED_API_GAP`.**

`GET /v1/instance` on `CLERK_SECRET_KEY` returned the fields `allowed_origins`, `allowed_subdomains`, `environment_type`, `id`, `max_allowed_users`, `object`, `subdomain_allowlist_enabled`, `workspace_id`. `sessionFieldsPresent` is false.

Clerk OpenAPI `bapi/2026-08-20.yml` (fetched 2026-11-20) defines `Instance` with exactly those fields. It has no maximum lifetime, inactivity timeout, or session-token lifetime. `platform/beta.yml` in the same snapshot has no `session_settings` schema. The published Backend API can update one session's `expire_at` (`PATCH /sessions/{session_id}`); that is a write and was not called. HTTP 200 is not the 14-day proof. Custom `GET /jwt_templates` is still an empty list and does not prove the default session token's `sid`.

Local contract, unchanged: `worker/auth/clerk-auth.ts` rejects verified tokens without `sessionId`. `sid:` revocation TTL is `1209600` seconds (14 days). `tk:` remains 24 hours. That local TTL matches a 14-day upstream maximum only when Clerk itself is set to ≤ 14 days. Production settings were not changed. No session was revoked.

### Dashboard proof still required

1. On instance `ins_3M6H9ktM3jO84RvEu5BmKFokCfr`, Dashboard → Sessions → Maximum lifetime enabled and duration **≤ 14 days (≤ 336 hours)**.
2. Record inactivity timeout separately. It is not the maximum lifetime.
3. Record that the default session token still contains `sid`.
4. Synthetic or QA-owned logout/replay: a revoked `sid` stays rejected. Do not revoke real user sessions.

Until that evidence exists, A1 stays pending and G19 stays `BLOCKED_SECURITY`.

---

## 4. Hostinger connection "Punctum Picture - Administração"

The alias is **not** on the Hostinger toolkit. A separate custom toolkit matches the normalized name.

| Field | Value |
| --- | --- |
| Toolkit | `custom_punctum_picture_administra_o` |
| Connection id | `custom_punctum_picture_administra_o_stamen-form` |
| Status | ACTIVE, private, default for that toolkit |
| Alias returned by list | none |
| Tools from search | none |
| `GET https://developers.hostinger.com/api/hosting/v1/websites?order_id=1008628483` | **401 Unauthenticated** |
| Used for inventory or writes | no |

The connection does not present a Hostinger API credential, so it is not identity-qualified for order `1008628483`. `hostinger_brake-angelo` (Operação 50/50) was not used. `hostinger_ackey-genal` (created 2026-09-24, no alias) was not queried.

Read-only inventory used `hostinger_usings-moko` (Punctum Picture), ACTIVE:

| Field | Value |
| --- | --- |
| Order | `1008628483` active, plan `hostinger_premium_v3`, only order on the connection |
| Subscription | `AzZiaeV92d20j1rmC`, Premium Web Hosting, `non_renewing` |
| User | `u571409090` |
| Client id | `1018536097` |
| Node site | `punctumpicture.com` enabled |
| Same order | `menezescontabilidade.com` builder, not modified |
| Aliceblue | not listed |
| Setups in the last 24h | none |

`workflow_dispatch` for the Hostinger preflight returned **403**. Comparison with `HOSTINGER_API` reuses [44682640483](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44682640483) on `dc3e555`, which read the same order, user, and Node site. The preflight script is unchanged since that run.

Evidence: `docs/operations/private-albums-r4/evidence/2026-11-20-hostinger-administracao-aq.json`.

---

## 5. Capability and A2

| Path | Can read the Punctum account | Can create a Node site | Used to mutate |
| --- | --- | --- | --- |
| Custom toolkit `custom_punctum_picture_administra_o_stamen-form` | no (API 401) | not shown | no |
| Composio `hostinger_usings-moko` | yes | tool absent from toolkit search | no |
| `HOSTINGER_GENERATE_FREE_SUBDOMAIN` | n/a | generates a name only | not called |
| GitHub `HOSTINGER_API` | yes, on the prior preflight | POST onboardings exists in Hostinger docs | no |

**A2: `AWAITING_A2`.** Checked again: cycle AO checklist, `execution-state.json` `A2_R3_Hostinger_QA_staging_path = PENDING_HUMAN`, and PR comment 7029962772 (verdict `R3-QA-ORIGIN = BLOCKED_EXTERNAL`, no site created). An API connection is not A2. No additional site was created. Isolated QA origin: **absent**. QA build id: **absent**.

---

## 6. Remote gates

| Gate | Result | Reason |
| --- | --- | --- |
| G05 | **NOT_RUN_REMOTE** | No isolated Node origin. Local exact `26214400` bytes, SHA-256 `fe069ef5aeb1ac3e20b03348c73eb6c6a1dfad2e0660a9c2e8b68188cd3392db`, stays `PASS_LOCAL`. |
| G17 | **NOT_RUN_REMOTE** | No Node origin measurement. Cloudflare health is not a substitute. |
| G18 | **NOT_RUN_REMOTE** | Local synthetic SQLite restore passed (2 clients, 2 galleries, 10 objects, NUL text). No isolated empty remote storage. |

`punctumpicture.com` was not used as a QA deploy target.

---

## 7. Local suites (mission G06)

Node `v22.23.4`, no production secrets. Every step exit 0.

| Step | Result |
| --- | --- |
| `npm audit --audit-level=low` | 0 vulnerabilities |
| typecheck, lint, `npm run build` | pass |
| Vitest | 333/333, 64 files |
| Vitest collage | 7/7 |
| `node --test` CI files plus G05 stream | 141 pass / 0 fail |
| Hostinger sanitize unittest | 2/2 |
| Playwright Chromium e2e | 23 PASS lines, exit 0 |

The e2e script also printed `Punctum public home purge unconfirmed after a successful admin change` and still exited 0. That line is not remote purge proof. Vitest logged client-disconnect exceptions during abort cases; the file total stayed 333 passed.

Evidence: `docs/operations/private-albums-r4/evidence/2026-11-20-g06-local-aq.json`.

These local results are not remote gate passes.

---

## 8. Product gates G01–G24

Counts this cycle: **1 PASS / 0 new FAIL / 5 BLOCKED_EXTERNAL / 1 BLOCKED_SECURITY / G05 G17 G18 NOT_RUN_REMOTE / remaining NOT_RUN**. Historical AO `FAIL` on remote G05 and G17 is not deleted.

| Gate | State | Note |
| --- | --- | --- |
| G01 | **PASS** | Branch reconciled at `f5dddb4`; Clerk instance and Hostinger order re-proven |
| G02 | NOT_RUN | CI on this commit is the regression run; remote DoD still open |
| G03–G04, G06, G08–G14, G16, G21, G24 | NOT_RUN | Remote or human target absent. Local regression passed and is not promoted |
| G05, G17, G18 | **NOT_RUN_REMOTE** | See §6 |
| G07 | BLOCKED_EXTERNAL | Real OTP/login QA |
| G15 | BLOCKED_EXTERNAL | Physical assistive matrix (A4) |
| G19 | **BLOCKED_SECURITY** | R1 and R3 open. This agent does not self-accept |
| G20 | BLOCKED_EXTERNAL | LGPD (A3) |
| G22 | BLOCKED_EXTERNAL | A6 not granted |
| G23 | BLOCKED_EXTERNAL | A7 not granted. No new resource to roll back |

## 9. H00–H10

| Gate | State | Note |
| --- | --- | --- |
| H00 | PASS | Order `1008628483` / `u571409090` / `punctumpicture.com` reconfirmed. Named custom connection is ACTIVE and not API-authenticated |
| H01 | BLOCKED_EXTERNAL | Real Clerk on an isolated managed origin |
| H02 | BLOCKED_EXTERNAL | D1/R2 parity |
| H03 | NOT_RUN | E2E on a QA Node origin |
| H04 | BLOCKED_EXTERNAL | Apex TLS / routing |
| H05 | BLOCKED_EXTERNAL | Remote rollback |
| H06 | BLOCKED_EXTERNAL | Ops cutover |
| H07 | BLOCKED_EXTERNAL | Auth/upload load |
| H08 | historical inventory only | No DNS writes |
| H09 | BLOCKED_EXTERNAL | Cutover |
| H10 | BLOCKED_EXTERNAL | Release |

---

## 10. Authorization A1–A7

All remain **PENDING**.

| ID | State |
| --- | --- |
| A1 R1 Clerk maximum lifetime | PENDING — `BLOCKED_API_GAP` |
| A2 R3 isolated Node QA | PENDING — `AWAITING_A2`, site not created |
| A3 G20 LGPD | PENDING |
| A4 G15 physical accessibility | PENDING |
| A5 G19 independent security | PENDING — no self-accept |
| A6 merge / cutover | PENDING |
| A7 rollback rehearsal outside disposable QA | PENDING |

---

## 11. Vulnerabilities and changes

No product code changed in this cycle. `npm audit --audit-level=low` reports 0 vulnerabilities. Protections were not weakened.

Still open:

- R1 Dashboard maximum lifetime and synthetic revocation replay
- R3 isolated origin, so remote G05/G17/G18 stay unrun
- G19 independent review on the release SHA
- Custom Administração connection is ACTIVE and returns 401 on the Hostinger API
- A3, A4, A6, A7
- Historical remote G05 and G17 FAIL from cycle AO

No Hostinger, DNS, Clerk, or database resource was created or changed.

**Next safe action:** a person with the Punctum Clerk Dashboard records Maximum lifetime ≤ 14 days for `ins_3M6H9ktM3jO84RvEu5BmKFokCfr`, then a synthetic logout/replay. Record A2 before any `POST /orders/1008628483/onboardings`. Give `custom_punctum_picture_administra_o_stamen-form` a Hostinger API credential, or keep the qualified read path as `HOSTINGER_API` on the Punctum account.

**Production remains `NO_GO`.**
