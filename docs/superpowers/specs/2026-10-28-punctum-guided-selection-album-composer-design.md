# Punctum Picture — Seleção guiada, entregas versionadas e compositor editorial privado (SPEC)

**Data:** 2026-10-28 (America/Sao_Paulo)  
**Estado:** SPEC consolidada para revisão; decisões funcionais aprovadas em brainstorming, **não equivale a autorização de execução, merge ou produção**.  
**Base de inspeção:** PR #24, branch `agent/hst-001-hostinger-qa-20261028`, SHA `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd` (verificar HEAD na execução).  
**Escopo:** fotógrafa Maria (administradora) e cliente titular do álbum; implementação futura no módulo privado existente.  
**Documentos relacionados:** `docs/superpowers/specs/2026-10-22-punctum-client-albums-design.md` (autenticação histórica desatualizada), `docs/superpowers/specs/2026-10-24-punctum-mobile-first-collage-design.md`, `docs/operations/private-albums-r4/execution-state.json`.  
**Plano:** `docs/superpowers/plans/2026-10-28-punctum-guided-selection-album-composer.md`.  
**GOAL:** `docs/superpowers/goals/2026-10-28-punctum-cos-goal.md`.

## 1. Intenção, limites e sucesso

Maria publica fotografias de prova; o cliente seleciona e confirma um conjunto; Maria edita **fora** do Punctum Picture, associa as versões finais às provas confirmadas, monta uma entrega narrativa por blocos e publica revisões, inclusive parciais. O cliente acompanha progresso, avalia ajustes e obtém apenas fotos finais autorizadas. Uma solicitação jamais se converte silenciosamente em aprovação ou publicação.

**Sucesso observável:** cliente A só vê seus próprios álbuns; seleciona exatamente N, até N ou livre segundo regra exibida; confirma e obtém recibo histórico; só Maria reabre a seleção; provas são reduzidas e efetivamente marcadas; fotos finais são vinculadas às confirmadas; Maria publica revisão parcial ou completa e preserva versões; o cliente só vê a mais recente; revisões de edição são aprovadas individualmente antes de Maria publicar; acesso expirado bloqueia até mídia direta; download autorizado individual e coletivo funciona dentro dos limites comprovados; emails reais são enviados apenas após publicação por provedor previamente homologado; mobile e acessibilidade têm evidências.

**Não objetivos:** CRM integral, pagamentos, contratos, agenda, edição fotográfica no navegador, chat geral/realtime, colaboração pública, múltiplos destinatários por álbum, HTML/CSS/JS arbitrários, música/vídeo, links compartilháveis públicos, novo backend/infraestrutura paga, mudança do portfólio/home/SEO público.

**Antiobjetivos:** confundir favoritos com seleção confirmada; reaproveitar o componente da home em álbuns sem isolamento; servir originais de prova ao cliente; desativar autorização em rotas de mídia; gerar ZIP custoso dentro do Worker sem prova; alterar produção por efeito colateral; considerar CI verde como homologação física, jurídica, financeira ou de segurança.

## 2. Decisões ratificadas (D01–D28)

