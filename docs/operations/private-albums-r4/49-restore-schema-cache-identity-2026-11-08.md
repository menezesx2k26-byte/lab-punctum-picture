# PUNCTUM R4 — ciclo L | preflight D1 de recovery + fronteira de identidade no cache

**Data:** 08/11/2026 (America/New_York). **Decisão:** `NO_GO_PRODUCTION`. Branch `fix/punctum-albums-r4-completion-20261107`; PR #32 draft/open/unmerged. Infra e custo incremental autorizado: **R$ 0,00**. Nenhum merge, deploy, alteração Cloudflare remota, D1/R2 reais, fotos reais ou mudança de flags.

## 1. Retomada e fontes

- Reconciliação antes do patch: HEAD remoto **K `fc76443475cecebc82fe96654a8c21af62c3f3d4`**, tree **`040494df456140e2a7858dd4a7b653bdcf384dde`**, CI exact-SHA **#42542584271 completed/success**, job 31/31; checkout local sibling **`85fc69cf088de43073f5e056e55f4b679aac63d0`** com tree idêntica e worktree limpa.
- PR #32 confirmada open/draft/unmerged. Relatórios 46–48 e ledger preservados. Checkpoints K PR [#6729690310](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32#issuecomment-6729690310) e Drive `PUNCTUM_R4_HANDOFF_RASTER_ROLLBACK_2026-11-08` tinham readback confirmado.
- GOAL 36, handoff 35 e reconciliação 16 permanecem fontes secundárias. A SPEC original `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` §23 não foi localizada no checkout, na busca da Biblioteca e nas contas Drive consultadas; **não substituir nem inferir seu texto ausente**.

## 2. G23/G18 — falhas D1 previsíveis antes de gravação R2

**RED real:** arquivo de recuperação sintético com IDs, chaves canônicas e bytes corretos, mas `client_galleries.theme="unsafe-theme"`, alcançou `R2.put` antes de o `CHECK(theme IN (...))` no D1 detectar a violação. Como o commit D1 é posterior à etapa R2, isso produziria objetos órfãos após falha previsível. Também foram preparados cenários de e-mail não normalizado (CHECK), coluna SQL inexistente e coluna obrigatória omitida. Nenhuma fixture histórica G18 foi alterada.

**GREEN:** `scripts/lib/private-recovery.ts` verifica o esquema **real do banco D1 de destino** via `PRAGMA table_info` somente leitura e compara o conjunto de colunas, obrigatoriedade/NULL e defaults. Antes do primeiro R2 PUT, também aplica a semântica das restrições CHECK conhecidas nas migrations R4: e-mail normalizado, PBKDF2 iterations, booleanos, tema/status, MIME/tamanho 25 MiB do esquema (não significa autorização do Images Binding), digest hexadecimal, estado de imagem/intent. Colunas não reconhecidas, valores inválidos e campos obrigatórios ausentes falham sem R2. As validações de vínculos A/B, PK e UNIQUE dos ciclos I–K permanecem.

**Falha posterior recuperável:** teste com dois PNGs sintéticos introduz interrupção do `db.batch` após a etapa de armazenamento. A primeira tentativa mantém objetos intactos, não insere cliente e não chama `R2.delete`. A repetição, após o D1 voltar, verifica novamente bytes/metadata nos objetos já existentes e conclui os inserts com **conta em quarentena**. O teste não supõe que R2 + D1 formem transação distribuída.

**Limitações remanescentes:** controles acima cobrem restrições R4 conhecidas e divergência de schema observável antes da escrita, não todas as mudanças de schema futuras; D1 pode mudar depois do preflight. Sem lock/coordenação de manutenção ou destino QA segregado, resta risco de escrita concorrente entre `R2.put` e `db.batch` e de restauração externa entre recheck e `R2.delete` no cleanup. Não autodeclarar G23 completo.

## 3. G17 — cabeçalhos de identidade não podem entrar no cache compartilhado

