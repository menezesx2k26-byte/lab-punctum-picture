# Punctum Picture — LUNA Gate Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar o fechamento técnico seguro do Punctum Picture sem recriar trabalho, perder o WIP de Clerk, confundir provas sintéticas com homologação gerenciada ou liberar prematuramente os dois releases.

**Architecture:** A PR #45 e seu ledger G01–G24 continuam sendo a linha de integração. O trabalho Clerk ainda não commitado é uma linha independente a reconciliar, nunca fonte para sobrescrever a PR. Cloudflare permanece produção; Hostinger Unlimited é o destino Node gerenciado; a VPS 2135319 é QA auxiliar, não o destino. Release A (público, R4 OFF) e Release B (álbuns privados) têm DoDs e autorizações separadas.

**Tech Stack:** Git/GitHub Actions, Node 24, Vinext/React/TypeScript, Vitest, Playwright, Cloudflare Workers/D1/R2, Hostinger Unlimited Node, SQLite/Sharp, Clerk, Python 3.

**Spec:** `docs/superpowers/plans/2026-11-21-punctum-continuation-bh-tasks-gates.md`, `docs/operations/private-albums-r4/16-original-g01-g24-reconciliation.md`, `docs/operations/private-albums-r4/execution-state.json`, `docs/superpowers/plans/2026-11-20-punctum-unlimited-domain-unblock-and-r4-release.md`. Design original: `docs/superpowers/specs/2026-10-22-punctum-client-albums-design.md` **se existir na revisão**, senão ler a referência do Drive listada no plano de 20/11; não fabricar caminho.

## Global Constraints

- **Hierarquia de autoridade:** instrução expressa do proprietário > design/decisões aprovados > plano BH + este adendo para execução > contrato original G01–G24 > ledger de estados no HEAD > código/CI testados no SHA correspondente > notas históricas. Nenhum plano altera sozinho a definição canônica de um gate, nem promove o status sem prova.
- **Fonte de estados:** `docs/operations/private-albums-r4/execution-state.json`, preservar `currentCycle20261121AY.gateRecords` e as entradas posteriores; o checkpoint BH é um recibo histórico e não substitui novo readback. Estado observado em 22/11: G01/G24 PASS, G16 FAIL, demais HOLD/BLOCKED/NOT_VERIFIED. Revalidar antes de usar.
- **Baseline observada (não fixada):** worktree isolado `C:\Users\Pichau\.codex\worktrees\punctum-unlimited-release\Punctum Picture`; branch `codex/punctum-unlimited-release-20261120`; HEAD `4acf051a66672c96ab04031f9bab120be9255867`, após código qualificado `f020e1b1a1e1667029fc0bb50c7073d23a117d79`. Reconfirmar `HEAD` e upstream antes de editar.
- **WIP observado (não ingerir automaticamente):** `C:\Users\Pichau\Documents\ChatGPT\Punctum Picture`, branch `agent/punctum-clerk-auth/20261121-045514`, HEAD `b417405c0406daf286b192a8151cf45c4a50f89c`, 31 caminhos alterados/não rastreados no status observado em 22/11. Preservar alterações, índice, untracked, worktrees e histórico; proibir `reset --hard`, `clean -fd`, stash destrutivo e cópia de diretório por cima.
- O repositório canônico é `menezesx2k26-byte/lab-punctum-picture`, não confundir clones ou repos com nome semelhante. A branch `chore/punctum-d1-audit-recovery-20261122` está baseada em candidato antigo; seu importador D1 **não entra automaticamente** na integração da PR #45.
- **Bloqueio externo:** issue #44. Registro `punctumpicture.com` Active na Unlimited não significa associação ao Node `magic-lime-guanaco-79.hostingersite.com`. `is_accessible=false` e TXT vazio não autorizam fabricar desafio, repetir transferência ou editar DNS. Só reconsiderar depois de fato novo verificado do provedor.
- **Sem autorização específica:** não fazer merge, deploy produtivo, DNS/NS/TXT, cutover, contratação, alteração Clerk Production, ligação de flag R4, migração/restauração em banco ocupado, exclusão de dados ou contato com suporte. Custo incremental autorizado R$ 0.
- Guardas: `PUNCTUM_CANDIDATE_PRIVATE_GALLERIES_ENABLED=false` no Release A; `CLERK_PILOT_ENABLED=false` até decisão própria. Auditoria/sessão reais, backup offsite e reversibilidade têm de ser certificados separadamente.
- Reutilizar skills e testes já existentes. Não executar matriz inteira, clonar tudo, iniciar agentes paralelos, builds WSL ou QA VPS por hábito; usar testes focados e CI do SHA alterado. Verificar quota/contexto antes de uma execução pesada.
- Ao encontrar `BLOCKED_PROVIDER` ou `BLOCKED_EXTERNAL`, marcar **só** a ação dependente como bloqueada; continuar entregáveis independentes, com um único `NEXT_SAFE_ACTION` por dependência.

