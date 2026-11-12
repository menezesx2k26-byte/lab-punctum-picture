# PUNCTUM PICTURE R4 — ciclo C, prévias legadas acima do limite e snapshot público codificado

**Data:** 2026-11-08. **GOAL:** R4 álbuns privados, DoD canônico G01–G24; **decisão:** `NO_GO_PRODUCTION`. **Proibição:** nenhum merge, deploy, migração remota, fotografia real, alteração de fixtures históricas, D1 adicional ou cobrança. **Fonte:** SPEC original §23 e reconciliação `16-original-g01-g24-reconciliation.md` (não matriz Argon), GOAL 36 e relatórios 38–39.

## Reconciliação sem sobrescrita

O segundo ciclo já havia sido publicado após o último registro da conversa: PR #32 `open/draft/unmerged`, HEAD remoto `8966178c01ea4a461054fcf34e6afca113647873`, parent `a7e4166e25812a74c9fae84cd37bb3b1665ddcbe`, árvore `b6800e3af1588ab9634f8a9e80b092e6869a5d26`. O commit local irmão `c0c6538e55f6a154a70ffca34df242c9244c30e7` tem a mesma árvore. Nada foi rebaseado, resetado ou sobrescrito.

GitHub Actions [CI #42527202846](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42527202846) **completed/success** no SHA exato `8966178c…`; job `verify` concluiu todos os passos, inclusive testes de Worker, Vitest, Node, build, SSR bundle e Chromium. Artefato `r4-browser-evidence` ID `13635842943`, SHA-256 do arquivo publicado `1c3a8e9cff3399f7909fc6d79ce4c2cedbff2c60848f3b310506da2dbaf4d1b7` (ZIP não inspecionado internamente nesta rodada). Esses resultados correspondem **somente** à árvore anterior `b6800e3`; alterações do ciclo C exigem um novo SHA e nova CI.

Observação G17 [CPU QA read-only #42527198252](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42527198252): `completed/success` do *coletor*, GraphQL HTTP 200, **zero amostras de CPU histórica** no intervalo 24h; não se mediu CPU efetiva de MISS/cold nem se identificou runtime do novo SHA. Artefato `r4-cpu-historical-readonly` ID `13636295746`, digest `sha256:ce481a0479c04e484ff8e6ebc121df95c32312313eeb82bf4d8fac68b28c2282`. `cpuGatePassed=false` por construção.

Inventário G23 [preflight #42527198228](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42527198228): workflow `completed/success`, mas `BLOCKED_READ_ONLY_SCOPES_UNVERIFIED`: `subscriptions` HTTP 403, `databases` HTTP 401; outros GET de scripts, R2, settings e deployments responderam 200. `writes=0`, `rollbackExecuted=false`, `productionSafeToRelease=false`. Artefato `r4-rollback-readonly-evidence` ID `13635916124`, digest `sha256:c5e879a1acd0461550e236d9143ab62d5dffe2f4de7cf1b4497241144e6dfa76`. Não confundir conclusão do workflow com homologação de rollback ou permissões suficientes.

## G05 — terceiro ensaio TDD (integridade de limite operacional também para dados legados)

**RED reproduzido:** um intent `uploaded` persistido com `expected_size = 26.214.400` antes/fora do guard atual ainda chegava ao fluxo `direct`/`complete` sem um guard equivalente, podendo ler R2 e encaminhar mais de **20.000.000 bytes** ao Images Binding; um registro de imagem `ready` legado ou com tamanho de R2 divergente também podia chegar à transformação de prévia. Casos novos provam *ausência* de chamadas R2 e Images para D1 oversized e *ausência* de chamadas Images para objetos com tamanho R2 oversized, em GET e HEAD, thumb/gallery.

**GREEN comprovado nos testes locais:** a API verifica tamanho inteiro positivo, não maior que `CLIENT_MAX_UPLOAD_BYTES`, e MIME exato em **qualquer continuação** de intent já persistido, antes de assinatura/stream/R2/Images. `UPLOAD_IMAGE_LIMIT` 413 preserva linhas e objeto para decisão posterior, nunca promove imagem. A rota de prévia autorizada confere **dois** limites, do D1 e do objeto R2 real: se qualquer um exceder 20 MB, retorna `IMAGE_INPUT_LIMIT` 413, inclusive em HEAD; downloads de original (rota separada, com autenticação e integridade) não foram intencionalmente reduzidos. 25 MiB **não se tornam suportados**; a proteção impede somente ultrapassar os limites do Binding. A SPEC continua **26.214.400 bytes**, G05 continua **FAIL**.

Limites oficiais: [Cloudflare Images](https://developers.cloudflare.com/images/get-started/limits/) documenta **20 MB para Images Binding `.input()`**, 100 MB para imagem remota por URL e restrições distintas para imagens hospedadas. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) informa CPU Free 10 ms e 128 MB por isolate. Mesmo 25 MiB cabendo no R2, nenhuma transformação segura e privada dos originais foi homologada no Free: uma URL pública ou pre-signed não pode ser criada sem análise de URL bearer, logs, autorização, expiração, quota, custos e integridade, além de CPU/memória. Não autorizar serviço pago ou D1 novo.

## G17 — prevenção de snapshot com referência privada mascarada

**RED reproduzido:** o teste de snapshot recusava URLs privadas em texto simples, mas aceitava `/api/client/galleries` quando codificado como `%2Fapi%2Fclient%2Fgalleries`, `\\u002Fapi\\u002Fclient\\u002Fgalleries`, entidade HTML numérica `&#47;`, ou string JSON com `\\/`. A proteção converte variantes comuns de separador escapado antes da verificação. Rejeita também caminho base sem barra terminal usando `\b`, tanto na etapa de staging quanto no consumo. É proteção em profundidade contra caminhos privados conhecidos, não uma prova geral de ausência de PII: nenhum snapshot gerado pelo Studio deve conter dados de clientes, e auditoria independente G19 permanece necessária. `PUBLIC_HOME_SNAPSHOT_ENABLED` permanece opcional; publicação remota não foi autorizada.

## Planejamento de QA e gates humanos

G15 exige Android TalkBack e iOS VoiceOver **físicos** com dispositivo/modelo/versão/resultado e leitura correta de lightbox, foco, favoritos, zero bytes quando negado, zoom e logout. G19 exige revisor técnico **independente** no SHA final, examinando IDOR, cookies, Origin/CSRF, upload HMAC, R2 checksum, restauração, limitação de tamanho, cache e QA. G20 requer aprovação LGPD identificada pela responsável do estúdio; G22 aprovação específica de release, não uma autorização genérica. Nenhum desses requisitos é substituído por Chromium, simulação, GitHub Actions ou revisão do próprio autor.

## Matriz de reconciliação G01–G24 (sem reclassificação silenciosa)

`BASE` = SHA `8966178c…` com CI #42527202846. `C` = mudanças locais deste ciclo, exigindo SHA/CI nova. `PASS histórico` conserva apenas as provas de seus SHAs anteriores. As colunas seguem o GOAL: `GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO`.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS histórico | Engenharia | BASE/C | git tree, estado PR | GitHub/worktree | PR #32, 35/36/39/40 | CI C | preservar head/árvore e PR draft |
| G02 | PASS histórico/revalidar | Engenharia | BASE/C | Vitest/Node/build | local/CI | #42527202846 | SHA C sem CI | readback exato de todos os jobs |
| G03 | PASS histórico | Engenharia | BASE | cadastro schema | local/QA anterior | 16/25/39 | nova QA não homologada | manter prova histórica |
| G04 | PASS histórico | Engenharia | BASE | galeria e editor | Chromium/QA | 25/39 | G05 25MiB | ensaio produto com recurso autorizado |
| G05 | **FAIL** | Engenharia/Estúdio | BASE/C | limites D1/R2; bytes SHA | local | testes upload, media, 39/40 | arquitetura 25MiB Free não provada | definir solução segura e provar no QA autorizado |
| G06 | PASS histórico | Segurança | BASE | JWT/Access | QA anterior | 16/25 | parecer independente | revalidar no SHA final |
| G07 | PASS histórico | Responsável OTP | BASE | OTP real anterior | QA humana | 25 | nova homologação | repetir se ambiente aprovado |
| G08 | PASS histórico | Segurança | BASE | sessão/revogação | local/QA | 25/39 | não prova release | manter regressão |
| G09 | PASS histórico/revisar | Engenharia | BASE/C | A/B 404/zero bytes | local/Chromium | client-security-matrix, 39 | SHA C não está no QA | revalidar isolamento em QA dedicado |
| G10 | PASS histórico/revisar | Engenharia | BASE/C | flag OFF/404 | local | 39, wrangler | produção runtime não modificado | manter flag OFF, provar após release autorizado |
| G11 | PASS histórico | Engenharia | BASE | favoritos | Chromium | #42527202846 | SHA C novo | preservar E2E |
| G12 | PASS histórico/revisar | Engenharia | BASE/C | integridade download/preview | local | media tests, 39/40 | QA novo não homologado | provar bytes SHA completos |
| G13 | PASS histórico | Frontend | BASE | lightbox/teclado | Chromium | #42527202846 | G15 físico | confirmar E2E |
| G14 | PASS histórico | Frontend | BASE | upload administrativo | Chromium | #42527202846 | 25MiB bloqueado | validação integral em QA |
| G15 | **BLOCKED_EXTERNAL** | QA assistivo | BASE/C | TalkBack/VoiceOver NOT_RUN | físico | roteiro G15 §anterior | dispositivos e relatório humano | executar e registrar |
| G16 | PASS histórico/revisar | Estúdio/Frontend | BASE/C | SSR/Studio/Colagem | bundle/Chromium | #42527202846, snapshot | novo SHA C | conferir SSR e preservar rascunhos |
| G17 | **FAIL** | Infra CPU Free | BASE/C | GraphQL CPU sem amostras; snapshot | QA read-only/local | #42527198252, 39/40 | não há CPU cold/MISS do SHA final | telemetria real no QA autorizado |
| G18 | PASS histórico/revisar | Engenharia QA | BASE/C | restore/intent SHA | D1/R2 local | 39, testes de recuperação | QA real ausente | prova remota quando seguro |
| G19 | **BLOCKED_EXTERNAL** | Revisor externo | BASE/C | parecer independente NOT_RUN | externo | roteiro de segurança 39/40 | aprovação humana | revisão P0/P1 do SHA final |
| G20 | **BLOCKED_EXTERNAL** | Responsável LGPD | BASE | termo formal NOT_RUN | estúdio | GOAL36 | aprovação identificada | solicitar à responsável |
| G21 | PASS no BASE / pendente C | Maintainer | BASE/C | CI do SHA final | Actions | #42527202846 | nova CI | conferir jobs e artefatos C |
| G22 | **BLOCKED_EXTERNAL** | Proprietário | BASE | aprovação de release NOT_RUN | governança | GOAL36 | gates FAIL | só após readiness total |
| G23 | **BLOCKED_EXTERNAL** | QA rollback | BASE/C | preflight read-only | Actions/QA | #42527198228 | 401 D1/403 subscriptions, sem rollback | permissões autorizadas + QA segregado |
| G24 | PASS histórico/checkpoint C pendente | Engenharia | BASE/C | GitHub/Drive readback | repo/Drive | 35–40 e PR | readback novo SHA/CI/Drive | persistir sem apagar histórico |

**Verificação do ciclo C na árvore local antes de publicar:** focado 23/23 PASS (media 15, config 5, snapshot 3); suíte inteira **245/245 PASS em 57/57 arquivos**, incluindo matrizes de segurança, recuperação de clientes e testes de concorrência; Node raster/CPU/G23 **11/11 PASS**, SSR Miniflare do bundle Vinext **1/1 PASS**, `npm run typecheck` PASS, `npm run lint` PASS, `npm run build` PASS (avisos conhecidos Vinext/Vite), `npm audit --audit-level=low` **0 vulnerabilidades**, `git diff --check` PASS. **Chromium real local 14/14 PASS**: dois clientes sintéticos A/B, dez PNG originais, negação privada/404, foco/teclado/Escape, download byte a byte, oito larguras, Studio/Colagem, upload administrativo, persistência após restart, rollback local isolado e logout/revogação. Relatório `outputs/browser-e2e/report.json` do checkout; não equivale a dispositivo físico ou Cloudflare QA. A CI do SHA futuro **não** é antecipada.

**Decisão final deste relatório:** `NO_GO_PRODUCTION`, `PRIVATE_GALLERIES_ENABLED=false`, custo incremental autorizado **R$ 0,00**. O relatório conserva deliberadamente `G05 FAIL`, `G17 FAIL`, G15/G19/G20/G22/G23 `BLOCKED_EXTERNAL`; nenhum deploy ou aprovação humana é implicitamente consentido. Substituir campos PENDING apenas depois de readback dos instrumentos correspondentes, sem projetar PASS para o SHA futuro.
