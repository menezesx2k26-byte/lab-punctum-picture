# Risk register

| ID | Risk / scenario | Severity | Containment / mitigation | Evidence and status |
| --- | --- | --- | --- | --- |
| R-01 | Access OTP/JWT not proven; an unknown or revoked identity might be improperly treated as authenticated | P0 | Keep private galleries off in production; use Access as identity only and D1 as authorization authority; require real OTP/JWT flow before release | Historical run `40124217595` explicitly says `accessProviderTested=false`; **open/blocking** |
| R-02 | Concurrent requests bypass shared D1 rate limit or repeated 429s consume D1 writes | P1 | Conditional atomic D1 UPSERT with `RETURNING`; saturated row is not updated; simultaneous regression test | Pre-fix RED accepted 8/8 with max 2; amended targeted local suite passes. Independent acceptance and final CI pending at snapshot; `nonconformities.md` |
| R-03 | Private originals or metadata leak across client identities | P0 | Keep R2 private; D1 ownership checks; synthetic QA only; no photos in fixtures | Historical isolated pilot tested application authorization; no current real OTP; residual gate open |
| R-04 | Worker CPU or provider quota exceeded in real traffic | P1 | Avoid paid CPU config; Access primary avoids PBKDF2 path in that mode; validate each route and quota before release | Historical worker `exceededCpu` and plan read blocked; current quota unknown |
| R-05 | CSS/public collage changes regress mobile, headings or private routes | P1 | Scope CSS to public home; static/SSR contracts; maintain separate branches; browser check still required | PR #14 CI run `40161708958` success; actual layout/browser remains unmeasured |
| R-06 | PersistFlow or “Martha” guessed as owner/runtime, causing cross-tenant write | P0 | No execution; require owner, run/workspace and resource inventory first | Connector lacks list operation; Hostinger record absent in checked accounts; blocked |
| R-07 | Existing service use exceeds free quota despite R$0 mission budget | P1 | No remote deploy or QA write; billing and quota read blocked; keep all mutations local/GitHub | Subscription read 403; **open** |
| R-08 | Recovery or deletion interpreted as permission to discard originals | P1 | Preserve D1/R2; use fixture-only recovery; no deletion; require approved retention policy | Rollback documented but no rollback run in this mission |
| R-09 | CI success mistaken for customer or editorial acceptance | P1 | Keep all six DoD states separate; no production release | PR metadata remains draft and unmerged; release **NO-GO** |

Severity uses the mission’s adapted software scale; it is not a certification assessment. Owners: engineering for R-02/R-05, account/service owner for R-01/R-03/R-04/R-06/R-07/R-08, release owner for R-09.