## Review Focus

1. **Dois worktrees com mudanças Clerk sobrepostas:** um merge/cópia apaga decisões ou produz autenticação híbrida. Testar inventário por arquivo, três versões base/WIP/integração, invariantes de sessão e diff sem tocar no WIP.
2. **Domínio Active sem associação e sem TXT:** reexecução de ownership ou DNS incorreto afeta produção. Testar `no TXT`/conta errada ⇒ `BLOCKED_PROVIDER` sem escrita.
3. **Snapshot consistente com escrita concorrente:** rollback apenas de DNS perde dados posteriores. Testar delta, restore reverso remoto segregado e sessão invalidada, ou manter G18/G23 bloqueados.
4. **Clerk/Access e mídia privada cruzando origens:** login válido não certifica ACL. Testar A/B/anon GET e HEAD, zero bytes indevidos, revogação e cache `private, no-store` na origem correta.
5. **CI verde com SHA/ambiente/checkout equivocados:** um artefato sintético/dirty não qualifica a Hostinger. Testar paridade SHA, `sourceSha`, ambiente gerenciado, lista de skips e limites de prova antes de promover gates.

## Task LC0: Reconciliar baseline e dependências sem alterar o produto

**Files:** Read `docs/operations/private-albums-r4/execution-state.json`, `docs/operations/private-albums-r4/89-cycle-be-vps-parity-sitemap-2026-11-21.md`, `docs/superpowers/plans/2026-11-21-punctum-continuation-bh-tasks-gates.md`; update a próxima nota numerada **apenas se houver fato novo**.

**Interfaces:** Produz `baseline.json` SANITIZADO (SHA, refs, paths sem conteúdo privado, WIP count, CI/ambiente/prova/bloqueio) para LC1–LC6.

- [ ] **Step 1: Ler os dois worktrees e upstream.** Executar `git status --porcelain=v1 --untracked-files=normal`, `git rev-parse HEAD` e `git branch -vv` em cada diretório; conferir PR #45, issue #44, HEAD remoto e ações em curso. Resultado: tabelas separadas, nenhum WIP perdido.
- [ ] **Step 2: Conferir proveniência.** Ler a CI `44889674474` do código `f020e1b1` (ambos jobs PASS) sem atribuí-la automaticamente ao novo HEAD; reconhecer `checkoutDirtyAtRun=true` nos artefatos anteriores e `managedQa=NOT_TESTED`. Resultado: cada evidência ligada a SHA e ambiente exato.
- [ ] **Step 3: Testar negativa de pré-condição.** Se remoto divergiu ou outro executor possui lease/lock, proibir escrita e produzir `BASELINE_CONFLICT` com SHA observado. Revalidar após resolver o conflito, jamais force-push.
- [ ] **Step 4: Registrar e commitar somente a nota factual** no worktree da PR #45, caso haja diferença; validar `git diff --check` e `git status`. Não alterar ledger por mera releitura.

## Task LC1: Integrar o WIP Clerk por contrato, não por cópia

**Files:** Read-only WIP nos caminhos `app/acesso/`, `app/albuns/`, `app/admin/`, `worker/api/`, `worker/client/`, `worker/utils/`, `package.json`/`package-lock.json`, `vite.config.ts`. Testes existentes: `tests/integration/clerk-pilot.spec.ts`, `tests/integration/client-access.spec.ts`, `tests/integration/client-admin-audit.spec.ts`. Alterações futuras somente em branch isolada derivada do HEAD da PR #45.

**Interfaces:** Produz tabela `WIP_DISPOSITION` por caminho (`REUSE`, `ADAPT`, `DUPLICATE`, `CONFLICT`, `UNSAFE`), contrato de modo legado/Clerk/Access e SHA do patch integrado.

