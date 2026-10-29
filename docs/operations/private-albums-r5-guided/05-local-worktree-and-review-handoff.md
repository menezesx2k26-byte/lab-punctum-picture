# R5 — runbook Windows/CoS para worktree isolada e revisão independente

**Uso:** roteiro futuro, **não executado** neste checkpoint. A branch remota documental `agent/punctum-r5-preparation-20261028` já existe. O terminal compartilhado nesta sessão não forneceu capacidade confiável para inspecionar o clone Windows: alterações locais, ownership, locks, worktrees, diretivas locais e dependências instaladas permanecem **não verificadas**. Não interpretar o roteiro como `PP00=PASS`.

## Fase A — preflight 100% leitura no clone correto

Abra PowerShell em um terminal que efetivamente tenha acesso ao workspace; configure manualmente `$PunctumRepoRoot` com **caminho completo do clone Git já existente** e `$PunctumParent` com pai aprovado para criar uma **nova** worktree. Não copie valores fictícios de caminhos. A inspeção inicial é leitura, sem mudar branch:

```powershell
$ErrorActionPreference = 'Stop'
$PunctumRepoRoot = Read-Host 'Caminho ABSOLUTO do clone Punctum existente'
$PunctumRepoRoot = (Resolve-Path -LiteralPath $PunctumRepoRoot).Path
if ((git -C $PunctumRepoRoot rev-parse --is-inside-work-tree) -ne 'true') { throw 'Nao e um repo Git' }
$PunctumTop = (git -C $PunctumRepoRoot rev-parse --show-toplevel).Trim()
$PunctumRemote = (git -C $PunctumRepoRoot remote get-url origin).Trim()
if ($PunctumRemote -notmatch 'menezesx2k26-byte[/\\]lab-punctum-picture(\.git)?$') { throw 'origin nao corresponde ao repo autorizado' }
git -C $PunctumRepoRoot rev-parse HEAD
git -C $PunctumRepoRoot status --porcelain=v1
git -C $PunctumRepoRoot branch -avv
git -C $PunctumRepoRoot worktree list --porcelain
git -C $PunctumRepoRoot remote -v
git -C $PunctumRepoRoot log -1 --format='%H %cI %s'
```

Procure `AGENTS.md` **no clone, diretórios pais e subárvores que poderão receber arquivos**. A árvore Git remota documental, com 1216 entradas, não continha `AGENTS.md` versionado; isso não prova ausência de instruções locais. Leia também instruções CoS/Codex aplicáveis. Documente cada caminho, owner/writer, alteração modificada/untracked, worktree checkout e lock; qualquer conflito exige `STOP` antes de editar. Não usar `git clean`, `reset`, `checkout -f`, `rebase`, `stash`, ou remoção de worktree para fazer a validação passar. Não sobrescrever `.env`, fixtures, scripts existentes ou dados R4.

## Fase B — obter referência remota e criar worktree apenas quando seguro

Conferir, na PR #25 e na branch de preparação, o HEAD **atual** do GitHub e não confiar em hash histórico. `fetch` pode atualizar refs locais, mas não modifica arquivos do checkout existente. Só proceder depois do inventário da fase A e validação de que não há locks/processos concorrentes. Nome de branch local igual ao remoto deve ser exclusivo, e um destino já existente implica `STOP`.

```powershell
$PunctumBranch = 'agent/punctum-r5-preparation-20261028'
$PunctumParent = Read-Host 'Diretorio pai NOVO/APROVADO para worktree'
$PunctumParent = (Resolve-Path -LiteralPath $PunctumParent).Path
$PunctumWorktree = Join-Path $PunctumParent 'punctum-r5-preparation-20261028'
if (Test-Path -LiteralPath $PunctumWorktree) { throw 'Destino ja existe: STOP sem sobrescrever' }
git -C $PunctumRepoRoot fetch origin "refs/heads/$($PunctumBranch):refs/remotes/origin/$($PunctumBranch)"
if ($LASTEXITCODE -ne 0) { throw 'fetch falhou' }
$PunctumRemoteHead = (git -C $PunctumRepoRoot rev-parse "refs/remotes/origin/$PunctumBranch").Trim()
$PunctumDocumentedHead = Read-Host 'SHA remoto verificado independentemente no GitHub nesta sessao'
if ($PunctumRemoteHead -ne $PunctumDocumentedHead) { throw 'Divergencia de SHA: STOP' }
$PunctumLocalBranchExists = git -C $PunctumRepoRoot branch --list $PunctumBranch
if ($PunctumLocalBranchExists) { throw 'Branch local ja existe; reconciliar worktrees antes de continuar' }
git -C $PunctumRepoRoot worktree add --track -b $PunctumBranch $PunctumWorktree "origin/$PunctumBranch"
if ($LASTEXITCODE -ne 0) { throw 'worktree add falhou; inspecionar sem reexecutar cegamente' }
git -C $PunctumWorktree rev-parse HEAD
git -C $PunctumWorktree status --porcelain=v1
git -C $PunctumRepoRoot worktree list --porcelain
```

