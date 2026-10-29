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

## Complemento executável material (10 lifecycle + 19 modelo FK/CAS)

Após a contraprova `0009` de 6/6, ensaios **novos e executados** em SQLite memória foram anexados em `15-legacy-lifecycle-and-composite-fk-reference-evidence.md`: `verify-0009-lifecycle.py` **10/10** (exit 0; exclusão, orphan cover, soft delete, rollback, commit de estado incorreto que passa FK) e `verify-fk-reference-model.py` com `relational-fk-reference-model.sql` **19/19** (exit 0; relações composta A/B, FK de seleção e revisão, `ON DELETE RESTRICT`, CAS e rollback). São **provas do schema legado e de um modelo de referência exclusivo de docs**, **não** PP01 PASS, migration `0010`, D1 runtime ou teste de produto. Não reaplicar `0009` em produção.

**RED futuro PP01/PP04 de alta prioridade e ainda NOT_RUN:** `0009+0010` em D1 local populado deve recusar com transação consistente (a) exclusão física da foto final/capa usada em publicação, (b) `deleted_at` que deixe snapshot servido sem bytes, (c) reparent da imagem/prova entre álbuns, (d) seleção `open` usada como base de final, (e) `UPDATE` na chave/hash/bytes de `finalVersionId` publicado, (f) candidato não aceito, e (g) ponteiro de revisão de cliente B. Manter os positivos A/A e B/B, `PRAGMA foreign_key_check=[]`, logs de CAS/retry, preservação das 0009 reais e rollback sem purge. O modelo documental **intencionalmente permite** (d) e (e), mostrando que FKs não substituem guardas transacionais, política de estado, auditoria e imutabilidade R2. Não utilizar o SQL de docs como migration.

**Nuance D1 a validar no Worker real:** Cloudflare D1 impõe FKs por padrão e documenta `DB.batch()` com ordem e rollback atômico caso uma instrução falhe; D1 opera em auto-commit e não se deve transportar ingenuamente a sintaxe `BEGIN/COMMIT` do SQLite auxiliar para o Worker. A troca de ponteiro publicada deve ter pré-condições/CAS no próprio statement ou batch corretamente projetado, com revisão idempotente e evidência de rollback. `PRAGMA defer_foreign_keys` é ferramenta temporária de migração, **não** desabilitação permanente de FK. Fontes: https://developers.cloudflare.com/d1/sql-api/foreign-keys/ e https://developers.cloudflare.com/d1/worker-api/d1-database/.

## NOVO contrato RED de transação e histórico — originado do ensaio 62/62 em SQLite documental

**Evidência reproduzida:** `17-transactional-cas-history-red-20261028.md`, com `verify-publish-transaction-contract.py` e `reference-publish-guards.sql` (somente no diretório `docs`). 62/62 **asserções esperadas de modelo**, 30 disputas reais entre dois SQLite connections, log/SHAs/exit 0; **não** D1 local, produto R5 ou aprovação PP01. Cinco lacunas iniciais de histórico/recibo/outbox e três novos casos de CAS-obsoleto/false-commit; asserções incluem negativas que *demonstram falhas deliberadas*.

- **Tasks 01/04 — PP01/PP04, RED decisivo:** criar snapshot DA publicado, publicar DX, tentar `DELETE/UPDATE` direto nos itens e metadados históricos DA. **Deve falhar**, mesmo após a troca do ponteiro; histórico de publicações append-only/versões imutáveis, não só proteção do `published_revision_id` atual. Positivo: novo DX é visível, DA fica inacessível por URL cliente porém íntegro para admin/rollback autorizado.
- **Tasks 01/04 — PP01/PP04, concorrência:** dois autores com mesmo `expectedRevision`: somente um `rowcount=1`, outro `409 STALE_REVISION`; testar principalmente `D1.batch()` que contém `UPDATE CAS` + receipt + outbox: `rowcount=0` **não é exceção SQL**; batch não deve commitar receipt/outbox quando CAS obsoleto. Ensaiar mecanismo de erro atômico realmente suportado no D1, com duas sessões e logs de SHA. SQLite isolado mostrou que a sequência ingênua pode commitar evento incorreto.
- **Tasks 03/04 — idempotência:** chave igual + hash idêntico do payload canonizado retorna recibo anterior e nenhuma segunda revisão; mesma chave + hash de payload diferente exige `409 IDEMPOTENCY_CONFLICT`; guardar fingerprint de pedido sob tenant/ator/método e verificar após revogação de sessão. Provar dedupe concorrente e ausência de double-send.
- **Tasks 04/07 — publicação/outbox:** ponteiro só após confirmação, objeto R2 verificado, candidato aprovado, versão selada e CAS; receipt + outbox `pending` no commit D1, e-mail `sent` somente após prova de aceite de transporte real, sem rollback do snapshot por falha pós-commit. Outbox e mídia de cliente B devem ser negadas, URLs antigas sem bytes, cron/retry respeitam rate-limits e custos.
- **Tasks 04/08/11 — R2 e custo:** PUT de chave R2 imutável antes do commit D1 pode gerar objeto órfão em falha; definir reconciliador com janela de segurança, rechecagem contra **todo** histórico, dedupe e regra LGPD; nenhuma deleção automática nem sobreescrita de final. Medir `R2 Class A/B/storage`, CPU, Images únicas, watermark rasterizada e batch streaming antes de PP08.
- **Tasks 05/06/07/08 — UX/A11y Maria e cliente:** para `409` recarregar/comparar draft sem perder foco; após publish sucesso com e-mail pendente não afirmar aviso enviado; cliente vê 25/30, revisão 4/5 sem candidato rejeitado, controles de expiração, retry e recuperação, 320–1440px/200%/teclado/leitor de tela. Browser real, QA física e parecer independente continuam `NOT_RUN`.

