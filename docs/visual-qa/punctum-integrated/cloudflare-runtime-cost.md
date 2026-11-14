# Cloudflare runtime and cost record

## Read-only findings

- Zone `punctumpicture.com` is on Free Website; apex and `www` point to Worker service `punctum-picture-migration`. Classic Workers route list was empty.
- QA Worker `punctum-picture-albums-qa` has the private Access mode, matching Access audience configuration, preview environment, private gallery flag and QA restore D1/R2 bindings. This aligns with `scripts/lib/private-preview.mjs`.
- Production Worker was observed without private-gallery bindings/flag. Production D1/R2 binding and current version were read, not changed.
- R2 buckets had no enabled `r2.dev` or custom domain in the inventory.
- The Access QA application and OTP identity provider exist; no OTP/JWT exchange occurred.
- `usage-model=standard` and 7-day event count 66,580 are not proof of a Free-plan quota or billable usage.
- `GET /accounts/{account}/subscriptions` returned HTTP 403 because the authorized connector lacks Billing Read. Current Worker, Access and R2 quotas/charges therefore remain **UNKNOWN**.

## Spend and runtime evidence

Incremental spend in this run: R$0. No plan upgrade, billing mutation, remote deployment, preview write, migration or Cloudflare Browser Rendering was performed. Existing service usage may still be billable; zero incremental spend is not a claim of zero account usage.

Local runtime diagnosis on PR #14: `vinext start` reproducibly fails in Node’s default loader with `ERR_UNSUPPORTED_ESM_URL_SCHEME` for the virtual `cloudflare:` scheme. The supported Vite/Cloudflare `npm run dev` path returned HTTP 200 for `/` and `/portfolio` after local-only D1 migrations. This is local smoke evidence, not a built production preview or browser visual test. See `docs/visual-qa/punctum-mobile-collage-2026-10-25.md` on the PR #14 branch.

**Gate: BLOCKED_BILLING_SCOPE_AND_CURRENT_REMOTE_QA.** No claim is made that Workers Free capacity is sufficient for all traffic.
