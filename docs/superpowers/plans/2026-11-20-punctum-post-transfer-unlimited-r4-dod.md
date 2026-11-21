# Punctum Picture Post-Transfer Unlimited / R4 DoD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Recuperar a associação de punctumpicture.com ao Node existente na Hostinger Unlimited e produzir evidência verificável para dois releases distintos, mantendo a produção Cloudflare íntegra até as respectivas autorizações.

**Architecture:** Este é um plano complementar, não um novo projeto ou uma substituição do plano da PR #43. Reutilizar Node 24/Vinext/SQLite/Sharp, os preflights e os testes da PR #45, o staging existente e a origem D1/R2. Separar três estados que nunca podem ser confundidos: registro de domínio, autorização/associação ao site da hospedagem e roteamento TLS/DNS. Preparar o release público com R4 OFF e tratar o R4 ON como uma aprovação posterior independente.

**Tech Stack:** Node 24, Vinext, TypeScript, Vitest, Playwright, Python unittest, Hostinger Managed Node/Unlimited, Clerk, Cloudflare Workers/D1/R2/DNS, GitHub Actions.

**Spec:** docs/superpowers/plans/2026-11-20-punctum-unlimited-domain-unblock-and-r4-release.md; docs/operations/private-albums-r4/16-original-g01-g24-reconciliation.md; docs/operations/private-albums-r4/execution-state.json; docs/operations/private-albums-r4/88-cycle-ax-public-flag-and-domain-readback-2026-11-20.md; docs/operations/PUNCTUM-ROLLBACK.md. Issue #44: https://github.com/menezesx2k26-byte/lab-punctum-picture/issues/44.

## Global Constraints

- Planejamento apenas: nenhum merge, deploy, DNS/NS/TXT, transferência do registro, criação/remoção de sites, restore em dados reais, billing, alteração Clerk produção ou ativação R4 está autorizado por este documento.
- Preservar o Worker atual punctum-picture-migration, Studio, Colagem, originais D1/R2, cookies/sessões e o contrato de acesso público; não sacrificar comportamento existente para obter CI verde.
- Credenciais, ordens e identidade da conta devem coincidir: Unlimited = pedido 1008583103, usuário u775492464, site magic-lime-guanaco-79.hostingersite.com; Premium antigo = 1008628483, usuário u571409090. A sessão Hostinger genérica/Conthabil não comprova o estado da Unlimited.
- Registro na Unlimited já foi confirmado por preflight da credencial apropriada. NÃO solicitar nova transferência. O último resultado de associação é HTTP 200, is_accessible=false, TXT vazio; o 422 de move/incoming não qualifica status de transferência.
- Não usar login do Miranda nem credenciais de outros projetos. A diretriz de takeover de 21/11 autorizou a VPS 2135319 para QA Linux isolado com dados sintéticos. O destino dos releases permanece o Node gerenciado da Unlimited. Custo incremental permitido de R$ 0,00.
- Para código novo/correção: teste independente RED -> mudança mínima GREEN -> testes focados -> CI exato -> revisão de diff -> commit pequeno. Nunca afrouxar/reescrever assertivas somente para passar testes.
- Testes locais/sintéticos, retorno HTTP 200, portfólio de domínio Active e CI success não são sinônimos de homologação remota ou autorização de release. Preservar evidências vinculadas ao ambiente, hora UTC, SHA completo, responsável e limites da prova.
- Álbuns privados OFF por padrão no release público: PUNCTUM_CANDIDATE_PRIVATE_GALLERIES_ENABLED=false. Apenas o opt-in exato "true" habilita R4 em cenários isolados. Negar GET/HEAD anônimo ou de outro cliente, sem bytes privados e sem cache compartilhado.
- Readbacks do navegador: uma tentativa quando disponível; se indisponível, não trocar perfil repetidamente. API Unlimited em GitHub Actions e resposta do provedor formam o caminho crítico verificável.
- Trabalho humano/provedor é dependência externa. Não marcar PASS por intenção, resposta sem protocolo ou nota histórica. STOP do release bloqueado não significa STOP de tarefas independentes e seguras.

## Evidence Baseline (não reexecutar sem pergunta nova)

