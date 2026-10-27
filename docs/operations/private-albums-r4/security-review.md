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