- [ ] **Step 1: Teste de preservação.** Medir `git status` e hashes de diff/arquivos WIP no checkout original antes de qualquer modificação; ao final, verificar fingerprints iguais. Não capturar segredos ou diffs privados em artefatos públicos.
- [ ] **Step 2: Reconciliação de três vias.** Comparar merge-base, HEAD do WIP e HEAD PR #45 por arquivo/comportamento; registrar decisões para frontend/login, handlers, cookies, autorizadores, sessão, redirects, pacote, migrations e flags. Se houver mudanças sem contrato de identidade aprovado, `CONFLICT`, sem aplicar.
- [ ] **Step 3: Teste RED mínimo em integração isolada** para cenário escolhido: modo legado quando piloto OFF; token/JWKS/azp/sid inválidos negados; logout/revogação/disable; dois clientes A/B; GET/HEAD indevidos sem bytes. Executar `npm test -- tests/integration/clerk-pilot.spec.ts tests/integration/client-access.spec.ts tests/integration/client-admin-audit.spec.ts`. Anotar caso que falha por comportamento, não por fixture.
- [ ] **Step 4: Implementação mínima** somente do comportamento REUSE/ADAPT autorizado, sem trocar globalmente login ou habilitar Clerk Production. Rerodar os três testes, `npm run typecheck`, ESLint focado e `git diff --check`; só então commitar patch isolado. Enviar à PR de integração por merge regular/review, nunca cherry-pick cego de WIP.
- [ ] **Step 5: Revisão de identidade.** Mapear explicitamente incompatibilidades senha inicial/troca forçada da SPEC original versus OTP/Clerk atual; decisão de produto/segurança precisa constar antes de substituir fluxos. Sem decisão, preservar modo legado e G06–G10 HOLD/BLOCKED.

## Task LC2: Delimitar recuperação D1 e fechamento de auditoria administrativa

**Files:** `docs/operations/PUNCTUM-ROLLBACK.md`, `worker/api/client-admin.ts`, `worker/utils/audit.ts`, `tests/integration/client-admin-audit.spec.ts`, utilitário recuperado `deploy/vps-qa/audit-d1-import.py` na branch histórica separada.

**Interfaces:** Produz matriz `G18_EVIDENCE` (checksum/row-count/FK/audit), `ADMIN_AUDIT_MATRIX` (mutation/trace/rollback/retry) e nenhuma declaração de restore remoto sem recibo.

- [ ] **Step 1: Comparar antes de integrar.** Para o auditor D1 antigo, verificar `merge-base`, conteúdo e testes existentes no HEAD PR #45; marcar `REDUNDANT` ou `PORTABLE`. Um teste unitário local com SQL sintético não comprova snapshot atual nem G18, G23.
- [ ] **Step 2: Escolher um mutation-then-audit ainda residual** do inventário BH; adicionar teste que injeta falha no audit INSERT depois de preparar alteração, exige HTTP 500, estado integral idêntico, zero evento persistido, retry atribuído exatamente uma vez. Não duplicar a correção Access já validada.
- [ ] **Step 3: Rodar RED, implementar a menor transação D1** usando `prepareAudit`/`batch` compatíveis, rodar GREEN em `npm test -- tests/integration/client-admin-audit.spec.ts` e testes de rota adjacentes, typecheck e lint focado. Commit pequeno, review delimitado; G19 formal continua HOLD.
- [ ] **Step 4: Se o auditor D1 fornecer valor novo**, integrar adaptado com teste próprio no ramo atual e manter caches `__pycache__/` fora do commit. Sem valor incremental, não tocar. O importador não escreve origem Cloudflare e não pode ser apontado a banco de produção.

## Task LC3: Paridade pública mensurável e G16/G17

**Files:** `scripts/live-parity-audit.mjs`, testes públicos já existentes, relatório em `docs/operations/private-albums-r4/`. Não assumir opções CLI não documentadas: inspecionar o contrato do script antes de executar.

**Interfaces:** Produz `PUBLIC_PARITY_REPORT` e `PERFORMANCE_BASELINE` com SHA, URLs/origens, amostra, percentis, recursos, custos, falhas e limiares aprovados/propostos distintos.

