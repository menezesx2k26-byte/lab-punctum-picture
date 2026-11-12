# PUNCTUM R4 — ciclo T | upload público transacional D1, quarentena R2 e cache G17

**Data:** 09/11/2026. **Estado global obrigatório:** `NO_GO_PRODUCTION`. Novo incremento integrado G05/G17/G23 na worktree T isolada, sobre HEAD remoto S `491174d0f645aad02b155820b5d790b2a6625710`. Nenhum merge, deploy, alteração Cloudflare remota, billing, permissions, feature flag, fotos reais, Studio ou Colagem editorial.

## Baseline e preservação

- Ciclos N/O/P/Q/R publicados e preservados; S publicado com parent R `61068411d3aa0713d7e2736301f87f3d1a76ac75` e tree `49a4091b345096ec7b2498c083f03a74d72886ab`, igual à tree local S. GitHub PR #32 open/draft/unmerged.
- S CI exact SHA [#42703301463](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42703301463) completed/success verify 31/31; browser artifact ID 13711794322, size 5.877.910 B, digest `sha256:15a4ef95c41e6f584c40579046a444070a2338d63a5b3eec9a7a58768ee293d4`. ZIP interno não auditado. PR checkpoint S [#6752131440](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32#issuecomment-6752131440) readback; Drive Sgtmenezes document `12oLVbThH1KUncV7XiYzRQ4L4MMprwoDJg0LZmyHBsSA` append com requiredRevisionId, revisão nova/readback confirmados. Não duplicados P/Q/R.
- S local integral teve 260/264 com 4 timeouts/3 pool errors; rerun 28/29 por timeout de health, CPU host 2-vCPU carregado >11; CI Linux S independente passou sem esconder falhas locais.

## TDD RED→GREEN G23/G05: upload público/editorial

**RED reproduzidos (4/4 FAIL)** em `tests/integration/public-upload-state-races.spec.ts` com Miniflare D1/R2 sintéticos e hooks de interleaving, mantendo a implementação anterior:

1. `ready` restaurado após leitura da intenção era aceito e permitia PUT R2 desnecessário.
2. cleanup `expired/failed` entre PUT R2 e UPDATE D1 era reaberto para `uploaded` sem CAS.
3. imagem soft-deleted e intenção expirada durante decodificação eram indevidamente finalizadas `ready/completed`.
4. falha do Images Binding para bytes não decodificáveis era engolida, marcando `ready` apesar de conteúdo inválido.

**GREEN dirigido: 4/4 PASS** após alterações em `worker/api/admin.ts`: `assertPublicUploadImage()` valida vínculo exato album/image/key/MIME/size/status/deleted_at/arquivo e album ativo; guarda de validade e estado antes de PUT; R2 immutable only-if; `UPDATE ... WHERE` condicional pós-PUT com `meta.changes===1`; objeto R2 preservado em conflito tardio para recovery, sem delete automático. Completion exige intenção `uploaded`, revalida ligação D1, existência R2, tamanho/MIME, `IMAGES.info()` válido com formato metadata correspondente, dimensões e tamanho, falha fechada para raster rejeitado pela leitura de metadata (sem afirmar decodificação integral nem derivados neste fluxo público); `db.batch()` com guards condicionais em imagem e intenção e contagem de alterações. Não afirmar atomicidade distribuída D1/R2: somente D1 é transacional; atores externos não coordenados ainda exigem fencing.

Compatibilidade de chaves legadas continua restrita ao operador histórico G18; fixtures G18 intocadas. O teste histórico de fluxo de upload em `worker.spec.ts` agora usa PNG sintético decodificável para observar a guarda real de bytes, sem fotos reais.

## G17: negociação compartilhada do cache público

RED direto observado: uma requisição anônima com `Cache-Control: max-age=0` era elegível para cache compartilhado. `text/html;q=0` também passava no teste de substring. GREEN em `worker/public-home-cache.ts`: diretiva explícita de revalidação e recusa HTML negociada não entram em cache. Validação direta sintética 5/5 PASS; `tests/unit/public-home-cache.spec.ts` adiciona teste regressivo (total 12 testes no arquivo). Preserva nonce/cookie/Authorization/Origin/identidade previamente protegidos e aceita HTML anônimo válido. Sem CPU remoto cold/MISS/pós-invalidação em QA segregada autorizada, G17 segue **FAIL**.

## Limitações, regressões e fronteiras

- T RED/green por Workers Vitest: RED 4/4 falharam; GREEN 4/4 passaram; execução integrada `worker.spec.ts` + novo teste 20/21 PASS, único timeout health check 20.296s sob host 2-vCPU com load elevado. Outro rerun dedicado de upload + cache 16/16 PASS. Não aumentar timeouts nem apagar asserções. ESLint exit0 e git diff --check PASS; TypeScript inicial falhou somente na tipagem da nova tabela de testes de headers, corrigida: TypeScript rerun exit0. Node 21/21 PASS, fixture histórica G18 1/1 PASS, Colagem 7/7 PASS, build Vinext PASS, SSR route import 1/1 PASS, npm audit 0 vulnerabilidades, JSON válido e diff check PASS. Chromium Linux será exigido na CI T exact-SHA; browser local T não foi iniciado no host sobrecarregado.
- Fluxo completo G05 de 25 MiB **não homologado**: 26.214.400 B exigidos vs Images Binding `.input()` 20.000.000 B; derivação privada, proveniência, CPU/memória e custo R$0 não comprovados em remoto. Guarda segura preservada; **G05 FAIL**.
- Quarentena sem exclusividade retém objetos e tem custo/storage não readback; plano de purge exclusivo + backup/restore R2/D1 remoto ainda não homologados. `db.batch` não une D1 e R2; **G23 BLOCKED_EXTERNAL**.
- QA CPU Workers Free cold/MISS/pós-invalidação inexequível sem ambiente QA autorizado/metrics exact-SHA; **G17 FAIL**.
- G15 físico, G19 auditoria independente, G20 LGPD formal e G22 release específico não simulados, todos **BLOCKED_EXTERNAL**. `PRIVATE_GALLERIES_ENABLED=false` em config versionada, runtime não revalidado. Nenhuma afirmação de custo realizado zero; apenas orçamento incremental autorizado R$0,00.
- SPEC literal `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` §23 não localizada após buscas; GOAL36, reconciliação16, handoff35 e relatórios50–56 permanecem as fontes acessíveis, sem inventar seção ausente.

## Evidências finais T

**Pendentes antes do checkpoint remoto**: commit/parent/tree, CI Linux exact SHA e browser artifact, PR/Drive com revisão/readback. Regressões locais dirigidas e estáticas estão fechadas com resultados reais; Workers integral local T não foi certificado como PASS devido ao timeout health; exigir CI Linux integral exata. Não usar o sucesso S para declarar T aprovado. Continuar após T com inventário read-only de órfãos/quarentena, SHA/ETag/ownership e procedimento de fencing/rollback, sem deleção remota.

## Matriz canônica G01–G24

Colunas: `GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO`.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS HISTÓRICO_ESCOPADO | Engenharia | S | PR/ref/parent/tree/24 gates | GitHub readback | CI S #42703301463 31/31 | SPEC literal §23 ausente; produção não homologada | Localizar SPEC e manter matriz atualizada |
| G02 | PASS histórico | Eng./Reviewer | S | CI Linux 31/31 | GitHub Actions | #42703301463 exact-SHA S | CI T pendente | Comprovar T exact-SHA |
| G03 | PASS | Admin | L | D1/cadastro | Chromium local | relatórios prévios | sem QA M | Revalidar QA seguro |
| G04 | PASS | Admin | L | publish/capa/galeria | Chromium | histórico e2e L | release não autorizado | Preservar Studio |
| G05 | FAIL | Eng./QA Images | T local | public upload CAS + raster metadata, private signed prior | Vitest D1/R2 sintético | T RED4→GREEN4; private P/Q/R/S histórico | 25 MiB vs Images20MB; derivados, SHA e atomicidade remoto incompletos | Provar pipeline privado integral 25MiB com custo Free |
| G06 | PASS | Segurança | G/L | JWT/JWKS | QA histórico | reconciliação 16 | G19 | Auditoria independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | físico | G15 |
| G08 | PASS | Segurança | L/M | sessão/revogação | local | 46–50 | sem QA remoto M | Revogação QA autorizada |
| G09 | PASS | Segurança | L/M | isolamento A/B | Miniflare | 44–50 | auditor externo | G19 |
| G10 | PASS | Segurança | L/M | private GET/HEAD negados | Miniflare | 44–50 | flag produção não verificada | Revalidar runtime |
| G11 | PASS | Produto | L | favoritos | Chromium | CI L | físico | G15 |
| G12 | PASS | Produto | L | download/hash | Chromium | CI L | QA real | Homologação segura |
| G13 | PASS | UI cliente | L | lightbox/teclado | Chromium | CI L | TalkBack/VoiceOver | G15 |
| G14 | PASS HISTÓRICO_ESCOPADO | UI/Admin | S | 8 larguras/upload/admin | Chromium Linux CI | CI S #42703301463 31/31 | QA remoto segregado não executado | Revalidar UI física autorizada |
| G15 | BLOCKED_EXTERNAL | Testadores | — | TalkBack/VoiceOver | físico | GOAL36 | NOT_RUN | Homologar Android e iOS reais |
| G16 | PASS HISTÓRICO | Studio/Editorial | T local/S | Colagem7; Chromium CI S | local+CI Linux | T Colagem7/7 + CI S 31/31 | Chromium T exact-SHA pendente | Preservar Studio/Colagem T |
| G17 | FAIL | Cloudflare/Infra | T local | HTTP max-age=0/HTML q=0 + snapshot guards | Vitest local + Node direto | G17 12/12 + RED→GREEN 5/5, CI S 31/31 | CPU real cold/MISS/pós-invalidação do T não medida | QA segregada autorizada CPU exact-SHA |
| G18 | PASS HISTÓRICO_ESCOPADO | Operador | T local | fixture G18 imutável, recovery scoped | Node local | T G18 1/1, CI S 31/31 | G23 remoto não homologado | Preservar fixture e fazer QA exclusiva |
| G19 | BLOCKED_EXTERNAL | Auditor independente | — | parecer formal | humano | GOAL36 | sem aprovação | Auditoria independente |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD formal | humano | GOAL36 | sem aceite | Aprovação formal |
| G21 | PASS HISTÓRICO_ESCOPADO | CI Reviewer | S | verify 31/31 | GitHub Actions | #42703301463 exact S SHA 31/31 | CI T pendente | Conferir T exact SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização de release | humano | GOAL36 | ausente | Autorizar especificamente após gates |
| G23 | BLOCKED_EXTERNAL | Operador/QA | T local | pre/post PUT late conflicts, quarantine | D1/R2/Miniflare | T RED4→GREEN4, S CI31/31 | rollback remoto/fencing e inventário/custo reais ausentes | QA segregada, hashes, exclusive purge |
| G24 | PASS HISTÓRICO_ESCOPADO | Documentação | S | PR/Drive revisão/readback | GitHub/Drive | PR #6752131440, Drive S requiredRevisionId/readback | checkpoint T pendente | Persistir T pós-CI exact SHA |

**NO_GO_PRODUCTION** — nenhum gate externo presumido.
