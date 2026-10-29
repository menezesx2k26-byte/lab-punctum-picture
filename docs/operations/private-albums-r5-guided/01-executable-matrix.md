# R5 — matriz executável das Tasks 00–12 e gates PP00–PP10

**Fonte de verdade:** SPEC, plano e GOAL versionados na PR #25. **Baseline:** `f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f`. **Fase atual:** preparação documental isolada, `NO_GO`. Nenhuma implementação ou teste R5 foi executado; linhas `NOT_RUN` não significam aprovação tácita.

## Pré-condição transversal
1. Registrar aprovação humana **inequívoca e rastreável dos dois documentos**, com revisor/autoridade, URL, versão SHA e texto de aceite. Decisões de brainstorming, abertura da PR e CI verde não bastam. D28 segue default de engenharia, não ratificação expressa.
2. Reconciliar alterações locais e ownership, criar worktree nova a partir da base verificada, manter writers sem colisão. `PP00` PASS só após baseline/testes locais no SHA exato.
3. Para cada tarefa, ciclo obrigatório `RED → GREEN → REFACTOR → REVIEW → COMMIT → CHECKPOINT`; log de comando, exit code, assert count, SHA, arquivo de evidência, limitações e custo. Sem aprovação, **somente os passos de inspeção, planejamento e desenho**.
4. Flags privadas OFF por padrão; sem clientes reais, merge, deploy, migração remota, billing, novos serviços pagos, purges, segredos ou restauração histórica.

## Dependências e aceites executáveis

| Task / gate | Depende de | RED / teste decisivo após aprovação | GREEN / aceite verificável | Provas previstas | Risco / custo | Situação atual |
|---|---|---|---|---|---|---|
| **00 / PP00** baseline/ownership | aprovação + acesso local | diff de main/PR24/PR25, `git status`, worktrees, instruções, `npm ci`, typecheck, lint, test, build, e2e quando aplicável | branch/worktree isoladas e testes contabilizados no SHA | `00-baseline.md`, logs, commits, CI, ownership | conflito com trabalho de terceiros; nenhuma despesa | **BLOCKED_EXTERNAL** (aprovação/local) |
| **01 / PP01** D1, contratos/políticas | 00 | unit/integration RED para seleção inválida, FK cross-gallery, CAS 409, duplicação, SQL sobre DB populado | `0010` aditiva, Zod strict, FK compostas, transações, rollback não destrutivo | `01-contracts.md`, fixture D1 isolada, SQL/schema diff | dados/concorrência; D1 local apenas | **NOT_RUN** |
| **02 / PP02** provas seguras | 01 + viabilidade de processamento | RED watermark pixel real, resolução, A/B 404/0 bytes, GET/HEAD sem derivada, bypass optimizer público | derivada imutável R2 hash/dimensões/MIME conferidos; nenhuma prova crua ao cliente; falha fecha acesso | `02-media.md`, hashes, amostra de pixel, CPU/Images/R2 e testes de mídia | processamento pode exceder Free ou IMAGES indisponível; **BLOCKED_COST** se sem margem | **NOT_RUN** |
| **03 / PP03** seleção/confirmar | 01 + 02 | RED exact N, max ≤N, free ≥1, duplicados, favorito separado, replay, concorrência, A/B | rascunho versionado, confirmação atômica/recibo imutável, só Maria reabre com auditoria | `03-selection.md`, testes/unit+integration+browser preenchido | duplicação/IDOR; sem cobrança | **NOT_RUN** |
| **04 / PP04** finais e publicação | 01, 02, 03 | RED upload Xv1/Xv2, Y não confirmado, 25/30 parcial, stale 409, retry idempotente, snapshot antigo | objetos finais imutáveis associados a prova confirmada, troca atômica do snapshot, cliente só último publicado | `04-finals.md`, hashes e GET/HEAD de variantes A/B, transações | exposição/version race; upload R4 G05 segue FAIL | **NOT_RUN** |
| **05 / PP05** compositor admin | 01, 04 | RED blocos tipados, reorder/keyboard, crop por ocorrência, reuse sem duplicar objeto, conflito CAS | Editor privado dnd-kit, 6 tipos allowlisted, draft independente de publicação | `05-composer.md`, screenshots, teste component/unit e regressão home | XSS/referência cruzada; R2 apenas referências | **NOT_RUN** |
| **06 / PP05/PP04** entrega cliente | 04, 05 | RED parcial 25/30, completo 30/30, antiga negada, loading/error/empty/session, downloads só finais | experiência guiada no ClientLibrary/PrivateGallery com contagem e snapshot coerentes | `06-delivery.md`, screenshots 8 larguras, zoom 200%, foco/Escape | performance visual/A11y; nenhum novo serviço | **NOT_RUN** |
| **07 / PP06** solicitações/mensagens | 01, 03, 04, 06 | RED pedido por foto e global; decisão 3/5 vs 2/5, XSS, IDOR, flood/replay | inbox do Studio, decisões individuais, thread contextual audível, sem publicar por aprovação | `07-requests.md`, fixture A/B, históricos, testes de segurança | privacidade e abuso; storage D1 | **NOT_RUN** |
| **08 / PP06** reedição/antes-depois | 04, 07 | RED aprovar 4/5, rejeitar quinta, revogar 1 pré-publicação, negar pós-publicação, GET/HEAD A/B | comparação privada e decisões por foto; versão anterior continua até publicação explícita | `08-review.md`, hashes, UI touch/teclado, race | vazamento candidato; IMAGES/R2 | **NOT_RUN** |
| **09 / PP07** validade/renovação | 01, 02, 04, 07 | RED relógio antes/na/depois; GET/HEAD de todas as mídias/candidato/ZIP sem bytes | biblioteca mostra bloqueio e pedido; só Maria renova; nenhum purge implícito | `09-access.md`, matriz rota × método × dono × validade | cache/URL antiga; sem purge | **NOT_RUN** |
| **10 / PP07** outbox/email | 04, 07, 09 + provedor autorizado | RED ausência pré-commit, dedupe, retry, idempotência e nenhum anexo/link de segredo | inbox no portal + outbox persistente; envio real só com transporte gratuito autorizado e recibo externo | `10-email.md`, eventos, prova de recebimento/custo real | risco financeiro/entrega falsa: **BLOCKED_EXTERNAL** se sem provedor | **NOT_RUN** |
| **11 / PP08** lote/download | 04, 06, 09 + orçamento | RED manifest 25 de 30 (somente finais), hashes, cancelamento, IDOR, expirado, offline | um clique entrega todas as finais permitidas sem exceder CPU/memória; estratégia de streaming/ZIP empiricamente escolhida | `11-batch.md`, hash bytes, CPU/memória Android físico | ZIP/Worker Free/R2 e download no aparelho: **BLOCKED_COST/EXTERNAL** sem prova | **NOT_RUN** |
| **12 / PP09–PP10** sistema/DoD | 00–11, revisores, R4 gates | regressão E2E duas contas + Maria, CAS/IDOR/XSS/CSRF/revogação, CI/QA física e rollback | segurança independente, LGPD, teste físico, custos/CI SHA e rollback verificados; nunca habilitar produto por inferência | `12-integrated.md`, matriz SHA/testes, artifacts e pareceres | G05/G17 R4 FAIL; G15/G19/G20/G22/G23 externos | **NOT_RUN**, release **BLOCKED_EXTERNAL** |