- [ ] **Step 1: Escrever testes negativos/focados** para host/canonical/sitemap (loc sem filhos), Hero/Studio/Colagem/portfólio, e /albuns + APIs/mídia privada no Release A OFF. Reproduzir eventual 30x indevido ou conteúdo discrepante antes do patch.
- [ ] **Step 2: Corrigir somente diferenças comprovadas**, mantendo fotos, SEO, assets, editor e fluxos atuais; rerodar testes focados e CI no SHA exato. Não confundir ambiente sintético/VPS com Node gerenciado Unlimited.
- [ ] **Step 3: Especificação de medição reprodutível.** Em QA autorizado, coletar p50/p95 por rota (home, portfólio, arquivo, health, login/Studio, mídia/Sharp), erro HTTP, cold-start, throughput, RAM, disco, CPU, processo, latência de upload, cron e disponibilidade de logs. Comparar mesmas condições de carga/tempo entre Cloudflare e Unlimited. Plano de coleta inicial: até 10 aquecimentos + 50 requisições medidas por rota/origem, concorrência máxima 2, taxa limitada; parar por degradação, rate limit, custo ou autorização. **Esta amostra NÃO qualifica p99**: para p99, planejar amostra maior e orçamento aprovado.
- [ ] **Step 4: Fixar critério antes de pontuar G17.** Confrontar medidas com cotas e custo real do plano. Publicar orçamento, p95 alvo, erro máximo e margem de recursos como **PROPOSTA** até aceite específico; não inventar SLA/limiar já aprovado. Zero vazamento privado e zero aumento não autorizado de custo são invariantes, não proposta.
- [ ] **Step 5: Gate.** G16 só PASS após paridade real de páginas, dados, conteúdo público e R4 OFF no destino gerenciado exato. G17 só PASS com medição suficiente, critério aceito e capacidade/custo assinados. Se associação/TLS bloqueia o alvo, registrar `BLOCKED_PROVIDER`, não `PASS_SYNTHETIC`.

## Task LC4: Restore reverso remoto, delta final e rollback após novas escritas

**Files:** `docs/operations/PUNCTUM-ROLLBACK.md`, adaptadores existentes D1/R2/SQLite, `scripts/r4-g18-local-sqlite-restore-demo.mjs` quando existir; ledger G18/G23.

**Interfaces:** Produz dois recibos independentes `RESTORE_REMOTE_G18` e `ROLLBACK_REMOTE_G23`; cada um contém origem/destino, propriedade, `eligibleWriteTargets`, snapshot SQL, R2 manifest SHA/bytes, row counts, FK, sessões, novos writes e ambiente.

- [ ] **Step 1: Teste de segurança da seleção de destino.** `eligibleWriteTargets=0`, ownership ambíguo ou banco/bucket ocupado ⇒ ZERO escrita, `BLOCKED_TARGET`. Nunca inventar QA vazio, executar reset ou recriar dados reais para passar.
- [ ] **Step 2: Em QA segregado autorizado, produzir snapshot consistente** com manifesto/contagens/checksums D1/R2, chaves e relações, sem segredos e sem misturar originais reais a fixtures. Verificar restauração de dados e mídia após restart/rebuild em destino não servido.
- [ ] **Step 3: Reproduzir escritas novas no candidato** depois do snapshot (edição Studio, publicação, favorito, upload e auditoria) e demonstrar estratégia de freeze/delta/replay sem perda ou duplicação. Preservar IDs, permissões e estado editorial.
- [ ] **Step 4: Ensaiar rollback completo** de código, config, dados, R2, Studio/Colagem, jobs e revogação de sessões, seguido de reabertura e negação A/B, sem tocar origem ou banco ocupado. Reportar RPO/RTO efetivamente medidos.
- [ ] **Step 5: G18 e G23 têm evidências próprias.** Se um só lado passou, o outro continua BLOCKED. DNS rollback não é restore de dados. Nenhuma importação final/produção sem autorização independente.

## Task LC5: Assurance independente e separação dos releases

**Files:** `docs/operations/private-albums-r4/g19-independent-review-package-2026-11-20.md`, `docs/operations/private-albums-r4/11-lgpd-decisions.md`, `docs/operations/private-albums-r4/execution-state.json`, relatórios de acessibilidade.

