# Direct Studio Hero Upload Implementation Plan

## Nota de continuidade — 21/11/2026

Este plano registra a proposta original. O upload Hero já possui implementação; as caixas desmarcadas abaixo não provam ausência da funcionalidade. Para a continuidade completa de Hostinger, Clerk, R4 e Hero, usar o [prompt pós-BH com tasks e gates](2026-11-21-punctum-continuation-bh-tasks-gates.md), o [ledger atual](../../operations/private-albums-r4/execution-state.json) e o [fechamento BH](../../operations/private-albums-r4/89-cycle-be-vps-parity-sitemap-2026-11-21.md).

| Proposta histórica | Referência efetiva no código BH |
| --- | --- |
| `migrations/0006_site_media.sql` | `migrations/0008_site_media.sql`; não renumerar migrações |
| `shared/config.ts` | Módulos existentes em `shared/config/`, exportados por `index.ts` |
| `app/lib/hero-media.ts` | `app/lib/public-visuals.ts`, com `resolveConfiguredHeroVisual` |
| `HeroUploadControl.tsx` separado | Upload implementado em `app/admin/components/studio/StudioPhotosPanel.tsx` |
| Seleção do Hero | `app/admin/components/studio/hero-media.ts` |
| `config.spec.ts`, `hero-media.spec.ts`, `studio-hero-upload.spec.tsx` | `site-config.spec.ts`, `public-visuals.spec.ts`, `studio-hero-media.spec.ts`, `site-media-suitability.spec.ts` e `tests/integration/site-media.spec.ts` |
| Upload por XHR/direto R2 | Fluxo atual usa `fetch` e PUT na rota administrativa `/admin/api/site-media/:id/direct`; não trocar o transporte apenas para reproduzir esta proposta |

O mínimo original de 1920×1080/1080 no lado curto diverge da implementação atual (`isSuitableHeroSource`: 1280×720 ou 720×1280) e do teste que preserva a aceitação de 1536×961. Identificar a decisão posterior e reconciliar o contrato antes de alterar os limites; esta nota não aprova nem revoga um limite por inferência.

A construção de uma URL no resolver não comprova o contrato completo de prontidão, publicação e fallback. Rastrear storage/publicação/serving e acrescentar prova de integração para lacunas reproduzidas, conforme T04.H do prompt. Não recriar componentes, helpers ou tabelas já existentes.

**A Task 6 histórica abaixo não autoriza merge, migração, deploy ou teste mutável em produção.** Permanecem necessários os aceites separados de release, os gates G01–G24 e as provas de QA. Nesta retomada houve somente reconciliação documental; nenhum comportamento de Hero foi alterado ou novamente homologado.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Studio upload a Home hero directly from a phone, store it independently from albums, preview/select it in the draft, and publish it safely without a code deploy.

**Architecture:** Add a narrow `site_media` domain backed by the existing R2 conventions, authenticated worker endpoints for hero upload/list/completion, and a typed hero reference in Studio configuration. Public resolution accepts ready site media, preserves legacy portfolio-image references, and falls back to the bundled 4K hero.

**Tech Stack:** Next.js/React/TypeScript, Cloudflare Worker, D1/Drizzle-style SQL migrations, R2, Vitest, existing Studio configuration/publish pipeline.

**Spec:** `docs/superpowers/specs/2026-08-25-direct-hero-upload-design.md`

## Global Constraints

- Hero-only media must not create or require an album and must never enter portfolio/archive APIs.
- Accept JPEG, PNG and WebP only; maximum upload size is 25 MiB.
- API is authoritative for suitability; minimum landscape source is 1920×1080 and portrait sources require at least 1080 px on the short side.
- Public Home may resolve only `ready` site media referenced by the published snapshot.
- Resolution order is site-media reference → existing published portfolio image → bundled `/images/hero-maria.webp`.
- Existing Studio snapshots/configurations remain readable.
- Uploading does not publish automatically; normal Studio draft/publish semantics remain mandatory.
- No hidden album, generic asset manager, image editor, AI upscaling or unrelated refactor.

---

### Task 1: Site-media persistence and typed Hero reference

**Files:**
- Create: `migrations/0006_site_media.sql`
- Modify: `db/schema.ts`
- Modify: `shared/config.ts`
- Test: `tests/unit/config.spec.ts`

**Interfaces:**
- Produces `HeroMediaRef = { kind: "site-media"; id: string } | { kind: "portfolio-image"; id: string } | null`.
- Produces D1 table `site_media(id, role, storage_key, original_filename, mime_type, size_bytes, status, width, height, created_at, updated_at)` with `role='hero'` and statuses `pending|ready|failed`.

