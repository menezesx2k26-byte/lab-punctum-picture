# Punctum Picture — Colagem Autoral Mobile-First Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task with regression coverage.

**Goal:** Preset editorial de colagem mobile-first, reversível no Studio, sem reconstruir o site, mantendo lente/carrossel/álbuns intactos.
**Architecture:** Preset allowlisted; folha CSS escopada somente à home; reuse `featured-work:collage`; Studio/preview existentes.
**Tech stack:** React 19, Next.js 16, Vinext, TypeScript, CSS, Vitest, GitHub Actions, Workers Free.
**Spec:** `docs/superpowers/specs/2026-10-24-punctum-mobile-first-collage-design.md`.
**Base:** `main` `af55e1526b731be099e804335eb143d2b5cfa95e`.
**Branch:** `design/punctum-collage-mobile-20261024`; draft PR #14.
**Constraints:** No production deployment or merge; no D1/R2/auth modifications; no third-party artwork; preserve creative choices and user content; mobile 320–430 px, accessibility and motion.

## Review Focus

- Preset com mídia escolhida não apaga `heroMedia`, `photoIds`, `itemCount`, copy nem IDs.
- 320 px/zoom 200% não devem cortar título, nav ou CTA.
- Álbum sem capa tem fallback legível, não perde link.
- Teclado, `prefers-reduced-motion`, toque vertical/horizontal e modal permanecem operáveis.
- Draft no Studio não altera produção; rollback ao preset anterior preserva conteúdo.

### Task 0 — Isolate and verify baseline
Files: `shared/config`, `app/components`, `docs/visual-qa`.
- [x] Check PR #13 and main HEAD; distinguish design branch from auth changes.
- [x] Create isolated Git worktree at `C:\Users\Pichau\repos\punctum-collage-mobile-20261024` from main.
- [x] Create independent design branch and draft PR #14.
- [x] Save fresh baseline local `npm ci && npm run typecheck && npm run lint && npm test && npm run build` on SHA `10e672a0ddd7b3b7ce4263a05baa9a49a0661970`; see the dated QA report. The fresh clone is available under `/workspace/lab-punctum-picture`.

### Task 1 — Safe preset / selected media
Files: `shared/config/preset-ids.ts`, `shared/config/preset-registry.ts`; `tests/unit/collage-preset.spec.ts`.
- [x] Add tests requiring allowlist and preserving `heroMedia`, `photoIds`, `itemCount`, copy, IDs and layout contracts.
- [x] Watch GitHub CI RED (run 40151558020: three failures in these behaviors).
- [x] Introduce `colagem-autoral` and safe merge semantics; force immersive policy.
- [ ] Verify final CI GREEN.

### Task 2 — Scope artwork and contrast
Files: `app/collage-home.css`, `app/components/HomeExperience.tsx`; `tests/unit/collage-theme.spec.ts`.
- [x] Add mobile-first CSS with purple/yellow/paper, paper edges/tape/star, no third-party assets.
- [x] Import CSS after immersive layer in `HomeExperience`; scope by `data-theme-preset`.
- [x] Add contrast AA and rollback unit coverage.
- [ ] Verify visual behavior and zero overflow at supported widths.

### Task 3 — Reuse existing featured-work collage
Files: `app/components/FeaturedStories.tsx`, `tests/unit/collage-frontend.spec.tsx`.
- [x] Keep real D1 album links and original covers; add no-cover fallback.
- [x] Cover 0, 1 and multiple albums, link and no fictitious CTA.
- [x] Automated render tests, including the no-cover fallback, pass locally; UI inspection remains blocked on browser tooling.

### Task 4 — Mobile navigation and editorial hierarchy
Files: `app/collage-home.css`; `app/components/SiteChrome.tsx` unchanged.
- [x] CSS-only compact navigation, expressive manifesto, print-like About and quiet Contact.
- [x] Leave lens, 3D carousel and public routes untouched.
- [ ] Test 320/360/375/390/430/768/1024/1440 and 200% zoom in rendered browser.

### Task 5 — Immersive invariants / accessibility
Files: `shared/config/immersive-policy.ts` untouched; `tests/unit/immersive-policy.spec.ts` and `tests/unit/home-render-plan.spec.ts` existing.
- [x] Prevent preset from changing protected variants or selected media.
- [x] Decor CSS uses pointer-events none and no scroll hijacking.
- [ ] Verify actual touch gestures, focus return, `Escape`, reduced motion and TalkBack/VoiceOver.

### Task 6 — Studio and rollback
Files: `app/admin/admin.css`, `shared/config/preset-registry.ts`.
- [x] Native preset appears automatically in Studio with original purple/yellow thumbnail.
- [x] Preserve draft config and restore previous preset without deleting selected media.
- [ ] Verify full save/preview/discard/publish history in isolated preview, without touching production.

### Task 7 — Final QA and handoff
- [ ] Fresh CI typecheck, lint, unit/integration suite, build fully GREEN on the final pushed SHA; local equivalents pass after the fixes.
- [ ] Browser screenshot QA at supported viewports.
- [ ] Device QA Android/iPhone real, LGPD independent validation.
- [x] Update the QA report with explicit PASS/BLOCKED evidence; final DoD remains blocked on visual and Studio inspection.
- [x] Independent read-only review of the corrections; no new code findings. No merge or deployment.

## Execution method and claims

Implemented via local isolation setup, GitHub connector edits on the independent remote design branch and GitHub Actions. Native local terminal later returned a security scope block on the new path; do not claim local build/screenshot tests where no evidence exists. CI RED was verified via job logs. Treat any later successful CI as build/test evidence, **not** a production or physical device sign-off.

## Current execution record — 2026-10-25

- The prior note about the native terminal's path restriction describes an earlier executor. This run used a fresh clone at `/workspace/lab-punctum-picture`; local tests and build executed there and are recorded in `docs/visual-qa/punctum-mobile-collage-2026-10-25.md`.
- Source/test/CI corrections are committed as `ac41ea340cec7d199c50b51d7d1572487196d234`. The test suite and build ran against the same tracked tree immediately before that commit. GitHub CI on the final pushed documentation SHA remains pending.
- Safe dependency security refresh is committed as `f5fc9968f8f6c9b40232570b2410e832a83a20d9`; the clean install and complete local suite passed on that exact dependency tree. Production dependency audit is clear; development-toolchain advisories remain documented in the QA report.
- Browser screenshots, measured responsive dimensions, zoom, and Studio save/discard/reversal remain BLOCKED because the only connected managed browser is paid and requires prepaid time; the task's incremental-cost limit is R$ 0.
- `npm run preview` was reproduced as an upstream/runtime incompatibility. `npm run dev` is the verified cost-free local Cloudflare Vite/Workers alternative after applying migrations to the local D1 only. It is an HTTP runtime smoke, not browser or production-preview evidence.
