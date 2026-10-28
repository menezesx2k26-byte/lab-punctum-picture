# Revisão independente — R4

Revisão estática independente solicitada nesta execução. Não equivale a pentest nem a homologação do Access real. As alterações foram verificadas em testes sintéticos locais; o estado e configuração remotos não foram observados.

| ID | Severidade | Evidência e causa | Correção e testes | Estado |
|---|---|---|---|---|
| R4-SEC-01 | alta, condicional a configuração incorreta | A audience de clientes podia coincidir com a administrativa; `requireAdmin` confiava na audience admin, permitindo confusão de aplicações. | Guard verifica igualdade no caminho Access administrativo independentemente de flag/modo e na configuração de clientes. Teste RED falhou pela ausência do guard; GREEN valida flag ligada/desligada com JWT sintético assinado. | Corrigido localmente; configuração real não verificada |
| R4-REL-02 | alta para confiabilidade | R2 podia gravar objeto antes de D1 atualizar intent; retry retornava 409 e ficava sem recuperação. | Retry compara bytes e metadados antes de aceitar objeto existente; intent expirado não avança. RED reproduziu objeto existente/intent pendente; GREEN incluiu bytes divergentes, resposta repetida e PUTs concorrentes. | Corrigido localmente; falha D1 não injetada e teste real edge pendente |
| R4-REL-03 | alta para confiabilidade | Duas confirmações concorrentes: falha tardia de decodificação podia rebaixar imagem `ready` e intent `completed`. | RED coordenou uma falha após a outra requisição concluir e observou `failed`; GREEN exige `ready`/`completed`. Atualizações de falha usam predicados condicionais em batch. A revisão independente confirmou o cenário específico; não executou a suíte. | Corrigido e testado localmente; QA edge pendente |

Demais áreas exigem revisão complementar e evidências A/B, restore e OTP reais; não declarar ausência global de P0/P1 por esta revisão. Segredos, JWT completos e fotos reais não foram registrados.

## Revisão direcionada da continuação — recuperação

Foram encontrados e corrigidos: colisão de versão de sessão pós-backup (quarentena e rotação independente); snapshot com capa/tamanho/MIME incoerentes (recusa antes das escritas); UPSERT/cópia irrestrita no piloto (escopo exato e transporte D1/R2 nativo condicional); ausência do guard antes de alterações QA; confusão entre envelopes REST e bindings; domínio customizado de R2 não verificado; ID histórico aceito pelo Worker; resposta D1 incompleta interpretada como vazia. O revisor leu as correções e confirmou o fechamento desses achados específicos; não executou testes nem operações remotas. A biblioteca não deve ser apresentada como política LGPD de exportação ao titular, e não devolve fotos/hashes de credenciais na resposta da etapa QA.

A revisão completa de toda a aplicação e homologação remota continuam distintas. Não remover gates NO-GO por causa desta revisão parcial.

## Atualização incremental Argon R4 (2026-10-27)

- **Novas garantias técnicas implementadas e verificadas por testes**:
  1. **Zero bytes em negações de mídia privada e `HEAD` (`worker/client/router.ts`)**: todas as respostas negadas (`401`/`403`/`404`/`405`) para `/api/client/galleries/:galleryId/images/:imageId/:variant`, `/admin/api/albuns-privados/:galleryId/images/:imageId/:variant` e `/_vinext/image` entregam exatamente `0` bytes (`byteLength === 0`), sem `ETag`, `Content-Disposition` ou `Last-Modified`, e com `Cache-Control: private, no-store` e `X-Robots-Tag: noindex, nofollow, noarchive`.
  2. **Normalização contra path traversal duplamente codificado em `/_vinext/image` (`worker/client/router.ts`)**: cada iteração de `decodeURIComponent` é normalizada via `new URL(decoded, url).pathname` e bloqueia tanto `isPrivateGalleryPath` quanto prefixos de objetos R2 (`/client-galleries/`, `/private-galleries/`).
  3. **Fronteira B1 em Cloudflare Access (`worker/utils/auth.ts`)**: `requireAdmin` exige que o `email` autenticado via `cf-access-jwt-assertion` pertença a `ADMIN_ALLOWED_EMAILS` (normalizado em minúsculas), bloqueando clientes ou terceiros com `403 ADMIN_UNAUTHORIZED`.
  4. **Exportação LGPD sanitizada do titular (`worker/client/lgpd.ts`, `worker/api/client-admin.ts`)**: `GET /admin/api/clientes/:clientId/lgpd-export` exclui `password_hash`, `password_salt`, `password_iterations`, `session_version`, `storage_key`, segredos e registros de outros clientes.
  5. **Higiene de dependências (`package.json`, `package-lock.json`)**: overrides `"satori": "0.33.5"` e `"fflate": "0.7.5"` eliminam os avisos moderados transitivos (`npm audit --json` com `0` vulnerabilidades).
