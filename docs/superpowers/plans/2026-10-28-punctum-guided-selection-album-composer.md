# Punctum Picture — Guided Selection and Editorial Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Entregar seleção confirmada, provas com watermark, finais versionadas, editor editorial privado, entregas parciais, revisões autorizadas, solicitações e downloads sob zero gasto incremental não autorizado.

**Architecture:** Estender Worker/React/D1/R2 privados existentes com tabelas aditivas e objetos imutáveis. Rascunho, aprovação de edição e publicação são estados independentes; a publicação troca atomicamente o ponteiro para um snapshot validado. Nunca introduzir backend separado nem reutilizar o compositor público como se controlasse álbuns privados.

**Tech Stack:** Node >=22.13.0, Next 16.4.3, React 19.2.8, vinext/Vite, TypeScript, Zod 4, Cloudflare D1/R2/Workers, dnd-kit, Vitest e Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-punctum-guided-selection-album-composer-design.md`

## Global Constraints

- R4 continua NO_GO_PRODUCTION: G05 e G17 FAIL; G15/G19/G20/G22/G23 BLOCKED_EXTERNAL segundo o relatório datado. Gates novos PP00–PP10 são independentes e não corrigem automaticamente a R4.
- R$ 0 de gastos não autorizados. Proibidos deploy/merge, migração remota, clientes reais, alteração Access produção, billing, planos pagos, purge, novos segredos e seed de recuperação R4 sem aprovação específica.
- Começar por PR #24 e main atuais, identificar SHA exato, arquivos não commitados, branch e ownership. Não assumir que o SHA histórico 50e8fc4 ainda é o HEAD.
- Usar worktree isolado e PR draft; não escrever na worktree de outro agente nem diretamente em main/PR24.
- TDD RED–GREEN–REFACTOR, menor alteração possível, commits por tarefa, verificação em SHA exato, evidência independente. Não afirmar execução sem logs.
- Preservar site público, lente, carrossel 3D, autorretrato, Colagem Autoral, SEO, Studio e os cinco clientes históricos da R4.
- Favoritos não são seleção; cliente não reabre confirmação; nenhuma prova bruta, candidata não aprovada, mídia de outro cliente ou revisão antiga é servida.
- Sem HTML/CSS/JS arbitrário, novo framework/backend, músicas, vídeos, novas despesas ou notificações ficticiamente enviadas.
- Divergência entre plano e código atual requer evidência e ajuste de documentação, não implementação cega. Tudo que depender de custo, dispositivos físicos, LGPD, segurança formal ou autorização humana fica BLOCKED até validação real.

## Review Focus

1. **IDOR:** titular A acessa IDs/mídias/threads/batch de B -> 404 ou resposta opaca sem bytes.
2. **CAS e replays:** edição concorrente e clique duplo não duplicam seleção/publicação; stale -> 409.
3. **Expiração e revogação:** mídias privadas GET e HEAD retornam zero bytes mesmo com URL antiga.
4. **Integridade de edição:** 25/30 publicado não mostra prova sem final; 4/5 edições aprovadas nunca publica a quinta.
5. **Falhas de infraestrutura:** upload sem watermark, email sem provedor e batch com pouca memória falham visivelmente e sem custo oculto.

## File Structure e interfaces entre tarefas

Criar: `migrations/0010_guided_selection_delivery.sql`; `shared/client-workflow.ts`; `worker/client/workflow-policy.ts`; `worker/client/workflow-repository.ts`; `worker/client/proof-derivatives.ts`; `worker/client/notifications.ts`; `worker/api/client-workflow.ts`; `worker/api/client-workflow-admin.ts`; `app/albuns/components/SelectionJourney.tsx`; `DeliveryExperience.tsx`; `RevisionReview.tsx`; `app/admin/components/private-album/WorkflowEditor.tsx`; `AlbumBlockComposer.tsx`; `RequestInbox.tsx`; testes novos unit/integration por responsabilidade; `docs/operations/private-albums-r5-guided/`.

Modificar com menor diff: `worker/client/router.ts`, `worker/media/private-gallery.ts`, `shared/client-galleries.ts`, `app/albuns/components/PrivateGallery.tsx`, `ClientLibrary.tsx`, `api.ts`, `responses.ts`, `routes.ts`, `app/admin/components/PrivateGalleryEditor.tsx`. Não modificar migration 0009 e arquivos R4 de evidência.

Tipos/assinaturas obrigatórias para interfaces:
- `type SelectionMode = "exact" | "max" | "free"`; `validateSelection(mode:SelectionMode,limit:number|null,ids:string[]):ValidationResult`.
- `type AlbumBlock = CoverBlock | TextBlock | PhotoBlock | SequenceBlock | DividerBlock | ClosingBlock`.
- `getWorkflow(db:D1Database,galleryId:string):Promise<WorkflowRow|null>`.
- `saveSelectionDraft(db:D1Database,input:SelectionDraftInput):Promise<SelectionDraftResult>`.
- `confirmSelection(db:D1Database,input:ConfirmSelectionInput):Promise<SelectionReceipt>`.
- `registerFinalVersion(db:D1Database,input:FinalVersionInput):Promise<FinalVersion>`.
- `publishDeliveryRevision(db:D1Database,input:PublishDeliveryInput):Promise<DeliveryRevision>`.
- `getPublishedDelivery(db:D1Database,ownerId:string,galleryId:string):Promise<DeliveryRevision|null>`.
- `createRequest(db:D1Database,input:RequestInput):Promise<RequestReceipt>`.
- `decideRequestItem(db:D1Database,input:RequestItemDecisionInput):Promise<RequestItem>`.
- `appendRequestMessage(db:D1Database,input:MessageInput):Promise<RequestMessage>`.
- `enqueueWorkflowEvent(db:D1Database,event:WorkflowEvent):Promise<void>`.
- `deliverPendingNotifications(transport:EmailTransport,db:D1Database,limit:number):Promise<DeliveryReport>`.
- `getBatchManifest(owner:ClientIdentity,galleryId:string,revisionId:string):Promise<BatchManifest>`.
- Identities: usar `proofImageId` como referência lógica; `finalVersionId` como objeto final imutável; `expectedRevision` para concorrência; `requestId`/`itemId` para solicitações. Não criar sinônimos conflitantes.

## Gate/estado

Arquivo canônico novo `docs/operations/private-albums-r5-guided/execution-state.json` com `sourceHead`, `testedSha`, `gate`, `status`, `testCommands`, `artifacts`, `blockers`, `nextAction`. Estados somente PASS, FAIL, BLOCKED_EXTERNAL, BLOCKED_COST, NOT_RUN; histórico por commit. PP00 base; PP01 contratos; PP02 provas; PP03 seleção; PP04 finais; PP05 compositor/cliente; PP06 solicitações/revisões; PP07 validade/email; PP08 batch; PP09 segurança/LGPD/rollback; PP10 integração/DoD. Cada tarefa termina com commit e recibo.

---

### Task 00 — Reconciliação, isolamento e baseline (PP00)

**Files:** Criar `docs/operations/private-albums-r5-guided/00-baseline.md` e `execution-state.json`. Não editar código.

**Interfaces:** produz branch, base SHA, clean tree, owners e baseline real para Task 01.

- [ ] **Step 1:** Ler AGENTS/instruções, PR24/main, HEAD, workflows, alterações não commitadas, worktrees e gates R4. Documentar ações proibidas.
- [ ] **Step 2:** Criar worktree/branch isolada da base integrada verificada e PR draft, sem sobrescrever edições de outros agentes.
- [ ] **Step 3:** Executar `node --version`, `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` e e2e existente se disponível. Registrar exit codes no SHA. Um baseline falho não é PASS.
- [ ] **Step 4:** Comparar código existente com SPEC para evitar duplicação; identificar arquivos efetivamente necessários e conflitos.
- [ ] **Step 5:** Commit baseline + evidências; PP00 somente com ownership, testes e rastreabilidade conferidos.

### Task 01 — Modelo D1 e políticas puras (PP01)

**Files:** Criar `migrations/0010_guided_selection_delivery.sql`, `shared/client-workflow.ts`, `worker/client/workflow-policy.ts`, `workflow-repository.ts`, `tests/unit/client-workflow.spec.ts` e `tests/integration/client-workflow.spec.ts`.

**Interfaces:** `validateSelection`, `getWorkflow`, `saveSelectionDraft`, `confirmSelection` e `publishDeliveryRevision` com tipos do mapa.

- [ ] **Step 1 (RED):** Testes falham para seleção vazia, exata N incorreta, máximo >N, IDs duplicados, foto estrangeira, favoritos não confirmados, blocos inválidos, replay/stale CAS, migration em D1 já populado.
- [ ] **Step 2:** Rodar `npm test -- tests/unit/client-workflow.spec.ts tests/integration/client-workflow.spec.ts`. Registrar RED esperado.
- [ ] **Step 3 (GREEN):** Implementar migração aditiva e schemas Zod strict; tabelas para workflow, derivadas, seleção/itens, finais, draft, snapshots, requests/itens/mensagens, eventos e outbox. Chaves compostas e FKs; nenhuma migração remota.
- [ ] **Step 4:** Reexecutar testes, `npm run typecheck` e validação FK/rollback local. Histórico de 0009 permanece.
- [ ] **Step 5:** Commit `feat(punctum): establish guided workflow contracts` e evidência `01-contracts.md`.

### Task 02 — Watermark real nas provas e mídia privada (PP02)

**Files:** `worker/client/proof-derivatives.ts`, `worker/client/router.ts`, `worker/media/private-gallery.ts`; teste `tests/integration/client-workflow-media.spec.ts`.

**Interfaces:** `createProofDerivativeIntent(admin,galleryId,proofImageId):Promise<ProofIntent>` e `verifyProofDerivative(db,bucket,input):Promise<ProofDerivativeRecord>`.

- [ ] **Step 1 (RED):** Testar watermark incorporado aos pixels, resolução menor, ausência de original em cliente, acesso B=404/zero bytes, GET/HEAD de provas sem derivada, ausência de download de prova e bloqueio do otimizador público.
- [ ] **Step 2:** Rodar `npm test -- tests/integration/client-workflow-media.spec.ts` para verificar RED.
- [ ] **Step 3 (GREEN):** Spike derivação controlada na UI administrativa ou via fluxo offline homologado, upload com intent existente para R2 privado, hash/dimensões/mime verificados, serviço apenas da derivada. Falha impede publicação, nunca serve original.
- [ ] **Step 4:** Rodar testes e medir custo/CPU/Images/R2 com dados sintéticos sem plano pago. Sem viabilidade, PP02=BLOCKED_COST, não fazer fallback inseguro.
- [ ] **Step 5:** Commit e `02-media.md` com amostra e provas negativas.

### Task 03 — Jornada de seleção e confirmação (PP03)

**Files:** `worker/api/client-workflow.ts`, `client-workflow-admin.ts`, `app/albuns/components/SelectionJourney.tsx`, `PrivateGallery.tsx`, `responses.ts`; testes `client-workflow.spec.ts` e `client-gallery-ui.spec.ts`.

**Interfaces:** `PUT /api/client/galleries/:id/selection {proofImageIds,expectedRevision}`; `POST .../selection/confirm {expectedRevision,idempotencyKey}`; admin `POST .../selection/reopen`.

- [ ] **Step 1 (RED):** Testes de exact/max/free, ≥1 foto, contador, favoritamento independente, confirmar/repetir, bloqueio pós-confirmar, Maria-only reabrir e recibos imutáveis.
- [ ] **Step 2:** Rodar testes alvo e capturar RED.
- [ ] **Step 3 (GREEN):** Handlers com auth/Origin/rate-limit/CAS e grade guiada consistente; conservar interface de favoritos.
- [ ] **Step 4:** Rodar testes e browser com álbum preenchido, 390px, teclado/foco; comprovar que cliente não reabre por request.
- [ ] **Step 5:** Commit + `03-selection.md`.

### Task 04 — Vínculo foto final, snapshots e parcialidade (PP04)

**Files:** `worker/client/workflow-repository.ts`, `worker/api/client-workflow-admin.ts` e `worker/media/private-gallery.ts`; testes `client-workflow-admin.spec.ts`/`client-workflow-media.spec.ts`.

**Interfaces:** `registerFinalVersion`, `getPublishedDelivery`, `publishDeliveryRevision`.

- [ ] **Step 1 (RED):** Testar prova confirmada X → versões finais imutáveis Xv1/Xv2; Y não confirmado negado; publicar 25/30 com estado parcial; substituição do draft não altera snapshot histórico; concorrência 409; retry idempotente.
- [ ] **Step 2:** Executar testes e registrar RED.
- [ ] **Step 3 (GREEN):** Reutilizar intent/R2 privado para finais, validação de bytes, snapshots com IDs de versão final e ponteiro publicado atomicamente. Nada de cópia por ocorrência.
- [ ] **Step 4:** Rodar testes de tenant A/B, mídia, byte/hash, old snapshot admin-only e typecheck. Falta de homologação remota G05 permanece explicitamente bloqueada.
- [ ] **Step 5:** Commit + `04-finals.md`.

### Task 05 — Editor por blocos e Studio guiado (PP05)

**Files:** `app/admin/components/private-album/WorkflowEditor.tsx`, `AlbumBlockComposer.tsx`, `PrivateGalleryEditor.tsx`, CSS privado; `tests/unit/client-composer.spec.ts`.

**Interfaces:** `AlbumBlock` discriminado; `saveComposition({galleryId,expectedRevision,blocks,candidateVersions}):Promise<{draftRevision:number}>`; crop `{focalX:number,focalY:number,zoom:number}` validado.

- [ ] **Step 1 (RED):** Testar criar/remover/ordenar/ocultar blocos cover/text/photo/sequence/divider/closing, teclado, crop independente, mesma foto em três blocos sem 3 objetos R2, substituição atualiza draft e não publicação, stale conflict.
- [ ] **Step 2:** Rodar `npm test -- tests/unit/client-composer.spec.ts` e capturar RED.
- [ ] **Step 3 (GREEN):** Reutilizar sensores dnd-kit do Studio, mas manter registro de blocos privado, sem copiar contratos imersivos da home. Abertura das provas configurável; grade de seleção fixa.
- [ ] **Step 4:** Testar prévia com fotos preenchidas em celular/desktop; typecheck; teste de não regressão de home/Colagem/Studio.
- [ ] **Step 5:** Commit + `05-composer.md`.

### Task 06 — Experiência cliente e publicação de entregas (PP05/PP04)

**Files:** `app/albuns/components/DeliveryExperience.tsx`, `ClientLibrary.tsx`, `PrivateGallery.tsx`, `PhotoViewer.tsx`, `responses.ts`, e2e guiado.

**Interfaces:** `GET /api/client/galleries/:id/delivery` → `{revisionId,isPartial,finalReadyCount,confirmedCount,blocks,allowDownloads}`.

- [ ] **Step 1 (RED):** Com 25/30, exibir parcial e 5 pendentes; 30/30 completo; cliente só vê snapshot mais novo; provas não aparecem como final; carregamento, erro, vazio e sessão vencida.
- [ ] **Step 2:** Rodar testes e2e/componentes e capturar RED.
- [ ] **Step 3 (GREEN):** Render editorial privado com fotos finais referenciadas, contador correto, download respeitando permissão, revisões anteriores somente admin.
- [ ] **Step 4:** Playwright 320/360/375/390/430/768/1024/1440, zoom 200%, teclado, foco, Escape e reduced motion; QA com álbum real sintético populado.
- [ ] **Step 5:** Commit + `06-delivery.md`.

### Task 07 — Solicitações, decisões por foto e mensagens (PP06)

**Files:** `worker/api/client-workflow.ts` e `client-workflow-admin.ts`; `app/admin/components/private-album/RequestInbox.tsx` e UI cliente; testes `tests/integration/client-workflow-security.spec.ts`.

**Interfaces:** `createRequest`, `decideRequestItem` e `appendRequestMessage`.

- [ ] **Step 1 (RED):** Pedido por foto ou geral, aprovar 3/5 e recusar 2/5 com motivos, histórico persistente, mensagens apenas entre proprietário/Maria, XSS escaped, rate limit e IDOR negado.
- [ ] **Step 2:** Rodar testes alvo, capturar RED.
- [ ] **Step 3 (GREEN):** Handlers privados e inbox guiada, histórico append-only, threads por pedido, sem chat realtime; aprovação não implica publicar.
- [ ] **Step 4:** Tests A/B, typecheck e browser completo com dois usuários sintéticos.
- [ ] **Step 5:** Commit + `07-requests.md`.

### Task 08 — Antes/depois, aprovação individual e desistência pré-publicação (PP06)

**Files:** `app/albuns/components/RevisionReview.tsx`, `worker/api/client-workflow.ts` e `worker/media/private-gallery.ts`; e2e/integration de revisão.

**Interfaces:** `GET /api/client/galleries/:id/review/:itemId`; `POST .../requests/:requestId/items/:itemId/decision {decision:"accept"|"reject"|"revoke",expectedRevision}`.

- [ ] **Step 1 (RED):** Comparação autorizada antes/depois no celular, aprova 4/5 e pede ajuste quinta, revoga uma aprovação ANTES da publicação (D28), nega revogação depois; Maria publica só as aceitas.
- [ ] **Step 2:** Rodar e registrar RED.
- [ ] **Step 3 (GREEN):** Viewer responsivo com controles teclado/toque, Crop consistente, estados auditados e forte checagem de proprietário e candidato.
- [ ] **Step 4:** Testes GET/HEAD, IDOR A/B, histórico de versões e race de publicação.
- [ ] **Step 5:** Commit + `08-review.md`.

### Task 09 — Expiração e renovação (PP07)

**Files:** `worker/client/workflow-policy.ts`, `workflow-repository.ts`, `worker/media/private-gallery.ts`, `ClientLibrary.tsx`; integração de expiração.

**Interfaces:** `isGalleryAccessible(expiresAt:string|null,now:string):boolean`, `requestRenewal(client,galleryId):Promise<RequestReceipt>` e `decideRenewal(admin,requestId,newExpiry:string|null):Promise<RenewalDecision>`.

- [ ] **Step 1 (RED):** Se expirado, cartão aparece sem mídia, botões renovação, GET/HEAD thumbs/gallery/download/candidate/batch 0 bytes. Cliente não reativa, Maria pode renovar por data ou sem vencimento; nenhum purge.
- [ ] **Step 2:** Rodar testes com relógio controlado antes/na/apos expiração e registrar RED.
- [ ] **Step 3 (GREEN):** Enforce server-side em cada rota de mídia, APIs retornam apenas metadata mínima ao titular; implementar renovação com auditoria.
- [ ] **Step 4:** Rodar security matrix, URL antiga/cache, typecheck.
- [ ] **Step 5:** Commit + `09-access.md`.

### Task 10 — Outbox, alertas no portal e e-mail real (PP07)

**Files:** `worker/client/notifications.ts`, `tests/unit/client-notification.spec.ts`; integração nos handlers de publicação/solicitações.

**Interfaces:** `enqueueWorkflowEvent`, `deliverPendingNotifications`; `interface EmailTransport { send(to:string,subject:string,text:string,dedupeKey:string):Promise<SendReceipt> }`.

- [ ] **Step 1 (RED):** Antes de publicar não há notificação; após commit há evento, dedupe por event/recipient/channel, retries seguros, aviso ao cliente de revisão e Maria de solicitação, conteúdo sem mídia/segredo.
- [ ] **Step 2:** Rodar tests alvo e registrar RED.
- [ ] **Step 3 (GREEN):** Implementar inbox de avisos e outbox; identificar transporte existente já autorizado. Não supor que Cloudflare Email Routing é SMTP livre; Email Sending pode exigir pago.
- [ ] **Step 4:** Rodar testes + envio REAL a conta sintética autorizada e comprovar recebimento/custo. Sem provedor/recibo real: BLOCKED_EXTERNAL, jamais PASS nem envio fictício.
- [ ] **Step 5:** Commit + `10-email.md` com status e pendências.

### Task 11 — Download em lote e custos (PP08)

**Files:** `app/albuns/components/batch-download.ts`, `tests/unit/client-batch-download.spec.ts`, rota privada de manifest, UI da entrega.

**Interfaces:** `getBatchManifest(owner,galleryId,revisionId):Promise<BatchManifest>` e `downloadAvailableFinals(manifest,progress,signal):Promise<BatchResult>`.

- [ ] **Step 1 (RED):** 25/30 batch exatamente 25 versões finais com hashes e nomes determinísticos; download proibido se Maria desabilitou ou álbum expirou; IDOR/duplicação/erro de rede/cancelamento, sem prova, sem versão antiga.
- [ ] **Step 2:** Testar e obter RED, depois spike de três opções: ZIP no navegador com memória limitada; pacote produzido sob demanda na UI de Maria; streaming Worker somente com evidência CPU.
- [ ] **Step 3 (GREEN):** Escolher solução de um clique com progresso, cancelamento e economia comprovada. Não carregar dezenas de originais simultaneamente no Worker.
- [ ] **Step 4:** Byte/hash em lote populado, memória/CPU em Android físico, operação R2/Workers/Images; se inviável no Free: BLOCKED_COST/EXTERNAL e recurso desabilitado.
- [ ] **Step 5:** Commit + `11-batch.md` e orçamento reproduzível.

### Task 12 — Full-system QA, governança e DoD (PP09/PP10)

**Files:** `docs/operations/private-albums-r5-guided/12-integrated.md`, `execution-state.json`; testes de segurança/regressão e recibos de revisão.

**Interfaces:** gera `readiness = "NO_GO" | "READY_FOR_HUMAN_APPROVAL"`, nunca `GO_PRODUCTION` automático.

- [ ] **Step 1:** Freeze SHA, verificar branches/PRs concorrentes, revisão independente de segurança com findings e testes de regressão para cada P0/P1.
- [ ] **Step 2:** Em SHA exato rodar `npm ci`, `npm audit --omit=dev`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, Playwright e migrations/restore em DB isolado; registrar resultado de cada comando.
- [ ] **Step 3:** Exercitar fluxo real sintético de Maria + clientes A/B: provas, confirmação, reabertura, final 25/30, compositor/reuse/crop, revisão 4/5, desfazer, inbox, renovação, email, batch e isolamento.
- [ ] **Step 4:** Teste visual 320–1440, zoom 200%, foco/contraste/reduced motion e mobile; **Android/iOS físicos** e leitores de tela não são substituídos por emulação.
- [ ] **Step 5:** Validar orçamento real da conta, 100k requests/day e 10ms CPU Free (consultar limites atuais), transformações Images, storage/ops R2, envio email, prova de rollback, política LGPD e revisão formal. Não promover R4 G05/G17/G15/G19/G20/G22/G23.
- [ ] **Step 6:** Construir matriz `requisito → código/commit → teste → resultado → evidência`; todos os gates sem prova permanecem FAIL/BLOCKED/NOT_RUN. Revalidar home/lente/SEO/Colagem/Studio.
- [ ] **Step 7:** Commit docs e atualize PR draft com SHA final, CI/artifacts verificáveis, blockers, custo e readiness. Sem merge/deploy/produção sem aprovação humana.

## Gate-to-task coverage

| Gate | Owner | PASS mínimo |
|---|---|---|
| PP00 | 00 | ownership, baseline e SHA documentados |
| PP01 | 01 | D1 schema/cas/tipos, regressão verde |
| PP02 | 02 | watermark real, nenhum raw, custo viável |
| PP03 | 03 | seleção/confirmar/reabrir/favoritos separados |
| PP04 | 04 | final imutável, parcial, publicações atômicas |
| PP05 | 05–06 | editor/cliente responsivos, sem home regression |
| PP06 | 07–08 | inbox, mensagens, decisões por foto, antes/depois |
| PP07 | 09–10 | expiração GET/HEAD e envio de email real |
| PP08 | 11 | download lote byte/hash e custo viável |
| PP09 | 12 | segurança independente, LGPD, restore/rollback |
| PP10 | 12 | integração/CI exato, dispositivos, R4 e aprovação |

## Self-review

Cobertura: todas as seções funcionais da SPEC mapeadas para tarefas, sem “implementar tudo” como tarefa. Interfaces `proofImageId`/`finalVersionId`/`expectedRevision`/`requestId`/`itemId` são usadas de forma consistente. Os cinco casos de Review Focus têm testes nas tarefas correspondentes. D28 está identificado como default do agente. Email gratuito, CPU Cloudflare, lote mobile, LGPD, segurança formal e produção são bloqueios objetivos; o plano não promete contorná-los contratando novos serviços.

**Handoff:** Chat on Steroids é o executor/orquestrador futuro escolhido pelo proprietário. O GOAL acompanha este plano. A implementação exige revisão e aprovação humana da SPEC e deste plano antes do PP00 de produto; esta branch documental não a autoriza.
