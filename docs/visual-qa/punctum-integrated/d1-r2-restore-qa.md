# D1/R2 isolation and restoration QA

## Current run

No remote QA workflow, D1 migration, object upload, restore, or Worker deployment was run during this mission. Remote plan/billing visibility was blocked (Cloudflare subscription endpoint returned 403 for missing Billing Read scope). Production was inspected read-only and no mutation was made.

## Historical isolated pilot

GitHub Actions [40124217595](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40124217595), SHA `eb11de10106b1e06c04f66c7ec3e1b8c4b985608`, reported isolated QA resources, 93 restored D1 rows and 40 R2 objects checked byte-for-byte, then archive/reset/disable revocation. Its sanitized artifact is `docs/operations/evidence/2026-10-24-private-auth-qa.json` and says `productionTouched=false`.

The same dated readback recorded production Worker `punctum-picture-migration` at 100% traffic, deployment ID `366e1e15-ee14-46fd-aa39-4b86c5c1fd8c`, version ID `84b4e28d-9c26-4024-81bc-ccf5a98a7dca`, and a public API response of HTTP 200 with SHA-256 `509a13aa848a1b0120a61ee09eb733433122d8429b1c296281ee5156cc82867c`. The artifact says these values were unchanged from its initial readback. Treat these IDs/hash as **2026-10-24 historical evidence**; this mission's 2026-10-25 inspection was read-only and did not perform a new byte-for-byte production probe.

This is historical evidence for data/domain behavior under a synthetic QA session; it does not prove real Access OTP/JWT, current resource availability, present quotas, or a current code SHA. No raw D1 dump, image, object key, or cookie is copied here.

## Safety controls

- QA names and restore mappings come from `scripts/lib/private-preview.mjs`.
- Preview guard rejects the known production database IDs.
- QA R2 buckets are private; `r2.dev` and custom public domains were disabled in read-only inventory.
- No resource was deleted, migration run remotely or binding changed in this mission.
- The workflow was not re-run because current plan/usage limits could not be read and cost must remain R$0.

**Current result: BLOCKED_CURRENT_REMOTE_REPLAY.**