- **Limite residual**: revisão independente externa (`G19: PARTIAL`) e homologação remota de Cloudflare Access / R2 / edge (`G07`/`G17`/`G18`: `BLOCKED_EXTERNAL`) permanecem abertas.

## Complemento de execução — PR #20, 27/10/2026

### P0 confirmado e corrigido (R4-SEC-ADMIN-ALLOWLIST)
- **RED — `ac7ef4e`**: valid JWT RS256 com issuer e audience administrativos e `ADMIN_ALLOWED_EMAILS` vazia produziu `{roles:["admin"]}` em `requireAdmin`. Falha reproduzida no Codespace por `npx vitest run tests/integration/client-security-matrix.spec.ts --reporter=dot`: 1 FAILED/3 PASS.
- **GREEN — `bdd00f9`**: exigência `allowed.includes(email)` sem exceção para lista vazia. Mesma suíte focada: 4 PASS/0 FAIL, incluindo allowlist vazia e separadores, com par de chaves e JWT sintéticos. A autenticação por senha já tinha verificação fail-closed.
- **Limite**: não testado com políticas reais Cloudflare Access ou JWT de identidade real; G07 continua BLOCKED_EXTERNAL.

### Exportação LGPD
A API seleciona colunas específicas em D1 (sem hashes, salts, session_version, storage_key) e filtra galerias/imagens/favoritos por titular. A construção do JSON por projeção explícita não espalha segredos mesmo se as rows carregarem campos adicionais. `requireAdmin` protege a rota e a resposta é `private, no-store`. Os testes unitários e de integração cobrem negação anônima e cross-tenant, mas **não** substituem avaliação jurídica, acesso real, política de retenção e sign-off da responsável pelo estúdio. Textos de fotos ou nomes podem conter dados de terceiros incidentais.

### Dependências: diferenciar branch da main
- `npm ci` sobre o lockfile da PR #20: **546 pacotes auditados, 0 vulnerabilidades** na instalação (27/10/2026). A árvore tem overrides para `undici@7.30.1`, `sharp@0.35.5` e `esbuild@0.25.12` (além de `fflate`, `satori`). Rodar novamente `npm audit` no SHA de entrega.
- A consulta somente leitura à API de Dependabot (`state=open`) retornou **10 alertas ainda abertos** na visão do repositório: #41 undici HIGH; #37 sharp HIGH; #16, #15, #12, #11, #10, #8 undici (diversas severidades); #4 sharp HIGH; #1 esbuild MEDIUM. Isso **não** equivale a 10 vulnerabilidades presentes no lockfile desta PR: Dependabot acompanha a branch default até o merge. Não fechar/dispensar alertas sem correlacionar a árvore de dependências da main e as versões efetivas.
- Pacotes de `@cloudflare/vitest-pool-workers` são obsoletos segundo aviso npm; migração futura para o plugin novo exige teste separado e não deve ser feita como refactor oportunista deste release.

