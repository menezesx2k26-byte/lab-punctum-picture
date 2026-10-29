# Punctum Picture R5 — novas contraprovas de ciclo de vida e modelo FK/CAS (28/10/2026)

**Classificação:** trabalho de pré-implementação autorizado, **não destrutivo**, em Linux auxiliar isolado. Fonte real: migration legada `migrations/0009_private_client_galleries.sql`; nenhum clone completo do Punctum, D1 Cloudflare, R2, produto, recursos reais ou clientes usados. **Estado não promovido:** PP00/09/10 `BLOCKED_EXTERNAL`, PP01–08 `NOT_RUN`, `NO_GO`; R4 G05/G17 `FAIL` e G15/G19/G20/G22/G23 `BLOCKED_EXTERNAL` independentes.

## 1. Reconciliação antes da escrita

GitHub branch `agent/punctum-r5-preparation-20261028`, base exigida `6467bf7bfc1d06454dc97217250ef4e14daa81ec`: `compare` inicial `identical` (ahead=0, behind=0). `main=aac2d448d9f54e9215c278892ab3a4a7f26237a4`; PR #24 draft `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`; PR #25 draft `f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f`, sem novos HEADs. Árvore remota 1.237 entradas, `truncated=false`, nenhum `AGENTS.md` **versionado** e nenhum módulo R5 de produto identificado; isso **não comprova** ausência de AGENTS ou alterações locais. CI da branch: zero workflow runs. Nenhuma sessão Windows antiga foi acessada.

A recuperação nova de execução foi o **container Linux auxiliar já disponível**, sem conexão GitHub via DNS, com Python 3.13.5 e `sqlite3.sqlite_version=3.46.1`; o conteúdo estritamente necessário da `0009` foi recebido pelo conector GitHub e reconstituído em `/tmp/punctum-r5-evidence/0009.sql`. Antes de cada ensaio, `git hash-object` do SQL retornou **`5281fc9b99ed85bf6e7751ad7eb11f8b5482df23`**, e `sha256sum` retornou **`0636a83626db74d30a0fbefa15086c6a251401ca4dc6283e426f7d30265a65e8`**, idênticos à origem GitHub. Nenhum pacote externo/SDK foi instalado.

## 2. 10/10 ensaios novos da DDL legada

**Reprodução local observada, com exit code 0:**

```sh
python /tmp/punctum-r5-evidence/verify_0009_lifecycle.py /tmp/punctum-r5-evidence/0009.sql > /tmp/punctum-r5-evidence/lifecycle-log.json
# output: overall=EXPECTED_LEGACY_SCHEMA_PROPERTIES_REPRODUCED, matched=10, total=10, exit 0
```

Versão reproduzível **idêntica exceto pelo path padrão de migration** (ajustado para checkout), depois efetivamente reexecutada usando `--` argumento posicional de arquivo SQL: `verify-0009-lifecycle.py` Git blob `395447f49332e79bdcfc7bd65540e3e289fff1a3`, commit `a2572135344a7390a2471e5515f3ffe0fd607616`, **exit code 0; 10/10**, com leitura remota e hash de blob batendo com a cópia executada.

| Teste | Resultado observado em SQLite memória |
|---|---|
| R01 excluir `client_accounts(A)` referenciado por galeria | `FOREIGN KEY constraint failed` |
| R02 excluir `client_galleries(GA)` ainda com imagens | FK rejeita |
| R03 excluir `IA` que possui favorito legítimo A→GA | FK rejeita |
| R04 excluir `CA` usado **apenas** como `cover_image_id` em GA | **Permitido**, deixando `cover_image_id=CA` e **0 imagens** CA |
| R05 marcar `deleted_at` na imagem usada como capa de galeria `published` | **Permitido**; status continua `published`, capa aponta a imagem soft-deleted |
| R06 atualizar capa GA para imagem IB de GB por SQL direto | **Permitido** (recapitula lacuna anterior, mas em ensaio lifecycle independente) |
| R07 mover imagem IA de GA para GB, enquanto IA é **só capa** | **Permitido**, deixando referência de capa inconsistente |
| R08 mover IA de GA para GB enquanto IA tem favorito A | FK rejeita |
| R09 transação explícita atualiza capa e falha em FK do favorito; `ROLLBACK` | Capa volta a `NULL`, sem mudança parcial |
| R10 transação explícita inclui capa cruzada e favorito B→galeria A válidos às FKs existentes; `COMMIT` | **Permitido**; `PRAGMA foreign_key_check=[]` |

Todos os dez resultados coincidiram com o comportamento esperado para as constraints **existentes** e nenhum `foreign_key_check` encontrou violação. Não são dez testes PASS de segurança: R04/R05/R07/R10 são **contraprovas**. Arquivos e pontos: `migrations/0009_private_client_galleries.sql:14–26` (capa sem FK), `:28–47` (imagens com FK só para galeria e `deleted_at`), `:60–68` (favoritos com FK composta imagem↔galeria mas não titular↔galeria). `worker/api/client-admin.ts:262–275,314–324` verifica em Worker a capa na atribuição e na publicação; **não** extrapolar UPDATE SQL direto a bypass HTTP R4 ou a falha funcional no fluxo atual. A R4 não oferece automaticamente uma API de hard delete de imagem no escopo lido.

**Implicação material adicional para R5:** o histórico publicado precisa impedir exclusão/mutação de imagem final referenciada, inclusive quando não há favoritos; não basta depender de `getReadyGalleryImage` ou da validação de publicação feita uma única vez. Definir política de *tombstone*, R2 imutável, retenção de histórico e rollback por ponteiro antes de editar schema de produto.

## 3. Contrato experimental FK composto, fora das migrations