- **D01–D07:** fluxo selecionar→confirmar→editar externamente→entregar; regra por álbum exata N/até N/livre; confirmação bloqueante com reabertura apenas por Maria e histórico; provas reduzidas com watermark e sem downloads; finais separadas; jornada guiada B; compositor nível 3.
- **D08:** nas provas só a abertura é autoral; grade de seleção e confirmação permanecem padronizadas. Na entrega, narrativa totalmente autoral por blocos.
- **D09–D10:** alterações após entrega mediante aprovação de Maria; cliente vê somente última revisão publicada, Maria vê todo o histórico.
- **D11–D13:** editor editorial por blocos responsivos, não canvas livre; reutilização de um ativo final em blocos múltiplos, sem cópia de bytes e com crops independentes; substituição de final atualiza todas as ocorrências no **rascunho**, sem mudar publicação anterior.
- **D14–D15:** apenas fotografias do conjunto confirmado podem compor a entrega; mudar conjunto exige nova autorização e confirmação; downloads individuais e em lote somente quando Maria permitir e custo zero comprovado.
- **D16–D18:** entrega parcial explicitamente incompleta; “Baixar tudo” baixa todas as finais já disponíveis e autorizadas, indicando pendências; publicação gera notificações no portal e por e-mail, mediante infraestrutura existente e validação de custo.
- **D19–D21:** vencimento opcional configurável por álbum, sem exclusão automática; álbum expirado é listado como bloqueado e permite pedir renovação, decidida por Maria; Studio centraliza solicitações, aprovações, recusas, histórico e avisos por e-mail.
- **D22–D24:** solicitação de ajuste por foto ou geral; conversa contextual dentro do pedido, sem chat global; Maria aprova/recusa cada alteração individualmente, podendo justificar.
- **D25–D27:** edição revisada requer prévia privada e aprovação do cliente antes da publicação; aprovação por fotografia e publicação apenas das alterações aprovadas, mantendo a versão publicada anterior das pendentes; comparar antes/depois com UI responsiva.
- **D28 — escolha delegada ao agente, NÃO ratificação expressa:** desfazer aprovação de uma **edição** antes da publicação, com auditoria e bloqueio do candidato revogado. Não permite desfazer confirmação do **conjunto** sem ação de Maria.

**Padrões delegados (não decisões expressas):** seleção livre exige ao menos 1 foto; seleção “até N” exige entre 1 e N; pedido de nova edição não dispensa autorização da seleção original; preview em estado de expiração é negado; itens gerais de solicitação têm decisão global; respostas são assíncronas; textos de e-mail sem anexos/fotos; sem purge implícito. Podem ser revistos em análise humana sem alterar escolhas ratificadas.

## 3. O que existe hoje e o que é evolução

- Stack no SHA-base: Node >=22.13.0, Next 16.4.3/React 19.2.8, vinext/Vite, TypeScript, Zod, D1, R2 privado, Workers, dnd-kit, Vitest/Playwright.
- Já existem: `app/admin/components/StudioManager.tsx` e `studio/StudioPageComposer.tsx` (página pública); `ClientAccountsManager.tsx`, `PrivateGalleryEditor.tsx`; `app/albuns/components/ClientLibrary.tsx`, `PrivateGallery.tsx`, `PhotoViewer.tsx`; `app/albuns/components/api.ts`/`responses.ts`/`routes.ts`; `worker/client/router.ts`/`auth.ts`/`access.ts`/`repository.ts`; `worker/api/client-admin.ts`/`client-galleries.ts`/`client-gallery-upload.ts`; `worker/media/private-gallery.ts`; `shared/client-galleries.ts`; migration `0009_private_client_galleries.sql`; favoritos reais separados.
- **Não existem homologados nesta base:** seleção confirmada, arquivos finais ligados a provas, snapshots de revisão, editor privado por blocos, pedidos contextuais, vencimento/renovação e notificações dessa evolução. O protótipo HTML descartável não constitui produto/teste físico/segurança.
- A R4 é **NO_GO_PRODUCTION**: 17 PASS, G05/G17 FAIL, G15/G19/G20/G22/G23 BLOCKED_EXTERNAL; nenhum gate desta SPEC substitui esses gates. Consultar execução atual antes de usar cifras históricas.

## 4. Abordagens e arquitetura escolhida para planejamento

**Escolhida como default de engenharia:** extensão aditiva do Worker/React/D1/R2 existentes com módulos pequenos e contratos explícitos. Vantagens: reaproveita auth/admin, auditoria, mídia privada, testes e Studio; mantém a fronteira pública intacta. Tradeoff: exigir versionamento e migração coerentes, CPU/transformações e concorrência cuidadosamente testados.

