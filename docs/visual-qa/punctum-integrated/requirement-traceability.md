# Requirement traceability matrix

Each row is an individual, binary gate. A static/unit result is stated only where that is the complete criterion; when the mission requires a rendered/browser/provider check, partial code evidence does not change BLOCKED. Owners indicate who must supply the missing evidence. Source commits, commands, environment, UTC times and artifacts are indexed in `evidence-manifest.json`.

| ID | Binary criterion | Owner | Test / evidence | Status |
| --- | --- | --- | --- | --- |
| VIS-001 | Approved palette colors match the specified purple/yellow/paper/ink values | Design/front-end | PR #14 palette registry and `collage-theme.spec.ts` | PASS |
| VIS-002 | Collage story title renders at the approved heading level with no skipped card heading | Front-end | `collage-frontend.spec.tsx`; CI 40161708958 | PASS |
| VIS-003 | Every collage art asset has approved/original provenance and contains no copied third-party artwork | Editorial/design | Asset provenance and Maria review not captured | BLOCKED |
| VIS-004 | Managed photos remain natural and are not forced into an arbitrary 4:5 crop | Front-end | `scripts/collage-css.test.mjs` asserts `object-fit: contain`; no current screenshot | PASS |
| VIS-005 | Rendered collage composition meets the approved editorial direction | Editorial/design | No current browser screenshot/review | BLOCKED |
| MOB-001 | Home renders without unintended overflow at 320, 360, 375, 390, 430, 768, 1024 and 1440 CSS px | Browser QA | No current DOM width measurements | BLOCKED |
| MOB-002 | Safe-area insets preserve nav, content and controls on supported mobile orientations | Browser QA | No current device/browser run | BLOCKED |
| MOB-003 | At 200% zoom, content remains readable and controls remain operable | Browser QA | No current browser run | BLOCKED |
| MOB-004 | `scrollWidth` does not exceed `clientWidth` except intentional controlled carousel | Browser QA | No current measurement | BLOCKED |
| MOB-005 | Every nav link measures at least 48 × 48 CSS px and remains reachable by touch | Front-end/browser QA | CSS contract checks declared min width/height only; computed boxes not measured | BLOCKED |
| MOB-006 | Wrapped navigation does not overlap the lens hero, CTA, header or content at any required width | Browser QA | No current screenshot/measurement | BLOCKED |
| MOB-007 | Photos of varied aspect ratio load without clipping, distortion or layout break | Browser QA | Static CSS says contain; no current rendered photo set | BLOCKED |
| MOB-008 | Long text, portrait/landscape and footer content remain usable on mobile/tablet | Browser QA | Not exercised on current HEAD | BLOCKED |
| STU-001 | Studio offers the allowlisted `colagem-autoral` preset | Front-end | Registry/unit test; Studio UI not opened | BLOCKED |
| STU-002 | Applying the preset shows a reversible preview before save | Front-end | No current Studio browser run | BLOCKED |
| STU-003 | Studio can select/save photos without losing existing hero or reel media IDs | Studio QA | Configuration preservation unit test only | BLOCKED |
| STU-004 | Studio copy edits survive save, reload and preset changes | Studio QA | No Studio persistence exercise | BLOCKED |
| STU-005 | Section order edits survive save, reload and revert | Studio QA | No Studio interaction test | BLOCKED |
| STU-006 | Disabled sections remain disabled after preset apply and rollback | Studio QA | No Studio interaction test | BLOCKED |
| STU-007 | Save draft persists the intended configuration and preview renders it | Studio QA | No current browser test | BLOCKED |
| STU-008 | Discard leaves previously saved content unchanged | Studio QA | No current browser test | BLOCKED |
| STU-009 | Reload restores saved photos/copy/order/IDs without defaults overwriting them | Studio QA | Unit serialization test is partial; no UI reload run | BLOCKED |
| STU-010 | Returning to original preset preserves editorial/media/section data | Studio QA | Preset round-trip unit test; browser return not tested | BLOCKED |
| STU-011 | Applying the same preset repeatedly is idempotent in Studio | Studio QA | Static config tests only; Studio not exercised | BLOCKED |
| STU-012 | Default/light/dark/accent/photo surfaces remain legible after actual Studio edits | Studio/accessibility QA | Sample palette contrast tests only | BLOCKED |
| IMM-001 | LensHero remains cinematic with its selected media on the collage home | Front-end/browser QA | No current rendered-browser evidence | BLOCKED |
| IMM-002 | Horizontal/3D carousel modes retain their existing controls and selection | Front-end/browser QA | No current cross-mode browser run | BLOCKED |
| IMM-003 | Touch/drag gestures operate without hijacking page scroll | Browser QA | No current device run | BLOCKED |
| IMM-004 | Reduced-motion preference suppresses nonessential motion | Accessibility QA | Not measured in a browser/emulator | BLOCKED |
| A11Y-001 | Current rendered page passes scoped WCAG AA/manual review for text, controls and error states | Accessibility QA | No axe/manual browser audit | BLOCKED |
| A11Y-002 | Keyboard-only operation has visible focus and reaches all navigation/Studio/carousel actions | Accessibility QA | Not tested | BLOCKED |
| A11Y-003 | All rendered color states meet applicable contrast thresholds | Accessibility QA | Unit test verifies a few palette pairs only | BLOCKED |
| A11Y-004 | Screen-reader names, heading order, image alternatives and announcements work | Accessibility QA | One SSR heading assertion; no screen-reader run | BLOCKED |
| PERF-001 | Current build LCP is measured with route/device/network/sample recorded | Performance QA | No current sample | BLOCKED |
| PERF-002 | Current build CLS is measured with route/device/network/sample recorded | Performance QA | No current sample | BLOCKED |
| PERF-003 | Current build INP is measured from appropriate interaction samples | Performance QA | No current sample | BLOCKED |
| ALB-001 | Authorized client completes real OTP, RS256 JWT validation and first application session | Access/account owner + engineering | No current OTP/JWT/session; historic artifact says provider not tested | BLOCKED |
| ALB-002 | Active client can access only active galleries assigned to its D1 identity | Backend/security | Local fixture tests pass; no current real identity run | BLOCKED |
| ALB-003 | Private originals stay in private R2 and are served only after authorization | Backend/security | Historical isolated pilot; current remote test not run | BLOCKED |
| ALB-004 | Client A requesting client B image receives safe denial and zero private bytes | Security QA | Historical synthetic QA only; current real-provider run absent | BLOCKED |
| ALB-005 | Upload validates intent, allowed MIME, 25 MiB cap, bytes and R2 head before ready state | Backend QA | Local integration/history; no current remote replay | BLOCKED |
| ALB-006 | Admin publish/cap/order workflow exposes only ready images | Admin QA | Historical pilot; no current QA run | BLOCKED |
| ALB-007 | Client favorites persist only for its own authorized gallery | Backend QA | Historical synthetic QA pilot | BLOCKED |
| ALB-008 | Download follows per-gallery permission and returns private headers | Backend/security QA | Historical synthetic QA pilot; no current browser/user run | BLOCKED |
| ALB-009 | Logout, disable, archive, reset and `session_version` changes revoke the next protected request | Backend/security QA | Local tests and historical pilot; real provider lifecycle absent | BLOCKED |
| ALB-010 | Shared rate limit admits no more than max under concurrency and does not mutate saturated rows | Backend/security | `rate-limit.spec.ts`; final local 2/2, independent review no issue | PASS local; final CI tracked in manifest |
| ALB-011 | QA D1/R2 backup restores approved rows/objects byte-for-byte into isolated targets | Operations | Historical run 40124217595: 93 rows / 40 objects; no current remote replay | BLOCKED for current snapshot |
| ALB-012 | Client library/viewer/favorites/errors operate on current mobile devices and zoom | Mobile QA | No current browser/device evidence | BLOCKED |
| CF-001 | Current Workers, routes, Access, D1, R2 and bindings are inventoried from authorized read APIs | Operations | Read-only connector results and script/runbook comparison | PASS |
| CF-002 | Current isolated QA deployment/restore completes without touching production | Operations | No current QA workflow run | BLOCKED |
| CF-003 | Inspection uses granted least-privilege reads and never reveals secret values | Security/operations | Read-only calls; Billing Read scope was missing; no secret values read | PASS |
| CF-004 | Current plan/quota/cost is confirmed and within owner-approved limits | Account owner | Subscription read 403; usage model is not quota evidence | BLOCKED |
| CF-005 | Production Worker/version/routes/data remain unchanged | Operations | Production readback and current read-only audit; no write path | PASS |
| PF-001 | Current PersistFlow controller, owner and execution plane are verified | Service owner | Repo docs only; connector lacks inventory | BLOCKED |
| PF-002 | “Martha” identity maps to an authorized tenant/resource | Service owner | No verified account/repo/domain association | BLOCKED |
| PF-003 | PersistFlow secrets remain segregated from Punctum/QA credentials | Security | No connector run or secret transfer; branch docs keep boundaries | PASS |
| PF-004 | Actual run/workspace receipt is read and tied to this task without inventing an ID | Service owner | No run/workspace supplied; no list operation | BLOCKED |
| PF-005 | Durable checkpoint/receipt is verified in current PersistFlow | Service owner | Git commits exist; no PersistFlow receipt available | BLOCKED |
| PF-006 | PersistFlow does not become identity or customer-data authority | Architecture/security | Architecture documents place identity/authorization in Access+D1; no integration was run | PASS design boundary |
| PF-007 | Sandbox creates no duplicate or shared authority and can be isolated by owner/resource | Service owner | Current owner/capacity not verified; sandbox not started | BLOCKED |
| INT-001 | PR #13 and #14 build together on a traceable disposable combined branch/environment | Integration QA | Branches remain separate; no combined preview/build | BLOCKED |
| INT-002 | Collage CSS is scoped away from private gallery/admin routes in rendered UI | Front-end QA | Source selectors scoped; no cross-branch browser check | BLOCKED |
| INT-003 | Public routes and private-gallery flow show no cross-PR regression on current heads | Integration QA | No current combined E2E | BLOCKED |
| INT-004 | Design and albums rollback work independently in isolated QA | Operations | Procedures documented; no current rollback exercise | BLOCKED |
| GOV-001 | Controller approves LGPD purpose, retention, export, deletion and incident policy | Data controller | Existing LGPD document remains a draft | BLOCKED |
| GOV-002 | Owner approves ongoing provider cost/quotas, including existing R2/Actions/Access use | Account/service owner | Billing scope unavailable; no upgrade requested | BLOCKED |
| GOV-003 | Editorial, owner and release approvals are explicit for merge/deploy/activation | Maria/repository owner | Mission expressly prohibits these release actions | BLOCKED |
| OPS-001 | Required CI passes on each final PR head | CI/release owner | PR #14 run 40161708958 success; final PR #13 run pending | BLOCKED until PR #13 final CI |
| OPS-002 | All authorized changes are committed on the responsible existing branch | Engineering | Commits/push recorded by final PR metadata and manifest | BLOCKED until post-push confirmation |
| OPS-003 | Each decision has traceable artifact, SHA, command, environment and UTC timestamp | QA owner | This matrix and `evidence-manifest.json`; final SHA/CI fields to be confirmed after push | BLOCKED until manifest finalization |
| OPS-004 | Restore and rollback procedures are executed successfully in disposable QA | Operations | Historical data pilot only; no current rollback test | BLOCKED |