- PR #42 (base técnica), PR #43 (plano) e PR #45 (execução) abertas/draft; #45 HEAD 34465752e91a34c3f2c377df32162dad8a4491cf em 20/11/2026 BRT.
- CI https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44850160802: jobs verify e hostinger-node-qa completed/success nesse SHA; código do commit anterior 34dbd668af619c4f18854cc15de705c50dcb0fb5: Vitest 333, Colagem 7, managed Node 75 PASS/1 skip, Node QA 40, OFF 8 e opt-in 49 checks. Não qualifica TLS canônico, Clerk real ou restore remoto.
- Preflight https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44849256884: portfólio da Unlimited contém punctumpicture.com Active; associação is_accessible=false; challengeLength=0; correlation ID a3464ffe-28de-4c01-8ff8-ca32b6f356a9. Consulta incoming com force_sync retornou HTTP 422 indeterminado.
- DNS último fingerprint 4eaec7ca0018c0b77ba668f1829338631399fb91d65686e5282859e6af9cce19, apex/www no Worker Cloudflare à época; exigir novo readback antes de decisão.
- Delta atual https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44849256823: 230 originais, 372.040.548 bytes, fonte sem escrita/freeze. Artefato temporário não é backup persistente nem importação/restauração.
- scripts/live-parity-audit.mjs registrou divergências HTTP no staging: /api/public/site (10), stats (3), albums (45), archive atingiu teto de 300; home, sitemap e robots também diferem. Não foi feita comparação administrativa autenticada.

## File and Responsibility Map

| Responsabilidade | Arquivos existentes a reutilizar |
| --- | --- |
| Diagnóstico de conta e domínio | scripts/punctum-hostinger-account-preflight.py, scripts/punctum_hostinger_account_preflight_test.py, .github/workflows/punctum-hostinger-account-preflight.yml |
| Registro/DNS sem escrita | .github/workflows/punctum-dns-preflight.yml, issue #44; .github/workflows/punctum-domain-ownership.yml É de escrita e NÃO pode ser disparado sem autorização |
| R4 OFF e rotas candidatas | services/punctum-hostinger-production/candidate-runtime.mjs, services/punctum-hostinger-production/candidate-runtime.test.mjs, scripts/hostinger-r4-25mib-local-proof.mjs |
| Comparação pública | scripts/live-parity-audit.mjs, testes de rotas públicas já existentes em app/ e worker/ |
| Backup/exportação/restore | .github/workflows/punctum-source-delta-preflight.yml, scripts/hostinger-managed-export.mjs, scripts/r4-g18-local-sqlite-restore-demo.mjs, docs/operations/PUNCTUM-ROLLBACK.md |
| Ledger e revisão | docs/operations/private-albums-r4/execution-state.json, relatório 88, PR #42/#43/#45, documentação G19/G20 já existente |

O executor verifica a existência e a assinatura de qualquer helper adicional antes de citá-lo ou modificá-lo; nenhuma interface nova é pressuposta. Não criar wrappers, scripts, workflows ou documentação redundantes para substituir ferramentas existentes.

## Review Focus (5 falhas de alto risco e o teste que as cobre)

1. Credencial de conta errada com token válido: Task 1 deve testar que pedido/username/site divergentes falham fechados, sem emissão de comando de binding.
2. Domínio Active mas hospedagem recusa e não emite TXT: Task 1 deve confirmar status BLOCKED_PROVIDER_NO_CHALLENGE, challengeLength=0 e zero alterações DNS; Task 2 não promove a vínculo comprovado.
3. Release público expõe /albuns ou mídia privada: Task 4 deve executar o modo --public-release-check e exigir 404/zero bytes/cache no-store com flag ausente/false; somente "true" permite teste R4.
4. Exportação estável mas escrita concorrente depois do snapshot: Task 5 deve comparar delta e manifestos antes de qualquer corte; nenhuma alegação de zero perda sem controle de freeze/replay e restore descartável.
5. Usuário A acessa mídia/área de B ou sessão antiga: Task 6 exige matriz real/sintética separadas, GET e HEAD zero bytes após logout/rebind e validação de cookies/Clerk por identidade correta.

---

### Task 0: Reconciliar baseline e não duplicar trabalho já aceito

**Files:** Read docs/operations/private-albums-r4/88-cycle-ax-public-flag-and-domain-readback-2026-11-20.md; docs/operations/private-albums-r4/execution-state.json; docs/superpowers/plans/2026-11-20-punctum-unlimited-domain-unblock-and-r4-release.md. Write apenas nota mínima/ledger se surgir evidência nova.