## Contraprova nova de integridade persistida — PP01 (não altera estados)

O ensaio read-only sobre a **DDL exata** `migrations/0009_private_client_galleries.sql` (blob `5281fc9b99ed85bf6e7751ad7eb11f8b5482df23`) executou **6/6 casos sintéticos em SQLite memória** e demonstrou duas lacunas de constraints, não de autorização HTTP R4: `favorites(client_id=B,gallery_id=A,image_id=A)` é aceito e a capa de GA pode apontar para imagem IB da GB. Em ambos os casos `PRAGMA foreign_key_check=[]`, porque as constraints existentes não exigem esses vínculos. Reprodutor `verify-0009-favorites-isolation.py`, dados e logs em `13-exact-0009-sqlite-tenant-integrity-evidence.md`. **PP01 continua NOT_RUN**: uma execução isolada da migração legada não testa a nova `0010` nem D1.

**RED obrigatório após PP00 e aprovação formal:** em D1 local populado com `0009+0010`, testar escritas SQL diretas e API que tentem associar cliente B/galeria A, prova de B/final de A, item de revisão de B/pedido de A, bloco com mídia de outro álbum, snapshot não confirmado, capa/derivada mal vinculada; rejeitar por FK composta/CAS/transação equivalente sem publicar bytes ou modificar snapshot. Executar controles positivos A→A e B→B e rollback; auditar `PRAGMA foreign_key_check`. A `0009` não deve ser alterada e não há permissão para migrar produção. Limites oficiais D1 Free a aferir no desenho: 500 MB/banco, 100 bind parameters/statement e 2 MB/row; validar tamanho do `blocks_snapshot_json` e número de operações de publicação por transação (https://developers.cloudflare.com/d1/platform/limits/).

## Contratos de dados, API e invariantes
- IDs canônicos: `proofImageId`, `finalVersionId`, `expectedRevision`, `requestId`, `itemId`; evitar sinônimos. `SelectionMode = exact|max|free`.
- D1: `client_gallery_workflows`, `client_proof_derivatives`, `client_selection_revisions`, `client_selection_items`, `client_final_asset_versions`, `client_delivery_drafts`, `client_delivery_revisions`, `client_album_requests`, `client_request_items`, `client_request_messages`, `client_workflow_events`, `client_notification_outbox`. Migração prevista `0010_guided_selection_delivery.sql`; NÃO alterar `0009`.
- Cada mutação: auth, role/owner, Origin/CSRF, Zod strict, rate limit, idempotency key e CAS quando pertinente. Divergência `409 STALE_REVISION`. Recursos A→B: 404 opaco/0 bytes; nenhuma chave R2 no JSON cliente.
- Cliente não usa favoritos como seleção, não reabre seleção confirmada e não aprova publicação pela simples abertura de pedido. Maria configura, reabre excepcionalmente e publica explicitamente após validação de seleção, finais, aprovações e armazenamento.
- Mídia cliente: apenas derivadas de prova marcadas (sem botão download), finais do snapshot publicado vigente, ou candidato somente em etapa de aprovação válida. GET e HEAD fazem a mesma validação de dono, validade, versão e status. `Cache-Control: private,no-store`; nenhuma rota no otimizador público.
- Revisão: ponteiro atômico para snapshot imutável com versões de R2 por ID. 25/30 parcial mostra 25 finais, cinco pendentes; aprovar 4/5 candidatos não publica quinta foto não aprovada; reedição revogada pré-publicação não entra.
- Expiração: metadados mínimos podem anunciar renovação ao titular, porém todas as rotas de mídia negam bytes; não há exclusão automática.
- E-mail: outbox só após commit, sem anexos/links privados, dedupe por evento/destinatário/canal. Estado `sent` somente mediante transporte + recibo real.
- Download em lote: manifest vinculado à revisão vigente; byte/hash por item, progresso/cancelamento e estratégia respeitando limites de memória/CPU.

## Matriz de gates — estado atual e teste para PASS

| Gate | Status atual | Para chegar a PASS |
|---|---|---|
| PP00 | BLOCKED_EXTERNAL | aprovar SPEC+plano; worktree local limpa/owned, baseline, SHA, comandos, exit code |
| PP01 | NOT_RUN | migração local em D1 populado + FK/CAS/Zod e rollback isolado |
| PP02 | NOT_RUN | derivadas watermarked comprovadas por bytes/pixel + autorização e orçamento |
| PP03 | NOT_RUN | seleção/confirmar/reabrir, A/B, concorrência e recibo |
| PP04 | NOT_RUN | finais imutáveis, parcial 25/30 e snapshot publicado atômico |
| PP05 | NOT_RUN | editor/clientes 8 breakpoints, zoom/foco e regressão pública |
| PP06 | NOT_RUN | pedidos, mensagens, 4/5, antes/depois e revogação pré-publicação |
| PP07 | NOT_RUN | expiração GET/HEAD 0 bytes + envio email realmente homologado |
| PP08 | NOT_RUN | lote hash/bytes, um clique, Android real e custo/CPU provados |
| PP09 | BLOCKED_EXTERNAL | parecer independente formal + política LGPD assinada + rollback/restore |
| PP10 | BLOCKED_EXTERNAL | CI exato e QA integrada/física + todos PP + R4 G05/G17/G15/G19/G20/G22/G23 resolvidos e aprovação de liberação |

**Nota:** `BLOCKED_COST` é registrado quando a aferição mostrar orçamento indisponível/inadequado; nenhum custo real R5 foi medido nesta fase. A matriz sinaliza risco de custo, não um `FAIL` inventado.

## Comandos / checkpoints futuros
```sh
git status --porcelain=v1
git rev-parse HEAD
git worktree list --porcelain
node --version
npm ci
npm audit --omit=dev
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
git diff --check
```
Cada comando só vira evidência se de fato executado e anexado com stdout/stderr sanitizado, exit code e SHA testado. `npm test` e `npm run test:e2e` exigem ambiente/fixtures adequados; falha/ausência de browser não é PASS. Após cada gate: `RED → GREEN → REFACTOR → REVIEW → COMMIT → CHECKPOINT`, sem dois escritores no mesmo arquivo; registrar `requirementIds, files, testCommand, exitCode, assertions, testedSha, commit, ciRunUrl, artifactHash, measuredCost, reviewerFindings, blockers, nextAction`.

## Retomada ordenada
1. Obter aceite humano formal **para SPEC e plano exatos**; documentar URL, pessoa, data e SHA.
2. Auditar workspace local/locks/AGENTS, criar worktree R5 a partir da branch de preparação, validar baseline; só então concluir PP00.
3. Implementar em blocos coerentes 01→02→03→04→05/06→07/08→09/10→11→12, respeitando testes e revisores distintos. Continuar frentes independentes quando custo/email/aparelhos bloquearem outras.
4. Manter separadamente G05/G17 FAIL e G15/G19/G20/G22/G23 BLOCKED_EXTERNAL da R4 até homologação específica.
5. Preparar draft PR de **implementação futura**, CI exato, evidências, rollback e handoff; somente `NO_GO` ou `READY_FOR_HUMAN_APPROVAL`, sem `GO_PRODUCTION` automático.