**Rejeitada:** backend separado para composição/seleção. Criaria nova superfície de ataque, deploy e custo.  
**Rejeitada:** colocar as coleções na configuração pública/portfólio. Quebraria isolamento da home, indexação e permissões.  
**Rejeitada:** usar favoritos atuais como seleção. Não há confirmação, bloqueio nem recibo.

**Módulos propostos** (não alterar sem levantamento prévio): `shared/client-workflow.ts` (Zod/tipos), `worker/client/workflow-repository.ts` (D1 e snapshots), `worker/client/workflow-policy.ts` (políticas puras), `worker/api/client-workflow.ts` (cliente), `worker/api/client-workflow-admin.ts` (Maria), `worker/client/notifications.ts` (outbox/transporte), `app/albuns/components/SelectionJourney.tsx`/`DeliveryExperience.tsx`/`RevisionReview.tsx`, `app/admin/components/private-album/WorkflowEditor.tsx`/`AlbumBlockComposer.tsx`/`RequestInbox.tsx` e CSS privado. Refatorar somente onde necessário; as rotas existentes continuam autoridade única.

## 5. Jornadas e UX

**Maria:** Studio → Solicitações/Pendências → Cliente/Álbum → Configurar regra de seleção e validade → preparar provas seguras → prévia/publicação de provas → acompanhar seleção/favoritos em áreas distintas → autorizar excepcional reabertura e preservar confirmação anterior → subir versões finais associadas às provas confirmadas → analisar pendentes e pedidos → editar composição → prévia desktop/mobile → publicar revisão parcial ou completa → acompanhar notificações e expiração.

**Cliente:** autenticação R4 vigente (não seguir senha histórica da SPEC 22/10) → Biblioteca → abrir álbum → ver abertura autoral e regra → marcar seleção em grade padronizada, contador e feedback → confirmar, com recibo claro e ação fechada → acompanhar “em edição” → ver entrega parcial/completa → downloads apenas se autorizados → pedir alteração por foto ou geral → responder dentro de solicitações → avaliar novas edições em antes/depois e aprovar individualmente → receber nova revisão publicada; álbum vencido mostra cartão de acesso expirado e botão de renovação sem carregar bytes privados.

**Estados completos a implementar:** loading, vazio, erro de rede, retry, sessão expirada, sem imagens válidas, upload em andamento/falhou, provas sem processamento seguro, contagem insuficiente/excedida, seleção confirmada, reabertura autorizada, finais pendentes, entrega parcial, entrega completa, prévia de revisão, aceito/rejeitado/revogado, publicação com conflito, aviso pendente/erro de e-mail, acesso expirado, renovação solicitada/aprovada/recusada. Não fazer estados finais fictícios por mock.

**Linguagem visual:** fotografia principal; tipografia editorial e texto curto; grid de seleção consistente; navegação por próxima ação, sem dashboard burocrático; controles discretos de ação claros e acessíveis. Sem frases genéricas ou “AI slop”. A composição da entrega não deve sacrificar foco, leitura ou performance mobile. Os protótipos usam imagens públicas fictícias e não validam o produto.

## 6. Regras de negócio e transições

### 6.1 Seleção

- `selectionMode` = `exact` | `max` | `free`; `selectionLimit` inteiro positivo para exact/max e `null` para free. Limites por álbum, não fixar “3”; limites superiores de produto vêm de prova de capacidade técnica e configuração/admin, não de mock.
- `favorite` permanece ação independente da seleção. Alternar favorito nunca altera seleção, não dispara confirmação.
- Rascunho de seleção atualizável pelo proprietário autenticado enquanto aberto. Confirmar requer ≥1 foto pronta e elegível, regra de quantidade satisfeita e versão vigente. Gerar registro/recibo imutável com IDs, regra, versão, data, ator.
- Após confirmação, escrita do cliente bloqueada; pedido não reabre. Somente Maria abre nova rodada e preserva revisões anteriores. Alterar conjunto confirmado requer nova autorização e confirmação; as versões finais não confirmadas tornam-se inelegíveis até reconcile explícito.