**Interfaces:** Produces matriz verificável (SHA, source, account, env, provider state, owner, timestamp) consumida pelas Tasks 1–8.

- [ ] **Step 1:** Observar git status --short, git rev-parse HEAD e heads/bases atuais das PRs #42/#43/#45; se HEAD mudou, revalidar código e prova, sem reset/stash.
- [ ] **Step 2:** Ler ledger G01–G24 e marcar separadamente provas locais, staging remoto, produção e aprovações; não converter histórico em PASS atual.
- [ ] **Step 3:** Ler CI 44850160802 no HEAD completo e artefatos das execuções 44849256884 / 44849256823, comparando conteúdo, SHA e ambiente. Não repetir preflight sem diferença material.
- [ ] **Step 4:** Confirmar novamente a origem pública Cloudflare por leitura DNS e HTTPS, sem escrita; se fingerprint divergir, interromper somente decisões de cutover e registrar drift.
- [ ] **Step 5:** Produzir uma única matriz incremental em registro operacional existente, git diff --check e commit documental isolado se houver fatos novos. DoD: nenhum estado inferido, nenhum segredo serializado e sem efeito em main/produção.

### Task 1: Validar diagnóstico da conta correta e a divergência domínio/hospedagem

**Files:** scripts/punctum-hostinger-account-preflight.py; scripts/punctum_hostinger_account_preflight_test.py; .github/workflows/punctum-hostinger-account-preflight.yml.

**Interfaces:** Consumes perfil fixo Unlimited; produces domínio Active + associação acessível/não acessível, challengeLength, erro/status e correlation IDs sanitizados. Não fornece vínculo Node apenas com portfólio Active.

- [ ] **Step 1:** Inspecionar os testes preexistentes, inclusive mismatch, http 422 e challenge vazio. Se um cenário do Review Focus não estiver coberto, escrever um teste RED com entradas sintéticas e assertivas de FAIL-CLOSED/zero DNS writes. Não mexer em testes se já cobrirem o contrato.
- [ ] **Step 2:** Executar: python -m unittest discover -s scripts -p punctum_hostinger_account_preflight_test.py -v. Para teste novo, observar FAIL por comportamento ausente, não erro de fixture.
- [ ] **Step 3:** Somente diante de falha reproduzida, corrigir a função existente build_report() em scripts/punctum-hostinger-account-preflight.py, preservando TARGETS, segredo fixo HOSTINGER_UNLIMITED_API e whitelist de dados.
- [ ] **Step 4:** Rodar novamente unittest e git diff --check. Usar workflow read-only existente, fixado em SHA da branch e target unlimited, quando necessário; conferir contas/order/site e artifacts sanitizados.
- [ ] **Step 5:** Registrar resposta com HTTP, origin/target, valor de is_accessible, challengeLength, correlation ID e ticket (se existir). Commit de código apenas se houve TDD verdadeiro. Aceite: Active sozinho NÃO libera Task 3; HTTP 422 de incoming não é interpretado como pendência de transferência.

### Task 2: Reconciliação com Hostinger, sem transferência e sem DNS prematuro

**Files:** Issue #44 (canônica), relatório incremental somente se resposta nova. Sem mudanças de produto.

**Interfaces:** Consumes provas da Task 1; produces resposta oficial de associação ao site existente ou ticket de suporte em aberto com ação de terceiro claramente identificada.

- [ ] **Step 1:** Consultar uma vez a associação no contexto Unlimited correto e distinguir portfólio/registrador, site Node e alias. Caso o Browser nativo continue indisponível, anotar erro e usar API/provedor, sem mudar perfil.
- [ ] **Step 2:** Se is_accessible=false e TXT vazio, NÃO rodar .github/workflows/punctum-domain-ownership.yml nem inventar registro TXT; atualizar issue #44 somente com evidência nova e IDs de correlação.
- [ ] **Step 3:** Preparar, com base no texto já registrado na #44, pedido de liberação/reconciliação de punctumpicture.com ao site magic-lime-guanaco-79.hostingersite.com, pedido 1008583103. Preservar os dados e nameservers Cloudflare; não solicitar nova movimentação do registro.
- [ ] **Step 4:** Encaminhar suporte somente com autorização de contato e capacidade autenticada. Registrar protocolo/retorno real, nunca declarar enviado se apenas redigido; se depender de agente da Hostinger, estado BLOCKED_PROVIDER e continuar Tasks 4–6 independentes.
- [ ] **Step 5:** Após confirmação do provedor, repetir UMA verificação direcionada pela Unlimited e demonstrar o vínculo efetivo do domínio com o Node exato. Teste negativo: domínio apenas Active, check acessível ou resposta sem site associado NÃO satisfaz o DoD de binding.

