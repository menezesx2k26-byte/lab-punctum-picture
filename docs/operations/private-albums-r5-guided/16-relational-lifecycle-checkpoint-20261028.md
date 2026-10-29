# R5 — checkpoint durável: retenção legada, modelo composto e limites de política

**Data:** 28/10/2026, horário de São Paulo. **Repo/branch:** `menezesx2k26-byte/lab-punctum-picture`, `agent/punctum-r5-preparation-20261028`. **Checkpoint base:** `6467bf7bfc1d06454dc97217250ef4e14daa81ec`. O GitHub confirmou `compare identical, ahead=0, behind=0` antes da escrita; nenhum `AGENTS.md` no Git tree remoto `truncated=false` de **1.237** entradas; isso não autoriza presumir ausência de AGENTS locais. `main=aac2d448d9f54e9215c278892ab3a4a7f26237a4`, PR #24 `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd` (draft), PR #25 `f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f` (draft). Zero CI runs na branch documental ao iniciar.

## Incremento técnico real, sem editar produto

1. **Legado 0009:** no Linux auxiliar independente (Python **3.13.5**, SQLite **3.46.1**), a fonte reconstituída via GitHub foi **pinada** por Git blob `5281fc9b99ed85bf6e7751ad7eb11f8b5482df23` e SHA256 `0636a83626db74d30a0fbefa15086c6a251401ca4dc6283e426f7d30265a65e8`. `PRAGMA foreign_keys=ON`, banco SQLite `:memory:`. Foram executados **10/10** novos cenários de exclusão/reparent, capa órfã, soft delete publicado, rollback de transação e contraexemplo de commit inconsistente permitido pela FK. Saída final `EXPECTED_LEGACY_SCHEMA_PROPERTIES_REPRODUCED`; **exit code 0**. `verify-0009-lifecycle.py` versão remota Git blob `395447f49332e79bdcfc7bd65540e3e289fff1a3`, commit `a2572135344a7390a2471e5515f3ffe0fd607616`, teve sua cópia local correspondente **executada novamente** com argumento de caminho de SQL e retornou **10/10, exit 0**.
2. **Referência relacional não produtiva:** `relational-fk-reference-model.sql` Git blob `dd985e33c74f75a483014385b45b918e5652c6cb`, SHA256 `87634c1efeeb390947cee2a209d519d2c63d39366cd9739ecb660785c351aea8`, commit `ccf65e44614310d6f1c002b732ca24d52959798f`. É **somente SQL de documentação**, tabelas `r5_ref_*`, não migration `0010`. `verify-fk-reference-model.py`, blob `d4e60b179f35e96cbdf0fed7f4dc3ee40ea06ea7`, SHA256 `bf403b17ea73801c6698f4ce757862b6c70a891d368875da99cf1074392565bc`, commit `7320e25204c54a084d28af2e38be4d1ee53a102b`, foi conferido **byte por byte pela Git blob hash** contra a cópia Linux que executou **19/19, exit 0**: A/A e B/B, cruzamentos proibidos por FK composta, retenção, CAS stale e bem-sucedido, rollback. Dois *contraexemplos esperados* tiveram **ACCEPTED**: final associado à seleção `open`, mutação de `private_object_key` após publicação. Portanto **FK não implementa política de estado nem imutabilidade de valor**.
3. Primeira execução do modelo 15/16, **exit 1**, diagnosticou colisão de PK no teste N05 antes de exercitar a FK; corrigiu-se usando segunda prova válida. Verificador compacto teve um primeiro erro no path padrão em `/tmp`, também corrigido e reexecutado **19/19, exit 0**. Falhas do *harness*, não do produto. Roteiro e resultados por caso em `15-legacy-lifecycle-and-composite-fk-reference-evidence.md`, blob `52ab8eee18340a6546b087253379afd218013016`, commit `24343c4b388104082472a934442152aa69801178`.
4. Matriz `01-executable-matrix.md` complementada com RED específicos para exclusão de imagem publicada, `deleted_at` de capa, remapeamento entre álbuns, seleção `open`, mutação da versão final publicada, candidato pendente e ponteiro de outra galeria. Blob `539fe1fdb0a54529815c2332c4195571190d0c40`, commit `e9eff427673371f4a5ebe3b758a31d0b96ec5c0f`. Leitura de volta confirmou arquivos acima.

## Fronteira entre ensaio SQLite e D1

