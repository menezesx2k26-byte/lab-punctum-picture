# Implementação: cinco templates de apresentação de álbuns
**Base:** `codex/punctum-unlimited-release-20261120` @ `3129f80f7bf931ef223247763209c6bcd72d8b5d`. **Branch:** `feature/punctum-album-templates-20261123`. **PR draft:** #48. **Mecanismo:** TDD; sem release automático.

## Tarefa 1: contratos e provas RED
- Criar `tests/unit/client-gallery-templates.spec.ts` com cinco IDs, labels, fallback de legado, validação e proibição de CSS arbitrário.
- Criar `tests/integration/client-gallery-layout.spec.ts` com `bootstrapPrivateDb`, PATCH administrativo, `getGallery` e negativa 400; preservar `clientId/status/capa/download`.
- Conferir que a CI no commit apenas de testes não passa até o código existir; não enfraquecer asserts.

## Tarefa 2: persistência aditiva
- `shared/client-galleries.ts`: enum, metadata de templates, resolver seguro, create default e update opcional.
- `migrations/0016_private_gallery_layout_presets.sql`: add coluna com default CHECK, sem dados reais.
- `worker/client/repository.ts`: selecionar e serializar `layout_preset AS layoutPreset` em todas as consultas.
- `worker/api/client-admin.ts`: INSERT/PATCH auditados no mesmo `D1.batch`, sem ampliar autenticação ou APIs.
- Critérios: testes novos, existentes, revogação, audit fail-closed, typecheck.

## Tarefa 3: editor e site
- `app/admin/components/PrivateGalleryTemplatePicker.tsx`: cinco cartões com miniatura CSS, `aria-pressed`, mudança por teclado.
- `app/admin/components/PrivateGalleryEditor.tsx`: escolha na criação e na edição, sem salvar antes do comando existente. Ao publicar, usar o PATCH já validado.
- `app/admin/components/private-gallery-admin.css`: responsivo, foco visível.
- `app/admin/components/studio/StudioStylePanel.tsx`: esclarecer presets já existentes, não reconstruir Studio.

## Tarefa 4: visualização
- `app/albuns/components/PrivateGallery.tsx`: aplicar apenas `data-layout-preset` safe, mantendo `themeTokens`, URL autenticada e `PhotoViewer`.
- `app/albuns/albuns.css`: CSS escopado, cinco composições sem crop, fallback clássico, mobile.
- Conferir que `allowDownloads`, favoritos, lightbox e privacidade seguem intactos.

## Tarefa 5: QA/handoff
- CI exata no SHA final: `npm ci`, audit, `npm run typecheck`, lint, `npm test`, build, E2E; checar jobs e logs.
- Revisar diff do PR e evitar alterações em identidade/infra; reportar limites de QA browser real.
- Gate R4 permanece `PARTIAL_VERIFIED / PRODUCTION_NO_GO`; nada de merge/deploy/migração remota sem autorização específica.
