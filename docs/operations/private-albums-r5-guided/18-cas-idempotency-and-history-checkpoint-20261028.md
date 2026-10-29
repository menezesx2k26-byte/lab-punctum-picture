# Punctum Picture R5 — checkpoint durável de CAS, histórico, idempotência e outbox

**Escopo, 28/10/2026:** incremento exclusivamente de documentação técnica isolada. HEAD de partida `f3c17efcdd9636bd5d2502e711d375980c1a6927`, branch `agent/punctum-r5-preparation-20261028`, sem mudança remota posterior no momento inicial. `main=aac2d448d9f54e9215c278892ab3a4a7f26237a4`; PR draft #24 `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`, PR draft #25 `f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f`. Branch sem CI novo, árvore Git 1242 entradas, sem `AGENTS.md` **versionado**; instruções/owners/processos/worktrees Windows continuam desconhecidos. Nenhuma janela Windows alheia tocada.

## O que foi realmente executado

**Ambiente isolado Linux Python 3.13.5 / SQLite 3.46.1**, Node 22.16.0, git 2.47.3, sem checkout Punctum completo, sem Cloudflare D1 ou R2. Foi construída em `/mnt/data/punctum-r5-sandbox` uma disposição sintética mínima de arquivos, via blobs exatos do GitHub, pinados antes da execução:
- `migrations/0009_private_client_galleries.sql`: Git blob `5281fc9b99ed85bf6e7751ad7eb11f8b5482df23`; SHA256 `0636a83626db74d30a0fbefa15086c6a251401ca4dc6283e426f7d30265a65e8`.
- `docs/operations/private-albums-r5-guided/relational-fk-reference-model.sql`: Git blob `dd985e33c74f75a483014385b45b918e5652c6cb`; SHA256 `87634c1efeeb390947cee2a209d519d2c63d39366cd9739ecb660785c351aea8` (documento já existente, não reeditado).
- Novo `reference-publish-guards.sql`, Git blob `51e5cc0fa8e35bf836fe5623fdb8f73f45187d42`, SHA256 `9699dfa86bcfb694af33f631447fb6070b7343b1ee4aa7dc654a8a949874bd63`, commit `8fd052f8a83b495f0f5701c9b4a26c6311a9c791`.
- Novo `verify-publish-transaction-contract.py`, Git blob `1f5f604f22339e0ef4fb3e2f4bfa861c749fd4cf`, SHA256 `d7d5049df38f48c7c0c04d4c35b21e942703baebd737e0aae61755ce0ad767c8`, commit de extensão final `56ca29b4ca188d5419c2fa4d215e34a757ca5439`. A leitura remota confirmou **blob exato igual ao script executado**.
- Relatório de casos `17-transactional-cas-history-red-20261028.md`, Git blob `00b46527781887239da5f3c0d14127c89e8b1cd3`, commit `9d9a8d5c04989b26f61e0093c615a340f656c07b`.
- Matriz `01-executable-matrix.md` atualizado com PP01/03/04/07/08 e critérios de Maria/cliente, Git blob `b5e2cc20fb88ee0a691fa90a4f9975aed7be744e`, commit `c17453b291c8b8909169093c3d5d970799f10d60`.

**Comando local executado, exit 0:**
```sh
python /mnt/data/punctum-r5-sandbox/verify-publish-transaction-contract.py /mnt/data/punctum-r5-sandbox > /mnt/data/punctum-r5-sandbox/transaction-result.json
# JSON: matched=62, total=62, failed=[], raceRounds=30
# SHA256 do log final: e716b05535f86075468a9d0195504768594fe33c51dc01555135a50197e8e2bd
```
Também foi executado com **exit 0, 62/62** sem argumento no layout sintético de checkout `mock-checkout/docs/.../verify-publish-transaction-contract.py`, localizando `mock-checkout/migrations/0009_private_client_galleries.sql`. O JSON produzido foi **byte-identical**, SHA256 igual ao acima. Como a source migration e referências são pinadas, drift de conteúdo resulta em erro explícito.

O primeiro protótipo gerou 37/38, exit 1, por colisão de PK de fixture que mascarou a FK esperada. Corrigido com segunda revisão independente, depois o verificador chegou a 52/52, 57/57 e finalmente 62/62 exit 0. **Esses erros intermediários foram do harness, não de produto**.

## Descobertas materiais e RED acionáveis

