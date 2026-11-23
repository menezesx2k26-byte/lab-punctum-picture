# Definition of Done checklist

| Gate | Status | Why |
| --- | --- | --- |
| DoD-A — Collage | **BLOCKED** | CSS/SSR and CI pass, but current rendered browser, viewport, Studio, accessibility, performance and physical-device evidence is missing. |
| DoD-B — Albums | **BLOCKED_REAL_OTP** | Local code tests and historical isolated D1/R2 domain pilot pass; no real OTP/JWT/session proof, current remote run, or current mobile flow. |
| DoD-C — Cloudflare | **BLOCKED** | Resource inventory read; Billing Read denied (403); no current remote QA replay; usage/quotas unknown. Production preservation verified read-only. |
| DoD-D — PersistFlow/Martha | **BLOCKED_INFRA_NOT_VERIFIED** | No current owner/controller or sandbox inventory; connector requires run/workspace IDs and cannot list. No run created. |
| DoD-E — Integration | **BLOCKED** | Separate branches preserved, but no disposable combined preview, end-to-end/browser cross-check, current remote restore or tested rollback. A local P1 CAPA is corrected and awaits CI evidence. |
| DoD-F — Release | **BLOCKED by explicit scope** | Merge, deploy, production activation and commercial changes are prohibited by the user’s mission. |

No overall PASS is declared. A CI PASS on one or both branches cannot close browser, identity, quota, governance or release gates.
