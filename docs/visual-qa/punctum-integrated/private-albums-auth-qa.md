# Private album authentication QA

## Current gate

**BLOCKED_REAL_OTP.** The current mission did not enter an OTP, obtain a JWT or issue a client session. No email inbox was read and no code was requested in chat. An existing QA Access app and One-time PIN configuration were confirmed read-only, but configuration and a redirect do not prove identity.

## Historical domain pilot (not current identity proof)

The sanitized artifact `docs/operations/evidence/2026-10-24-private-auth-qa.json` describes GitHub Actions run [40124217595](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40124217595), SHA `eb11de10106b1e06c04f66c7ec3e1b8c4b985608`, on isolated QA. It records 10 uploads plus retry, publication, favorites, downloads, cross-client/public media denial, restoration of 93 D1 rows and 40 R2 objects byte-for-byte, and archive/reset/disable revocation. The report explicitly says `accessProviderTested=false`, `productionTouched=false`, and `partial-access-otp-required`; downstream application tests used a synthetic HMAC session exclusively in QA.

## Required real-provider sequence still open

1. An authorized owner completes OTP directly in the provider’s secure flow.
2. Capture sanitized evidence of issuer/audience/subject/type/expiry validation and signature verification; never record the JWT or OTP.
3. Verify active client association in D1, own-gallery access, logout/re-entry, unknown/disabled account, session-version revocation and private-media denial.
4. Confirm zero private bytes for client A requesting client B’s image.
5. Repeat on supported mobile devices after approval.

Synthetic fixture tests remain useful for authorization logic but cannot close steps 1–4. Production private galleries remain disabled.
