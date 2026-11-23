# R4 private-album live QA in GitHub Codespaces

This harness lets the repository owner run the live R4 private-album gates
(G05 remote, G06-G14, G17, G18, G23 and the negative tests) from a Codespace by
pasting real secrets into **Codespaces secrets**. It REUSES the existing gate
scripts and never rewrites or weakens any of them, and never touches any
JWT / issuer / audience / azp / session / revocation check.

It is **fail-closed**: a gate whose required secrets are unset is reported
`SKIP` (never a fake pass), and the process exits non-zero only if a gate that
actually RAN failed. Secret **values are never printed or written** to any
evidence file; only secret **names** appear.

## 1. Open the Codespace

1. On GitHub, open the repository and switch to branch
   `codex/punctum-unlimited-release-20261120`.
2. Create a Codespace on that branch (Code -> Codespaces -> New, select the
   branch). The dev container (`.devcontainer/devcontainer.json`) installs
   Node 22, Python 3, the GitHub CLI, `openssl`, Playwright chromium, and makes
   `wrangler` available via the project dev dependency (`npx wrangler`).
3. Wait for `postCreateCommand` to finish (npm deps + openssl + playwright
   chromium + wrangler check).

## 2. Set the Codespaces secrets (names only)

Add these under **Settings -> Codespaces -> Secrets** (or the repository's
Codespaces secret settings) and grant them to this repository. The
`.devcontainer/devcontainer.json` `secrets` block declares the same names so
Codespaces prompts for any that are missing. **Never commit the values.**

Grouped by the gate that consumes them:

### Clerk runtime / browser proof (G06-G10)
- `CLERK_SECRET_KEY` - Clerk live secret key (`sk_live_...`).
- `CLERK_PUBLISHABLE_KEY` - Clerk live publishable key (`pk_live_...`).
- `CLERK_ISSUER` - Clerk issuer URL.
- `CLERK_JWT_KEY` - Clerk JWKS / JWT verification key material.
- `CLERK_AUTHORIZED_PARTIES` - authorized parties (azp) list.
- `SITE_ORIGIN` - public site origin.
- `PUNCTUM_CLERK_ADMIN_EMAIL` - Clerk-linked admin email.
- `PUNCTUM_CLERK_ADMIN_USER_ID` - Clerk admin user id (`user_...`).
- `PUNCTUM_CLERK_SESSION_ID` - Clerk admin session id (`sess_...`).
- `PUNCTUM_CLERK_BROWSER_SESSION_JWT` - short-lived Clerk session JWT for the browser proof.

### Managed origin (G05 remote, G06-G14, G17)
- `PUNCTUM_QA_ORIGIN` - must equal `https://aliceblue-locust-999458.hostingersite.com` (the managed functional gate hard-asserts this and fails closed otherwise).
- `PUNCTUM_QA_ADMIN_EMAIL` - admin email for the functional login.
- `PUNCTUM_QA_TEST_PASSWORD` - admin password for the functional login.
- `SOURCE_ADMIN_EMAIL` - source admin email (acceptance HTTP + managed production harness).
- `SOURCE_ADMIN_PASSWORD` - source admin password (acceptance HTTP + managed production harness).
- `HOSTINGER_API` - Hostinger API token for the managed production prepare harness (G17).
- `PUNCTUM_MANAGED_OUTPUT` - output directory for the managed production prepare harness.

### Cloudflare recovery (G18/G23)
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token scoped for R2 recovery object reads.
- `PUNCTUM_MANAGED_RECOVERY_KEY` - hex AES-256-GCM recovery key.
- `PUNCTUM_MANAGED_RECOVERY_PREFIX` - R2 object prefix of the recovery export.

### Managed acceptance probe (G05 remote)
- `PUNCTUM_MANAGED_PROBE` - probe marker matching `/^p[a-f0-9]{6}$/`.

### CI provenance (not secret, but required by the managed gates)
- `GITHUB_SHA` - source commit SHA stamped into every managed gate report.
- `GITHUB_RUN_ID`, `GITHUB_RUN_ATTEMPT` - stamped into the managed functional synthetic album title.

## 3. Run the gates

Run everything (each gate RUNs or SKIPs based on which secrets are present):

```bash
npm run qa:r4
```

Fast offline smoke (only the no-secret local 25 MiB proof; never contacts any
origin):

```bash
npm run qa:r4:local
```

The orchestrator prints a RUN/SKIP plan, tees each gate's output into
`outputs/qa-r4-codespace/<gate>.json`, writes `outputs/qa-r4-codespace/summary.json`,
and exits non-zero only if a gate that RAN failed.

### Exact command per gate

The orchestrator shells out to the real scripts. You can also run each directly.

| Gate(s) | What it proves | Exact command |
| --- | --- | --- |
| G05 local | Private 25 MiB raster upload/download + public-release guard, fully offline | `node scripts/hostinger-r4-25mib-local-proof.mjs --public-release-check` then `node scripts/hostinger-r4-25mib-local-proof.mjs` |
| G05 remote | Managed origin upload/download byte-for-byte integrity over HTTP | `node scripts/hostinger-managed-acceptance-http.mjs` |
| G06-G14 (+ negatives) | Managed synthetic functional exercise then verify, including anonymous Studio denial and private/R4 route 404 negatives | `PUNCTUM_QA_ORIGIN=https://aliceblue-locust-999458.hostingersite.com node scripts/hostinger-managed-functional.mjs exercise` then `... node scripts/hostinger-managed-functional.mjs verify` |
| G06-G10 | Clerk browser login / logout / session revocation against real Clerk + isolated app | `node scripts/hostinger-clerk-browser-proof.mjs` |
| G17 | Managed production prepare harness; writes `outputs/punctum-managed-production/report.json` | `python3 scripts/hostinger_managed_production.py` |
| G18 / G23 | Download encrypted recovery export, decrypt, restore into an isolated local D1, verify schema + inventory | `node scripts/hostinger-managed-recovery-download.mjs` |

Negative tests are embedded in the managed functional `exercise` phase
(anonymous `/admin/studio` -> 303, and `/albuns/entrar`,
`/studio-preview-internal`, `/application.sqlite`, `/capability.sqlite`,
`/synthetic-media.bin` -> 404) and in the G05 local proof (reject oversize,
short upload, invalid checksum, cross-client GET/HEAD denial). They run as part
of their parent gate; there is no separate command.

G18/G23 depends on `outputs/punctum-managed-production/report.json` produced by
the G17 prepare harness, so run G17 (or `npm run qa:r4` with the G17 secrets
set) before the recovery download gate; otherwise the recovery gate fails closed.

## 4. Gates this harness CANNOT close (external / human)

These remain external and are reported as `EXTERNAL` in the plan. A green
`npm run qa:r4` run does **not** imply any of them is satisfied:

- **G15** - assistive-technology (TalkBack / VoiceOver) verification is physical / human.
- **G19** - independent security sign-off is an external human review.
- **G20** - LGPD controller approval is an external human decision.
- **G22** - release authorization is an external human decision.

## 5. Safety

- Only secret **names** are ever committed (in this doc and in
  `.devcontainer/devcontainer.json`). Never commit a secret value.
- The harness fails closed: missing secrets -> `SKIP`, never a fake pass.
- No gate script and no auth / security check is modified by this harness.