### Capacidade Workers Free — bloqueio concreto
A documentação Cloudflare Workers atual (12/10/2026) informa limite de CPU **10 ms por requisição** e 100.000 requisições/dia no Free: https://developers.cloudflare.com/workers/platform/limits/. O teste de fallback PBKDF2 usa 310.000 iterações e pode demorar muito acima de 10 ms em ambiente local; **não afirmar viabilidade edge**. Documentação D1: limite de 5 milhões de linhas lidas/dia, 100 mil escritas/dia e 5 GB no Free (https://developers.cloudflare.com/d1/platform/pricing/). R2 Standard inclui 10 GB-mês, 1M Class A e 10M Class B por mês (https://developers.cloudflare.com/r2/pricing/); requer conferir billing e uso agregado da conta e não apenas a tabela publicada. Nenhum teste pago nem mudança de billing foram executados.

### Independência
Esta continuação **não constitui revisão independente**; é implementação e verificação pelo mesmo assistente. A revisão estática histórica cobriu casos específicos, não pentest/Access/edge nem auditoria completa. G19 permanece PARTIAL e exige revisor distinto e evidência de sua avaliação antes de GO. G17 e G18 permanecem BLOCKED_EXTERNAL.

## Continuação de hardening — 28/10/2026, execução no Codespace e pareceres auxiliares

### Correção R4-SEC-CLIENT-LOGOUT — sessão capturada depois do logout
- **RED:** commit `8340b8a`; `tests/integration/client-access.spec.ts` confirmou que `DELETE /api/client/session` apenas removia cookie do navegador, mas o mesmo cookie guardado seguia autenticando no D1 (`1 FAIL / 7 PASS`).
- **GREEN:** commit `ed2b94c`; `worker/api/client-session.ts` faz compare-and-update em `session_version` quando o cookie é válido e preserva logout idempotente para cookies ausentes/expirados. Focado Access `8 PASS`. **Comportamento explícito:** logout invalida todas as sessões daquela conta, inclusive em outros aparelhos. Não revoga, por si só, a sessão do provedor Cloudflare Access; `logoutUrl` continua disponível e a prova real G07 não foi feita.

### Correção R4-SEC-ADMIN-ROTATION — cookies anteriores à troca da senha
- **RED:** commit `4d687bd`; `tests/integration/admin-session-rotation.spec.ts` confirmou que uma sessão HMAC administrativa permanecia autenticada após alteração da credencial armazenada (`1 FAIL`).
- **GREEN:** commit `8c8d324`; assinatura e verificação HMAC agora derivam de `ADMIN_SESSION_SECRET` e da revisão da credencial ativa (hash na D1 ou fallback de hash de ambiente), **sem enviar hash/salt ao cliente**. O token emitido sob credencial anterior não verifica após rotação. Teste focado `1 PASS` e teste legado de login/troca administrativa `1 PASS` (16 outros testes não selecionados naquele comando; a suíte completa foi executada separadamente). Rotacionar credencial automaticamente invalida cookies administrativos antigos.
- Nenhum segredo real, senha pessoal ou JWT real foi usado na regressão; fixtures sintéticas.

