# GOAL — Punctum Picture R5: seleção guiada + entrega editorial versionada

**Executor futuro:** Chat on Steroids (CoS) em colaboração com Codex, quando autorizado.  
**Prioridade:** P0 integridade/segurança → UX real → custo R$0 → revisão independente → handoff.  
**Status ao criar:** SPEC + plano documentados; implementação, merge e produção **não autorizados**.  
**Repo:** https://github.com/menezesx2k26-byte/lab-punctum-picture  
**PR de referência R4:** https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/24  
**SPEC:** `docs/superpowers/specs/2026-10-28-punctum-guided-selection-album-composer-design.md`  
**Plano:** `docs/superpowers/plans/2026-10-28-punctum-guided-selection-album-composer.md`  
**R5 evidências:** `docs/operations/private-albums-r5-guided/` (nova pasta, nunca sobrescrever relatórios R4).

## Objetivo operacional

Depois da **aprovação humana explícita da SPEC e do plano**, executar autonomamente e de forma segura a implementação incremental das decisões D01–D27 e o default de engenharia D28. Entregar PR draft com código, testes, UX, custos medidos, relatório de segurança, evidências e handoff; **não** mergear ou implantar. Nunca declarar DoD integral enquanto gates R4 ou R5 estiverem falhando/bloqueados.

## Contrato inegociável

1. Antes de qualquer escrita: ler **SPEC e plano completos**, AGENTS/regras, branch/PRs/main atuais, worktrees, modificações sem commit, migrations/Worker/Studio/CI, `docs/operations/private-albums-r4/execution-state.json`. O SHA `50e8fc4` é histórico, não presume HEAD. Reconstruir o estado por Git + provas reais, não por lembrança do chat.
2. Encontrar implementações existentes, reutilizar contratos atuais. Nada de backend novo, reescrever home, duplicar favoritos, quebrar autenticação OTP/Access R4 ou criar versão paralela do Studio público.
3. Criar worktree isolada e branch de implementação **nova**, nunca editar a PR #24 diretamente nem sobrescrever arquivos possuídos por outro executor. Se houver conflito, STOP + relatório de ownership.
4. Trabalhar por **Task 00–12 do plano**, obedecendo dependências. Para cada tarefa: teste RED com falha observada → código mínimo → GREEN real → refactor → regressão → commit SHA → prova → revisão. Uma aprovação de revisor não substitui testes.
5. Manter um único writer por área de código. Subagentes independentes podem revisar em paralelo (UI/acessibilidade, segurança/Worker, orçamento/infra), mas não editar os mesmos arquivos simultaneamente. Jamais declarar subagentes ou ponte CoS/Codex ativa sem chamada e evidência.
6. R$ 0 **incremental não autorizado**. Nunca habilitar Workers Paid, Images Paid, email pago, serviços pagos, migração D1 remota, R2 real não autorizado, cobrança, produção, Access ou segredos. Se limite do Free não couber, documentar `BLOCKED_COST`, preservar o que já é seguro, não improvisar plano pago.
7. Manter `PRIVATE_GALLERIES_ENABLED=false` em produção. Qualquer flag futura para nova evolução também OFF por padrão. Nenhum merge/deploy/aprovação de produção em nome do usuário.
8. Sem seed/restauração R4 histórica, sem uso de fotografias/dados reais, sem mudanças destrutivas e sem inventar handoff no Drive/PersistFlow. QA sintético isolado, com hashes e paths.
9. Respeitar todas as 28 escolhas: provas reduzidas com marca real; seleção exata/máxima/livre; confirmar bloqueia; somente Maria reabre; versão final vinculada a foto confirmada; entrega parcial; blocos editorialmente livres porém tipados/responsivos; revisões imutáveis; antes/depois e aprovação por foto; inbox/mensagens por solicitação; validade opcional/renovação; aviso in-app/e-mail; downloads individuais e batch autorizados. Não substituir essas escolhas por favoritos ou mock estático.

## GOAL loop / máquina de estados

`RECONCILE → OWNED_WORKTREE → RED → GREEN → REVIEW → EVIDENCE → COMMIT → CHECKPOINT → NEXT_GATE`.

Para cada gate novo PP00–PP10:
- recuperar checkpoint durável, verificar commit/branch e ownership contra Git;
- ler a linha correspondente da SPEC + tarefa do plano;
- produzir artefato testável e rodar os comandos reais;
- registrar `gate, requirementIds, testCommand, exitCode, assertionCounts, commitSha, ciRunUrl, artifactHash, knownLimitations, costEstimate, reviewerFindings`;
- PPxx=PASS apenas se critérios do documento e logs verificáveis baterem;
- falha real → FAIL e corrigir antes de dependentes; falta de conta/permissão/aparelho/validação humana → BLOCKED_EXTERNAL; excede Free → BLOCKED_COST;
- ações independentes podem avançar com blockers explícitos; nunca mascarar gate falho com resumo otimista.