### Task 3: Provar domínio associado, TLS e origem sem roteamento público

**Files:** Usar preflights existentes e docs/operations/PUNCTUM-ROLLBACK.md; serviços/candidate-runtime somente se regressão real.

**Interfaces:** Consumes prova de Task 2; produces identidade do site, configuração TLS/Host, certificados válidos para apex e www ou plano de cutover com bloqueio explícito de TLS.

- [ ] **Step 1:** Gate: não avançar sem prova da associação ao mesmo Node, sem usar apenas hostingersite.com como evidência.
- [ ] **Step 2:** Inspecionar configuração e método suportado pela Hostinger para custom domain, TLS, alias www e validade de certificado antes da troca de tráfego. Não emitir certificado por método que exija troca de produção não autorizada.
- [ ] **Step 3:** Exercitar, somente em teste controlado, Host, www redirect e expected origin; executar node --test services/punctum-hostinger-production/candidate-runtime.test.mjs.
- [ ] **Step 4:** Verificar Cookie Secure/SameSite, Clerk origin/redirect, CSP/CORS/CSRF, canonical, sitemap, robots e noindex em staging. Testar zero vazamento de rotas privadas com flag OFF.
- [ ] **Step 5:** Anexar resposta HTTPS comprovada para host canônico ou registrar bloqueio do TLS até janela de release; nunca marcar produção pronta somente por cert do domínio temporário.

### Task 4: Eliminar divergências da aplicação pública mantendo R4 OFF

**Files:** scripts/live-parity-audit.mjs; services/punctum-hostinger-production/candidate-runtime.mjs e seus testes; módulos públicos existentes conforme ownership real. Não criar segunda aplicação.

**Interfaces:** Consumes staging e origem Cloudflare; produces diffs classificados por conteúdo obsoleto, erro de adaptação, ambiente ou diferenças aceitáveis documentadas, mais prova funcional de Studio/Colagem.

- [ ] **Step 1:** Executar auditoria de paridade pública existente em ambiente isolado, com PROD_ORIGIN=https://punctumpicture.com e DEST_ORIGIN=https://magic-lime-guanaco-79.hostingersite.com; capturar somente dados públicos/sanitizados. Compare os paths já instrumentados e baseline do relatório 88.
- [ ] **Step 2:** Para cada divergência relevante, escolher o dono real: snapshot/delta ainda não importado (Task 5), configuração pública, SSR/SEO ou bug de código. NÃO corrigir um snapshot ausente mudando expectativas dos testes.
- [ ] **Step 3:** Para bug de código reproduzido, adicionar assertiva RED no teste existente correspondente, executar FAIL, corrigir a menor fonte, e executar GREEN. Não alterar CSS/UI em massa, bibliotecas nem autenticação sem contrato.
- [ ] **Step 4:** Executar npm run typecheck, npm run lint, npm test, npm run build:hostinger:managed-runtime, node --test services/punctum-hostinger-production/candidate-runtime.test.mjs e node scripts/hostinger-r4-25mib-local-proof.mjs --public-release-check. Esperado: private OFF, /albuns e mídia privada 404, zero bytes indevidos, 8 checks públicos ou mais sem regressão.
- [ ] **Step 5:** Provar Studio/Colagem autenticados no QA autorizado, SEO/robots e mobile com comparação real, não apenas título/status de login. Revalidar CI no novo SHA e registrar limites de latência/capacidade/custo antes de classificar paridade PASS.

### Task 5: Dados atuais, backup retido, restore remoto e delta sem perda

**Files:** .github/workflows/punctum-source-delta-preflight.yml; scripts/hostinger-managed-export.mjs; scripts/r4-g18-local-sqlite-restore-demo.mjs; docs/operations/PUNCTUM-ROLLBACK.md; ferramentas de importação existentes descobertas antes da execução.

**Interfaces:** Consumes manifestos D1/R2/SQLite e versões do app; produces prova de contagem+SHA byte a byte, backup fora do deploy, restore/reopen e RPO/RTO medidos.

