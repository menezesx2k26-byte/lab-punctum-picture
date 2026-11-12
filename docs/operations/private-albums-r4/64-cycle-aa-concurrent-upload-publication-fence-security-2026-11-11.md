# R4 — ciclo AA: conclusão concorrente, publicação cercada e atualização RSC

Data: 11/11/2026 UTC. Decisão: **NO_GO_PRODUCTION**. PR #32 draft/open/unmerged. Orçamento incremental autorizado: R$ 0,00.

## Baseline e fontes

HEAD de entrada remoto/local `f25a99cc23338cb8d48fc9b9041de6f1a331f0a3`, CI #42917103900 completed/success confirmada pela API no SHA exato. Base PR `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`; main `0636ab7105cf54455bf7db9ad640471ea764e5a2` (19 commits exclusivos de main / 225 desta branch). Checkout novo e isolado `/workspace/scratch/68da7b7069c3/punctum-r4`; worktrees anteriores não acessadas nem alteradas. O plugin selecionado expôs apenas ferramentas browser nesta sessão; execução pelo terminal do ambiente isolado e GitHub autenticado.

Documentos 35/36 lidos integralmente, matriz 16, ledger e relatórios 25–34/60–63 examinados. SPEC literal não localizada no checkout, nas duas buscas Library ou na busca Drive `PUNCTUM_SPEC`; o texto ausente não foi inventado. Transcrições canônicas 16/35/36 continuam referência disponível. Não usar matriz Argon.

## Correções implementadas com evidência

1. **G05, conclusão concorrente:** RED reproduziu `409 UPLOAD_INTENT_MISMATCH` quando outra requisição já havia confirmado exatamente os mesmos bytes entre decode e CAS. GREEN aceita apenas resultado D1 **0/0**, com JOIN revalidando intent/galeria/imagem/chave/MIME/tamanho/expiração, completed_at, SHA, ready/não excluída e dimensões. Revogação, digest, dimensões ou expiração divergentes continuam 409; rebind anterior continua negado. A convergência não refaz gravações nem duplica o evento `image_ready`. Não torna D1/R2 atomicamente transacionais.
2. **G17, publicação/snapshot:** invalidar somente ANTES da publicação permitia a um produtor capturar HTML antigo sob o epoch novo. Migração **aditiva e exclusivamente local** 0012 cria leases individuais; begin e finish avançam epoch, leitura/staging recusam qualquer lease ativo. Publicações sobrepostas e callback duplicado são testados. `finally` termina também em payload rejeitado; autorização/Origin são verificadas antes da lease. Se o processo morrer ou o storage falhar, lease retida desabilita snapshots até reconciliação manual; NÃO expirar lease por tempo. SSR fallback preserva a disponibilidade, mas não comprova CPU Free.
3. **G17, cache:** revisão auxiliar apontou que SSR em voo poderia repovoar cache após purge. Quando `PUBLIC_HOME_SNAPSHOT_ENABLED=true`, navegação ignora o entrypoint de cache e consulta D1; chamada direta ao entrypoint também nega cache compartilhado. RED de headers reproduziu cache público indevido; GREEN remove CDN TTL/tag. Isso preserva o modo legado de cache quando snapshots estão desligados. Não resolve CPU do SSR nem cria produtor editorial confiável. Nenhuma flag foi habilitada remotamente.
4. **Segurança de dependências:** audit atual encontrou **GHSA-xqc2-xf4c-x3h3 / CVE-2026-126187**, critical, no RSC 19.2.8. Fonte primária https://github.com/advisories/GHSA-xqc2-xf4c-x3h3 e release React 19.2.9; backport corrigido. React, React DOM e react-server-dom-webpack alinhados em **19.2.9**, preservando Next/Vinext/plugin-rsc e ajuste SSR version-pinned. `npm ci` reproduziu lockfile e audit GREEN zero. Mudanças de flags dev/optional de sharp no lockfile foram normalização do npm; versões desses pacotes não mudaram.

## Validação local observada

