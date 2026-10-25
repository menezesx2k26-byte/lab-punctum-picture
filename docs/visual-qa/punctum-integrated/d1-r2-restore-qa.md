# D1/R2 isolation and restoration QA

## Current run

No remote QA workflow, D1 migration, object upload, restore, or Worker deployment was run during this mission. Remote plan/billing visibility was blocked (Cloudflare subscription endpoint returned 403 for missing Billing Read scope). Production was inspected read-only and no mutation was made.

## Historical isolated pilot

GitHub Actions [40124217595](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40124217595), SHA `eb11de10106b1e06c04f66c7ec3e1b8c4b985608`, reported isolated QA resources, 93 restored D1 rows and 40 R2 objects checked byte-for-byte, then archive/reset/disable revocation. Its sanitized artifact is `docs/operations/evidence/2026-10-24-private-auth-qa.json` and says `productionTouched=false`.

This is historical evidence for data/domain behavior under a synthetic QA session; it does not prove real Access OTP/JWT, current resource availability, present quotas, or a current code SHA. No raw D1 dump, image, object key, or cookie is copied here.

## Safety controls

- QA names and restore mappings come from `scripts/lib/private-preview.mjs`.
- Preview guard rejects the known production database IDs.
- QA R2 buckets are private; `r2.dev` and custom public domains were disabled in read-only inventory.
- No resource was deleted, migration run remotely or binding changed in this mission.
- The workflow was not re-run because current plan/usage limits could not be read and cost must remain R$0.

**Current result: BLOCKED_CURRENT_REMOTE_REPLAY.**
