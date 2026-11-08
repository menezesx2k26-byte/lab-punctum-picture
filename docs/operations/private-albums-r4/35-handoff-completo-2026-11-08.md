# PUNCTUM PICTURE — R4 | HANDOFF COMPLETO E TAKEOVER VERIFICÁVEL
**Data-base da captura:** 08/11/2026 (America/Sao_Paulo).
**Tipo:** transferência de contexto para agente executor. Este documento não constitui homologação, autorização de produção nem checkpoint automático.
**Decisão atual:** **PRODUCTION_NO_GO**. Álbuns privados ainda não liberados.
**Documento companheiro:** `36-goal-definition-of-done-2026-11-08.md`. Ler ambos.

## 0. Instrução obrigatória ao agente que assumir
Continue a implementação existente, não a recrie. Investigue e execute trabalho real até o máximo estado seguro, com TDD, comandos, readbacks, commits, CI exata e evidência remota quando autorizada. Não substitua a entrega por um novo plano. Nunca promova um gate por inferência, simulação local, workflow verde ou relato histórico sem escopo. Ao encontrar impedimento externo, registre a causa e avance em frentes seguras, sem improvisar acesso, assinatura, orçamento ou autorização.

A especificação de precedência máxima é `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` (27/10/2026; 40.541 bytes; SHA-256 de referência histórica `2989e0ba18982658570dc699842393b3f980c9a5312237af33ab02292d10ecfb`). Seu `23 define exatamente os gates **G01–G24**. O documento `docs/operations/private-albums-r4/16-original-g01-g24-reconciliation.md` corrige um erro antigo de numeração: **G13=frontend cliente, G14=frontend admin, G15=acessibilidade/matriz assistiva**. Não usar a matriz numérica Argon, que é distinta da SPEC, como substituta.

## 1. Fontes de verdade e estado Git realmente conferido
1. Mensagens/autorizações do proprietário e especificação R4, preservando correções posteriores de escopo.
2. Estado remoto efetivo de GitHub e infraestrutura; código real; CI e QA sobre SHA exato.
3. Documentação versionada contemporânea, seguida dos relatórios históricos.
4. Handoffs no Drive Sgtmenezes, Engram e PersistFlow para contexto; **não** substituem readback de Git/QA.

- **Repo:** https://github.com/menezesx2k26-byte/lab-punctum-picture
- **Branch ativa:** `fix/punctum-albums-r4-completion-20261107`.
- **HEAD de código conferido ANTES dos dois documentos deste handoff:** `baab1bac1e58a90d8fe2fd43d8e71f17d726cdf3`. Após commit documental, o novo HEAD será diferente; comparar com remoto, não reescrever retroativamente esta medição.
- **Worktree:** `D:\Repos\punctum-r4-completion-20261107`, limpa na verificação de 08/11; worktree histórica `D:\Repos\punctum-auth-qa-20261024` no commit `5b5e193`: preservar.
- **Origin main capturada:** `0636ab7105cf54455bf7db9ad640471ea764e5a2`; comparação main…HEAD em 08/11: main 19 commits à frente e branch 193 commits à frente. Recalcular antes de integrar.
- **Parent de PR #32:** `agent/hst-001-hostinger-qa-20261028` no `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`. Branch de trabalho 13 commits à frente desse parent e 0 atrás no momento observado. Não force-push nem misturar código de outras worktrees.
- **PR atual:** https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32 — **draft, aberta, mergeable, NÃO merged**.
- **Stack preservado (todos draft/open/unmerged no readback):** PR #13 `agent/private-client-albums-20261022` → PR #17 `integration/punctum-private-albums-r4-20261027` → PR #20 `agent/argon-punctum-r4-dod-20261027-v2` → PR #24 `agent/hst-001-hostinger-qa-20261028` → PR **#32**. Os PRs #13 e #17 referenciam main; não assumir merge linear sem inspecionar bases/merge-base.
- **CI do código baseline:** https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42497465093 — **completed/success**, SHA `baab1ba…`, inclusive Chromium E2E; artefato `r4-browser-evidence` ID `13624451257`, existência confirmada, **ZIP não inspecionado**. Local no mesmo código: **232/232 testes Workers, 56 arquivos; 11/11 Node Images/preflight; typecheck, lint, build, npm audit --audit-level=low (0)**. Estes números são snapshot, nunca atribuir a commits futuros sem executar.

## 2. Contrato do produto — o que não pode ser quebrado
**Punctum Picture é o estúdio de fotografia de Maria.** O site público possui direção autoral, Colagem Autoral, Anti AI-Slop, Studio com rascunho editorial protegido, hero, carrossel e portfólio. O trabalho privado **não** autoriza mudar paleta, identidade, fotos originais, preset visual aprovado, rascunhos nem publicações da Maria. Nada de dashboard genérico, design artificial ou imagens inventadas.

Fluxo privado especificado: administração autorizada cadastra cliente/e-mail → cria galeria (título, introdução, tema) → prepara e envia fotos em R2 privado → confirma integridade/ordem/capa → publica/despublica → titular acessa via Cloudflare Access Free (OTP, JWT assinado e autorizado em D1) → navega somente suas galerias → visualiza, favorita e baixa fotos quando permitido → logout/revogação e recuperação funcionam. Nenhuma rota, mídia, thumbnail, otimizador, relatório ou cache pode revelar bytes de terceiros ou fotos não publicadas.

**Principal identidade de cliente:** `CLIENT_AUTH_MODE=access`, Access Free OTP+JWT, D1 como autoridade, cookie Punctum independente. Login por senha PBKDF2 é legado/compatibilidade, não criar segundo login público concorrente. Password Bridge Hostinger não é workaround aprovado. A autenticação administrativa por segredo compartilhado deve registrar principal compartilhado, **não** atribuir individualmente um e-mail sem prova. Access administrativo depende de allowlist verificada.

**Infra/stack:** Next 16.4.3 + React 19.2.8 + Vinext 0.0.50 + Vite 8.3.5 + Workers/TypeScript, D1, R2 privado, Images Binding, Wrangler, Vitest/Miniflare, Chromium/Playwright. O build contém ajuste version-pinned de carregamento SSR em `build/ssr-on-demand.ts`; não remover/atualizar versões sem refazer prova de SSR.
Principais caminhos:
- `worker/index.ts`: roteamento de Worker, fronteiras privadas, SSR Vinext, entrypoint `PublicHome` e purge.
- `worker/client/router.ts`, `worker/client/response.ts`, `worker/utils/auth.ts`, `worker/api/client-session.ts`: autorização, sessão, mídia privada e respostas 404 sem bytes.
- `worker/api/client-gallery-upload.ts`, `worker/client/gallery-raster.mjs`, `shared/client-galleries.ts`: intents, finalização, R2/IMAGES e contrato de tamanho.
- `app/admin/components/PrivateGalleryEditor.tsx`: upload/progresso/erro/retry; `app/albuns`: cliente.
- `worker/client/lgpd.ts`, `worker/api/client-admin.ts`: export sanitizado e auditoria.
- `migrations/0009_private_client_galleries.sql`: schema e CHECK histórico de até 25 MiB. **Nunca fazer migration destrutiva para baixar esse CHECK**.
- `tests/integration/client-pilot.spec.ts`, `client-media.spec.ts`, `client-security-matrix.spec.ts`, `client-upload-config.spec.ts`, `r4-public-rollback.spec.ts` e `scripts/r4-*.mjs`.
- `.github/workflows/ci.yml`, `r4-images-ephemeral-qa.yml`, `r4-cpu-readonly-qa.yml`; observar triggers e SHA exato.

## 3. Autorizações e vedações estritas
Autorizado: leitura/inventário, commits e PR isolados, testes locais/CI, QA **somente em recursos dedicados previamente comprovados**, auditoria não destrutiva, artefatos sanitizados, escrita deste handoff. Não autorizado sem aprovação separada: merge main (pode disparar deploy), deploy produção, `PRIVATE_GALLERIES_ENABLED=true`, alterar políticas Access produção, migrations D1 remotas destrutivas, deletar/reescrever históricos QA ou objetos R2, clientes reais como fixtures, comprar/atualizar plano, mudar billing, fornecer credenciais/links privados, usar servidor Node/PersistFlow de outra aplicação.

**Infra de QA e dados:**
- Conta Cloudflare Punctum previamente conferida com Workers Free, Images Free, Teams Free e R2 existente; assinatura `r2_paid` consta no inventário, **não** equivale a autorização de nova despesa.
- Inventário observou **17 Workers antes/depois** de ensaios efêmeros recentes, e **10/10 bancos D1 Free ocupados**. Esse estado é snapshot de QA; fazer inventário read-only novo antes de alocar. Não criar 11º D1, desalocar DB alheio ou adulterar fixtures para abrir espaço.
- Histórico sintético em D1 `punctum-picture-r4-qa-20261028` e buckets R2 de R2/G18 **imutáveis por esta execução**; readback de contagens anteriores: 3 clientes, 3 galerias, 11 imagens, 11 intents, 2 favoritos, 1 ponteiro. Contagens iguais não são prova criptográfica de ausência de alteração; ensaios recentes não tinham binding D1.
- Hostinger QA `aliceblue-locust-999458.hostingersite.com` já apresentou probe Node/HTTPS 200. **Isso NÃO prova SSR Vinext, integração D1/R2, CPU/headroom, persistência, restart nem custo.** Não mexer no host de PersistFlow.

## 4. Linha de execução/evidência recente — não confundir as provas
| Etapa/commit | Evidência verificável | O que foi provado | O que NÃO foi provado |
|---|---|---|---|
| Edge histórico `40779241089` (28/10) | p50/p95/p99 CPU 31/57/145 ms, amostragem histórica | CPU de candidato excedia Free 10 ms | Estado do código atual |
| `dde8c3e` | QA CPU #42441525618, CI #42441528778 | 36/36 HTML200; CPU amostrado n=7, p50 46,874ms, p95/p99 72,527ms; Worker removido | G17 PASS |
| `6074b88` / `5cd8361` | cache QA #42486168970 | 35 HIT/1 MISS, 36/36 HTML200, p50 latência 31ms | CPU cold |
| `19ed443` | cache purge QA #42487556524, CI #42487559744 | 35 HIT/1 MISS; purge autenticado 200, MISS→HIT, p50 latência 21ms; Worker removido | CPU cold, invalidação em Studio real |
| `bce8551` | Images QA #42492484685, CI #42492488717 | Helper de raster do próprio produto validou PNG sintético 2x2→1x1 de 67B no binding IMAGES Free | Upload D1/R2/Access integrado |
| `60259da` | CI #42493482485 | Teste local publica Studio, aplica Colagem sem vazar rascunho, restaura versão anterior; hash SHA256 de R2 e registro D1 privados preservados | Rollback remoto completo de Worker/config/SSO |
| **`baab1ba`** | **CI #42497465093** e **QA Images #42497461077** | **232 Workers, 11 Node; CI E2E success**. Images real: PNG sintético HTTP200/67B, worker criado/deletado, 17→17, D1=0, R2=0, sem fotos | Upload completo, CPU cold, cobrança efetiva |
| G18 histórico | [run #40786688338](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40786688338) | Restore isolado D1/R2 com hashes e contas sintéticas quarentenadas | G23 rollback integral |

**Mudança de produto pendente:** a SPEC original exige **25 MiB = 26.214.400 bytes** por foto privada, mas a Cloudflare publica limite de **20 MB** para `IMAGES.input()`. Código `baab1ba` passou a rejeitar acima de **20.000.000 bytes antes de reservar imagem/intent no D1 ou gravar R2**, exibindo 20 MB; em `worker/client/gallery-raster.mjs` há restrições de 12.000 px por lado e 100 MP. TDD RED/GREEN verificado. Isto evita upload preso, **não cumpre nem revoga automaticamente o requisito original**; compatibilização ou mudança de escopo depende de decisão expressa do responsável. Fonte: https://developers.cloudflare.com/images/get-started/limits/ .

**Cache:** `PublicHome` armazena só GET / HTML anônimo e sem RSC/auth/cookies; default/admin/client sem cache, navegador revalida e a borda guarda por 60s, purge seletivo após publicação. A flag `PUBLIC_HOME_CACHE_ENABLED` não está ativada na configuração de produção. Cache HIT elimina a invocação da home nesse caso, **mas em MISS continua SSR com CPU acima do limite Free**. Fonte: https://developers.cloudflare.com/workers/cache/ .

## 5. Matriz CANÔNICA de 24 gates — snapshot reconciliado
Matriz histórica de 28/10: **17 PASS / 2 FAIL / 5 BLOCKED_EXTERNAL**; os avanços de 07–08/11 têm escopo abaixo. Um PASS antigo **não se transforma automaticamente em prova no HEAD recém-modificado**. Reexecutar/referenciar conforme a natureza de cada gate. Estados permitidos: `PASS`, `FAIL`, `BLOCKED_EXTERNAL`, `BLOCKED_SECURITY`, `NOT_RUN`, `NOT_APPLICABLE` (este último somente se autorizado e justificado, nunca para contornar exigência).

| Gate original | Critério original | Snapshot reconciliado | Qualificação necessária |
|---|---|---|---|
| G01 | Baseline atualizado — SHAs/inventário | PASS | Atualizar HEAD/main/stack/infra no início de cada takeover |
| G02 | Integração sem regressão — diff auditado/testes | PASS | Conservar Studio/Colagem, CI do HEAD |
| G03 | Cadastro admin — E2E/D1 | PASS | Regressão admin no código vigente |
| G04 | Galeria e publicação — E2E | PASS | Estados draft/published/archived e capa |
| **G05** | **Upload confiável — bytes/retry** | **FAIL** | End-to-end remoto auth→intent→R2→Images→ready→download, bytes/hash/retry/concorrência; resolver 25MiB versus 20MB |
| G06 | JWT Access — testes criptográficos | PASS | RS256/JWKS, issuer/aud, exp/iat/sub/email/type negativos |
| G07 | OTP real — evidência real sanitizada | PASS histórico humano (desktop) | Não confundir com Android completo; revalidar ambiente antes do GO |
| G08 | Sessão segura — auth/revogação | PASS | Logout, versão, disabled, cookie replay, Access separadamente |
| G09 | Isolamento — matriz A/B | PASS | Contas/galerias/mídia/favoritos cross-client |
| G10 | Mídia privada — zero bytes indevidos | PASS | GET/HEAD, 404/0 bytes, optimizer, cache, flag-off |
| G11 | Favoritos — persistência E2E | PASS | Persistência local/QA e não revelação entre clientes |
| G12 | Downloads — API/UI | PASS | Original byte/hash e negação foreign |
| G13 | Frontend cliente — browser | PASS | Lightbox, teclado, foco, erro/empty/reload |
| G14 | Frontend admin — browser | PASS | Criação, upload, reorder, capa, publicação e estados |
| **G15** | **Acessibilidade — matriz assistiva** | **BLOCKED_EXTERNAL** | Android/iOS físicos, TalkBack/VoiceOver, 200% zoom, reduced motion, teclado, fotos/ações e resultados documentados |
| G16 | Não regressão pública — testes main | PASS | Comparar Studio/Colagem/hero/portfólio e rascunho; main atual antes de merge |
| **G17** | **CPU/custos — fontes/medição** | **FAIL** | CPU cold/MISS ≤10 ms Workers Free conforme evidência representativa e erros 0, além de quotas/custo/usage; cache HIT sozinho não passa |
| G18 | Backup/restauração — D1/R2 byte a byte | PASS de QA remoto isolado | Não extrapolar a restore remoto integral do produto atual |
| **G19** | **Segurança independente — sem P0/P1** | **BLOCKED_EXTERNAL** | Revisor independente autorizado, relatório completo e zero P0/P1 abertos |
| **G20** | **LGPD — aprovação estúdio** | **BLOCKED_EXTERNAL** | Decisão escrita da controladora sobre finalidade/base, retenção, exportação, exclusão, terceiros, incidentes e canal |
| G21 | PR integração — CI/revisão | PASS | CI final exata e revisão do diff/stack, sem confundir checkout de merge temporário |
| **G22** | **Release — autorização específica** | **BLOCKED_EXTERNAL** | Autorização explícita do proprietário para cada etapa R1/R2/R3 |
| **G23** | **Rollback — procedimento testado** | **BLOCKED_EXTERNAL** | Restore remoto/flag-off/config/Worker/Studio/Colagem, reabertura, sessões e bytes D1/R2 em QA |
| G24 | Handoff — relatório verificável | PASS histórico | Novo documento+goal e readback Git/Drive/Engram/PersistFlow |

**Gates técnicos prioritários:** G05, G17, G23. **Dependências humanas que o agente NÃO pode assinar:** G15 no dispositivo real, G19 revisão formal independente, G20 controladora, G22 proprietário. Além destes, reavaliar G01/G02/G16/G21 e as regressões da integração final.

## 6. Bloqueios — causas, donos e próximo passo executável
### G05 — integração real e tamanho
**Causa:** o Worker QA original não tinha `IMAGES`, e a conta Free tem 10/10 D1 ocupados; o probe de Images isolado passou, mas sem D1/R2. A SPEC 25MiB conflita com `IMAGES.input()` 20MB.
**Próximo passo:** inspecionar quotas/entitlement/current R2 em modo leitura; avaliar integração com D1 isolado sem tocar fixture histórico e sem custo, com escopo autorizado; resolver 25MiB por arquitetura compatível validada ou decisão formal expressa de alteração. Provar no **mesmo produto** fluxo OTP/JWT→admin intent→upload autorizado→R2→IMAGES→ready→thumbnail/download com SHA bytes, conflito/retry/duplicidade, falha parcial, cross-client, sem custo adicional. Se segregação impossível: manter FAIL e registrar bloqueio exato, sem inventar database extra.

### G17 — CPU/custo
**Causa:** SSR dinâmico Vinext na home fria gasta dezenas de ms de CPU e excede Workers Free 10ms por request; Workers Cache mitiga só HIT. Baseline de CPU não é latência HTTP.
**Próximo passo:** comparar opções R$0 (HTML/asset pré-renderizado em publicação, arquitetura estática versionada com invalidação e rollback, otimização SSR ou Hostinger *somente se capacidade/custo/integração comprovados*). Selecionar por testes, não preferência. Medir CPU em cold first-hit, purge/MISS, rotas privadas, admin, imagem, sessão, resposta 404/0 bytes e carga dentro do limite Free; registrar amostragem, erros, invocations, utilização/quotas e mecanismo anti-stale. A Cloudflare publica 10ms CPU por HTTP request Free: https://developers.cloudflare.com/workers/platform/limits/ . Não usar pago.

### G15 / G19 / G20 — humanos de verdade
**G15:** documentar matriz e coletar provas em dispositivos físicos + assistivas; emulação Chromium não supre. **G19:** revisor distinto do implementador, sem P0/P1, prova de runtime Access/cache/IDOR/logs e análise independente assinada. **G20:** Maria/controladora responde e aprova política LGPD versionada; agente não estabelece base legal/prazos por conta própria nem atesta aceite por silêncio. Registrar quem, papel, data, versão e evidência sanitizada. Exigências em `11-lgpd-decisions.md` e `security-review.md`.

### G23 — rollback remoto completo
Prova local de `60259da` é válida para lógica Studio/Colagem, mas não restaura deployment/Cloudflare real. Prova G18 de backup byte a byte é outro teste. Executar em QA remoto segregado e autorizado, com snapshot inicial, versão Worker previamente verificada, hashes e relações DB/R2, flag-off, revogação, retorno da versão/config anterior, negações mídia 404/0 bytes, reabertura validada, Site/Studio/Colagem sem regressão. Sem restaurar em D1 ocupado, deletar fotos reais ou executar migration reversa destrutiva.

### G22 — autorização específica de liberação
Solicitações genéricas de “terminar” autorizam trabalho técnico seguro, **não** merge/deploy/ativação para clientes. R1 integração PR, R2 deploy flag false, R3 ativação flag true exigem decisões separadas segundo `22 da SPEC. O proprietário fornece a aprovação específica depois dos gates; nenhuma aprovação foi observada.