- RED upload: conflito 409 reproduzido; RED fence: helper ausente; RED cache: público em vez de private/no-store. Recibos em `evidence/cycle-aa-20261111/`.
- Focados: **41/41** em upload/cache/snapshot.
- Final após React 19.2.9: **299/299 Workers**, **59/59 arquivos**; **7/7 Colagem**; **typecheck/lint/build PASS**, **npm audit zero**; `git diff --check` PASS.
- Node completo scripts/e2e/services: **111 testes, 110 PASS, 1 FAIL**: `access-cookie-navigation` não iniciou Chromium (`process_singleton_posix ... socket() failed: Operation not permitted`). Não é PASS local. R4+evidence separado anterior: **79/79 PASS**.
- SSR produção: **1/1 PASS**, módulo administrativo continua carregado apenas na rota Studio; snapshot presente evita SSR e publicação inválida remove snapshot. Primeira execução falhou na expectativa histórica epoch=1; teste atualizado para dois avanços start/finish e exige zero leases restantes, sem remover proteção.
- Browser E2E tentou executar: DB/R2 locais sintéticos criados, mas Chromium falhou ao iniciar pelo mesmo bloqueio de socket. **BLOCKED_ENV local**, não PASS. CI deve executar Chromium e a navegação por cookie no SHA novo.
- E2E ampliado verifica ambas flags opcionais true no ambiente local, home no-store e fence de publicação autorizada/negada/falha. Zero dados reais.
- Revisão auxiliar por agente distinto leu diff e não encontrou defeitos bloqueantes novos; **não é parecer independente formal G19**.

## Inventário remoto somente leitura

Recibo sanitizado `evidence/cycle-aa-20261111/remote-readonly-summary.json`. Conta Punctum confirmada. **10 D1**, **13 buckets**, **18 Workers** (histórico tinha 17; não criado nenhum nesta rodada). Assinaturas listadas `free`, `teams_free`, `r2_paid`; isto não comprova franquia consumida/fatura R$0.

QA R4: versão `e05a3001-3c78-4703-8055-acf3026bd450`, deployment `5658b99f-3ff4-4282-aa0f-1e851f34eeb0`, 32 deployments listados. Flag privada **false**, DB sintético histórico correto, **sem R2 ou IMAGES**, Access com placeholders. SELECT contou **3/3/11/11/2** clientes/galerias/imagens/intents/favoritos; metadata `changed_db=false`, rows_written=0, rows_read=30. Contagens não substituem hash de todas as linhas/objetos. Nenhuma escrita Cloudflare, migration remota, deploy, mudança Access/billing, fotos/dados reais ou recursos históricos.

## Bloqueios concretos remanescentes

- **G05 FAIL:** 25 MiB original versus `.input()` 20 MB continua sem pipeline de decode privado seguro e custo zero comprovado. Constante operacional 20.000.000 preservada, requisito 26.214.400 não revogado. QA atual não possui R2/Images, Access real nem slot D1 segregado disponível. Não reutilizar DB histórico com escrita nem apagar bancos. Fonte oficial reconsultada: https://developers.cloudflare.com/images/optimization/binding/ .
- **G17 FAIL:** leases/cache corrigem consistência, não geram HTML. `stagePublicHomeSnapshot` continua sem produtor editorial confiável operacional. Snapshot ausente/inválido volta ao Vinext SSR; falta produtor do mesmo build/publicação e CPU efetiva cold/MISS/purge ≤10ms, quotas/uso e custo. Fonte: https://developers.cloudflare.com/workers/platform/limits/ . Cache legado sem snapshot mantém janela TTL histórica; nenhum PASS por HIT/latência.
- **G23 BLOCKED_EXTERNAL:** histórico de versões agora foi lido com sucesso, assim como SELECT D1/assinaturas. O antigo bloqueio 401/403 não deve ser repetido como falha atual dessas operações. Faltam destino realmente segregado/autorizado, dados/hashes e ensaio Worker/config/Studio/Colagem/sessões/reabertura. Não executar rollback sobre históricos para fabricar prova.
- **G15/G19/G20/G22:** aparelhos/assistivas reais, parecer formal independente, aceite Maria/controladora e release específico continuam ausentes.
- **G24:** Engram não foi encontrado na descoberta; busca retornou conversas OpenAI, que NÃO são substituto. PersistFlow descoberto está sem conexão ativa. Não gravar em serviço/app de outra finalidade, não alegar checkpoint nesses sistemas. Repo/PR/Drive recebem checkpoint verificável; fechamento CI é anexado externamente ao SHA publicado.

