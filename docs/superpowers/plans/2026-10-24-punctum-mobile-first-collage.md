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
- [ ] Save fresh baseline local `npm ci && npm run typecheck && npm run lint && npm test && npm run build` (local runtime isolation prevents complete evidence; rely on fresh branch CI and document separately).

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
- [ ] Verify tests and UI manually.

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
- [ ] Fresh CI typecheck, lint, unit/integration suite, build fully GREEN.
- [ ] Browser screenshot QA at supported viewports.
- [ ] Device QA Android/iPhone real, LGPD independent validation.
- [ ] Write QA report and DoD PASS/FAIL/BLOCKED.
- [ ] Independent review, no merge or deployment.

## Execution method and claims

Implemented via local isolation setup, GitHub connector edits on the independent remote design branch and GitHub Actions. Native local terminal later returned a security scope block on the new path; do not claim local build/screenshot tests where no evidence exists. CI RED was verified via job logs. Treat any later successful CI as build/test evidence, **not** a production or physical device sign-off.
