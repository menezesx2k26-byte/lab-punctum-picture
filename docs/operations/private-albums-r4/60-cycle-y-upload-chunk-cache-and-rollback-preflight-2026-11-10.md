# Punctum Picture R4 — ciclo Y: limites de stream, cache e preflight G23

**Data:** 10/11/2026 UTC. **Decisão:** `NO_GO_PRODUCTION`. **Custo incremental de infraestrutura autorizado:** R$ 0,00.

## Estado de entrada e fontes

- PR [#32](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32) `open/draft/unmerged`; branch `fix/punctum-albums-r4-completion-20261107`; remoto e checkout de partida `beda364f3b2eca32da92352ccb97bcb039ae2ba7`, confirmados por GitHub e `git ls-remote`.
- Base da PR: `agent/hst-001-hostinger-qa-20261028` (`50e8fc4`); main `0636ab7105cf54455bf7db9ad640471ea764e5a2`; comparação `origin/main...HEAD`: 19 commits exclusivos de main e 222 da branch. Checkout de trabalho isolado no Linux: `punctum-r4-cycle-y-20261109`. Worktrees anteriores, suas alterações pendentes e o checkout divergente `punctum-r4-exec-20261108` foram preservados.
- CI exata de **entrada**: [#42723054309](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42723054309) `completed/success`, 30 passos do job `verify` concluídos; artefato `r4-browser-evidence` ID `13721018140` presente, digest `sha256:6b5625553908f38b875e6f5f0345b7b428e4f3a060df8dae7799d45ef3c90ea3`. **Não** é CI das mudanças deste ciclo; conteúdo interno ZIP não inspecionado neste readback.
- Fontes lidas: handoff 35; GOAL 36; reconciliação canônica 16; `execution-state.json`; relatórios 25–34 e 37–59; código e tests vigentes. O arquivo literal `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` não está no checkout nem foi recuperado na Library; o mapeamento do §23 vem das transcrições versionadas 16/35/36. Nunca usar a matriz Argon como substituta.

## Correções verificáveis e escopo

1. **G05 — trabalho excessivo em stream:** `readBounded()` limitava 64 chunks vazios, mas 8.193 chunks de um byte com tamanho assinado válido atravessavam o leitor até R2. Teste RED produziu `Response{}` em lugar de `400 UPLOAD_STREAM`. Agora, a partir do chunk **8.193 não vazio**, cancela o leitor e devolve `UPLOAD_STREAM` antes de gravar objeto; a intent fica `pending` para retry íntegro. Teste GREEN confirmou upload normal recuperado e bytes R2 iguais aos enviados. **Não** altera os limites de formato, digest, autenticação, assinatura, R2 nem o teto provisório de 20.000.000 bytes. A fragmentação de browsers reais e CPU Free ainda requerem medição representativa para calibrar o limite.
2. **G17 — cache público restrito:** o HEAD anterior aceitava `Accept: text/html;q=1, text/x-component;q=0.9` no entrypoint compartilhado e `Content-Type: text/html+json` como HTML cacheável. RED reproduzido diretamente com código do commit `beda364`; GREEN limita respostas a MIME `text/html` exato (com parâmetros convencionais) e nega negociações JSON/React Flight, independentemente da ordem ou peso `q`. Cache só para home HTML anônima; cookies, rotas privadas, respostas de identidade e RSC continuam excluídos.
3. **G23 — predecessor de Worker:** um único deployment contendo duas versões em traffic split era interpretado como histórico de rollback. Dois testes RED falharam, e um terceiro RED detectou falso positivo quando uma versão do deployment antigo ainda está no traffic split atual. GREEN exige IDs de deployment distintos, `created_on` cronologicamente válido e ao menos uma versão anterior ausente do deployment atual; inventário incompleto falha fechado. Os testes com duas versões no mesmo deployment, ID duplicado, timestamps ausentes/iguais ou somente versões compartilhadas não qualificam. **Inventário nunca autoriza rollback**.

**Testes locais deste ciclo:** Vitest integração de uploads `14/14 PASS`, cache público `14/14 PASS` (28/28; 2 arquivos); `node --test scripts/r4-rollback-readonly.test.mjs scripts/r4-cpu-readonly.test.mjs scripts/r4-cpu-historical-readonly.test.mjs` `20/20 PASS`; `npm run typecheck`, `npm run lint` e `git diff --check` executados na máquina Linux, com a validação de HEAD exato ainda dependente da nova CI. Não foram usados Cloudflare remote, D1/R2 históricos, fotos reais, produção, billing, Access, rollback, merge ou deploy para estes ensaios.

## Pendências que impedem DoD

**G05 FAIL:** a SPEC original exige **25 MiB (26.214.400 B)**, enquanto `IMAGES.input()` aceita **20 MB** e o produto barra antecipadamente `20.000.000 B`. Falta pipeline privado com decodificação/derivação segura, SHA/bytes, limite/custo Free e autenticação real comprovados juntos em QA D1/R2/Images segregado; inventário histórico tinha 10/10 slots D1 ocupados. O limite desta rodada é defesa operacional, **não** solução do tamanho original.

**G17 FAIL:** cache quente/purge históricos foram demonstrados, porém a renderização Vinext no **primeiro acesso e MISS após purge** ainda não tem medição CPU efetiva dentro dos 10 ms Workers Free no SHA de entrega; consultas GraphQL anteriores retornaram amostragem insuficiente. Latência e HIT não são CPU; fatura/uso real não foram lidos neste ciclo.

**G23 BLOCKED_EXTERNAL:** preflight mais conservador melhora a identificação de versão anterior, porém faltam QA remoto dedicado e autorizado para backup→rollback→restore→reabertura de Worker/config/Studio/Colagem/D1/R2/sessões, validação de hashes e 404/0 bytes; inventário D1/Billing remoto anterior sofreu 401/403. **G15** depende de Android TalkBack e iOS VoiceOver físicos; **G19** de revisor de segurança independente autorizado; **G20** de aceite LGPD da responsável pelo estúdio; **G22** de autorizações separadas R1/R2/R3 do proprietário.

## Matriz canônica G01–G24 — escopo do ciclo, sem promoção de histórico

Legenda: `HIST.` = PASS de escopo/SHA anterior, sujeito à reconciliação final; `LOCAL` = teste em Miniflare/Node que **não** homologa runtime remoto. A coluna SHA `beda364 + Y` identifica base e diff local; para o SHA publicado consulte o commit da PR e a CI correspondente. Os 17 PASS históricos não foram recertificados por mera herança.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | HIST. PASS; readback Git atual | Eng. | beda364 + Y | refs, PR, stack | GitHub/Linux | 35/36/16, PR #32, este relatório | SPEC literal e inventário Cloudflare atual | Localizar SPEC, inventário remoto read-only |
| G02 | HIST. PASS; revalidação pendente | Eng. | beda364 + Y | CI, diff e regressões | GitHub/local | CI entrada #42723054309; testes Y | CI HEAD final | Revisar SHA final e CI |
| G03 | HIST. PASS | Admin | histórico | cadastro/D1 | Chromium/QA hist. | doc 16 | QA remoto atual | Revalidar cadastro autorizado |
| G04 | HIST. PASS | Admin | histórico | estados/capa/publicação | Chromium local | doc 16 | QA atual | E2E atual |
| G05 | **FAIL** | Eng./QA Images | beda364 + Y | stream RED→GREEN; 14 integração | Miniflare | test client-upload-config; upload e retry | 25 MiB; D1/R2/Images/Access QA integrada | Pipeline 25 MiB e QA real |
| G06 | HIST. PASS | Segurança | histórico | JWKS/RS256 negativos | QA/local | doc 16 | revalidação SHA final | JWT/regressões |
| G07 | HIST. PASS | Access QA | histórico | OTP real sanitizado | QA histórico | doc 25 | sessão QA vigente | Revalidar fluxo |
| G08 | HIST. PASS | Segurança | histórico | logout/revogação | QA/local | doc 16 | runtime atual | Revalidar cookie/versão |
| G09 | HIST. PASS | Segurança | histórico | A/B/IDOR | QA/local | doc 16 | QA atual | Reexecutar isolamento |
| G10 | HIST. PASS | Segurança | histórico | GET/HEAD 404/0 B | QA/local | doc 16 | flag runtime não lida | Revalidar negação real |
| G11 | HIST. PASS | Produto | histórico | favoritos D1 | Chromium | doc 16 | SHA atual | E2E reload/A-B |
| G12 | HIST. PASS | Produto | histórico | download/hash | Chromium | doc 16 | SHA atual | Revalidar bytes |
| G13 | HIST. PASS | UI cliente | histórico | lightbox/teclado | Chromium | doc 16 | físicos pendentes | Browser no HEAD |
| G14 | HIST. PASS | UI admin | histórico | upload/estados | Chromium | CI entrada/browser artifact | ZIP não inspecionado | Browser SHA final |
| G15 | **BLOCKED_EXTERNAL** | Testadores reais | — | TalkBack/VoiceOver | Android/iOS físicos | 36/16 | matriz assistiva humana incompleta | Testes físicos documentados |
| G16 | HIST. PASS | Studio/Maria | histórico | Colagem/Studio | CI/Chromium | doc 16; CI entrada | comparação visual atual | Revisar sem alterar drafts |
| G17 | **FAIL** | Infra/Workers | beda364 + Y | cache 14 + CPU Node | local/hist. Edge | docs 28–31; 19 Node | cold/MISS CPU + quotas/custo | Medição remota representativa |
| G18 | HIST. PASS QA limitado | Operador QA | histórico | restore hashes | Cloudflare QA histórico | #40786688338 | não equivale G23 | Preservar evidências |
| G19 | **BLOCKED_EXTERNAL** | Revisor independente | — | revisão segurança | externo | 36/16 | parecer assinado/zero P0/P1 | Revisão formal |
| G20 | **BLOCKED_EXTERNAL** | Controladora estúdio | — | decisões LGPD | humano | 36/11 | aceite datado ausente | Decisão da responsável |
| G21 | HIST. PASS; Y pendente | CI/Reviewer | beda364 + Y | CI/checks/browser | GitHub | #42723054309 é baseline | CI do novo SHA | Validar run/artifacts finais |
| G22 | **BLOCKED_EXTERNAL** | Proprietário | — | autorização R1/R2/R3 | humano | 36 | aprovação específica ausente | Decisão etapa por etapa |
| G23 | **BLOCKED_EXTERNAL** | Operador QA | beda364 + Y | preflight 20 Node, 3 RED→GREEN | local/read-only | scripts/r4-rollback-readonly.test.mjs | restore Worker/config/DB/R2 remoto | QA integral segregado |
| G24 | HIST. PASS; Y pendente | Documentação | beda364 + Y | ledger, Git e Drive | repo e históricos | este relatório; docs 35–59 | readback CI/Drive/Engram/PersistFlow Y | Registrar SHA, snapshots e comprovantes |

## Resultado operacional

`PRIVATE_GALLERIES_ENABLED=false` na configuração versionada; não inferir o valor efetivo remoto. Nenhum gate humano assinado, nenhum contrato 25 MiB revogado, nenhum ensaio QA remoto realizado nesta rodada. Este incremento permanece `NO_GO_PRODUCTION` mesmo se a CI da PR ficar verde.