## Matriz canônica

`PASS histórico` conserva fonte/SHA em doc16, sem homologação automática do HEAD AA. `AA` indica o commit que contém este diff, a fixar pelo readback Git/CI na PR. Nenhum gate global foi promovido.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS histórico; readback AA parcial | Eng. | f25a99c + AA | refs/inventário SELECT | GitHub/Cloudflare read-only | este relatório/recibo | SPEC literal ausente | Recuperar original e conferir estado final |
| G02 | PASS histórico; regressão AA local | Eng. | AA | 299 Workers/build/lint/tsc | local | logs/CI nova | browser/CI HEAD | Conferir CI exata |
| G03 | PASS histórico | Admin | doc16 | cadastro/D1 | local/QA histórico | doc16 | QA atual integrado | Revalidar segregado |
| G04 | PASS histórico | Produto | doc16 | publicação/capa | local/QA histórico | doc16 | QA atual | E2E final |
| G05 | FAIL | Eng./QA | AA | 20 upload; concorrência; hash | Miniflare | tests/client-upload-config | 25MiB; QA integrado | Pipeline seguro e QA segregado |
| G06 | PASS histórico | Segurança | doc16 | JWT/JWKS/negativos | QA histórico/local | doc16; suíte AA | runtime final | Revalidar QA |
| G07 | PASS histórico | Access QA | doc16 | OTP humano | QA histórico | doc25 | QA R4 placeholders | Revalidar identidade real |
| G08 | PASS histórico | Segurança | doc16 | sessões/revogação | QA histórico/local | doc16; suíte AA | runtime final | Revalidar replay |
| G09 | PASS histórico | Segurança | doc16 | A/B/IDOR | local/histórico | doc16; suíte AA | QA HEAD | Revalidar remoto |
| G10 | PASS histórico | Segurança | doc16 | GET/HEAD zero bytes | local/histórico | doc16; suíte AA | QA real final | Conferir negação |
| G11 | PASS histórico | Produto | doc16 | favoritos | browser histórico | doc16 | browser AA | Conferir CI artifact |
| G12 | PASS histórico | Produto | doc16 | download SHA/bytes | browser histórico | doc16 | QA AA | Validar final |
| G13 | PASS histórico | UI cliente | doc16 | lightbox/foco | browser histórico | doc16 | browser AA | Conferir CI |
| G14 | PASS histórico | UI admin | doc16 | upload/estados | browser histórico | doc16 | browser AA | Conferir CI |
| G15 | BLOCKED_EXTERNAL | Testadores físicos | — | TalkBack/VoiceOver | dispositivos reais | docs36/63 | matriz física incompleta | Executar matriz real |
| G16 | PASS histórico; SSR/Colagem AA | Studio/Maria | AA | SSR1/Colagem7 | local | suíte/build | browser e comparação final | Conferir CI sem alterar drafts |
| G17 | FAIL | Infra/Workers | AA | snapshot6/cache15/SSR1 | local | fences e cache RED/GREEN | produtor/CPU/uso reais | Produtor e CPU QA sem custo |
| G18 | PASS histórico limitado | QA | 13a6c83 | restore/hash | Cloudflare QA histórico | #40786688338/doc16 | não é G23 | Preservar fonte/hashes |
| G19 | BLOCKED_EXTERNAL | Revisor independente | — | parecer formal | externo | security-review.md | assinatura/zero P0-P1 | Revisão formal; audit AA corrigido |
| G20 | BLOCKED_EXTERNAL | Maria/controladora | — | aceite LGPD | humano | doc11 | aceite datado | Decisão expressa |
| G21 | PASS histórico; AA pendente | CI/reviewer | AA | CI/browser | GitHub | baseline #42917103900 | CI SHA AA | Conferir run/jobs/artifact |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | R1/R2/R3 | humano | doc36 | autorizações específicas | Somente após gates críticos |
| G23 | BLOCKED_EXTERNAL | QA | AA | inventário versões/DB | read-only | recibo AA | destino e rollback integral | QA segregado sem dados históricos |
| G24 | PASS histórico; AA parcial | Documentação | AA | repo/PR/Drive readback | GitHub/Drive | este relatório | Engram/PersistFlow indisponíveis | Registrar disponibilidade e CI final |