### 6.2 Provas, finais e publicação

- Provas para cliente: derivado real de resolução limitada, **watermark incorporada aos pixels** antes de armazenamento/serviço; nenhum botão de download; URLs de original ou final em rascunho não podem ser derivadas do front. CSS overlay sozinho não satisfaz a regra. O processamento deve ter spike de viabilidade **antes** de implementação definitiva; candidato de baixo custo: derivação controlada no navegador administrativo com upload autenticado de variante imutável para R2, verificação de dimensões/mime e amostra inspecionável. Se falhar, bloquear prova em vez de servir original sem watermark. Watermark reduz reprodução casual, não é DRM.
- Finais: uma foto confirmada (`proofImageId`) tem zero ou mais versões finais imutáveis; cada versão guarda hash, mime/tamanho, chave R2 privada e origem/auditoria. Substituição não faz overwrite do objeto anterior. Todas as ocorrências no draft resolvem o “current candidate”; snapshot publicado fixa `finalVersionId` por foto.
- Entrega pode ter subconjunto final pronto do conjunto confirmado; marcadores “N disponíveis de M confirmadas”; nunca mostrar prova como final. Reedição não aprovada não entra em publicação; final atual permanece. Maria publica explicitamente e o cliente vê somente o último snapshot (com histórico admin completo).
- Edição prévia cliente é autorizada somente para candidato associado a pedido e proprietário do álbum; aprovações por foto. Revogação pré-publicação invalida candidatura sem alterar seleção original.
- Publicação exige pré-condições no Worker/D1: titular ativo, álbum válido, seleção confirmada atual, apenas IDs confirmados, versões finais em R2 verificadas, autorizações necessárias, blocos válidos, revisão de draft CAS e status correto. A publicação deve ser transação/commit de ponteiro único para snapshot imutável, com idempotency key; nunca publicar parcialmente um conjunto de blocos e mídia por falha no meio.

### 6.3 Compositor

- Catálogo allowlisted e tipado: `cover` (foto+texto), `text` (título/corpo), `photo` (uma foto), `sequence` (2+ referências, layout seguro), `divider` (respiro/título), `closing` (texto/foto opcional). Maria cria/remove/reordena/oculta e escolhe estilo/editorial, cores de paleta, alinhamento, espaçamento e crop por ocorrência (foco X/Y e zoom limitados/validados), visualização em 320–1440 px.
- O compositor referencia `proofImageId`/versão lógica, não replica bytes; uma foto pode aparecer em vários blocos com crops independentes. Atualização do final altera todas as ocorrências do **draft**, preserva crops; snapshots publicados não mudam.
- Na fase de provas, apenas abertura configurável; grade de seleção/confirmar é estrutura fixa. No preview de entrega, não permitir bloco de foto sem versão final validada e confirmada.
- JSON de bloco com schema discriminado por `type`, IDs únicos, cardinalidade e tamanho máximos documentados/testados; sem HTML, CSS ou script arbitrário, recursos externos, links públicos, mídia de terceiros ou cross-gallery refs.
- Draft e publicação independentes, histórico de snapshots; versão otimista `expectedRevision` → `409 STALE_REVISION` e recarregar/comparar sem sobrescrever.

### 6.4 Solicitações, renovação e avisos