São regras de aceite propostas **compatíveis com a SPEC** sujeitas à revisão humana, não implementação ou promoção de gate. `D1.batch` reverte quando alguma instrução **falha**, e não necessariamente quando `UPDATE` afeta zero linhas: https://developers.cloudflare.com/d1/worker-api/d1-database/.

## Novo RED de recuperação por etapa de publicação — PP01/04/07/09 (ainda NOT_RUN)

Novo ensaio **somente modelo sintético**, relatório 19-failpoint-crash-recovery-and-d1-free-budget-20261029.md e verificador verify-synthetic-failpoint-saga.py: **161/161 checks esperados, exit 0, nove failpoints**, reabertura SQLite file-backed em cada um e idade de órfão com duas verificações; nenhum Worker/D1/R2 realmente executado. Não substituir os RED existentes nem promover gates.

| Task/gate | Cenário novo futuro em Worker+D1 local+R2 autorizado | Aceite verificável |
|---|---|---|
| 01/04 PP01/PP04 | Interrupção antes/depois do PUT, HEAD, INSERT revision, CAS, receipt, outbox, COMMIT e HTTP response | Antes do COMMIT, ponteiro/snapshot antigos e outbox ausente; depois, único snapshot e recibo duráveis; retry com chave+hash+principal idênticos sem duplicar; chave igual com payload diferente responde 409 |
| 01/04 PP01/PP04 | CAS stale 0 rows em D1.batch, incluindo crash após UPDATE | Falhar batch com rollback real e 0 receipt/outbox; 0 rows sozinho **não** é exceção; histórico anterior retido |
| 02/04 PP02/PP04 | R2 conditional PUT (sem overwrite), objeto ausente/corrompido, derivada não marcada e candidate não aceita | Validar SHA/bytes/pixels watermark realmente rasterizada; fail-closed GET/HEAD/Range; nunca fallback para original |
| 03/04 PP03/PP04 | Cliente B, prova não confirmada, candidata rejeitada, URL antiga, expiração na fronteira exata | Zero bytes/opaco para recurso alheio, expirado e versão revogada; confirmação imutável; versão nova vinculada à prova |
| 07/09/10 PP06/PP07 | Provider de email falha depois de commit, reinício do Worker, outbox retry limitado e auth admin compartilhada | Publicação permanece, aviso pending/failed; sent só com comprovante externo; autoria editorial individual comprovada sem e-mail autodeclarado |
| 04/09/11 PP04/PP07/PP08 | GC lê objeto órfão 24h depois; uma hora após faz segunda leitura; corrida de upload/snapshot histórico | Nunca excluir sem lease/status de upload, segunda checagem de referências históricas/LGPD e autorização; testar simulação de rollback e de orphan após falha D1; sem auto-delete antes da prova |
| 00/10/12 PP00/PP07/PP09/PP10 | D1 Free esgota 5 milhões rows read/dia ou 100 mil rows written/dia | Job de outbox e GC entra em backoff e mantém portal fail-closed, sem loop ilimitado; métricas reais/estudo de custo, nunca BLOCKED_COST inferido |