**RED real:** `publicHomeCacheResponse()` transformava um HTML 200 contendo `Authentication-Info` em `public, max-age=0, must-revalidate`, com tag de CDN; `isPublicHomeCacheRequest()` aceitava requisição com `X-Client-Id`. Uma configuração upstream com valores variáveis nesses headers poderia fazer o entrypoint da home guardar metadados de sessão/identidade.

**GREEN:** novos cabeçalhos de requisição com identidade (`X-Client-Id`, `X-Session-Token`, `X-Authenticated-User`, `X-Forwarded-Access-Token`) tornam o pedido inelegível ao cache. Respostas com `Authentication-Info`, `Proxy-Authentication-Info`, `Set-Cookie2`, `CF-Access-Jwt-Assertion`, `X-Client-Identity`, `X-Session-Token` e cabeçalhos de identidade previamente cobertos recebem `private, no-store`, sem `Cache-Tag`/diretiva de cache CDN, e os headers sensíveis são suprimidos pelo entrypoint. Não altera rotas Studio/Colagem nem ativa snapshot/cache em produção.

**G17 permanece FAIL:** ainda não existem amostras efetivas de **CPU remota cold/MISS/pós-invalidação no SHA atual**, nem prova de quotas/custo integral. A documentação Cloudflare publicada em 2026 mantém Workers Free **10 ms CPU por HTTP request, 128 MB por isolate**: https://developers.cloudflare.com/workers/platform/limits/ . Cache HIT, build local e latência HTTP não medem CPU Free cold/MISS.

## 4. G05 — reconciliação do limite de bytes e risco residual

- SPEC original: **25 MiB = 26.214.400 bytes** por foto. Guarda operacional atual: **20.000.000 bytes** para não ultrapassar `env.IMAGES.input()`; não elevar sem pipeline completo e evidências. A Cloudflare continua publicando o limite do binding como 20 MB: https://developers.cloudflare.com/images/get-started/limits/ .
- Revisadas as transições upload/intenção/GET/HEAD/download/complete/cleanup/recovery: o produto preserva chave exata por galeria+imagem, vínculo MIME/size, SHA-256 para originais novos, auth/IDOR, bloqueio de derivados acima do limite e recheck D1 antes da exclusão. Isso **não** cria commit atômico D1/R2 nem garante ausência de concorrência externa pós-recheck.
- `R2Bucket.delete()` não recebe condição ETag na API Workers, ao contrário de `put()`/`get()`: https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ . Qualquer solução de delete seguro diante de restore externo requer coordenação explícita ou design recuperável comprovado. Nenhum delete remoto foi executado. G05 **FAIL**.

## 5. Validações do ciclo L

- TDD: **G23 RED** preflight `CHECK` D1 após `R2.put` reproduzido; **G17 RED** dois testes de headers identificadores e de resposta falharam exatamente antes do patch.
- GREEN focado: **34/34 Vitest** (recovery, maintenance, snapshot, cache), `node --test scripts/r4-scoped-local.test.mjs` **1/1**, TypeScript e diff-check PASS.
- Regressão local completa no ciclo L encerrada com `==L_COMPLETE_PASS==` e exit code 0: **Workers Vitest 262/262 em 57 arquivos**, **Colagem 7/7**, **G18 Node 1/1**, **Node R4 selecionados 14/14**, **SSR 1/1**, **TypeScript PASS**, **ESLint PASS**, **Vinext build 5/5 PASS**, **npm audit zero vulnerabilidades**, **Chromium E2E completo PASS**, JSON e diff-check PASS. Chromium verificou A/B sintéticos, negações privadas/optimizer, Studio e Colagem, uploads/capa/publicação admin, oito larguras responsivas, restart, rollback local, logout e revogação.
- CI remota L e SHA remoto L: **PENDENTES no momento do commit**; testes locais não são atribuídos a uma CI futura. Resultado remoto deve ser comprovado após publicação em checkpoint externo, sem reescrever este histórico.

## 6. Matriz canônica G01–G24

