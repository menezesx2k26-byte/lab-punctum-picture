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
