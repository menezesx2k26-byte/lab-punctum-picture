# Ciclo AP | R1/R3 QA unblock — 2026-11-20

**Mission:** `PUNCTUM-R1-R3-QA-UNBLOCK-20261120`  
**Verdict:** `PARTIAL_VERIFIED`  
**Production:** `NO_GO`  
**Completion:** not `COMPLETED_VERIFIED`. This cycle does not merge, cut over DNS, or deploy.

Prior package: `docs/operations/private-albums-r4/80-cycle-ao-ready-for-authorization-2026-11-20.md`.  
Prior evidence files from 04:53 UTC are kept. This cycle adds new files and does not replace them.

---

## 1. Refs

| Item | Value |
| --- | --- |
| Draft PR | https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/42 |
| Branch | `cursor/r4-aj-security-phase-b-ae72` |
| Initial HEAD | `7834423e40296d04894ecc5ade203a6f56847afd` |
| Remote HEAD at takeover | same SHA; it had not moved |
| Script/preflight SHA | `dc3e555d564296b8111937dd712541e35725eb31` |
| Base | `codex/punctum-r4-goal-20261115` @ `f0f951d9f30225d717c1f82df7661889e287ec34` |

Trusted runs on `dc3e555`:

| Run | Workflow | Result |
| --- | --- | --- |
| [44682640472](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44682640472) | Punctum Clerk R1 instance read-only | SUCCESS |
| [44682640483](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44682640483) | Punctum Hostinger account preflight | SUCCESS |
| [44682647810](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44682647810) | CI on `dc3e555` | started; superseded when the AP evidence commit lands |

---

## 2. Clerk secret validation (G01)

GitHub's secret-list API returned **403** to this agent token, so secret `updated_at` was not re-read here. The owner metadata says `CLERK_SECRET_KEY` was updated at **2026-11-20 05:24:43 UTC**. The trusted job ran at **05:41:14 UTC**, after that timestamp.

| Secret name | Prior prefix (04:53Z) | This run | HTTP | Environment | Instance | Matches `ins_3M6H9ktM3jO84RvEu5BmKFokCfr` |
| --- | --- | --- | --- | --- | --- | --- |
| `CLERK_SECRET_KEY` | `pk_live_` (publishable, not sent to the API) | **`sk_live_`** | **200** | production | `ins_3M6H9ktM3jO84RvEu5BmKFokCfr` | **yes** |
| `PUNCTUM_CLERK_PRODUCTION_SECRET_KEY` | `sk_live_` | `sk_live_` | 200 | production | `ins_3M6H9ktM3jO84RvEu5BmKFokCfr` | yes |

Both backend secrets resolve to the same production instance. `PUNCTUM_CLERK_PRODUCTION_PUBLISHABLE_KEY` is present and was not sent to the Backend API. Classification of the updated secret: **`sk_live_`**, not `INVALID_BACKEND_SECRET`.

Evidence: `docs/operations/private-albums-r4/evidence/2026-11-20-clerk-r1-revalidation-ap.json`.

The previous script stopped after the first valid key, so an updated `CLERK_SECRET_KEY` would never have been called. The script now probes every backend secret, refuses publishable keys, and drops secret-shaped strings from the report.

---

## 3. R1 maximum session lifetime

**State: `BLOCKED_API_GAP`.**

`GET /v1/instance` on the updated `CLERK_SECRET_KEY` returned HTTP 200 and these top-level fields only: `allowed_origins`, `allowed_subdomains`, `environment_type`, `id`, `max_allowed_users`, `object`, `subdomain_allowlist_enabled`, `workspace_id`. `sessionFieldsPresent` is false. No maximum lifetime, inactivity timeout, or session-token lifetime was in the payload.

Clerk's session-options guide, read 2026-11-20, places **Maximum lifetime** on Dashboard → Sessions, corresponding to Platform API `session_settings`. The separate `session` config is session-token lifetime. HTTP 200 is not R1 proof. Custom `GET /jwt_templates` returned an empty list for both secrets; that list is not the default session token and does not prove or disprove `sid`.

