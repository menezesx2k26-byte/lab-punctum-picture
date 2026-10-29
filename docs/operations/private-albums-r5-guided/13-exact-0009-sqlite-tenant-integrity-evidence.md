# R5 — reprodução exata de duas lacunas de integridade na DDL legada 0009

**Escopo:** evidência material nova para o PP01 após o checkpoint `2b08b3458070ea730fafdc4ca7187cf13a07d42a`. Não altera `0009`, R4, schema de produção, produto, cliente ou billing. **Não é teste D1 runtime nem vulnerabilidade R4 demonstrada.** As regras de autenticação/autorização do Worker R4 continuam separadas deste ensaio de constraints.

## 1. Repositório, SHA e ambiente realmente executado

- GitHub: `menezesx2k26-byte/lab-punctum-picture`, branch `agent/punctum-r5-preparation-20261028`, primeiro HEAD remoto da rodada **`2b08b3458070ea730fafdc4ca7187cf13a07d42a`**; `compare` against same returned **ahead=0, behind=0**.
- R4 PR #24 `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`, PR #25 SPEC/plan `f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f` abertas/draft; main `aac2d448d9f54e9215c278892ab3a4a7f26237a4`; nenhuma dessas refs foi editada. Árvore remota com 1.234 entradas, `truncated=false`, sem `AGENTS.md` versionado (não significa ausência de AGENTS local/parent); sem novos módulos R5. Branch sem runs de CI.
- SQL de origem: `migrations/0009_private_client_galleries.sql`, **Git blob `5281fc9b99ed85bf6e7751ad7eb11f8b5482df23`**, `SHA256 0636a83626db74d30a0fbefa15086c6a251401ca4dc6283e426f7d30265a65e8`.
- Execução: Linux auxiliar isolado, **Python 3.13 / `sqlite3.sqlite_version=3.46.1`**, banco `:memory:`, `PRAGMA foreign_keys=ON`. DDL foi transcrita integralmente dos bytes retornados pelo conector GitHub, e `git hash-object` do arquivo local igualou **exatamente** o blob Git acima **antes da execução**, garantindo conteúdo do schema sem depender de clone/rede.
- Comando real: `python /tmp/verify_0009_favorites_isolation.py --migration /tmp/punctum_0009_private_galleries.sql`, **exit code 0**, após correção de um erro de `Path.parents[3]` do protótipo antes da reprodução bem-sucedida. Reexecutado com extensão do caso de capa, **exit code 0**, `checksMatched=6`, `checksTotal=6`, `result=REPRODUCED_EXPECTED_LEGACY_SCHEMA_GAP`. Uma primeira execução intermediária retornou exit 1 por bug no wrapper em `/tmp`; isto foi erro do **verificador auxiliar**, não do schema nem do produto; corrigido e conferido.
- Verificador final versionado: `verify-0009-favorites-isolation.py`, SHA Git **`a58a7061ffaa1695635a1ce207210a83f5b5a65c`**, SHA256 **`48d8392980e94cba0430db2ccaeae07b36397ec4bb0c11f6a2aef3e1e94d9483`**; primeiro commit `de9328652962248a4c9f44a2330e00d76fa1a762`, versão com capa `212eacf8e4e46910160b9936c1d50b492a58bbc8`. Blob remoto lido de volta **igual ao executado localmente**. Script só usa biblioteca padrão Python, migração pinada por Git blob SHA e SQLite memória; no checkout também é executável com o path default.

## 2. Matriz positiva, negativa e contraexemplos concretos

| Caso | Resultado observado | O que prova especificamente |
|---|---|---|
| Cliente sintético A favorita imagem IA da galeria GA de A | **ACEITO** | Positivo válido |
| Cliente sintético B favorita imagem IA da galeria GA de A | **ACEITO** | FK não vincula `favorites.client_id` ao `galleries.client_id`; **contraexemplo** de titularidade em DDL |
| B tenta associar imagem IB, da GB, à GA | **REJEITADO** (`FOREIGN KEY constraint failed`) | FK composta `gallery_id,image_id` existente protege vínculo imagem–galeria |
| Conta inexistente C tenta favorito de A | **REJEITADO** (`FOREIGN KEY constraint failed`) | FK simples `favorites.client_id` exige conta real |
| Capa GA recebe imagem IA da própria GA | **ACEITO** | Positivo válido |
| Capa GA recebe imagem IB da galeria GB | **ACEITO** | `client_galleries.cover_image_id` não possui FK composta para `client_gallery_images(gallery_id,id)`; **contraexemplo** de vínculo de capa |

Após os seis casos, `PRAGMA foreign_key_check=[]`. Isto é esperado: os dois registros cruzados não violam as **constraints existentes**. Resultado 6/6 significa que a verificação detectou as propriedades (inclusive as brechas) do schema legado, **não** que a política de isolamento da R5 passou.

