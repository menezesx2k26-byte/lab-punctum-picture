# PUNCTUM R4 — ciclo P | transições D1/R2, recovery e cache público

**Data:** 09/11/2026 (America/New_York). **Decisão:** `NO_GO_PRODUCTION`. Trabalho técnico somente na branch draft da PR #32, sem merge, deploy, ativação, operação Cloudflare remota de escrita, fotos reais, mudança de permissões ou billing. Custo incremental autorizado R$ 0,00 (faturamento não inferido).

## Baseline e proteção da genealogia

- GitHub readback: PR #32 `open/draft/unmerged`, base `agent/hst-001-hostinger-qa-20261028` (`50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`), HEAD remoto O `a99257ec8f89de674a2b8c5921a4f52bcb56d411`, parent `f91e868709e85d591f835c29951d30d838b98bbd`, tree `63571acff46c310f6633f049df22e59a67a442dd`.
- CI exata do baseline [#42668107238](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42668107238) `completed/success`, verify 31/31, Workers 266/266.
- Checkout original Linux permaneceu limpo com HEAD irmão M `fc5293dc859c717f9a314744e9085ec3a548a107`/tree `0e67db3c1748d562e0650f3b002c7caf043f4cc4`. Criada worktree **destacada e separada** `punctum-r4-cycle-p-20261109` sobre FETCH_HEAD remoto O, sem reset/rebase/clean destrutivos.
- Fontes lidas: GOAL 36, reconciliação 16, handoff 35, relatórios 50–52 e ledger. `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt`/seção 23 não localizada na árvore Git, Biblioteca nem nas buscas das contas Drive; texto original **não inventado**.

## G05 — RED→GREEN: upload assinado, publicação e recuperação segura

1. **Rebind antes de `uploaded→ready`**: D1 simulado troca `image_id/storage_key` de A para B imediatamente antes do batch de conclusão, após leitura do R2/decodificação Images. **RED:** rota devolveu 200 e publicou A ao concluir intenção B. **GREEN:** ambos UPDATEs de ready/completed conferem dentro de um `db.batch()` a mesma tupla imutável (gallery/image/key/MIME/size, digest, expiração, status, ausência de exclusão/conclusão) e `meta.changes === 1`. Corrida retorna HTTP 409, nenhum A/B ready e bytes R2 preservados.
2. **Rebind depois de R2 PUT e antes de `pending→uploaded`**: PUT imutável sintético grava chave A e muda a intenção para B antes do UPDATE D1. **RED:** código antigo devolveu 200, marcando intenção B `uploaded` com digest de A. **GREEN:** UPDATE, releitura de retry `uploaded` e backfill de digest legado exigem ownership D1 exato e imagem `pending` não excluída. Conflito 409 **não apaga** o objeto A, permitindo tentativa futura validada sem overwrite.
3. **Rebind antes de `uploaded→failed`**: resposta Images sintética indica raster inválido enquanto restauração religa intenção para B. **RED:** fluxo antigo retornou `INVALID_IMAGE` 400 e falhava imagem A/intenção B. **GREEN:** os dois UPDATEs de falha usam id/galeria/imagem/chave/tipo/tamanho/digest/status e confirmação de transições; conflito retorna 409, preserva ambas as imagens pending e original R2. Raster realmente inválido sem corrida mantém sua negativa normal.

## G23 — RED→GREEN: preflight de ciclo de vida do backup

- Um snapshot com intenção `completed` apontando para imagem `pending` era aceito por PK/FK/CHECK e chegava a `R2.put`. **RED:** bucket instrumentado lançou `R2 PUT before completed intent lifecycle preflight`.
- `assertRowScope()` agora rejeita `completed` se imagem não está `ready` ou está excluída. Testes adversariais garantem **zero R2 GET** no capture e **zero R2 PUT** no restore. O operador permanece separado do produto; preservadas fixture G18 e chave PNG legada exata, somente em recovery.
- Falha após escrita R2 continua recuperável por imutabilidade/retry e quarentena. A correção não cria transação única D1/R2 nem garante exclusão mútua com restore externo.

## G17 — RED→GREEN: contexto de identidade no cache

- **RED:** HTML 200 com `Content-Security-Policy: script-src 'nonce-...'` podia receber cache CDN público; cabeçalhos de resposta `X-Forwarded-Authorization`, `X-Forwarded-Cookie` ou `X-Client-Session` não eram removidos.
- **GREEN:** CSP e CSP-Report-Only contendo nonce por resposta forçam `private, no-store`, sem cache CDN/tag; cabeçalhos de identidade bloqueiam cache público e são removidos. Home anônima normal, Studio/Colagem, SEO e rascunhos permanecem intactos. Isso não é medição de CPU cold/MISS.

## Validação, limitações e provas

- TDD local RED: conclusão concorrente **8/9** (1 causal); trio G05/G23/G17 **36/39** (3 causais); raster inválido **10/11** (1 causal). GREEN focado posterior **39/39**, mais raster corrigido.
- Workers Vitest integral **271/271 em 57 arquivos**, Colagem **7/7**, G18 histórico **1/1**, Node R4 **14/14**; TypeScript, ESLint, Vinext build, JSON, `git diff --check`, npm audit **0 vulnerabilities**: PASS.
- SSR/Miniflare: primeira execução falhou `ENOENT dist/server/index.js` por ter sido iniciada antes do build na nova worktree; depois de build, rerun **SSR 1/1 PASS**. Não reclassificar o primeiro comando como verde.
- E2E Chromium local: **14/14 PASS**, exit 0, sobre Workers/D1/R2 sintéticos, Studio/Colagem, A/B, navegação/teclado, oito larguras, upload admin, restart, rollback local e revogação; carga alta/sem swap observada, sem encerrar terceiros.
- Novo SHA/CI Linux, PR, artefato de navegador e Drive: **pendentes ao redigir**; CI O não valida código P. QA Cloudflare remoto em P **NOT_RUN**.

## Limites imutáveis para produção

- **G05 FAIL:** SPEC 25 MiB (26.214.400 bytes) versus guarda operacional 20.000.000 bytes; Images Binding `.input()` limita 20 MB: https://developers.cloudflare.com/images/get-started/limits/ . Não subir limite sem decodificação verdadeira do original inteiro, derivados privados, proveniência, SHA, autorização por request, RAM/CPU/quota/custo zero e restore/E2E comprovados.
- **G05/G23 residual:** `db.batch()` é transação **apenas D1**. A R2 Workers API não oferece `delete` condicional por ETag; corrida externa entre SELECT e PUT/delete continua. Uma solução completa exige coordenação compartilhada por todos os operadores, lease/fencing e/ou sweep recuperável homologados; https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ .
- **G17 FAIL:** Workers Free 10 ms CPU HTTP/req, 128 MB/isolate: https://developers.cloudflare.com/workers/platform/limits/ . Cache HIT, latência, simulação local e CI não são amostras reais de CPU cold/MISS para SHA atual. Necessária QA segregada/autorizada com first-access, purged MISS, pós-invalidação e SSR fallback.
- **G23 BLOCKED_EXTERNAL:** rollback Worker predecessor, versões, D1/R2, hashes, sessão, revogação/reabertura e consistência cruzada não homologados remotamente; D1 401/Billing 403 históricos, não ampliar permissões.
- **G15/G19/G20/G22 BLOCKED_EXTERNAL:** TalkBack/VoiceOver físicos, auditoria independente, aprovação LGPD formal e autorização específica de release continuam ausentes.
- `PRIVATE_GALLERIES_ENABLED=false` preservado na configuração versionada; runtime de produção não revalidado. Sem mutações produtivas, sem release e sem fotos reais.

## Matriz de aceite G01–G24

Colunas: **GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO**. PASS histórico não equivale à prontidão técnica do SHA novo, nem à aprovação de produção.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | L/M | PR/ref/HEAD/tree | GitHub/local | relatório 49 | SPEC ausente | Localizar SPEC e conferir inventário |
| G02 | PASS histórico | Eng./Reviewer | O | CI 31/31 | GitHub Actions | #42668107238 | CI P pendente | Exigir CI P exact-SHA |
| G03 | PASS | Admin | L | D1/cadastro | Chromium local | relatórios prévios | sem QA M | Revalidar QA seguro |
| G04 | PASS | Admin | L | publish/capa/galeria | Chromium | histórico e2e L | release não autorizado | Preservar Studio |
| G05 | FAIL | Eng./Images QA | P local | TDD 3 transições D1/R2 | Workers sintéticos | RED→GREEN P 271/271 | 25MiB vs 20MB; D1/R2 sem lock; QA remoto | Pipeline 25MiB + coordenação |
| G06 | PASS | Segurança | G/L | JWT/JWKS | QA histórico | reconciliação 16 | G19 | Auditoria independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | físico | G15 |
| G08 | PASS | Segurança | L/M | sessão/revogação | local | 46–50 | sem QA remoto M | Revogação QA autorizada |
| G09 | PASS | Segurança | L/M | isolamento A/B | Miniflare | 44–50 | auditor externo | G19 |
| G10 | PASS | Segurança | L/M | private GET/HEAD negados | Miniflare | 44–50 | flag produção não verificada | Revalidar runtime |
| G11 | PASS | Produto | L | favoritos | Chromium | CI L | físico | G15 |
| G12 | PASS | Produto | L | download/hash | Chromium | CI L | QA real | Homologação segura |
| G13 | PASS | UI cliente | L | lightbox/teclado | Chromium | CI L | TalkBack/VoiceOver | G15 |
| G14 | PASS LOCAL | UI/Admin | P local | uploads + 8 widths | Chromium real local | E2E 14 cenários PASS | CI P e QA remoto ainda pendentes | Validar CI exact-SHA |
| G15 | BLOCKED_EXTERNAL | Testadores | — | TalkBack/VoiceOver | físico | GOAL36 | NOT_RUN | Homologar Android e iOS reais |
| G16 | PASS | UI/Studio | L | Colagem/SEO | Chromium/CI | #42544637971 | M sem CI | Revalidar M |
| G17 | FAIL | Cloudflare/Infra | P local | CSP/cache + snapshots | Vitest local | RED→GREEN P / cache 10 testes | CPU real cold/MISS do SHA novo sem amostras | QA segregada CPU cold/MISS |
| G18 | PASS LOCAL | Operador G18 | P local | G18 fixture e lifecycle | Miniflare + Node | histórico 1/1; recovery 19 testes | não é rollback remoto | Retentar em QA autorizado |
| G19 | BLOCKED_EXTERNAL | Auditor independente | — | parecer formal | humano | GOAL36 | sem aprovação | Auditoria independente |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD formal | humano | GOAL36 | sem aceite | Aprovação formal |
| G21 | PASS histórico | CI/Reviewer | O | CI 31/31 | GitHub Actions | #42668107238 | CI P pendente | Executar e conferir P exact-SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização de release | humano | GOAL36 | ausente | Autorizar especificamente após gates |
| G23 | BLOCKED_EXTERNAL | Operador QA | P local | R2 PUT=0 + GET=0, retry | D1/R2 sintéticos | recovery 19/19, fixture G18 1/1 | sem rollback remoto, D1 401 e Billing 403 | QA segregada predecessor/restore/revogação |
| G24 | PASS histórico | Documentação | O | PR/Drive readback | GitHub/Drive | checkpoint O #6747357485 | checkpoint P pendente | PR/Drive pós-CI exact-SHA |

**NO_GO_PRODUCTION.** Próximos passos: CI exact-SHA e checkpoints PR/Drive, depois coordenação de GC/restore externo, QA D1/R2/Images segregada e CPU cold/MISS efetiva, contrato 25 MiB e aprovações humanas.