Se `origin` for endereço remoto alternativo autorizado, validar origem e adaptar comando apenas após inspeção. Se a mesma branch estiver checkout em outro worktree, não usar `--force`; não criar outra branch com a mesma identidade sem motivo. Registrar o caminho realmente escolhido e o `SHA` confirmado. A worktree nova destina-se a documentação/preparação enquanto não houver aprovação formal; `npm ci` tem efeitos locais de instalação e só deverá ser feito na worktree própria após ownership confirmado. Nenhum `git push` adicional é necessário para consultar a documentação já publicada.

## Fase C — baseline depois do isolamento

```powershell
node --version
npm --version
git -C $PunctumWorktree status --porcelain=v1
git -C $PunctumWorktree diff --check
# No terminal POSICIONADO na worktree isolada e sem alterações de terceiros:
# npm ci
# npm audit --omit=dev
# npm run typecheck
# npm run lint
# npm test
# npm run build
# npm run test:e2e
```

Cada execução deve ter linha de comando literal, `exitCode`, ambiente, duração, teste/assert count, stdout/stderr sanitizado, SHA testado, CI URL/artifact hash e status `PASS`/`FAIL`/`NOT_RUN`. Os exemplos comentados **não foram executados**. Validar que Playwright, Workers/DB local e browsers existem antes de E2E; falha de setup não é `PASS` nem QA física.

## Fase D — revisão independente, leitores sem writes

Convocar três revisores distintos somente quando a capacidade de workers/conector estiver disponível e a invocação for registrada. **Não há revisor independente executado neste checkpoint.** Modo `read-only` para todos; apenas o executor principal poderá modificar documentos da branch designada. Escopos e entregas:

| Revisor | Input canônico | Perguntas e evidência | Resultado |
|---|---|---|---|
| Segurança/Worker | `03-api-auth-contracts.md`, Worker R4, SPEC e plano | A/B IDOR GET/HEAD, XSS/CSRF, CAS, candidatos/versões, watermark real, expiração, CORS/cache, P0/P1; relatório com arquivo+linha+SHA e findings | `review-security.md`, assinatura e teste de reprodução; P0/P1 bloqueiam PP09 |
| Frontend/acessibilidade | `02-private-journeys-security-cost-review.md`, React/Studio/ClientLibrary, SPEC | Teclado/touch, foco/ESC, 320–1440, zoom 200%, WCAG 2.2 AA, states, performance e emulação versus aparelho físico | `review-ui-a11y.md`, screenshots e ambientes quando realmente rodados |
| Custos/infra | `04-cost-capacity-and-validation-runbook.md`, Worker/R2/Images/D1, R4 telemetry | quotas/CPU/bytes da conta, no paid, Email, batch memory, margem conservadora e plano rollback | `review-cost.md`, consultas e orçamento verificados; sem conta, bloquear |

Todos reportam `reviewerIdentity, role, reviewedSha, files, findings (P0/P1/P2), evidenceUrls, performedTests, notRun, signoffScope`. Aceite formal G19 R4 e PP09 R5 requer independência real, não uma autoverificação. Não enviar dados sensíveis, fotos reais, JWT, cookies ou segredos aos revisores.

## Fase E — checkpoints e PR draft futura