Local compatibility, re-read in `worker/auth/clerk-auth.ts`: verified tokens without `sessionId` are rejected, and `sid:` revocation TTL is `1209600` seconds (14 days). `tk:` remains 24 hours. That local TTL matches a 14-day upstream maximum only when Clerk itself is set to ≤ 14 days. This cycle did not change production settings and did not revoke any session.

### Dashboard proof still required

1. On instance `ins_3M6H9ktM3jO84RvEu5BmKFokCfr`, Dashboard → Sessions → Maximum lifetime enabled and duration **≤ 14 days (≤ 336 hours)**.
2. Record inactivity timeout separately. It is not the maximum lifetime.
3. Record that the default session token still contains `sid`.
4. Synthetic or QA-owned logout/replay: a revoked `sid` stays rejected. Do not revoke real user sessions.

Until that evidence exists, A1 stays pending and G19 stays `BLOCKED_SECURITY`.

---

## 4. Hostinger connection "Punctum Picture - Administração"

**Found: no.** This Composio session lists three private Hostinger accounts:

| id | alias | status | used |
| --- | --- | --- | --- |
| `hostinger_brake-angelo` | Operacao 50-50 Producao | ACTIVE, default | no |
| `hostinger_usings-moko` | Punctum Picture | ACTIVE | yes, read-only |
| `hostinger_ackey-genal` | (none) | ACTIVE, created 2026-09-24 | no |

The requested alias is absent. `hostinger_ackey-genal` is older than this mission, so it is not that new connection. The connection may live in another Composio user or team workspace. This session cannot see it.

Account match on `hostinger_usings-moko`, confirmed again by `HOSTINGER_API` in Actions:

| Field | Value |
| --- | --- |
| Order | `1008628483` active, plan `hostinger_premium_v3` |
| Subscription | `AzZiaeV92d20j1rmC`, Premium Web Hosting, `non_renewing` |
| User | `u571409090` |
| Client id | `1018536097` |
| Node site | `punctumpicture.com` enabled |
| Same order | `menezescontabilidade.com` builder, not modified |
| Aliceblue | not listed |
| Setups in the last 24h | none |

---

## 5. Capability matrix and A2

| Path | Can read the Punctum account | Can create a Node site | Can deploy Node | Used to mutate |
| --- | --- | --- | --- | --- |
| Composio `hostinger_usings-moko` | yes | tool not in this toolkit search | tool not in this toolkit search | no |
| `HOSTINGER_GENERATE_FREE_SUBDOMAIN` | n/a | generates a name only | no | not called |
| GitHub `HOSTINGER_API` | yes, including Node build settings and history | POST onboardings exists in Hostinger docs | build POST exists in prior workflows | no |

Observed occupancy: **2 websites, 1 Node.js site**. The API did not return a remaining Node quota. Current public v6 Premium marketing lists Node.js as unavailable and a 3-website cap. This order is **premium v3** and already runs Node, so that table is not this order's contract.

`GET .../nodejs/builds/settings/env` returned **HTTP 500** `Hosting:9999` on this run. Build settings and build history stayed HTTP 200. No environment values were stored.

**A2: `AWAITING_A2`.** PR #42, cycle AO, `execution-state.json`, and PR comment 7029962772 leave A2 pending. No additional site was created. Isolated QA origin: **absent**. QA build id: **absent**.

---

## 6. Remote gates

| Gate | Result | Reason |
| --- | --- | --- |
| G05 | **NOT_RUN_REMOTE** | No isolated Node origin. Local 25 MiB evidence stays `PASS_LOCAL` and is not promoted. |
| G17 | **NOT_RUN_REMOTE** | No Node origin measurement. Cloudflare health is not a substitute. |
| G18 | **NOT_RUN_REMOTE** | No isolated empty storage. No restore was attempted. |

`aliceblue-locust-999458.hostingersite.com` remains unlisted. `punctumpicture.com` was not used as a QA deploy target.

