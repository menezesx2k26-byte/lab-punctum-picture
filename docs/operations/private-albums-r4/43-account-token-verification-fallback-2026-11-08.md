# PUNCTUM R4 — ciclo F: verificação somente leitura de token de conta para G23

**Data:** 08/11/2026. **DoD original:** G01–G24, §23 da SPEC e reconciliação 16. **Decisão:** `NO_GO_PRODUCTION`. Custo incremental autorizado R$ 0,00, produção/QA histórico intocados.

## Causa observada em Cloudflare QA real

O ciclo E foi publicado na PR #32 como commit remoto `41028b3e650dd5f91ef23b66a9e352f19a23b2cc` (árvore `a4819b5182859445ca423757bf506f78c214537c`, parent remoto D `9a28a035dc1f9218e4290cae5aca6d3493be40c4`). Sua [CI #42532806865](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42532806865) terminou `completed/success` no SHA exato (31 steps do `verify` sem failure), com artefato `r4-browser-evidence` ID 13637344515 e digest `sha256:8d5eb35b3a85203f863a704cb33a81ccc5e237af7508dc57160274561f585dfc` (conteúdo do ZIP não inspecionado individualmente).

A execução automática **somente leitura** [#42532802964](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42532802964) registrou `completed/success` do coletor, artefato `r4-rollback-readonly-evidence` ID 13638386213 (digest `sha256:7a9d34e1dc5e9f1ecd0478f56a09b8b81c176341c377f947bb66afd33c156887`). Logs auditados:

- `GET /user/tokens/verify` → HTTP **401**, `status=unverified`, nunca `active`.
- Worker scripts/settings/deployments e R2 buckets → HTTP 200; D1 → HTTP **401**; subscriptions → HTTP **403**.
- `BLOCKED_READ_ONLY_SCOPES_UNVERIFIED`, `rollbackExecuted=false`, `writes=0`, `productionSafeToRelease=false`.

Um 401 na verificação de token do usuário **não prova** que um token potencialmente de escopo de conta seja globalmente inválido, especialmente quando GETs de Worker funcionam. A API Cloudflare documenta dois caminhos distintos: [user token verification](https://developers.cloudflare.com/api/typescript/resources/user/subresources/tokens/methods/verify/) e [account token verification](https://developers.cloudflare.com/api/resources/accounts/subresources/tokens/methods/verify/). O acesso a subscriptions pode exigir [Billing Read](https://developers.cloudflare.com/billing/understand/billing-permissions/) e D1 Read depende do escopo/recurso.

## Novo TDD RED→GREEN

**RED:** diante de user token 401, uma resposta de `GET /accounts/{account_id}/tokens/verify` com `success=true, status=active` ainda era ignorada; o relatório mantinha `unverified`. Teste Node novo reproduziu `{http:401,status:unverified}` onde se esperava `{http:200,status:active}`.

**GREEN:** no preflight, **somente** quando a verificação `/user/tokens/verify` é inconclusiva, consultar em segundo passo `GET /accounts/{account_id}/tokens/verify` na conta QA fixa. A função pura aceita os dois resultados e somente persiste `{http,status,verifiedActive}`, com enum de estados fechado. IDs de token, bearer, prazo de validade e erros brutos da API nunca entram no checkpoint. Se ambas as consultas forem negadas, credencial permanece **unverified**, sem inferir revogação nem conceder permissão. Nenhum POST/PUT/PATCH/DELETE, nenhuma D1 query ou operação R2.

**GREEN local:** `node --test scripts/r4-rollback-readonly.test.mjs` **7/7 PASS**, incluindo fallback de conta e negações; diff sem whitespace inválido. A CI do SHA exato da publicação F e a nova leitura remota do preflight deverão ser relatadas em checkpoint externo, não inventadas antecipadamente.

## Gates e limites

- **G05 FAIL:** originais privados até 25 MiB na SPEC permanecem sem pipeline compatível com Images Binding `.input()` 20 MB, CPU Free, custo e QA integrado demonstrados. Guards atuais de 20 MB são operacionais, sem emenda à SPEC.
- **G17 FAIL:** CPU efetiva cold/MISS do SHA final não medida em Workers Free; GraphQL anterior retornou HTTP200 com zero amostras. O trabalho de snapshot foi ampliado no relatório 42; nenhuma ativação indiscriminada.
- **G23 BLOCKED_EXTERNAL:** mesmo caso account-token retornando `active`, os acessos D1/Billing e identidade de QA só serão confirmados pelos respectivos GETs e autorização do titular; não implica rollback nem mudança de flag. Ensaios remotos reversíveis continuam NÃO EXECUTADOS.
- **G15/G19/G20/G22 BLOCKED_EXTERNAL:** aparelhos físicos TalkBack/VoiceOver, auditoria independente, aprovação formal LGPD de Maria e autorização específica do proprietário não obtidas.
- **Demais 17 PASS históricos:** preservados por SHA/ambiente conforme matriz **G01–G24** do relatório 42 e ledger; não são reaprovações automáticas.

**Política operacional:** PR #32 segue aberta/draft/unmerged; `PRIVATE_GALLERIES_ENABLED=false` em configuração versionada, `NO_GO_PRODUCTION`, sem deploy, merge, alteração de credenciais, permissões, billing, D1, fotos de clientes, fixtures históricas ou custos adicionais. O workflow read-only não substitui G23.