- [ ] **Step 1: Write failing config tests**

Add tests that parse a Studio config containing `{ kind: "site-media", id: "hero-1" }`, preserve a legacy `backgroundImageId`, and reject an unknown `kind` without making the whole config unreadable.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/unit/config.spec.ts`
Expected: FAIL because the typed Hero media reference/schema is absent.

- [ ] **Step 3: Implement schema + migration minimally**

Add the `site_media` table with an index on `(role,status,created_at)`. Extend the Home Hero appearance/config shape with optional `heroMedia` using the exact union above while retaining `backgroundImageId`.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/unit/config.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add migrations/0006_site_media.sql db/schema.ts shared/config.ts tests/unit/config.spec.ts
git commit -m "feat: add site media model for hero"
```

### Task 2: Authenticated Hero upload API

**Files:**
- Modify: `worker/api/admin.ts`
- Create: `worker/site-media.ts`
- Test: `tests/integration/worker.spec.ts`

**Interfaces:**
- Consumes `site_media` from Task 1 and existing admin authorization/R2 bindings.
- Produces `POST /admin/api/site-media/intents`, `POST /admin/api/site-media/:id/complete`, `GET /admin/api/site-media?role=hero`.
- Intent response: `{ media: { id, role, status }, uploadUrl, requiredHeaders }`.
- Complete/list ready record: `{ id, role, status, url, width, height, mimeType, sizeBytes, originalFilename }`.

- [ ] **Step 1: Write failing integration tests**

Cover: unauthenticated request rejected; JPEG/PNG/WebP intent accepted; unsupported MIME and >25 MiB rejected; intent has no `albumId`; completion marks valid source ready; too-small landscape/portrait fails with a specific resolution error; list returns Hero media only; album/portfolio listing does not include site media.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/integration/worker.spec.ts`
Expected: FAIL with site-media routes missing.

- [ ] **Step 3: Implement minimal site-media service/routes**

Use UUID ids and storage keys under `site-media/hero/<id>/original`. Reuse the existing upload signing/direct-R2 conventions. Validate declared MIME/size on intent and inspect stored image metadata on completion. Mark invalid completion `failed`; never expose it from ready public resolution.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/integration/worker.spec.ts`
Expected: PASS for new site-media cases and existing upload cases.

- [ ] **Step 5: Commit**

```bash
git add worker/api/admin.ts worker/site-media.ts tests/integration/worker.spec.ts
git commit -m "feat: add direct hero media upload api"
```

### Task 3: Public Hero resolution and compatibility

**Files:**
- Create: `app/lib/hero-media.ts`
- Modify: `app/page.tsx`
- Modify: `app/sections/home/HomeHeroSection.tsx`
- Test: `tests/unit/hero-media.spec.ts`

**Interfaces:**
- Consumes published `heroMedia`, legacy `backgroundImageId`, ready site-media lookup, and existing published-image lookup.
- Produces `resolveHeroMedia(...) -> { src: string; alt: string } | null`, where null means use bundled `getPublicVisualAsset("hero")`.

- [ ] **Step 1: Write failing resolver tests**

Test exact precedence: ready site media wins; pending/failed/missing site media falls through to legacy published image; invalid legacy image falls through to bundled asset; old snapshots with only `backgroundImageId` still work.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/unit/hero-media.spec.ts`
Expected: FAIL because resolver does not exist.

- [ ] **Step 3: Implement resolver and wire Home**

Keep resolution pure in `app/lib/hero-media.ts`. Load only the referenced ready site-media record in `app/page.tsx`; pass the resolved URL to `HomeHeroSection`. Do not alter the approved mobile Hero composition.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/unit/hero-media.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/hero-media.ts app/page.tsx app/sections/home/HomeHeroSection.tsx tests/unit/hero-media.spec.ts
git commit -m "feat: resolve published site media hero"
```

### Task 4: Direct phone upload in Studio

**Files:**
- Modify: `app/admin/components/studio/StudioPhotosPanel.tsx`
- Create: `app/admin/components/studio/HeroUploadControl.tsx`
- Test: `tests/unit/studio-hero-upload.spec.tsx`

**Interfaces:**
- Consumes Task 2 endpoints and Task 1 `heroMedia` draft field.
- Produces `HeroUploadControl` with one native file input (`accept="image/jpeg,image/png,image/webp"`), progress/error state, preview, and `onReady(media)` callback.