**Interfaces:** Produz `RELEASE_A_PACKET` (site público, R4 OFF) e `RELEASE_B_PACKET` (R4 ON), com aprovação e bloqueios próprios.

- [ ] **Step 1:** Conferir G15 com TalkBack Android e VoiceOver iOS físicos, fluxos admin/cliente, teclado, foco, zoom 200%, contraste e revisão visual. Emulação Playwright não preenche o campo físico; exigir responsável e evidência datada.
- [ ] **Step 2:** Revisão G19 formal por revisor independente do SHA final, abrangendo RBAC/IDOR, sessões/Clerk, upload, cache/mídia, audit atomicity, restore e segredos. Parecer delimitado de patch não substitui aprovação formal. P0/P1 ⇒ NO_GO.
- [ ] **Step 3:** G20 exige aceite expresso da responsável pelo estúdio sobre LGPD, retenção, exclusão, exportação, backups e finalidade. Sem atribuir assinatura a terceiros.
- [ ] **Step 4:** Preparar autorização G22 específica para **Release A**, incluindo SHA, alvo, janela, DNS, TLS, backup, rollback, Writer Freeze e pós-cutover; **Release B** só depois, com autenticação real R4 e novo aceite. Nenhuma autorização automática por este documento.
- [ ] **Step 5:** Na falta de aceite ou provedor, entregar `PARTIAL_VERIFIED / PRODUCTION_NO_GO`, sem renomear os gates nem cancelar trabalho independente.

## Task LC6: Verificação exata, checkpoint e handoff para LUNA

**Files:** Nota versionada em `docs/operations/private-albums-r4/`, `execution-state.json` apenas após evidência nova, PR #45, Drive Sgtmenezes existente.

**Interfaces:** Saída obrigatória `RESULT / CHANGES / VALIDATION / T00–T06 / G01–G24 / SHA+CI / BLOCKERS / COST / RELEASE_A / RELEASE_B / CHECKPOINTS / NEXT_SAFE_ACTION`.

- [ ] **Step 1:** Com commits do código, verificar `git diff --check`, status limpo, testes focados RED/GREEN, `npm run typecheck`/lint e CI do HEAD; validar jobs, `sourceSha`, dirty flag, skips, hash de artefatos e ambiente. Um job verde histórico não vale para o código novo.
- [ ] **Step 2:** Registrar em ledger apenas mudanças de status com evidência, owner, ambiente e SHA. Preservar as 24 chaves originais de `currentCycle20261121AY.gateRecords` e o histórico; `H01–H06` são suplementares.
- [ ] **Step 3:** Publicar cada commit pequeno na branch correta, sem merge automático; verificar readback remoto. Atualizar **o mesmo** checkpoint Sgtmenezes somente se mudou estado, confirmar readback, sem duplicar documento.
- [ ] **Step 4:** Antes de encerrar, checar se houve memória durável relevante. Estado do Punctum fica no repo; Engram e PersistFlow somente com gravação e readback reais, nunca alegar ativação por intenção.
- [ ] **Step 5:** Fechar o incremento que é comprovável; manter blockers externos nomeados. `DONE_VERIFIED` do projeto exige os dois releases, seus gates e autorizações comprovados, não só este plano ou testes locais.

## Dependency Order, Stop Rule e DoD deste adendo

- Caminho crítico: LC0 → LC1 e LC2 (independentes após inventário) → LC3 e LC4 (segurança/paridade) → LC5 → LC6. Bloqueio da issue #44 impede apenas a associação/TLS/QA gerenciado/cutover dependentes; não interromper patches e testes locais seguros.
- Cada task termina em artefato verificável próprio, teste/prova no SHA e pequeno commit com revisão. Patches que tocam autenticação e migração precisam de revisão independente antes de integrar.
- Se baseline/ownership mudar, reconciliação é pré-condição; não continuar a partir de SHAs históricos nem em worktree com outro agente ativo.
- **Este plano é documental.** Não autoriza deploy, merge, DNS, produção, Clerk Production, billing, contato externo, restauração destrutiva nem liberação das duas fases.
- **DoD da correção documental (22/11):** arquivo presente e linkado a partir do BH, caminhos locais existentes ou expressamente condicionais, 24 gates preservados, WIP intacto, `git diff --check` PASS, commit e push verificados no branch da PR #45. **DoD técnico/produtivo fica pendente para execução posterior.**