## 7. Comandos, testes e disciplina de execução
No worktree correto e após checar `git status`:
```powershell
git fetch origin --prune
git status -sb
git rev-parse HEAD
git ls-remote origin refs/heads/fix/punctum-albums-r4-completion-20261107
npm ci
npm run typecheck
npm run lint
npm test
npx vitest run --config vitest.collage.config.ts
node --test scripts/r4-product-raster-validation.test.mjs scripts/r4-images-probe-worker.test.mjs scripts/r4-images-preflight.test.mjs
node --test scripts/r4-cpu-readonly.test.mjs
node --test scripts/r4-recovery-qa.test.mjs
npm run build
node --test scripts/ssr-route-imports.test.mjs
npm run test:e2e
npm audit --audit-level=low
git diff --check
```
Antes de qualquer teste E2E, usar Playwright Chromium instalado/CI; não confundir browser simulado com aparelhos físicos. A CI `.github/workflows/ci.yml` inclui testes adicionais além dos listados acima. **Não executar `npm run deploy`, `db:migrate:remote`, `restore:d1` ou workflows cloudflare de produção por automatismo.**

Para cada mudança de comportamento: teste RED → correção GREEN → refactor/regressão → lint/typecheck/build → CI exata → QA real isolado se autorizado → artefato auditável → atualização da matriz. Não apagar testes que falhem. Para uma integração final, comparar revisão/merge-base e evitar colisões de branches/worktrees.