1. **Snapshot histórico imutável:** o modelo antigo protegia somente o ponteiro atual. Após publicar uma nova revisão, SQL direto ainda pode apagar itens ou editar metadados da revisão anterior. **RED futuro**: catálogo/histórico *append-only* impede UPDATE/DELETE em **toda** revisão já publicada, mesmo depois de mudar current pointer, e mantém versões de mídia/R2 até retenção legal e LGPD.
2. **Seleção confirmada realmente imutável:** FKs não bloqueiam adição de itens a seleção confirmada ou inserção de novo item em delivery publicado. Triggers experimentais do documento bloquearam as operações na revisão atual, mas o contrato final exige epoch/histórico, actor auditável e confirmação atômica, inclusive reabertura somente Maria.
3. **CAS obsoleto não significa erro de SQL:** duas conexões reais disputaram 30 vezes `UPDATE ... WHERE revision=0`: 30 vezes exatamente uma mudou 1 linha e a outra 0. Sequência SQLite com CAS stale (0 rows) + inserts de receipt e outbox **COMMITIU estes inserts mesmo sem atualizar o ponteiro**. **RED obrigatório** em D1: CAS zero linhas precisa bloquear transação inteira com erro verificável, sem recibo, outbox, alteração parcial ou email; não confiar apenas no rollback de `D1.batch()` por instrução que falha. Proteção experimental `CHECK(ok=1)` + `changes()` funcionou no SQLite e **não está aprovada para D1**.
4. **Idempotência e autoria:** `UNIQUE(gallery_id,idempotency_key)` evita duas linhas, mas **não** distingue mesmo payload de payload diferente sob a mesma key; incluir fingerprint canonizado e resposta de conflito 409, recusa de ator não autorizado, auditoria individual verificável. Cookie admin por senha compartilhada não atesta Maria como pessoa, e `auditPrincipal` usa principal genérico corretamente.
5. **Outbox/email:** somente `status=sent` no banco não prova envio externo; persistir recibo do provedor autorizado, `pending/failed` com retry/backoff, dedupe por evento/recipient/channel e UX de entrega publicada mesmo com email pendente. Sem provider homologado e sem medição de custo.
6. **R2 não participa de transação D1:** mock de chaves em memória mostra objeto órfão possível se PUT precede DB e commit falha; reconciliador precisa de TTL de segurança, rechecagem de referências **históricas**, idempotência e LGPD antes de garbage collection. Não se mediram R2/Images nem foram processados pixels. Media GET/HEAD/Range, expiração, proteção de originais/candidatos, watermark rasterizada e batch mobile continuam RED de integração futuros.
7. **UX/a11y/finanças:** 25/30 entregues, 4/5 edições aprovadas, 320–1440px e zoom200%, teclados/screenreader, recuperação de 409 e de email falho, CPU Workers Free e memória 128MB, R2 operações e transformações Images continuam sem execução. O modelo SQLite **não** valida o Worker, frontend, dnd-kit, acesso HTTP, clientes ou custos.

## Limites e desbloqueios

- O conector GitHub permitiu reconciliação, leitura de fontes e escrita de documentação. Não possibilita checkout completo executável no Linux nesta sessão; o Linux não tem clone Punctum nem todos os node_modules, e as tentativas anteriores de `git ls-remote` falharam em DNS. **Não repetimos** falhas idênticas nem manipulamos Windows de ownership desconhecido. `npm ci`, `npm test`, Vitest, Playwright, build, CI no HEAD R5, testes D1/Worker/R2, Android, Security/A11y/Cost reviews independentes = `NOT_RUN`.
- As verificações anteriores 18/18, controle negativo, 17 fixture, 26 RED, 6/6 e 10/10 legacy e 19/19 referência **não foram repetidas**, pois continuam suficientes em seus escopos. Novos testes são complementares, não promoção de PP01.
- Aprovação humana da SPEC blob `db25502f25eed89131bac16e3a3172248f716ec1` e do plano blob `41e06e5fdd353eaff9a5f43357fbcbce741b2770` **não comprovada**. Precisa de identidade/data/aceite/URL e baseline/worktree owned, inventário de `AGENTS.md`, locks, branches, processos, status e trabalho paralelo antes de editar produto.
- Futura execução integral Tasks 00–12: testes RED primeiro em migration `0010` **local D1** sob duas contas e falhas injetadas, depois GREEN → REFACTOR → REVIEW independente → COMMIT → CHECKPOINT, gates específicos, revisão da SPEC D28 com autoridade humana, CI/lint/typecheck/Vitest/Playwright/build, rollback, R2/quota/Images/CPU/segurança/LGPD e PR draft somente autorizado. Sem merge/deploy/migration produtiva/billing/clientes antes de aprovação e gates.

```text
PP00=BLOCKED_EXTERNAL   PP01=NOT_RUN   PP02=NOT_RUN   PP03=NOT_RUN
PP04=NOT_RUN           PP05=NOT_RUN   PP06=NOT_RUN   PP07=NOT_RUN
PP08=NOT_RUN           PP09=BLOCKED_EXTERNAL PP10=BLOCKED_EXTERNAL
R4: G05/G17=FAIL; G15/G19/G20/G22/G23=BLOCKED_EXTERNAL
readiness=NO_GO; testedSha=null; implementationAllowed=false
```

**Decisão: NO_GO**. Este checkpoint não autoriza produção. Reconciliar HEAD remoto final e ler `execution-state.json` após sua atualização antes de qualquer nova escrita.