### Revisão read-only por dois revisores auxiliares (sem pentest, sem sign-off G19)
- **Confidencialidade:** não foi demonstrado vazamento cross-tenant pelos caminhos inspecionados (`lgpd.ts`, admin API, client repository, media R2). Isso não equivale a prova global de ausência de falhas.
- **P2 audit attribution:** com senha administrativa global, quem conhece a senha pode atribuir a sessão a outro e-mail permitido. A trilha `actor_email` não identifica inequivocamente o operador no modo senha compartilhada. Issue [#21](https://github.com/menezesx2k26-byte/lab-punctum-picture/issues/21). Exige escolha de identidade verificável ou auditoria sem falsa atribuição. Não alterar política Access sem autorização.
- **P2 LGPD completeness:** export atual exclui metadados de foto pendente, falhada e soft-deleted ainda retidos no D1. Issue [#22](https://github.com/menezesx2k26-byte/lab-punctum-picture/issues/22). Escopo e retenção requerem decisão da responsável; evitar afirmar cumprimento integral da LGPD.
- **P3 LGPD consistency:** export faz várias consultas D1 sem snapshot transacional, podendo conter dados de instantes diferentes sob concorrência. Mesma issue #22.
- Revisores somente leram código do SHA `9854115`; as correções desta continuação foram realizadas e testadas por este agente, portanto **G19 continua PARTIAL**.

### Prova técnica local e CI
- Após ambas correções, Codespace: typecheck/lint/build PASS; Vitest **47 arquivos / 194 PASS**, Colagem 7 PASS, Node 22 PASS, `npm audit --audit-level=low` zero vulnerabilidades, `git diff --check` PASS.
- CI GitHub Actions [40657070283](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40657070283) concluiu **success** no commit de código `8c8d324612b7786b77155d2a6ded06daf07eb30e`. Qualquer commit posterior exige validação do novo HEAD.
- Permanecem externos: OTP real, physical mobile QA, CPU e billing Free, restore isolado D1/R2, revisor independente formal, decisão LGPD e autorização explícita de release. **PRODUCTION_NO_GO**.

## Última rodada de hardening — 28/10/2026 (PR #20, sem release)

### R4-LGPD-RETAINED-METADATA
- **RED `840b702`**: teste unitário reproduziu ausência de metadados de fotos `pending`, `failed`, ou `deleted_at IS NOT NULL` ainda persistidas no D1.
- **GREEN `f318e5b`**: `worker/client/lgpd.ts` inclui `retainedImageMetadata` com campos explicitamente permitidos, status e data de exclusão lógica, preservando `galleries[].images` como fotos prontas não removidas. Nenhum objeto R2, armazenamento interno, senha, token, hash/salt ou dados de outro titular entra no JSON.
- O filtro de favoritos exige que o par `(galleryId,imageId)` exista nas imagens do titular (inclusive estados ainda retidos), e não apenas na coleção pronta para exibição.
- Teste de integração `eddccc0` valida a API HTTP de exportação com D1 local real e fixtures sintéticas A/B, incluindo estados retidos e `Cache-Control: private, no-store`.

### R4-LGPD-CONSISTENT-SNAPSHOT
- **RED `c271128`**: teste reproduziu dependência de quatro leituras independentes de conta, galerias, fotos e favoritos.
- **GREEN `3347c93`**: usa `D1Database.batch([...])` para ler as quatro tabelas em uma transação D1. Conforme documentação oficial, chamadas batch são transacionais e executadas sequencialmente; testes locais de contrato e D1 real passaram. Não se alega medição sob concorrência no edge.
- A exportação não entrega binários das fotos nem prova direito a cópia integral de cada obra; a responsável pelo estúdio deve definir operações, alcance, retenção, dados incidentais de terceiros e canal de entrega.

### R4-AUDIT-SHARED-SECRET
- **RED `c21dfc4`**: teste reproduziu a impossibilidade de atribuição individual confiável quando um segredo administrativo global pode iniciar sessões com qualquer e-mail permitido.
- **GREEN `3242adc` e commits subsequentes**: `requireAdmin` identifica sessões de senha compartilhada com `authSource: shared-password`; `auditPrincipal` retorna `shared-password@punctum.invalid` para auditorias, sem imputar identidade individual não comprovada. Caminho de JWT Access assinado preserva o e-mail efetivamente verificado e o formato anterior.
- `worker/api/admin.ts`, `admin-auth.ts`, `client-admin.ts`, `client-gallery-upload.ts` e `worker/site-media.ts` agora atribuem também `updatedBy` a `auditPrincipal`. Teste sintético de integração `44d0615` verifica coluna `audit_log.actor_email` de evento real em D1 local.
- **Risco residual**: no modo senha compartilhada ainda não existe atribuição individual; não declarar prova pessoal de autoria. Migrar para identidade individual confiável (ex.: JWT Access com política real autorizada) precisa decisão operacional e G07/G19. Issue #21 continua aberta para essa decisão.

Estas correções encerram os bugs específicos **em código/testes**, mas **G19 não está aprovado por revisor independente** e **G20 não está aprovado pela controladora**. G07/G14/G17/G18/G22/G23 continuam bloqueados. Nada foi alterado em Cloudflare real, D1/R2 remoto, Access, billing, main ou produção.

## Homologação final incremental — 28/10/2026, relatório 23

Os parágrafos anteriores são históricos. Nesta missão houve somente alterações no Worker QA dedicado, com recibos de recursos exatos; nenhuma escrita em produção ou QA histórico. CoS worker-2 fez revisão auxiliar distinta do implementador no SHA `da23806`; isso não é assinatura formal autorizada de G19. Gemini não produziu revisão material e não foi contado.

| Achado confirmado | Reprodução | Correção e teste | Risco residual |
|---|---|---|---|
| R4-SEC-ADMIN-CLAIMS, P2 | JWT RS256 de emissor/audience corretos sem exp/iat/sub/type aceito; RED `3331ccc` (2 FAIL) | GREEN `f9f8b96`: claims obrigatórias, app/subject/lifetime; 19 testes focados PASS | Exige token do emissor autorizado com forma inesperada; sem forgery comprovada; OTP/JWKS real não homologado |
| R4-AUDIT-ORDER, P2 | Reorder retorna 200 e muda posições sem audit_log; RED `a1fba42` | GREEN `22664cf`: `client_gallery.images_reordered`, `auditPrincipal(actor)` | Sessão por senha global continua não individual |
| R4-AUDIT-PENDING-UPLOAD, P2 | Intent pending sem evento; RED `a1fba42` | GREEN `22664cf`: `client_gallery.upload_intent_created`, somente imageId opaco | Falhas/retenção de logs exigem decisão operacional |

23 testes de galerias/mídia/auditoria passaram após os dois últimos GREEN. Não foram removidas asserções nem reduzido custo criptográfico.

| Limite de confiança | Controle observado | Prova atual | Limite ainda aberto |
|---|---|---|---|
| Access → Worker | RS256/JWKS, issuer/aud separados, exp/iat/sub/email/type; allowlist admin | Testes criptográficos locais com chaves novas; regressão acima | OTP, JWKS remoto, política e logout/revogação do provedor reais |
| Cookie → D1 | HMAC independente, versão/disabled na requisição, propriedade/publicação atuais | D1/workerd local, Chromium A/B e logout | Ciclo real Access e identidade individual de cada admin |
| Worker → R2 | Chaves privadas, somente imagem ready/galeria autorizada, zero bytes nas negações e no-store | Suítes locais e download browser byte a byte | Restore/privacidade de objetos remotos no ensaio específico |
| Administração → alterações | Origin, requireAdmin, auditoria com principal verificável ou compartilhado explícito | Regressões de ordem/intent, browser criação/publicação | Sign-off independente e aprovação da identidade operacional |
| Exportação/retensão → titular | Projeção allowlist e snapshot D1.batch, sem hashes/storage keys/tokens | Testes locais LGPD | Finalidade, base legal, terceiros, retenção, eliminação e canal de entrega aprovados pela controladora |
| Backup → restauração | Snapshot relacional, SHA-256/R2 onlyIf, INSERT-only, quarentena e segredo novo | Biblioteca testada; harness isolado revisado em worktree e sujeito a preflight | G18/G23 só avançam com relatório real, nunca pela existência do código |

Hipótese sem causalidade demonstrada: HTTP 503 da home pode envolver limites do runtime, mas não foi capturado Error 1102. CPU real do candidato em 48 eventos foi 57/111/204 ms (p50/p95/p99); G17 FAIL e NO_GO. Isso não é medição PBKDF2/Password Bridge. Nenhum achado de ausência de vazamento local substitui uma auditoria integral real. A atribuição individual e as decisões LGPD continuam pendentes de pessoas autorizadas.