As quotas D1 Free são **limites documentados, não medições da conta**. Enforcement em 01/09/2026, reset diário 00:00 UTC: https://developers.cloudflare.com/d1/platform/pricing/ e https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/. Testes físicos UX de Maria/cliente, 25/30, ajustes 4/5, 320–1440px, teclado, 200% zoom e recuperação de erro continuam NOT_RUN e não são cobertos por este modelo.

## PP00 — baseline de aplicação agora executado, aprovação ainda pendente (29/10/2026)

Em **clone Git independente** da preparação R5, o baseline da aplicação existente passou no HEAD 0b6a07f93820033b9aee2e90bd167c8dfb3fea3b: npm ci (540 pacotes), typecheck exit 0, lint exit 0, Vitest **54 arquivos/223 testes exit 0**, build **exit 0**, browser E2E local **PASS_LOCAL, 14 checks** no Chrome instalado, workerd/D1/R2 sintéticos e 8 larguras. Primeiro E2E falhou por Chromium do Playwright ausente, recuperado sem download com CHROMIUM_EXECUTABLE. Report/SHAs no checkpoint 21-owned-checkout-runtime-baseline-and-portability-20261029.md. Logs fora do clone, Git status limpo. **São testes R4 no checkout R5 documental, não PP01–08 e não CI. PP00 permanece BLOCKED_EXTERNAL** porque SPEC/plano não têm aprovação humana comprovada nem worktree de implementação autorizada.

Checkers documentais tinham falsos negativos em Windows: static 17/18 por CRLF e fixture 16/17 por regex UUID v4 malformada; ambos corrigidos em docs e reexecutados 18/18 e 17/17 com controle negativo. Quatro reprodutores Python pinados inicialmente falharam com CRLF; após canonicalizar LF antes dos hashes, os cinco executaram na fonte do clone com exit 0 (6/6,10/10,19/19,62/62 e 161/161). Esses **não** validam a futura 0010.

**RED adicional pós-aprovação, PP01/PP04/PP09:** reproduzir a janela TOCTOU do Worker R4: validar que imagem da capa está ready/não excluída, transação concorrente a torna inelegível, tentativa de alterar capa precisa falhar no próprio UPDATE condicional/constraint de 0010. Reproduzir publicação com erro injetado ao persistir audit event: a troca de ponteiro publicada e seu evento de auditoria individual verificável precisam ser uma transação indivisível; nem publicação sem audit, nem audit de publicação que não ocorreu. SQL da R4 e ensaio auxiliar de **14/14 resultados esperados, exit 0** (não HTTP/D1) detalhados no checkpoint 21. Usar duas conexões D1 local e Worker real somente após PP00. A R4 existente não recebe correção implícita.
## Nova evidência operacional: D1.batch/CAS/R2 **local workerd real** (29/10/2026)

`22-d1-workerd-runtime-and-human-approval-gate-20261029.md` e `verify-local-workerd-d1-r2-boundaries.mjs`: em Miniflare/workerd com D1 e R2 locais **17/17 asserções, exit 0**, fonte Git blob `56b3352ce8ac5e55f996298ca4c3f41ed244f7b2`, log SHA256 `C8CFF55A94FF9C6AF07047AB81BECA017D9335A61AD587BE8B578057E3D88984`. Não é SQLite Python puro, mas ainda usa **Worker mínimo e esquema sintético, não o Worker/migration R5**. Estado PP01/PP04/PP08 `NOT_RUN` permanece.

**RED futuro PP01/04:** uma atualização com 0 linhas não é erro de `D1.batch()` e pode confirmar recibo/outbox sem publicar; guard experimental `INSERT ... SELECT changes()` com `CHECK(ok=1)` **foi observado abortar batch no D1 local**. Exigir evidência equivalente para SQL final da migration 0010, sob duas invocações reais, idempotência por principal verificado+hash, auditoria no mesmo commit e ausência de eventos duplicados. O bucket R2 local manteve objeto staged após rollback D1 — criar contrato de compensação/GC com histórico e leases. Novo RED de timeout: `Promise.race` não cancela escrita D1 e o cliente pode não conhecer o resultado, portanto consultar receipt idempotente antes de repetir (https://developers.cloudflare.com/d1/observability/debug-d1/).

**Aprovação formal reavaliada:** PR #25 draft sem reviews humanos e só comentário CodeRabbit de falta de revisão; PR #24 trata explicitamente R4; buscas de issues pelos dois Git blobs, registros recuperáveis e dois Drives não comprovaram aprovação formal **de ambos**. PP00 continua `BLOCKED_EXTERNAL` apesar do clone e baseline; `NO_GO` e proibição de implementation/0010/deploy/billing preservadas.

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