## Ordem de execução e critérios de avanço

- **PP00:** baseline SHA/PR/worktrees/diff/CI completo; sem possuir arquivos alheios.
- **PP01:** migration 0010 aditiva + schema/policies + CAS/índices/FKs testados localmente.
- **PP02:** derivadas watermarked reais e rotas seguras, sem originais para clientes e com orçamento medido.
- **PP03:** seleção/confirmar/reabrir auditável, favoritos separados, A/B + race.
- **PP04:** finais imutáveis, snapshots, publicação parcial 25/30, cliente somente última revisão.
- **PP05:** editor privado por blocos, crop/reuse sem cópia, frontend guiado responsivo e sem regressão pública.
- **PP06:** pedidos por foto/gerais, aprovação por item, mensagens e antes/depois, cliente aprova cada reedição e pode desfazer pré-publicação.
- **PP07:** expiração/renovação bloqueiam GET/HEAD de mídia; outbox idempotente + email comprovado por transporte gratuito autorizado. Sem envio real, BLOCKED_EXTERNAL.
- **PP08:** um clique obtém todas as finais prontas da revisão publicada, com hashes e teste de memória/CPU/custo; se inviável, BLOCKED.
- **PP09:** segurança independente, LGPD/política de retenção, recuperação e rollback isolados formalmente validados.
- **PP10:** final QA com duas contas + Maria, browser populado real sintético, Android/iOS físicos, acessibilidade, CPU/R2/Images/Email, CI exato, diff-review e gates R4 reconciliados.

**Gating obrigatório:** qualquer FAIL de integridade/privacidade bloqueia publicação; qualquer BLOCKED de email/ZIP/custo impede **DoD integral**, não impede documentar código de outros módulos. PP10 não pode virar PASS quando G05/G17/G15/G19/G20/G22/G23 R4 ainda estiverem abertos.

## Verificação mínima por commit

Na versão final **do SHA testado** rodar:
~~~sh
node --version
npm ci
npm audit --omit=dev
npm run typecheck
npm run lint
npm test
npm run build
# Executar Playwright existente e os cenários R5 adicionados;
# registrar cada resultado, ambiente e escopo.
git diff --check
git status --short
git rev-parse HEAD
~~~
Executar comandos adequados ao Windows/Linux efetivamente disponível. Não supor que `npm run test:e2e` funciona sem preparar browser/ambiente; diferenciar NOT_RUN de PASS. Evidências de browser devem conter largura, navegador, screenshot e conjunto de dados; emulação ≠ device físico. Revisão independente é distinta de testes/CI.

## Evidências obrigatórias por milestone

Na pasta R5: baseline, requisitos→arquivos→testes, contratos D1, prova de watermark, autorização GET/HEAD, matriz cross-tenant, confirmação/cancelamento e CAS, exemplos 25/30 e 4/5, composição/crops, antes/depois, inbox e expiração, e-mail real + fila, batch hashes/memória, budget Workers/R2/Images, regressão pública, LGPD/segurança/rollback, e decisão de readiness.

O relatório precisa diferenciar: **implementado**, **testado em ambiente local**, **testado em QA isolado**, **testado em dispositivo físico**, **não testado**, **bloqueado**, **liberado por humano**. A R4 nunca é requalificada só por uma nova suíte.

## Continuidade e memória

- GitHub/PR/commit são a referência canônica de código; estado R5 em JSON e relatórios versionados.
- PersistFlow somente com checkpoint e takeover realmente verificados; se indisponível, gravar `CHECKPOINT_PENDING` e continuar de Git, sem dizer que há persistência ativa.
- Engram como índice episódico de decisões e bloqueios duráveis. Drive `sgtmenezes` para handoff compartilhado **se conexão e leitura de volta verificadas**; não gravar segredos.
- Em cada compact/resume, imprimir 1) base/branch/SHA, 2) gate atual, 3) PASS/FAIL/BLOCKED verdadeiros, 4) arquivos e CI, 5) bloqueios, 6) próximo passo seguro. Depois confrontar checkpoint com árvore real antes de executar.

## Final desired output

1. Links: PR draft, commits exatos, CI/artifacts, SPEC, plano e matriz PP00–PP10.
2. Descrição concreta da experiência Maria/cliente demonstrada, com prints/smokes e contagem de testes.
3. Lista honesta de bloqueios; custo real vs gratuito comprovado; nenhuma promessa de entrega de e-mail/ZIP/produção sem teste.
4. `readiness: NO_GO` ou `READY_FOR_HUMAN_APPROVAL` somente após cumprir precondições; **GO_PRODUCTION proibido sem autorização humana separada**.
5. Handoff durável que outro agente consegue retomar sem repetir o trabalho, sempre verificando o SHA real.

**START CONDITION:** aguardar aceite humano da SPEC/plano. Este GOAL descreve execução futura e não comprova código novo, workers ligados, deploy, aprovação de segurança ou custos homologados.