- [ ] **Step 1:** Confirmar delta atual de 230 originais/372.040.548 bytes como inventário, não backup. Reusar workflow de leitura; atestar ausência de escrita e escopo de tabelas, incluindo site_media e backup_runs.
- [ ] **Step 2:** Selecionar destino descartável autorizado, vazio e isolado. Verificar primeiro se script de importação/restauração existente suporta esse destino e falha fechado em caminho ocupado. Não escrever na D1/R2 origem nem no DB de staging compartilhado com dados.
- [ ] **Step 3:** Provar importação em QA isolado, cada key/size/SHA-256 e relacionamentos SQL/ACL; exercitar reinicialização/rebuild, backup persistente e restore completo de DB+originais com hashes idênticos. Nunca equiparar bundle cifrado efêmero a backup retido.
- [ ] **Step 4:** Projetar e ensaiar delta final e controle de escrita concorrente (freeze ou replay), medindo RPO/RTO e distinguindo reversão de tráfego da reconciliação de dados. Usar versões confirmadas, sem inventar comandos de rollback.
- [ ] **Step 5:** Registrar G18 e G23 separadamente com SHA, ambiente, hashes, reabertura de Studio/Colagem e sessões revogadas. Se qualquer um faltar: BLOCKED, não autorizar cutover.

### Task 6: QA real de Clerk/R4, segurança independente e acessibilidade

**Files:** testes Clerk existentes, worker/auth/clerk-auth.ts, worker/client/clerk-pilot.ts, documentação G19 e G20, ledger. Descobrir nomes reais de testes antes de alteração.

**Interfaces:** Consumes QA de origem/dados confiável; produces resultados de OTP real na organização Punctum Picture, deny matrix, aprovação independente e decisão LGPD atribuída.

- [ ] **Step 1:** Confirmar organização/instância Clerk Punctum e origens permitidas, sem tocar Miranda. Identidades sintéticas autorizadas para admin e clientes A/B. Registrar o máximo de duração de sessão do provedor realmente vigente.
- [ ] **Step 2:** Testar OTP, JWKS issuer/audience/sid, expiração, logout, rebind, acesso do cliente A aos IDs de B (deny), GET/HEAD de mídia, Cache-Control private/no-store, sem tokens ou OTP em artefatos.
- [ ] **Step 3:** Executar upload PNG original de 26.214.400 bytes, limite +1, interrupção/retry, SHA exato, restart e matriz de permissões. Preservar distinção entre prova sintética já feita e prova com provedor Clerk real.
- [ ] **Step 4:** Revisor independente avalia SHA de release, autenticação e dados; pessoas autorizadas testam TalkBack/VoiceOver físicos; responsável pelo estúdio decide LGPD/retention. Agente não se autoaprova em G19/G20.
- [ ] **Step 5:** Só marcar G07/G08/G15/G19/G20 quando evidências reais e assinaturas/decisões existirem. Não ativar R4 por CI verde, nem criar contas reais sem autorização.

### Task 7: Dois pacotes de release com gates independentes e STOP explícito

**Files:** docs/operations/private-albums-r4/execution-state.json; runbook PUNCTUM-ROLLBACK.md; plano mestre da PR #43 e PRs stacked. Nenhuma alteração de produção nesta task sem aprovação separada.

**Interfaces:** Consumes outputs de Tasks 0–6; produces dois pacotes verificáveis, cada qual com GO/NO_GO, owner, SHA e autorização distinta.

- [ ] **Step 1:** Pacote A = site público na Hostinger. Exigir associação + TLS + paridade Studio/Colagem/SEO, dados/restauração/rollback, limites/custo, CI exato e flag OFF. A condição de entrada é que todas as provas sejam do release efetivo, não do staging antigo.
- [ ] **Step 2:** Inspecionar workflows de main antes de qualquer merge, inclusive efeitos de deploy e migrações D1. Colocar DNS/merge/cutover sob autorização explícita específica; enquanto ausente, A = NO_GO.
- [ ] **Step 3:** Pacote B = ativação privada posterior. Exigir G01–G24 canônicos aplicáveis com auth real, controle LGPD, avaliação independente, acessibilidade, dados e rollback. Autorização A nunca autoriza B.
- [ ] **Step 4:** Para cada pacote registrar operador, exato SHA, ambiente, provas, condição de rollback, janela, monitoramento e custo R$ 0,00. Não gravar approval presumido.
- [ ] **Step 5:** Entregar matriz GO/NO_GO; não executar os releases durante a elaboração do plano. Se um bloqueio externo permanecer, manter produção Cloudflare e continuar apenas tarefas independentes seguras.