Colunas: `GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO`. `PASS` é histórico e delimitado pelo SHA/ambiente indicado em 16/44–48, não aprovação para release. `K` = remoto com CI verde anterior; `L` = alteração local ainda sem CI própria.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | K/L | SHA/tree/PR/worktree | GitHub/local | relatório 49 | SPEC ausente; infra inventário antigo | Recuperar SPEC/inventário read-only |
| G02 | PASS | Eng./Reviewer | K | integração/CI | Actions/local | #42542584271 | L sem CI remota | CI exact-SHA L |
| G03 | PASS | Admin | K | D1/cadastro E2E | Chromium local | relatórios 44–48 | QA remoto L não homologado | Revalidar QA |
| G04 | PASS | Admin | K | galeria/capa/publicar | Chromium local | relatório 48 | sem deploy | Preservar Studio |
| G05 | FAIL | Produto/Images QA | K/L | upload/byte/hash/cleanup | Miniflare | relatórios 44–49 | 25MiB contra limite 20MB; corrida D1/R2 | Desenho/QA zero custo comprovados |
| G06 | PASS | Segurança | G/K | JWT/JWKS negativos | QA histórico/local | reconciliação 16 | G19 | Parecer independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | teste físico | G15 |
| G08 | PASS | Segurança | K/L | revogação/quarentena | local | relatórios 46–49 | sem reabertura remota | QA segregado |
| G09 | PASS | Segurança | K/L | A/B/PK/IDs | Miniflare | 44–49 | G19 | Revisão independente |
| G10 | PASS | Segurança | K/L | GET/HEAD/zero bytes | Miniflare | 44–49 | remote não homologado | Revalidar flag OFF |
| G11 | PASS | Produto | K | favoritos | Chromium local | CI K | dispositivo físico | G15 |
| G12 | PASS | Produto | K | download/hash | Chromium local | CI K | QA/real | QA seguro |
| G13 | PASS | UI cliente | K | foco/lightbox | Chromium | CI K | TalkBack/VoiceOver | G15 |
| G14 | PASS | UI admin | K | upload/viewport | Chromium | CI K | QA integrado | Revisão |
| G15 | BLOCKED_EXTERNAL | Testadores físicos | — | TalkBack/VoiceOver | Android/iOS físicos | GOAL 36 | NOT_RUN | Testes assistivos |
| G16 | PASS | UI/Studio | K | Colagem/SEO | CI/Chromium | #42542584271 | L sem CI | Testar L |
| G17 | FAIL | Cloudflare/Infra | K/L | header cache/snapshot/CPU | Miniflare/QA histórico | RED→GREEN L; doc Cloudflare | CPU cold/MISS remota e quotas não comprovadas | Medir SHA atual em QA autorizado |
| G18 | PASS | Operador backup | K/L local | G18 26 linhas/10 PNG, SHA | Miniflare | Node G18 local L | QA remoto atual não aprovado | Quarentena e QA |
| G19 | BLOCKED_EXTERNAL | Revisor independente | — | auditoria | externo | GOAL 36 | sem parecer | Auditor formal |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD | humano | GOAL 36 | sem aceite | Decisão formal |
| G21 | PASS | CI/Reviewer | K | verify 31/31 | GitHub Actions | #42542584271 | L sem CI | Confirmar L |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização release | humano | GOAL 36 | sem autorização | Aprovar release após gates |
| G23 | BLOCKED_EXTERNAL | Operador QA | K/L local | recovery préflight/retry | Miniflare/Cloudflare GET histórico | RED→GREEN L, D1 401/Billing 403 | sem QA remoto autorizado/coordenação D1-R2 | Homologar rollback segregado |
| G24 | PASS | Documentação | K | PR/Drive readback | GitHub/Drive | checkpoint K | L pendente | Checkpoint L pós-CI |

**Decisão final deste incremento:** `NO_GO_PRODUCTION`. `PRIVATE_GALLERIES_ENABLED=false` apenas na configuração versionada; runtime produção não revalidado. Não declarar `TECHNICAL_READY_AWAITING_EXTERNAL` ou aceite humano. Continuidade depende de prova integrada G05/25MiB, CPU Free real G17, rollback G23 e signoffs G15/G19/G20/G22.