Arquivo `relational-fk-reference-model.sql` é um **modelo de referência propositalmente incompleto, prefixo `r5_ref_`**, no diretório de documentação — **não é `migrations/0010_...` e nunca deve ser aplicado na produção**. Git blob `dd985e33c74f75a483014385b45b918e5652c6cb`; SHA256 `87634c1efeeb390947cee2a209d519d2c63d39366cd9739ecb660785c351aea8`. O modelo adiciona `UNIQUE(client_galleries.id, client_galleries.client_id)` para permitir FK composta titular↔galeria, FK composta galeria↔seleção↔prova↔final↔revision/ponteiro; `ON DELETE RESTRICT` para preservar referências históricas; update CAS por `WHERE revision=expectedRevision` em teste de runtime.

Execução isolada real:

```sh
python /tmp/punctum-r5-evidence/verify_fk_reference.py /tmp/punctum-r5-evidence/0009.sql /tmp/punctum-r5-evidence/relational-reference.sql > /tmp/punctum-r5-evidence/ref-log.json
# versão compacta igual à publicada:
python /tmp/punctum-r5-evidence/verify_fk_reference.py /tmp/punctum-r5-evidence/0009.sql /tmp/punctum-r5-evidence/relational-reference.sql > /tmp/punctum-r5-evidence/compact-log.json
# output final: matched=19, total=19, exit 0, sqliteVersion=3.46.1
```

Script compacto `verify-fk-reference-model.py` SHA Git `d4e60b179f35e96cbdf0fed7f4dc3ee40ea06ea7`, SHA256 `bf403b17ea73801c6698f4ce757862b6c70a891d368875da99cf1074392565bc`, commit `7320e25204c54a084d28af2e38be4d1ee53a102b`. Leitura de volta: **Git blob do GitHub = blob da cópia local executada**. Nenhuma linha de produto alterada.

**Resultados: 19/19 propriedades esperadas** — 2 vínculos válidos A→A/B→B; 12 testes de rejeição por FK incluindo cliente↔galeria, prova não selecionada, revisão alheia, ponteiro para entrega B, deleção de final/prova/revisão publicados; 1 `STALE` de CAS; 1 rollback de transação ao tentar publicação cruzada; 1 CAS bem-sucedido; 2 **contraexemplos propositalmente ACEITOS**: criar final ligado a seleção `open` (não confirmada) e alterar `private_object_key` de uma versão já publicada. Uma primeira execução do modelo teve **15/16**, exit 1 porque `N05` esbarrou primeiro em PK duplicada; foi corrigida para criar outra prova válida na mesma galeria e agora N05 verifica **a FK desejada**. A versão compacta do verificador teve inicialmente exit 1 devido a `Path.parents[2]` no diretório temporário, corrigido sem tocar no produto, e reexecutado **19/19 exit 0**. Não ocultar as falhas de *harness*; não representam falha R5.

**Conclusão decisiva:** FKs compostas protegem **integridade de referências**, mas não comprovam confirmação de seleção, aprovação/revogação da candidata, nem **imutabilidade dos atributos** de objeto final. Critérios adicionais para `0010` futura: estado `confirmed` checado transacionalmente, eventos/recibos e epoch imutáveis, bloqueio de `UPDATE/DELETE` em final publicado (trigger/allowlist de mutações ou política transacional testada por escrita SQL direta), R2 sem overwrite, hash/decode de bytes e ponteiro da revisão alterado somente com CAS/idempotency. Alterações de metadados de final publicado devem falhar **sem depender da UI**. Revisores distintos precisam decidir forma final, sem assumir este modelo como blueprint completo.

## 4. Reproduzir no checkout owned (futuro)

```sh
# Após inspecionar AGENTS/worktrees/status e confirmar source blobs:
python docs/operations/private-albums-r5-guided/verify-0009-lifecycle.py
python docs/operations/private-albums-r5-guided/verify-fk-reference-model.py
# Esses scripts são read-only, usam Python stdlib e SQLite :memory:, sem Worker/Cloudflare.
# Mesmo se retornarem exit 0, PP01 permanece NOT_RUN até a 0010 real e D1 local aprovado.
```

A migration `0009` é pinada por Git blob SHA, e a SQL do modelo por SHA256 no script. Se divergir, os comandos recusam iniciar: atualizar apenas após reconciliação de código e evidência nova; não editar `0009` para fazer testes passarem. `AGENTS.md`, locks, processos e worktrees Windows permanecem **desconhecidos**. `npm ci`, Vitest, Playwright, build, D1 real, R2, watermark de pixels, CPU e notificações seguem **NOT_RUN**; sem assinatura de revisores externos, sem medição financeira R5.

## 5. Aceite futuro e rollback

Somente após aprovação humana formal da SPEC blob `db25502f25eed89131bac16e3a3172248f716ec1` **e** plano blob `41e06e5fdd353eaff9a5f43357fbcbce741b2770`, e PP00 validado em worktree owned, executar Tasks 00–12 seguindo `RED → GREEN → REFACTOR → REVIEW → COMMIT → CHECKPOINT`. Acrescentar aos RED PP01: integridade cruzada por escrita SQL direta, retenção de capa e fotografia final em snapshot, soft/hard delete e referências, transição de seleção aberta, manipulação de `private_object_key` pós-publicação, CAS/replay com contagem de revisão, ausência de artefatos R2 após rollback. Exercitar `0009+0010` somente em D1 **local** de duas contas/galerias sintéticas; verificar integridade antes/depois, dados legados preservados e rollback sem purge. A publicação exige revisão independente de segurança, frontend/a11y e custos antes de PP09/PP10, com a R4 ainda independente. Não abrir PR de implementação, merge, deploy, alteração de billing ou ativação de clientes sem autorização.
