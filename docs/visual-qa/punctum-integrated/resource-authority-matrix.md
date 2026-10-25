# Resource and authority matrix

All Cloudflare and Hostinger inspection in this mission was read-only. Names below are identifiers, not credentials. Secrets were not read or recorded.

| Resource | Owner / authority | Purpose / environment | Current evidence | Approved writes in this mission | Cost risk |
| --- | --- | --- | --- | --- | --- |
| Cloudflare account `257bca437616da74ece1ce4bbaf0bd89` | Account owner not independently confirmed | Punctum and unrelated account resources | Workers, D1, R2, Access read via authorized connector; subscription endpoint returned 403 | None remotely | Existing usage/plan not fully confirmed |
| Worker `punctum-picture-migration` | Punctum account; domain route owner not independently verified | Current apex/www production service | Zone custom hostnames route apex and www here; production Worker unchanged | None | Existing request/storage usage |
| Worker `punctum-picture-albums-qa` | Same account; QA resource | Isolated private-gallery QA | Access configured; QA D1/R2 bindings observed; no custom public domain | None in this run | Could incur existing plan usage |
| Worker `punctum-picture-miranda` | Owner/purpose unknown | Unknown/other | Name observed only | None | Unknown |
| D1 `punctum-picture` · `22697f13-7484-41e3-9441-f7b902c6577a` | Punctum production | Production database | Production binding observed; no migration or write | None | Existing usage |
| D1 `punctum-picture-albums-qa` · `0801d4f1-7c85-4db4-8643-7b7c9e34862c` | QA resource | Isolated QA database | QA workflow/script mapping | None in this run | Existing usage |
| D1 `punctum-picture-albums-qa-restore` · `b5087ae7-8c28-40eb-b541-8a58755131d3` | QA resource | Restore validation database | QA restore mapping | None in this run | Existing usage |
| D1 `4e959036-a3f0-4faf-bda2-fca9b4c5e984` | Historical/protected by preview guard; current binding unknown | Environment unknown | Protected ID in `scripts/lib/private-preview.mjs`; not confirmed as current binding | None | Unknown |
| R2 originals/backups: production `punctum-picture-originals`, `punctum-picture-backups`; preview counterparts `punctum-picture-originals-preview`, `punctum-picture-backups-preview` | Punctum environments | Production/preview content and backup | Names in `wrangler.jsonc`; provider inventory found production/QA buckets, no public domains | None | R2 billing/quota not verified |
| R2 `punctum-picture-albums-qa-originals`, `punctum-picture-albums-qa-backups`, `punctum-picture-albums-qa-restored` | QA | QA originals, backups and restore | Names in `scripts/lib/private-preview.mjs`; R2 public access disabled | None in this run | Existing R2 plan/usage unknown |
| Zone `punctumpicture.com` | Domain registrant not independently confirmed | Public site | Free Website zone; apex and www map to production Worker | None | Plan status is not a complete billable quota report |
| Cloudflare Access QA application/policy, One-time PIN | Cloudflare account; policy owner not independently confirmed | QA identity gate, one-hour session | App/AUD and OTP IdP configured; no real OTP/JWT exchange in this run | None | User/plan quota not verified |
| `darkslategrey-raccoon-448222.hostingersite.com` | Hostinger account owner unknown | Historically reported PersistFlow | No matching website record returned in either queried Hostinger connection in this run; historical `/healthz` observation remains historical | Explicitly prohibited for bridge deployment | Could alter shared service; no use made |
| PersistFlow Sandbox connector | Service owner and tenant unknown | Run/workspace sandbox | Only inspect-by-ID and create operation available; no list/inventory operation | No create/run | Unknown; no run started |
| GitHub repo and existing branches | Repository owner | PR #13 and #14 review branches | PR metadata read; commits pushed only to their existing branches after local verification | Branch-scoped commits/PR descriptions authorized | GitHub Actions usage; no external paid service requested |

The Workers `usage-model` value of `standard` does not prove Free plan limits. Account-wide event volume is not a billable usage or CPU measurement. Billing reads were blocked by a 403 due to missing Billing Read scope; no broader credentials were sought. See `cloudflare-runtime-cost.md` and `persistflow-martha-inventory.md`.