- Tipos `photo_edit` | `album_general` | `access_renewal`; cada foto no pedido recebe status próprio (pending/approved/rejected/awaiting_client/accepted/revoked/published), observação da Maria e event log; mensagens por pedido são assíncronas, preservadas e visíveis só a Maria e cliente titular.
- Maria decide individualmente fotos ou globalmente pedido geral; aprovar pedido não altera fotos, conjunto nem status de publicação automaticamente. Impedir repetição, abuso e flooding com rate limit/idempotência.
- Vencimento opcional `accessExpiresAt`; se atingido, listar apenas metadados mínimos para exibir bloqueio/pedido renovação; todas as rotas privadas de mídia GET/HEAD, incluindo thumb, gallery, download, candidato e pacote, negam bytes. Acesso não se reabre automaticamente por pedido. Maria pode autorizar período novo ou ilimitado. Expiração ≠ purge LGPD.
- Outbox de eventos após **commit**: publicação, revisão, novas solicitações, respostas e decisão. Aviso dentro do portal é canônico, o e-mail é entrega adicional; dedupe por `eventId + recipient + channel`, retry/backoff e estado entregue/falhou. Nunca enviar anexo/URL de original nem segredo. Provedor/infra real precisa ser identificado, testado, gratuito dentro das cotas e autorizado, ou o gate de e-mail fica **BLOCKED_EXTERNAL** — não afirmar envio se só enfileirou.

## 7. Proposta de dados D1 / R2 (revisar SQL/constraints durante execução)

**Migração aditiva sugerida:** `migrations/0010_guided_selection_delivery.sql`, preservando `0009` e dados R4. Tabelas separadas para evitar mudar semântica de favoritos, gallery.images e publicação anterior:

| Tabela | Campos/constraints canônicos |
|---|---|
| `client_gallery_workflows` | `gallery_id PK/FK`, `selection_mode`, `selection_limit`, `access_expires_at`, `selection_epoch`, `draft_revision INTEGER`, `published_revision_id nullable`, `updated_at` |
| `client_proof_derivatives` | `proof_image_id PK/FK`, `gallery_id`, `storage_key UNIQUE`, `sha256`, `width`/`height`, `watermark_version`, `status`, `created_at` |
| `client_selection_revisions` | `id PK`, `gallery_id FK`, `epoch UNIQUE(gallery_id,epoch)`, `state`, `confirmed_at`, `confirmed_by`, `rules_snapshot_json` |
| `client_selection_items` | `selection_revision_id`, `proof_image_id`, `position`, composite PK/FKs |
| `client_final_asset_versions` | `id PK`, `gallery_id`, `proof_image_id`, `storage_key UNIQUE`, `sha256`, `mime`, `size_bytes`, `status`, `created_at`, `editor_identity`; FK proof→mesmo álbum deve ser imposto por query/constraint e teste |
| `client_delivery_drafts` | `gallery_id PK`, `draft_revision`, `blocks_json`, `candidate_versions_json`, `updated_at` |
| `client_delivery_revisions` | `id PK`, `gallery_id`, `revision_no UNIQUE(gallery_id,revision_no)`, `selection_revision_id`, `manifest_json`, `blocks_snapshot_json`, `is_partial`, `published_at`, `published_by` |
| `client_album_requests` | `id PK`, `gallery_id`, `client_id`, `type`, `status`, `created_at`, `updated_at` |
| `client_request_items` | `id PK`, `request_id FK`, `proof_image_id nullable`, `proposed_final_version_id nullable`, `decision`, `reason`, `decided_at`, `accepted_at`, `revoked_at` |
| `client_request_messages` | `id PK`, `request_id`, `author_kind`, `author_id`, `body`, `created_at` |
| `client_workflow_events` | `id PK`, `gallery_id`, `event_type`, `actor`, `payload_minimal_json`, `created_at`; append-only lógico |
| `client_notification_outbox` | `id PK`, `event_id`, `recipient`, `channel`, `status`, `attempt_count`, `next_attempt_at`, `sent_at`, UNIQUE(event_id,recipient,channel) |

**Pormenor de construção a validar:** garantir FKs compostas, ON DELETE RESTRICT para snapshots históricos, índices por owner/status e limites de retenção. `published_revision_id` não é duplicado independente: ponteiro explícito aponta snapshot imutável e é resolvido junto ao fluxo. Transações D1 para CAS, confirmação e publicação; operações R2 sempre precedem commit visível. DB não deve conter tokens de acesso/links públicos ou mensagens sensíveis em logs. Preservar flags de R4.