## 8. Estado durável / continuidade
- Canonical ledger histórico: `docs/operations/private-albums-r4/execution-state.json` (**atualizado em 28/10**; é um snapshot, não o inventário atual da branch). Matriz original: `16-original-g01-g24-reconciliation.md`. Relatórios de continuidade `25` a `34`, principalmente `28` CPU, `29–31` cache, `32` Images, `33` rollback, `34` teto real.
- Drive **Sgtmenezes** → Punctum Picture: https://drive.google.com/drive/folders/1faquU27mdRUcmNn4iIOm4bcyjE34NVU4 . Último handoff anterior: https://docs.google.com/document/d/12oLVbThH1KUncV7XiYzRQ4L4MMprwoDJg0LZmyHBsSA/edit .
- Engram: conversa privada `conv_lP9LHRJ-nnMZnGPpUbavW`. Usar append + get readback, não criar narrativa contraditória.
- PersistFlow: run `punctum-r4-final-qa-20261028-cc33d21e`, geração 1; último checkpoint inspecionado com HEAD `baab1ba`, **checkpointOnly=true, takeover=false, automaticContinuation=false**. Não alegar persistência operacional ativa.
- Contexto de projeto vai ao **repo Punctum**, documentos/handoffs compartilhados ao **Drive Sgtmenezes**, episódio verificável ao **Engram** e continuidade ao **PersistFlow**. Segredos e dados de clientes nunca nesses locais. Não criar memória pessoal global para estados efêmeros de R4.

