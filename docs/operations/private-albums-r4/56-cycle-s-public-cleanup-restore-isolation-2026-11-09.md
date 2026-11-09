# PUNCTUM R4 — ciclo S | cleanup público, isolamento e preservação editorial

**Data:** 09/11/2026. **Decisão:** `NO_GO_PRODUCTION`. Incremento de engenharia no mesmo produto, sem publicação de conteúdo, merge, deploy, release, ativação de galerias privadas, alterações Cloudflare D1/R2 remotas, uso de fotos reais, alteração de billing/Access/permissões ou custo incremental autorizado acima de R$ 0,00.

## Estado de entrada e histórico preservado

- PR #32 `open/draft/unmerged`, base `agent/hst-001-hostinger-qa-20261028`; HEAD de entrada R `61068411d3aa0713d7e2736301f87f3d1a76ac75`, parent Q `dd03f844447be7978ec089a5489b6deab6f26828`, tree R `59beb1ef482873d32521eaea375c92a949ba7879`.
- CI R [#42685287962](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42685287962) `completed/success 31/31` incluindo Chromium Linux. Artefato browser ID `13705670479`, digest GitHub `sha256:8e39517d9df8937bce0646f2477279b27f98d0ed42e65781e9e81422c2f494c6`. Checkpoint PR R `6749747518` e Drive com requiredRevisionId/readback. P/Q checkpoints anteriores preservados e não duplicados.
- Worktree S destacada, separada das worktrees históricas M/P/Q/R; nenhuma troca de base por reset/rebase/force. Fontes lidas: GOAL36, reconciliação16, handoff35, relatórios50–55 e ledger. SPEC literal `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` §23 ainda não encontrada; conteúdo não inventado.

## TDD RED→GREEN: cron de uploads **públicos** também apagava imagens válidas

O ciclo R bloqueou `R2.delete` para álbuns privados. A reavaliação do cron `worker/scheduled.ts` identificou um **caminho paralelo independente**, que alcançava o mesmo R2 `ORIGINALS` usado por fotografias públicas/Studio:

1. **RED propriedade cruzada:** intenção pública `uploaded` expirada, vinculada à imagem A de álbum A, mas com `object_key` da foto `ready` do álbum B. Cron anterior executou `ORIGINALS.delete(keyB)` sem revalidar ownership. Observado `R2.get(keyB) = null` com D1 de B ainda `ready`.
2. **RED janela após SELECT:** imagem A inicialmente `pending`, intenção com chave canônica, restauração promovendo A a `ready` no ponto de `R2.delete`. Observada chamada destrutiva `1` (esperado `0`).
3. **RED soft-delete:** imagem pública com `deleted_at` preenchido sofria churn em cada cron, `pending→failed` e alteração de `updated_at`, embora seu original fosse reservado à recuperação.

**GREEN implementado:** o cron público agora só considera intenção/imagem com ligação exata no D1: `album_id/image_id/object_key`, MIME/tamanho, status pending/failed, `deleted_at IS NULL`, expiração e idade. Exige chave `originals/{album}/{image}.{png|webp|jpg}` com segmentos válidos, sem comparação por prefixo. Usa transição D1 `images→failed` condicional, seguida de `upload_intents→expired` / `completed_at` apenas se a imagem ainda estiver `failed` na mesma versão temporal e chave. Interferência de restore entre updates deixa o intent retryable e não apaga bytes. **Nenhum `R2.delete` para original público** no cron ativo. Chaves não canônicas e imagens prontas/revogadas são deixadas para revisão exclusiva, não corrigidas destrutivamente. Retentativas após interrupção são seguras e idempotentes.

**Teste adicional de concorrência:** restauração entre a atualização da imagem para `failed` e a finalização D1 da intenção — se a imagem voltar a `ready`, a intenção não é concluída indevidamente e o original R2 é preservado. O cron continua limpando `rate_limit_buckets` expirados e nenhum recurso editorial é publicado/alterado no frontend.

## Integração e riscos restantes

- Proteções R de quarantine privado e cache público G17 permanecem, assim como HMAC/O, entidade codificada/N, reconciliação P e revogação Q. Novos testes rodam em Miniflare/D1/R2 sintéticos, sem foto real nem Cloudflare write.
- Retenção de objetos em R2 **consome capacidade** e pode exigir política de quota/retention e sweep exclusivo. `completed_at` de uma intenção pública `expired` indica **quarentena D1**, não exclusão física R2; backlog histórico e custos observados ainda não foram inventariados em produção.
- Ainda existe `BACKUPS.delete()` sob política de retenção de backups lógicos separada; não confundir com a guarda dos originais de clientes e do catálogo, nem declarar exclusividade distribuída geral por eliminar estes dois caminhos.
- **G05 FAIL:** requisito 25 MiB (26.214.400B) excede o limite `Images.input()` de 20 MB; sem derivados privados homologados para arquivos maiores, sem QA D1/R2/Images completa nem custo Free verificado.
- **G17 FAIL:** Workers Free 10ms CPU HTTP, cold/MISS/pós-invalidação do novo SHA não medida em QA remoto. Cache e CI não são telemetria CPU real.
- **G23 BLOCKED_EXTERNAL:** inexistência de rollback remoto segregado autorizado com predecessor Worker, flags, sessões, hashes D1/R2, reabertura, exclusividade/fencing de outros operadores e inventário de objetos órfãos.
- **G15/G19/G20/G22 BLOCKED_EXTERNAL:** TalkBack/VoiceOver físicos, auditoria independente, aprovação LGPD formal e autorização específica de release. Produção/Studio/Colagem, SEO, rascunhos da Maria e identidade pública mantidos sem deploy.

## Evidências e validação

- **RED local real:** três cenários novos, 0/3 no código anterior, com falhas explícitas na perda R2 entre álbuns, delete pós-SELECT e churn de soft-delete.
- **GREEN focado prévio:** 29/29 (4/4 cleanup público, 8/8 maintenance privado, 17/17 Worker), TypeScript e `git diff --check` PASS no checkpoint de trabalho S e TypeScript repetido exit 0 em 21:26 UTC; repetição dirigida 28/29 PASS (4/4 cleanup público, 8/8 maintenance privado, 16/17 Worker), timeout do primeiro health check 20.191 ms; a primeira repetição 29/29 foi comprovada previamente, mas não é resultado da nova rodada. **Workers integral inicial S — NÃO PASSOU:** `npm test` terminou exit 11, **260 PASS/264, 4 timeouts e 3 erros de pool** em 55 arquivos, duração ~2405,89 s; failures em `client-admin-audit`, `client-pilot`, `worker` health e `client-passwords` PBKDF2, com `cloudflare-pool runner` timeout e `ECONNRESET`. Teste serial (`--no-file-parallelism --maxWorkers=1`) no host com 2 vCPUs, carga > 8 e processo gráfico alheio de CPU elevada também reproduziu timeouts de 60s em PBKDF2 e 20s no health check; a execução serial já falha foi terminada por SIGTERM **somente do próprio processo Vitest** (exit 143), sem modificar timeouts/asserções. Carga observada >11 em 2 vCPUs, com `glycin-svg` e Chrome renderers preexistentes; sem encerrar esses processos. Isso **sugere contenda de host**, mas NÃO prova ausência de regressão: CI Linux exact-SHA e regressões isoladas são necessárias. Etapas Colagem/Node/SSR/Chromium/lint/build/audit da cadeia integral não foram alcançadas por `set -e`. Não usar CI R como prova S.
- **Novo SHA GitHub, tree/parent/ref, CI Linux exact-SHA, checkpoints PR/Drive:** pendentes ao redigir. Não declarar CI S antes do readback final. QA Cloudflare remoto e faturamento permanecem não comprovados.

## Matriz G01–G24

Campos: **GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO**. PASS histórico escopado não equivale à homologação da versão S.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS HISTÓRICO_ESCOPADO | Engenharia | Q | PR/ref/parent/tree/24 gates | GitHub readback | CI Q #42680304657 31/31 | SPEC literal §23 ausente; QA R pendente | Localizar SPEC e conferir última matriz |
| G02 | PASS histórico | Eng./Reviewer | O | CI 31/31 | GitHub Actions | #42668107238 | CI P pendente | Exigir CI P exact-SHA |
| G03 | PASS | Admin | L | D1/cadastro | Chromium local | relatórios prévios | sem QA M | Revalidar QA seguro |
| G04 | PASS | Admin | L | publish/capa/galeria | Chromium | histórico e2e L | release não autorizado | Preservar Studio |
| G05 | FAIL | Eng./QA Images | S local | shared R2 cleanup/public-private ownership, upload signed | Vitest local | RED→GREEN S + R/P/Q histórico | 25 MiB vs Images20MB, sem D1/R2 atomicidade/QA remote | Provar pipeline integral com custo Free |
| G06 | PASS | Segurança | G/L | JWT/JWKS | QA histórico | reconciliação 16 | G19 | Auditoria independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | físico | G15 |
| G08 | PASS | Segurança | L/M | sessão/revogação | local | 46–50 | sem QA remoto M | Revogação QA autorizada |
| G09 | PASS | Segurança | L/M | isolamento A/B | Miniflare | 44–50 | auditor externo | G19 |
| G10 | PASS | Segurança | L/M | private GET/HEAD negados | Miniflare | 44–50 | flag produção não verificada | Revalidar runtime |
| G11 | PASS | Produto | L | favoritos | Chromium | CI L | físico | G15 |
| G12 | PASS | Produto | L | download/hash | Chromium | CI L | QA real | Homologação segura |
| G13 | PASS | UI cliente | L | lightbox/teclado | Chromium | CI L | TalkBack/VoiceOver | G15 |
| G14 | PASS HISTÓRICO_ESCOPADO | UI/Admin | Q | 8 larguras/upload/admin | Chromium Linux | CI Q 31/31 | QA remoto R não executado | Revalidar CI R exata |
| G15 | BLOCKED_EXTERNAL | Testadores | — | TalkBack/VoiceOver | físico | GOAL36 | NOT_RUN | Homologar Android e iOS reais |
| G16 | PASS HISTÓRICO | Studio/Editorial | R | Chromium Colagem/SEO | local+CI Linux | R CI #42685287962 31/31 | S CI pendente e falhas locais sob contenda | Revalidar Studio/Colagem S |
| G17 | FAIL | Cloudflare/Infra | R | HTTP cache variants, snapshot guards | Vitest local + CI R | RED→GREEN R; CI R #42685287962 | CPU real cold/MISS do S sem amostras | QA segregado/exact SHA |
| G18 | PASS HISTÓRICO_ESCOPADO | Operador | R | fixture G18 imutável, recovery scoped | Node local | R G18 1/1 e CI R 31/31 | S/G23 remoto não homologado | Rodar G18 S sem mutar fixture |
| G19 | BLOCKED_EXTERNAL | Auditor independente | — | parecer formal | humano | GOAL36 | sem aprovação | Auditoria independente |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD formal | humano | GOAL36 | sem aceite | Aprovação formal |
| G21 | PASS HISTÓRICO_ESCOPADO | CI Reviewer | R | verify 31/31 | GitHub Actions | #42685287962 exact R SHA | Workers S integral exit 11 sob contenda; CI S pendente | Conferir S exact SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização de release | humano | GOAL36 | ausente | Autorizar especificamente após gates |
| G23 | BLOCKED_EXTERNAL | Operador/QA | S local | forjado cross-album, late restore, soft-delete | D1/R2/Miniflare | TDD S RED→GREEN, R checkpoint #6749747518 | rollback remoto/fencing e inventário/custo reais ausentes | QA segregada, hashes, exclusive purge |
| G24 | PASS HISTÓRICO_ESCOPADO | Documentação | R | PR/Drive revisão/readback | GitHub/Drive | PR #6749747518, Drive R revision | checkpoint S pendente | Persistir S pós-CI exact SHA |

**NO_GO_PRODUCTION**. A falha integral local S foi preservada, não ocultada. Próxima ação: conferir S na CI exata e checkpoints; preparar inventário/quarentena de objetos com hashes e plano de descarte exclusivo, QA CPU cold/MISS e 25MiB sem reduzir a SPEC; manter gates humanos abertos.
