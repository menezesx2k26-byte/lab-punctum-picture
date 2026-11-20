# R1 ops checklist — Clerk session lifetime ≤ 14d + API revoke

**Status:** checklist only. **Not** Dashboard/API proof. Does not clear G19 or R1 residual.

Punctum local `sid:` revocation TTL is **14 days** (`CLERK_SESSION_REVOCATION_TTL_SECONDS`). Upstream Clerk sessions longer than that can mint fresh JWTs with the same `sid` after local deny-list expiry unless Clerk itself is configured and revoked correctly.

## Operator steps (authorized Clerk Dashboard / Backend API)

1. Open the Punctum Clerk application (production or isolated QA — never mix).
2. **Sessions → Maximum lifetime / inactivity** (wording varies by Clerk UI): set max session lifetime **≤ 14 days** (≤ 336 hours). Prefer shorter for Studio admin if product allows.
3. Confirm **session token** template still includes standard `sid` claim (required by Punctum verifier).
4. Document the exact setting values, application ID (not secret), and screenshot/hash in a private ops note — do not commit secrets.
5. **API revoke path:** on admin/client logout Punctum already deny-lists `sid:` + token digest. Optionally enable Backend API `sessions.revoke` with `CLERK_SECRET_KEY` only after a dedicated change request; not implemented as auto-call in this cycle.
6. Re-test on authorized QA: login → Sair → confirm Clerk browser session cleared (R2) and old JWT/`sid` denied; wait or clock-skew test must not revive after local TTL without Clerk max lifetime compliance.

## Acceptance for clearing R1 (human)

- [ ] Max session lifetime ≤ 14d verified in Clerk for the target application  
- [ ] Evidence stored privately (not in public repo secrets)  
- [ ] QA replay after logout still denied  
- [ ] Independent reviewer accepts R1 closed on named SHA  

Until then: **R1 OPEN**; G19 remains **BLOCKED_SECURITY**.