- A branch da preparação mantém os artefatos `00-preparation-baseline.md`, `01-executable-matrix.md`, `02-private-journeys-security-cost-review.md`, `03-api-auth-contracts.md`, `04-cost-capacity-and-validation-runbook.md`, `05-local-worktree-and-review-handoff.md` e `execution-state.json`; consultar `git ls-tree HEAD docs/operations/private-albums-r5-guided` antes de anunciar existência de cada um.
- Após aprovação explícita da SPEC e plano em **SHAs exatos**, completar PP00 e iniciar Tasks 01–12 com TDD e gates. O executor deve criar PR **draft de implementação** a partir da branch correta quando existir código autorizado e commits verificáveis; descrição aponta SPEC/plano, matriz, testes, SHA/CI, custos e bloqueios. A branch de preparação pode ser usada como base documental, mas não criar PR de implementação antes do aceite.
- Revisar impactos em R4 sem editar suas evidências: G05/G17 `FAIL`; G15/G19/G20/G22/G23 `BLOCKED_EXTERNAL`. Nenhum teste R5 requalifica R4.
- Handoff a cada checkpoint inclui URL/HEAD, owner, trabalho efetivo, comando+exit+SHA, limites, bloqueios, próximo passo e condição de parada. Estado permitido apenas `NO_GO` ou `READY_FOR_HUMAN_APPROVAL`; publicação/merge/deploy requerem autorização específica distinta.

## Observações de reconciliação até este checkpoint

Acesso remoto GitHub via conector foi funcional, e o histórico da PR #25 e branches remotas foi consultado. A inspeção do desktop Windows retornou janelas PowerShell preexistentes, mas não um novo processo confiável para CLI; não foi usado input em terminais de terceiros ou PersistFlow. Não há evidência de `git worktree add` local, testes locais R5, GitHub Actions na branch de preparação ou subagentes ativos. Registrar essas ausências **sem inferir falhas do produto**.

## Atualização operacional verificada 29/10/2026 — clone isolado e Playwright existente

- Foi recuperada uma **nova** sessão Git Bash/Git CMD sob controle desta execução, separada das janelas antigas e de ownership desconhecido. O repo original Documents/ChatGPT/Punctum Picture tinha branch R4 codex/punctum-r4-cpu-20261028, HEAD b417405c0406daf286b192a8151cf45c4a50f89c, status limpo e uma worktree. Sem AGENTS.md em ancestrais, root e tree versionado; sem locks Git. Processos Codex/Node de terceiros não foram tocados.
- Foi criado **clone independente** Documents/ChatGPT/.punctum-r5-isolated-20261029-30149863 (não worktree do repo R4), originalmente no HEAD 30a22fdf314e1703a7d9808c10d35a1a34718c4a, exit 0. Todo comando do baseline executou nele; logs/relatórios fora do checkout. Consultar o checkpoint 21 para comando, status, Git SHAs e log hashes. O clone pode receber fast-forward SOMENTE após assegurar status limpo e não haver processo concorrente de teste. Não alterar ou remover o clone R4.
- Windows Node 24.19.0 / npm 11.7.0 / Python 3.14.3: npm ci --no-audit --no-fund, typecheck, lint, 223 Vitest, build e E2E local com workerd/D1/R2 sintéticos executados. As verificações de fontes e os reprodutores pinados foram ajustados exclusivamente em docs para CRLF e regex UUID. Os avisos de allow-scripts em npm não implicam autorização para habilitar executáveis desconhecidos.
- Playwright falhou inicialmente por Chromium empacotado ausente. Foi usado **Google Chrome já instalado** em modo headless, sem baixar navegador, com CHROMIUM_EXECUTABLE apontando para o binário local e PUNCTUM_E2E_OUTPUT na pasta de logs externa. Resultado PASS_LOCAL/14, sem cloudflare remoto/OTP/dispositivos físicos. Não supor que o Chrome do operador sempre exista: verificar o binário antes e evitar perfil de navegador real.
- O clone isolado habilita execução de **regressão da R4 existente**, mas PP00 permanece BLOCKED_EXTERNAL por falta de aprovação humana vinculada aos Git blobs SPEC e plano. Não criar worktree de implementação, mudar produto, migrations, flags, billing, deploy ou PR de implementação. Novo checkout não é endosso de autoria editorial por senha compartilhada.