- [ ] **Step 1: Write failing component tests**

Render Fotos panel and assert visible copy `Hero da página inicial` and `Enviar foto do celular`; selecting a file requests an intent, PUTs bytes, completes upload, previews returned `url`, and calls draft update with `{ kind: "site-media", id }`. Assert failure keeps previous Hero and displays plain-language error.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/unit/studio-hero-upload.spec.tsx`
Expected: FAIL because direct Hero control does not exist.

- [ ] **Step 3: Implement minimal upload control**

Use a single-file native picker suitable for Android/iOS. Validate MIME and 25 MiB client-side, show progress during XHR PUT, call completion, then select the ready media in the Studio draft. Keep existing published-library picker as the alternate action.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/unit/studio-hero-upload.spec.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/admin/components/studio/StudioPhotosPanel.tsx app/admin/components/studio/HeroUploadControl.tsx tests/unit/studio-hero-upload.spec.tsx
git commit -m "feat: upload hero directly from Studio"
```

### Task 5: Draft/publish contract and regression coverage

**Files:**
- Modify: `worker/api/admin.ts`
- Modify: `tests/integration/worker.spec.ts`
- Modify: `tests/unit/public-visuals.spec.ts`

**Interfaces:**
- Consumes typed Hero reference and existing Studio draft/publish endpoints.
- Produces guarantee that upload alone never changes published Home; publish copies the Hero reference into the published snapshot; invalid/non-ready references cannot become an active public Hero.

- [ ] **Step 1: Write failing publish-contract tests**

Create a ready site Hero, save it only to draft and assert published snapshot is unchanged; publish and assert snapshot contains the site-media reference; attempt publishing a pending/missing id and assert public resolution remains on prior/fallback Hero.

- [ ] **Step 2: Verify RED**

Run: `npm test -- tests/integration/worker.spec.ts tests/unit/public-visuals.spec.ts`
Expected: FAIL until publish validation understands site media.

- [ ] **Step 3: Implement publish validation**

Validate referenced site media is `role=hero,status=ready` before promotion. Preserve previous published snapshot on validation failure and return actionable Studio error copy.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- tests/integration/worker.spec.ts tests/unit/public-visuals.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add worker/api/admin.ts tests/integration/worker.spec.ts tests/unit/public-visuals.spec.ts
git commit -m "test: protect hero Studio publish contract"
```

### Task 6: Production verification and deployment

**Files:**
- Modify only if a verification failure demonstrates a feature defect; any fix starts with a reproducing failing test.

**Interfaces:**
- Consumes all previous tasks.
- Produces a production deployment where Studio direct upload, draft/publish, Home Hero and fallback contracts are verified.

- [ ] **Step 1: Run focused and full verification**

```bash
npm run typecheck
npm run lint
npm test -- tests/unit/config.spec.ts tests/unit/hero-media.spec.ts tests/unit/studio-hero-upload.spec.tsx tests/unit/public-visuals.spec.ts
npm test
npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: Apply production D1 migration through the existing deployment workflow**

Use the repository's established Cloudflare production workflow; do not manually invent credentials or a second deployment path. Verify `0006_site_media.sql` is applied before serving endpoints that depend on it.

- [ ] **Step 3: Deploy the exact verified commit**

Push/merge only the verified implementation commit(s) through the existing production workflow. Record the exact Git SHA used by the successful deploy.

- [ ] **Step 4: Smoke the production contract**

Verify: `/admin/studio` loads; Fotos exposes `Enviar foto do celular`; authenticated intent/list endpoints respond; Home loads with current fallback before publication; publishing a ready test Hero changes the resolved Hero without a code deploy; restore the intended Hero afterward if a test asset was used.

- [ ] **Step 5: Verify deployment evidence**

Confirm the Cloudflare deploy job and smoke steps are `success` for the exact SHA. Do not claim completion from a local green suite alone.

- [ ] **Step 6: Final commit if verification documentation changed**

If no files changed during verification, do not create an empty commit. If a test-driven fix was required, rerun Step 1 and deploy the new exact SHA.

## Self-review

- Spec coverage: persistence, direct R2 upload, independence from albums, Studio mobile UX, resolution validation, draft/publish safety, legacy compatibility, fallback and production verification are each assigned to a task.
- Placeholder scan: no deferred implementation markers or unspecified error-handling steps remain.
- Type consistency: all tasks use `HeroMediaRef` with `site-media` / `portfolio-image`; API and Studio use the same site-media id; public resolver consumes the published typed reference.
