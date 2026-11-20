# R1 ops checklist — Clerk session lifetime ≤ 14d + API revoke

**Status após o ciclo AU:** o dashboard da instância de produção confirmou máximo web de 7 dias. Permanecem abertos o ensaio real de sessão e a revisão formal. [Relatório AU](86-cycle-au-p0-final-dod-2026-11-20.md)

**Cycle AP (2026-11-20 05:41 UTC):** `CLERK_SECRET_KEY` was re-read in Actions as `sk_live_` and returns instance `ins_3M6H9ktM3jO84RvEu5BmKFokCfr` (production, HTTP 200). `GET /v1/instance` still has no maximum-lifetime field. R1 remains **`BLOCKED_API_GAP`**. See `81-cycle-ap-qa-unblock-2026-11-20.md`. Production settings were not changed and no session was revoked.

**Cycle AQ (2026-11-20):** the same Actions evidence still stands (`workflow_dispatch` and the secret-list API returned 403; the script is unchanged). Clerk OpenAPI `bapi/2026-08-20.yml` `Instance` schema matches that payload and has no lifetime field. `platform/beta.yml` in that snapshot has no `session_settings`. R1 remains **`BLOCKED_API_GAP`**. See `82-cycle-aq-qa-unblock-2026-11-20.md`.

Punctum local `sid:` revocation TTL is **14 days** (`CLERK_SESSION_REVOCATION_TTL_SECONDS`). Upstream Clerk sessions longer than that can mint fresh JWTs with the same `sid` after local deny-list expiry unless Clerk itself is configured and revoked correctly.

## Operator steps (authorized Clerk Dashboard / Backend API)

1. Open the Punctum Clerk application (production or isolated QA — never mix).
2. **Sessions → Maximum lifetime / inactivity** (wording varies by Clerk UI): set max session lifetime **≤ 14 days** (≤ 336 hours). Prefer shorter for Studio admin if product allows.
3. Confirm **session token** template still includes standard `sid` claim (required by Punctum verifier).
4. Document the exact setting values, application ID (not secret), and screenshot/hash in a private ops note — do not commit secrets.
5. **API revoke path:** on admin/client logout Punctum already deny-lists `sid:` + token digest. Optionally enable Backend API `sessions.revoke` with `CLERK_SECRET_KEY` only after a dedicated change request; not implemented as auto-call in this cycle.
6. Re-test on authorized QA: login → Sair → confirm Clerk browser session cleared (R2) and old JWT/`sid` denied; wait or clock-skew test must not revive after local TTL without Clerk max lifetime compliance.

## Acceptance for clearing R1 (human)

- [x] Max session lifetime ≤ 14d verified in Clerk for the target application
- [ ] Evidence stored privately (not in public repo secrets)  
- [ ] QA replay after logout still denied  
- [ ] Independent reviewer accepts R1 closed on named SHA  

**R1 OPEN** para o ensaio real e o aceite do revisor. G19 permanece **BLOCKED_SECURITY**.