## 9. Como assumir de fato / próxima ação segura
1. Fazer readback do HEAD e git status; reler SPEC `23, tabela original, `execution-state.json`, PR #32, CI e este GOAL.
2. Reinspecionar Cloudflare **read-only** (plano Workers/Images, D1 10/10, uso, custo, R2, permissões, Worker QA) e validar a separação QA/prod. Nunca presumir recurso vazio.
3. Resolver tecnicamente G05 com cenário reproduzível para full end-to-end e o desvio dos 25MiB; registrar falhas sem apagar históricos.
4. Resolver G17 cold CPU em Free e validar no runtime real (não apenas cache HIT). Reexecutar G02/G16 e proteção Studio/Colagem.
5. Preparar/rodar G23 remoto isolado; consolidar matrix A/B, sessões, bytes/hash, backup.
6. Reunir G15/G19/G20 com responsáveis reais; **não assinar no lugar deles**.
7. Submeter PR/CI final e handoff. Só considerar R1/R2/R3 com aprovação específica G22 e sem gate crítico aberto.
8. Fechar a tarefa com relatório ``ESTADO / IMPLEMENTAÇÃO / TESTES / SEGURANÇA / OTP / DADOS / CUSTOS / GATES / BLOQUEIOS / RELEASE / NEXT_SAFE_ACTION``. Decisão fiel se falta gate: **NO_GO**, ainda que todos os testes automatizados tenham passado.

## 10. Critérios de parada e anti-fraude
Interrompa **a operação perigosa**, não todo o trabalho, se houver risco de vazamento privado, origem QA apontando à produção, segredo ausente/comprometido, custo pago, migration destrutiva, JWT sem validação, falha de isolamento, escrita remota sem permissão, risco ao Studio/Colagem ou conflito main. Não repetir a mesma tentativa falha sem fatos novos. **Não** declarar G05 PASS por probe de 1 PNG, G17 PASS por workflow verde/HIT, G15 PASS por emulação, G18 PASS como G23, G19 PASS por revisão do próprio autor, G20 PASS por minuta, G22 PASS por pedido geral de finalizar, G24 PASS por link sem readback.

**Última decisão verificável deste handoff:** **PRODUCTION_NO_GO**, 24 gates preservados, sem merge, sem deploy, sem atualização de plano, sem manipulação de fotografias reais. Este documento prepara o takeover; o GOAL companheiro é o contrato executável.