---

## 7. G01–G24

Counts this cycle: **1 PASS / 0 new FAIL / 5 BLOCKED_EXTERNAL / 1 BLOCKED_SECURITY / G05 G17 G18 NOT_RUN_REMOTE / remaining NOT_RUN**. Historical AO `FAIL` on G05 and G17 is not deleted; the remote attempt this cycle is `NOT_RUN_REMOTE`, which is still not a pass.

| Gate | State | Note |
| --- | --- | --- |
| G01 | **PASS** | Branch reconciled at `7834423`; Clerk instance and Hostinger order re-proven |
| G02 | NOT_RUN | CI on the final AP SHA is the regression run; remote DoD still open |
| G03 | NOT_RUN | Admin E2E target absent |
| G04 | NOT_RUN | Gallery E2E target absent |
| G05 | **NOT_RUN_REMOTE** | See §6 |
| G06 | NOT_RUN | Local sid contract unchanged; real JWKS target absent |
| G07 | BLOCKED_EXTERNAL | Real OTP/login QA |
| G08 | NOT_RUN | Revocation replay not run; real sessions not revoked |
| G09 | NOT_RUN | Remote cookie restart absent |
| G10 | NOT_RUN | CDN remote absent |
| G11 | NOT_RUN | Favoritos remote |
| G12 | NOT_RUN | Download UI target |
| G13 | NOT_RUN | Client browser real |
| G14 | NOT_RUN | Admin browser real |
| G15 | BLOCKED_EXTERNAL | Physical assistive matrix (A4) |
| G16 | NOT_RUN | Public regression on staging |
| G17 | **NOT_RUN_REMOTE** | See §6 |
| G18 | **NOT_RUN_REMOTE** | See §6 |
| G19 | **BLOCKED_SECURITY** | R1 and R3 open. This agent does not self-accept |
| G20 | BLOCKED_EXTERNAL | LGPD (A3) |
| G21 | NOT_RUN | PR #42 remains draft |
| G22 | BLOCKED_EXTERNAL | A6 not granted |
| G23 | BLOCKED_EXTERNAL | A7 not granted. No new resource to roll back |
| G24 | NOT_RUN | Continuity checkpoint is this repo file, not a Drive handoff |

## 8. H00–H10

| Gate | State | Note |
| --- | --- | --- |
| H00 | PASS | Order `1008628483` / `u571409090` / `punctumpicture.com` reconfirmed. Admin alias absent in this Composio session |
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

## 9. Authorization A1–A7

All remain **PENDING**. Unchecked items are not approvals.

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

## 10. Tests and security

Local, before the trusted runs: `node --test scripts/punctum-clerk-instance-readonly.test.mjs` **7/7**, `python3 -m unittest` Hostinger sanitize **2/2**.

No product protection was weakened. The script fix stops a publishable key from being sent to `GET /v1/instance` and forces the updated secret to be tested.

Remaining pendencies:

- R1 Dashboard maximum lifetime and synthetic revocation replay
- R3 isolated origin, so G05/G17/G18 stay remote-unrun
- G19 independent review on the final SHA
- Composio admin alias not visible here
- Hostinger env-list HTTP 500 on this read
- A3, A4, A6, A7

---

## 11. Rollback and next safe action

No Hostinger, DNS, Clerk, or database resource was created or changed. Rollback of this cycle is `git revert` of the AP commits. Production rollback runbooks are unchanged and were not rehearsed.

**Next safe action:** a person with the Punctum Clerk Dashboard opens Sessions for `ins_3M6H9ktM3jO84RvEu5BmKFokCfr` and records Maximum lifetime ≤ 14 days, then a synthetic logout/replay. Separately, record A2 before any `POST /orders/1008628483/onboardings`. If the admin Composio connection should be used, it has to be visible to this Composio user; until then the qualified read path is `HOSTINGER_API` on the Punctum account.

**Production remains `NO_GO`.**