**R2:** manter bucket privado, prefixos separados `client-galleries/{galleryId}/proof-derivatives/...` e `.../final-versions/...` com nomes opacos/versões imutáveis. Nunca criar cópia por ocorrência editorial. Retenção/reconciliação R2 e migração reversível sem drop: política LGPD definida com Maria/responsável antes de purge. Backups não devem ser alterados sem procedimento homologado.

## 8. APIs propostas / contrato intermediário

As rotas abaixo são **contratos a criar**, não caminhos existentes. Todas exigem sessão/autorização real em Worker, verificação de tenant e Origin/CSRF em mutação, Zod strict e RateLimit. Usar `If-Match`/`expectedRevision` e `Idempotency-Key` com persistência para confirmação/publicação, não “best effort”.

**Cliente:**
- `GET /api/client/galleries/:id/workflow` → regra, seleção atual/confirmada, progresso, versão publicada, flags de acesso e notificações sem chaves R2.
- `PUT /api/client/galleries/:id/selection` com `{proofImageIds,expectedRevision}` → rascunho validado; `POST .../selection/confirm` → recibo imutável.
- `GET /api/client/galleries/:id/delivery` → apenas último snapshot publicado (parcial/completo), blocos sanitizados e links autenticados sob endpoint existente/novo.
- `GET /api/client/galleries/:id/requests`; `POST .../requests`; `POST .../requests/:requestId/messages`; `POST .../requests/:requestId/items/:itemId/decision` para aceitar/rejeitar/revogar edição; `POST .../renewal` na biblioteca expirada.
- `GET /api/client/galleries/:id/review/:itemId` → metadados de comparação atual versus candidato, apenas titular/solicitação válida; fotos via rotas de mídia com autorização dedicada.
- `GET /api/client/galleries/:id/download-batch-manifest` → somente IDs/versionIDs finais autorizados na revisão vigente, never raw storage keys/public URLs. A montagem ZIP não acontece até passar o gate de custo e viabilidade.

**Admin:**
- `GET/PATCH /admin/api/albuns-privados/:id/workflow` (regra/validade), `POST .../selection/reopen`, `POST .../proofs/derive` (intent e verificação; nunca bytes não marcados ao cliente), `POST .../final-versions` (ligação id→prova confirmada), `GET/PATCH .../composition` (CAS), `POST .../delivery/publish` (snapshot/idempotência), `GET .../delivery/history`, `GET .../requests`, `PATCH .../requests/:requestId/items/:itemId`, `POST .../renewal/:requestId/decision`, `GET .../notification-outbox`.
- Estender `worker/client/router.ts` e `worker/media/private-gallery.ts` por rotas privadas explícitas e deny-by-default; jamais via public optimizer `/_vinext/image`. Mídia sob novo preset/categoria exige verificação de versão publicada ou candidato pré-aprovação, expiração e propriedade a cada GET/HEAD; nenhum CDN cache público.

**Erros:** 400 invalid schema, 401 sessão inválida, 403 ação proibida (ou 404 opaco para IDOR/media), 409 versão desatualizada/idempotência conflitante, 410 recurso de acesso expirado **somente em API de metadados para titular**, 422 regra de seleção violada, 429 rate limit, 503 serviço de transformação/notification indisponível. Nunca revelar existência de álbum alheio. Atualizar `app/albuns/components/responses.ts` e `api.ts` para validar envelope e tolerar falha de rede sem “sucesso” otimista falso.

## 9. Custos, CPU, download completo, notificações