## Veredito e operação seguinte

**GLOBAL_DOD_OPEN / NO_GO_PRODUCTION**. A migração 0012 só foi aplicada em bases efêmeras locais; deve ser incluída em futura autorização aditiva e rollback, antes de habilitar snapshot. Nenhum merge, deploy produtivo, flag privada true, compra ou contrato foi realizado. Faltas humanas não foram assinadas por agente. O estado final do commit/CI/Drive é conferido na PR sem atribuir CI anterior ao novo código.


## Fechamento conferido do código AA

Código remoto **45d998411952e4b8d613c89684748165004acbfe**, parent f25a99cc, árvore **ceb297e0ec176877c6043915fcb0a583d46a5d7c** idêntica ao local testado6cf090f. Push terminal não tinha credencial de escrita; API autenticada criou árvore idêntica/commit filho e moveu ref com expected_sha/force=false. Checkout remoto limpo criado em `../punctum-r4-aa-verified`; checkout irmão anterior preservado.

CI [43102450821](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43102450821) **completed/success**, job130797118391 **33/33 etapas**. Inclui audit zero, Workers299, Colagem7, testes Node/SSR, cookie cross-site Chromium e E2E. Artefato13892057814,10.836.088B, ZIP baixado e SHA256 **b2da8d428c6984677674ecc660bdaa3aaf114a7ec80e9efd348c9cb67b1f67d8** verificado. Report interno SHA256 **a2e20f0295a333710dd09de007309e4421c7cda97666cf776f27801c35694cde**, sourceSha45d9984, checkoutDirtyAtRun=false, PASS_LOCAL, **22 checks**, sete auditorias/145 regras/zero violações/117 nós incomplete. CincoPNGfullPage; zero pageErrors/consoleWarnings/consoleErrors/serverErrors. Os testes novos de publicação e ambas flags passaram no bundle real. O warning de purge sem cache no servidor é esperado nesse ambiente; não foi erro HTTP/JS.

Escopo: Chromium145.0.7632.6 em workerd local do Actions, D1/R2 sintéticos. Não OTP real, Cloudflare QA remoto, CPUFree ou aparelhos físicos. O bloqueio local Chromium EPERM permanece documentado e foi superado somente no runner CI, não apagado.

Checkpoint privado Drive [ciclo AA](https://docs.google.com/document/d/1nXaCZFo4QuJbip5aCdx_0GXOMyikX5ksFsfBFdu8ruo/edit) escrito com requiredRevisionId e lido de volta. ZIP persistido no [Drive sgtmenezes](https://drive.google.com/file/d/1_OpwYVEh47SZHlKnVsaGrWRUZe60Nr7c/view). Recibo `evidence/cycle-aa-20261111/ci-code-readback.json`. Engram/PersistFlow continuam indisponíveis, sem alegação de gravação.

A conferência pós-commit detectou linhas extras ao EOF em três recibos RED (untracked não abrangidos pelo diff-check inicial). Este fechamento remove só essas linhas e mantém a evidência causal. Código/dependências/testes/migrações são idênticos a45d9984. CI do novo HEAD documental é conferida separadamente na PR/Drive; a CI45d9984 não lhe é atribuída automaticamente. Nenhum gate global promovido: **17PASS históricos,2FAIL,5BLOCKED_EXTERNAL; NO_GO_PRODUCTION**.