Os casos foram executados no Linux auxiliar a partir de **DDL exata de `0009` e de um modelo de FKs em documentos**, e não no Worker/R2/Cloudflare D1. Portanto **PP01 permanece NOT_RUN**, não há `testedSha` de produto, não se pode afirmar segurança ou rollout. Os novos gates dependem de `migrations/0010_guided_selection_delivery.sql` **futura**, somente após aprovação e em worktree owned. A arquitetura real deve aplicar regras de confirmação, aceitação de candidato, hash/object key imutável, transações D1 com CAS/idempotência, atomicidade de ponteiro, snapshots e R2 antes da publicação; FKs são necessárias, não suficientes.

Consultas oficiais de D1 nesta rodada:
- https://developers.cloudflare.com/d1/sql-api/foreign-keys/ — D1 habilita verificação de FKs por padrão, suporta `PRAGMA defer_foreign_keys`; `ON DELETE RESTRICT` rejeita imediatamente; `CASCADE` pode excluir históricos indevidamente.
- https://developers.cloudflare.com/d1/worker-api/d1-database/ — `DB.batch()` executa instruções em ordem e reverte a sequência inteira em caso de falha. **Não** copiar diretamente `BEGIN/COMMIT` do SQLite auxiliar para Worker D1; validar o uso de `batch` e de CAS no statement.
- https://developers.cloudflare.com/d1/reference/migrations/ — `migrations/0010` será arquivo do produto somente **depois** do gate humano, nunca este SQL de referência.

## Limitação operacional e revisores

Não foram repetidas as 18/18 verificações estáticas/13 blobs Git, controle negativo 1/1, as 17 verificações da fixture, 26 cenários RED documentados, nem os 6/6 ensaios prévios, pois não havia novo motivo para fazê-lo. Os novos ensaios 10/10 e 19/19 são materialmente diferentes.

Sem nova sessão Windows de ownership garantido e **sem manipular janelas antigas**. A possibilidade nova aproveitada foi executar **scripts Python/SQLite em container Linux isolado**, com só os arquivos pinados via conector; **não** é checkout Git Punctum nem worktree R5. As antigas falhas de DNS foram documentadas em rodadas anteriores; nenhuma tentativa idêntica de `git ls-remote`/launch Windows foi repetida nesta. `AGENTS.md`, locks, alterações locais, processos, owners, worktrees e branches no computador Windows permanecem UNKNOWN. Vitest, Playwright, build, `npm ci`, D1 real, média CPU/Images, streaming de lote, notificações e QA física seguem NOT_RUN; nenhuma observação de billing e nenhum custo real R5 medido. Não há capacidade autenticada de revisor independente de segurança, a11y ou finanças; pareceres internos são estáticos e não signoffs.

## Retomada e status comprovado

```text
PP00 BLOCKED_EXTERNAL  (SPEC + plano humanos e terminal owned/baseline)
PP01 NOT_RUN           PP02 NOT_RUN           PP03 NOT_RUN
PP04 NOT_RUN           PP05 NOT_RUN           PP06 NOT_RUN
PP07 NOT_RUN           PP08 NOT_RUN
PP09 BLOCKED_EXTERNAL  (review independente/LGPD/rollback)
PP10 BLOCKED_EXTERNAL  (QA integrada, físico, custos, R4 e release)
R4 G05,G17 FAIL; G15,G19,G20,G22,G23 BLOCKED_EXTERNAL
testedSha=null; worktree.created=false; approval.implementationAllowed=false
readiness=NO_GO
```

Somente após assinatura verificável/aceite da SPEC blob `db25502f25eed89131bac16e3a3172248f716ec1` e do plano blob `41e06e5fdd353eaff9a5f43357fbcbce741b2770`, reconciliar local `AGENTS.md`/worktrees/HEAD/locks/diff e criar worktree **nova** e owned. Então executar o novo harness de docs, verificadores existentes, `npm ci`/typecheck/lint/Vitest/Playwright/build no SHA, iniciar `0010` via RED em D1 local com duas contas, e progredir Tasks 00–12 por `RED → GREEN → REFACTOR → REVIEW → COMMIT → CHECKPOINT`, com revisores independentes, custo real, rollback e PR draft futuro. Nenhum produto, migração remota, merge, deploy, billing ou cliente ativado nesta rodada. Nunca inferir `GO_PRODUCTION`.