**Regra inegociável: R$ 0 de gasto incremental não autorizado, sem migração para plano pago.** A documentação atual informa Workers Free com 100.000 requests/dia e 10ms CPU/request (https://developers.cloudflare.com/workers/platform/limits/), R2 Standard com franquia de 10 GB-mês, 1M classe A e 10M classe B/mês (https://developers.cloudflare.com/r2/pricing/) e Images Free com 5.000 transformações únicas/mês (https://developers.cloudflare.com/images/pricing/). **Franquias não garantem custo zero no uso real;** conferir contrato, telemetria e orçamento da conta. O Cloudflare Email Sending nativo tem elegibilidade/limites próprios e pode requerer Workers Paid (https://developers.cloudflare.com/changelog/post/2026-04-16-email-sending-public-beta/). Não presumir que o Email Routing permite envio transacional irrestrito.

- Spike obrigatório: comparar **download em lote por streaming/ZIP no navegador com memória limitada**, pacote pré-montado sem custo no lado admin e streaming Worker **apenas se medido**, incluindo Android real. Um clique inicia obtenção de todas as finais disponíveis, sem duplicação permanente de arquivos onde evitável; se tamanho/limite impedir, mostrar erro claro, não oferecer zip falso. Solução escolhida no gate com medições e aprovação técnica; nada de acumular N arquivos de 25MiB no Worker.
- Stripe, Cloudflare Workers Paid, Durable Objects pagos, queues pagas, email pago e Image transformations pagas não podem ser habilitados. Se SMTP existente/Hostinger/serviço gratuito já autorizado não for validado com envio real a destinatários de teste, o gate de notificações externas é `BLOCKED_EXTERNAL` e produto integral fica `NO_GO`. O aviso in-app e a outbox podem ser testados isoladamente.
- Presets de prova devem ser gerados uma vez por versão, hash/dimensões verificados; sem fallback de preview não marcada. Custos estimados com limites conservadores; se sem margem comprovada, `BLOCKED_COST`.
- Orçamento por publicação e por álbum: contagem de objetos e bytes D1/R2, transações, transformações únicas, requests Worker, tempo CPU p50/p95/p99, tamanho lote de download, erros 429/503. Não executar medições em produção sem autorização.

## 10. Segurança, LGPD, acessibilidade e continuidade

- R4 Access/OTP real e fronteiras cliente/admin continuam autoridade; não retroceder para senha antiga da SPEC 22/10. Bloquear cache, noindex, CSP e optimizer público; negar tenant alheio em todas as APIs e GET/HEAD de mídia. Revisão antiga nunca acessível ao cliente por URL adulterada. Segurança independe de esconder botões.
- Provas e prévias privadas não devem vazar originais ou candidatos em HTML público, og tags, logs, source maps ou links públicos. Impor autorização read-after-revoke, expiration e controle de roles; testes de IDOR, stale CAS, replay idempotente, CSRF, XSS de mensagens/blocos, rate limit, evento duplicado, eventos fora de ordem.
- LGPD: definir finalidade, base legal, retenção de versões/fotos/mensagens/emails e prazo de backups sob decisão humana; acesso expirado não implica exclusão; preparar exportação/eliminação autorizada. Formal G20 da R4 permanece pendente e não se finge aprovação legal.
- UI testada com dados reais sintéticos/populados, não apenas álbuns vazios, em 320, 360, 375, 390, 430, 768, 1024 e 1440 px; zoom 200%; teclado, foco visível e devolvido, Escape, leitor de tela, imagens alt, movimento reduzido, contraste WCAG 2.2 AA relevante, conexão lenta, tela touch e ausência de overflow. Emulação Playwright não substitui Android/iOS físicos.
- Preservar home, lente, carrossel 3D, autorretrato, Colagem Autoral, SEO, Studio e dados legítimos; nenhuma modificação de código público por conveniência. Não executar seed/restauração histórica R4. Auditoria de migrations e rollback do **novo** módulo por flag própria antes de qualquer habilitação.
- Git/worktree isolados, PR draft, CI por SHA exato, TDD RED/GREEN, commits por gate, revisão independente, relatórios e checkpoint recuperável. PersistFlow/Drive/Engram não são presumidos ativos; salvar/verificar individualmente. Não alterar dados reais, main, Access produção, billing, flags produção, deploy nem merge.

## 11. Gates de aceitação propostos para o Chat on Steroids (independentes de G01–G24 da R4)

| Gate | Evidência requerida | Condição de PASS |
|---|---|---|
| **PP00 Baseline/ownership** | HEAD/base/worktree limpos; delta PR/main; inventário do que existe; status R4 | sem conflitos ou execução sobre trabalho alheio |
| **PP01 Contratos/dados** | migration aditiva simulada em D1 local; rollback não destrutivo; Zod/estados e testes | nenhuma regressão de dados existentes; FK/CAS comprovados |
| **PP02 Provas seguras** | hash/bytes derivados watermarked; caso erro sem exposição; R2/mock e integração local | nenhum original de prova ao cliente e CPU/custo medidos |
| **PP03 Seleção/confirmar** | unit/integration A/B, exata/máxima/livre; replay, confirmação, reabertura auditada | favoritos diferentes de seleção, histórico e autorização íntegros |
| **PP04 Finais/revisões** | teste upload/link imutável, snapshot e entrega parcial, concorrência | cliente só vê última publicada e somente finais confirmadas |
| **PP05 Editor/UI** | catálogo allowlist, crops/reuse, draft/preview; Playwright mobile/desktop com conteúdo | responsive, acessível, nenhuma mutação da home |
| **PP06 Pedidos/reedições** | decisões item-a-item, mensagens, comparação, revogação pré-publicação | sem publicação por aprovação implícita e sem vazamento |
| **PP07 Prazo/notificações** | GET/HEAD pós-expiração, renovação, outbox + envio real em QA gratuito | bytes negados e email real/limites comprovados; sem email → BLOCKED |
| **PP08 Download em lote** | estratégia escolhida, downloads byte/hash, Android real e CPU/memória | uma ação baixa lote disponível sem gastos; sem prova → BLOCKED |
| **PP09 Segurança/LGPD/recuperação** | revisão independente + matriz IDOR/CSRF/XSS + política humana + restore isolado | revisão formal e base legal/prazos aprovados para liberação |
| **PP10 DoD integrado** | CI final SHA, browser, QA física, R4 G05/G17/G15/G19/G20/G22/G23, rollback completo, autorização humana | GO apenas se todos os gates relevantes da evolução **e** R4 passarem |

Resultados: `PASS` somente com evidência reproduzível; `FAIL` quando ensaio falha; `BLOCKED_EXTERNAL` para dependências humanas/provedores; `BLOCKED_COST` para limite gratuito não comprovado; `NOT_RUN` se não executado. Não promover gates por mocks, CI antigo, script com exit 0 sem asserts, nem presença de documentação.

## 12. Revisão interna de construção e decisões pendentes humanas

**Builder-check documental (autorrevisão; não substitui revisor independente):** interfaces estão separadas por proprietário, versões imutáveis evitam update in-place, e gates de email/CPU/download são explicitamente bloqueantes; fluxo parcial e seleção confirmada não se contradizem. As escolhas menores D28 e padrão de contagem são **defaults do agente**, identificados. Pontos a confirmar **antes da liberação real**, não bloqueiam escrita dos documentos ou desenvolvimento isolado: provedor de e-mail efetivamente gratuito/autorizado; política de retenção e consentimento LGPD; capacidade de Cloudflare Free e upload/transformação; reais aparelhos/assistive QA; aprovação humana para publicação; solução de download em lote comprovada. Nenhum desses pontos tem autorização implícita.

**Estado deste arquivo:** design documental pronto para revisão de Maria/proprietário e engenharia; não declarar `SPEC_APPROVED` antes de aprovação explícita humana. A etapa de implementação só começa após aprovação desta SPEC e de seu plano, com checagem de gate PP00.