### Task 8: Continuidade e checkpoint rastreável

**Files:** ledger canônico execution-state.json e uma nota de ciclo apenas se necessário; PR #45, issue #44. Drive/Engram/PersistFlow apenas no workflow de execução após outputs reais.

**Interfaces:** Produces handoff que distingue "planejado", "executado", "testado", "aprovado" e "implantado".

- [ ] **Step 1:** Reconciliar branch/HEAD, novas evidências, estado de cada Task e G01–G24, linkando CI/artifacts e ticket Hostinger real.
- [ ] **Step 2:** Registrar somente decisões verificadas no repositório; preservação de estado de projeto primeiro, sem memória especulativa ou segredos.
- [ ] **Step 3:** Quando o fluxo exigir handoff compartilhado, gravar em Drive sgtmenezes e verificar readback; Engram/PersistFlow somente com confirmação de persistência, nunca por intenção.
- [ ] **Step 4:** Finalizar relatório RESULT / CHANGES / VALIDATION / GATES / BLOCKERS / COST / PRODUCTION / NEXT_SAFE_ACTION. Estado COMPLETED_VERIFIED somente após os dois releases efetivamente autorizados e verificados.

## Dependencies and Safe Stop Rules

- **Trilha do domínio:** Task 0 → 1 → 2 → 3. Bloqueio do provedor não justifica alterar DNS nem refazer movimentação de registro.
- **Trilhas paralelas seguras:** Tasks 4/5/6 avançam em QA isolado sem fazer parecer que o domínio/TLS foi resolvido.
- **Release A (público):** Tasks 3 + 4 + 5 + revisão apropriada + autorização específica → Task 7A.
- **Release B (R4):** Tasks 5 + 6 + todos os G01–G24 aplicáveis + autorização separada → Task 7B, depois do release público.
- **Checkpoint:** Task 8 ao concluir cada incremento realmente verificado. Provas históricas não são reemitidas sem necessidade.

**Immediate next safe action:** na credencial Unlimited já confirmada pelo workflow, distinguir registro Active de vínculo ao site Node. Como a última associação foi recusada sem desafio TXT, concentrar a ação externa na issue #44 e na reconciliação pela Hostinger, sem duplicar portfólio, não usar a credencial Premium e sem mutar Cloudflare.

**Verdict at plan authoring:** PARTIAL_VERIFIED / BLOCKED_PROVIDER / PRODUCTION_NO_GO. Um arquivo de plano não satisfaz nenhum gate de release.

## Handoff de QA auxiliar de 21/11/2026

O runner `codex-qa` da VPS está provisionado. A chave SSH dedicada só aceita `smoke` e a senha da conta está bloqueada. O instalador versionado é `scripts/punctum-vps-qa-bootstrap.sh`. Em uma retomada, verifique os recursos e o serviço existente antes de usar o instalador. Ele recusa a substituição de identidades ou arquivos existentes.

Para uma execução de rotina, use a chave dedicada e o arquivo que contém a chave ED25519 do host verificada. Defina `UserKnownHostsFile`, `StrictHostKeyChecking=yes`, `IdentitiesOnly=yes` e `BatchMode=yes` na chamada `ssh`. Passe `smoke` como único comando da conta `codex-qa`. O campo `source_sha` liga o resultado à árvore carregada. O código de saída 0 exige os testes de paridade, restore SQLite, Sharp e a decodificação do fixture. O ledger registra o SHA, os hashes e os limites medidos.

Para atualizar a árvore, o operador de provisionamento prepara um `git archive` de fontes e fixtures sintéticas do SHA aprovado e confere seu SHA-256 na VPS. Alterações no lockfile exigem revisar os artefatos Linux e verificar sua integridade antes de carregá-los. A configuração root-owned usa `/opt/punctum-vps-qa/root/qa/release`. Atualize somente com o socket de QA ocioso e publique o `source-sha` após instalar os arquivos. Execute o smoke com a conta dedicada. Builds, Chromium e a prova HTTP completa de upload seguem na CI.

As duas fases seguem `NO_GO`. O próximo passo externo continua na issue #44. Aguarde confirmação de associação ao Node existente antes de novo preflight da Unlimited.