**Locais precisos:** `migrations/0009_private_client_galleries.sql:14–26` define `cover_image_id TEXT` sem FK; `:61–68` define `client_gallery_favorites` com `client_id` FK simples e `(gallery_id,image_id)` FK composta, sem relacionamento FK cliente↔galeria. Em `worker/api/client-admin.ts:245–275`, o endpoint de definir capa verifica `getReadyGalleryImage(db,id,imageId)` antes de gravar; em `worker/api/client-galleries.ts:61–93`, o favorito PUT faz `INSERT...SELECT` de cliente/galeria/ imagem sob as mesmas condições de titularidade e status. Logo **não extrapolar a escrita sintética direta SQL para um bypass HTTP R4**. Uma inserção fora do endpoint pode produzir associação incoerente; ainda não foi testada leitura/visibilidade de dado alheio através de Worker.

## 3. Critério de aceite PP01 novo, sem mudar estados

A `migrations/0010_guided_selection_delivery.sql` futura (somente depois de aprovação formal) deve fazer com que **cada referência persistida da R5** (seleção, proof derivada, finalVersion, request item, candidate, bloco, snapshot) esteja ligada ao mesmo `galleryId` e, onde aplicável, `clientId` por FK **composta** ou por invariantes transacionais equivalentes que protejam até escritas SQL diretas. Índices `UNIQUE` e FK devem estar definidos corretamente na tabela referenciada, respeitando `ON DELETE RESTRICT` para snapshots. Não é necessário nem autorizado editar a `0009` agora.

**RED funcional futuro em worktree aprovada:** montar D1 local com duas contas/galerias/população sintética (0009+0010), tentar inserir `client B ↔ gallery A` em seleção, revisão, pedido, final e snapshot; inserir `proofId A ↔ finalVersion B`; referência de capa/compostor com `galleryId` trocado; falha de FK ou 409 opaco sem transação parcial, `PRAGMA foreign_key_check=[]`, R2 intacto e nenhum byte entregue ao usuário B. Rodar também **positivos** A→GA e B→GB, CAS concorrente, ponteiro atômico, snapshot histórico e migração/rollback local populado. Não usar a mera presença de `getOwnedGallery` para dispensar constraints na nova persistência.

**Risco D1 Free documentado que ainda faltava na análise de capacidade:** 500 MB por banco, 5 GB por conta, 50 queries/Worker invocation (com nuances para batch), até 100 parâmetros vinculados por statement e máximo de **2 MB por string/BLOB/row**. São limites oficiais, **não** medidas da conta Punctum. A futura serialização `manifest_json`/ `blocks_snapshot_json` deve testar o limite de linha, uso de placeholders, índices e rollback; não pressupor que 30 provas nem 1000 blocos caibam. Fontes oficiais:
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/sql-api/foreign-keys/
- https://developers.cloudflare.com/d1/worker-api/d1-database/

## 4. Limites do terminal e da homologação

Novo caminho investigado: terminal Linux auxiliar local de execução independente do desktop Windows compartilhado. `git 2.47.3`, `node v22.16.0`, `npm 10.9.2`. `git ls-remote https://github.com/menezesx2k26-byte/lab-punctum-picture.git refs/heads/agent/punctum-r5-preparation-20261028` **exit 128**, stderr `Could not resolve host: github.com`; `getent ahostsv4 github.com` **exit 2**. Sem checkout Punctum nesse ambiente nem acesso a `AGENTS.md`/locks/worktrees Windows, nenhuma worktree foi criada; versões CLI antigas do Windows não foram tocadas. A CLI Linux executou **apenas** o ensaio SQLite/migração pinada em `/tmp`.

`npm ci`, Vitest, Playwright, typecheck, build, `node verify-r4-static-contracts.mjs` no clone, APIs D1 reais e testes R5 **NOT_RUN**. Sem execução de browser, fotos, pixel watermark, CPU, Images Binding, memória Worker, lote ou notificações, sem custos medidos. Revisor externo de segurança/frontend/custos não identificado/acionado; esta inspeção não é parecer independente. Histórico R4 G05/G17 e G15/G19/G20/G22/G23 permanece intacto.

## 5. Retomada e rollback

Preservar `NO_GO`, `testedSha=null`, PP00/PP09/PP10 `BLOCKED_EXTERNAL`, PP01–PP08 `NOT_RUN`; **6/6 SQL não pode ser promovido a PP01 PASS**. Depois de comprovar aceite humano da SPEC blob `db25502f25eed89131bac16e3a3172248f716ec1` e plano blob `41e06e5fdd353eaff9a5f43357fbcbce741b2770`, inventariar `AGENTS.md`, status, worktrees, processos, ownership e locks; construir worktree isolada protegida; iniciar Tasks 00–12 com `RED → GREEN → REFACTOR → REVIEW → COMMIT → CHECKPOINT`. A migração R5 deve ser aditiva/testada em D1 local, com rollback ensaiado sem purge nem alteração da `0009`; PR draft e signoffs só após aprovação formal. Nenhuma produção habilitada automaticamente.
