# Punctum R5 — nova evidência de recuperação de falhas D1/R2 (modelo isolado)

**Data:** 29/10/2026. **Estado:** NO_GO, sem autorização formal da SPEC e do plano. **Natureza:** ensaio Python/SQLite + arquivos locais sintéticos; **NÃO** teste de Cloudflare Worker, D1 ou R2, watermark, email, browser ou sistema R5 real. Tudo dentro da documentação isolada. Não repetir os 18/18 checks estáticos, 17 checks de fixture, 26 cenários RED, 6/6 + 10/10 SQLite 0009, 19/19 modelo FK e 62/62 CAS antigos.

## 1. Reconciliado antes da escrita

Branch agent/punctum-r5-preparation-20261028 em HEAD inicial 30149863e6abc9d724e849faa7ba622f7093761d, compare GitHub: identical, ahead=0, behind=0. Main aac2d448d9f54e9215c278892ab3a4a7f26237a4, PR #24 open/draft 50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd e PR #25 open/draft f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f. Árvore Git recursiva 1246 entradas, truncated=false, nenhum AGENTS.md **versionado**; instruções locais/parent e processos/locks/worktrees no Windows seguem desconhecidos. Nenhum CI R5 na branch. Nenhuma sessão Windows antiga foi acessada. O Linux auxiliar em /mnt/data tinha somente o sandbox anterior, sem checkout Git Punctum ou package.json, e o conector GitHub oferece texto/blobs, não fornece arquivo binário de clone/ZIP nem instala node_modules. Não repetir git ls-remote/DNS ou launch_app já frustrados sem mudança de capacidade.

## 2. Execução real nova, inteiramente sintética

**Script versionado:** docs/operations/private-albums-r5-guided/verify-synthetic-failpoint-saga.py. Último Git blob SHA e312284f55b692188c5189a11b032b2498ed49c7; SHA256 da cópia efetivamente executada d0621214d63e934afe27f629750ce2c41b08ca6340dbdd101dd0ef61ed8cb68c. Git blob remoto foi lido de volta e **coincidiu** com o blob calculado no Linux para os mesmos bytes. Usa exclusivamente Python stdlib, SQLite de arquivo em tempfile próprio e bytes textuais falsos em diretório temporário, representando R2. **Não usa migration 0009, não há migration 0010 e não importa Worker real.** Banco e storage de modelo são independentes do produto.

Comando realmente executado, exit code **0**:

    python /mnt/data/punctum-r5-sandbox/isolated-faults/verify-failpoints.py > /mnt/data/punctum-r5-sandbox/isolated-faults/failpoint-report.json

Resultado JSON: **161/161 assertivas correspondentes**, failed=[], 9 pontos de falha. Log JSON SHA256 **9cd7696c563a92da3b5e5888c6e3152ea3e23d289834375df5bece3dac2ab916**. Reexecutável em checkout futuro ou qualquer Python: python docs/operations/private-albums-r5-guided/verify-synthetic-failpoint-saga.py > /tmp/r5-failpoints.json. Não altera repo nem objetos externos.

**Falhas injetadas:** before_put, after_put, after_head, after_revision_insert, after_cas, after_receipt, after_outbox, after_commit, after_email_failure. Em cada cenário o banco foi fechado e reaberto (simulação controlada de restart, **não kill de processo**), verificando ponteiro e receipt persistidos; reenvio de mesma chave e bytes dá mesmo receipt sem novo evento, reenvio com payload diferente resulta IDEMPOTENCY_CONFLICT; sessão shared-password não pode assinar pessoalmente; cliente B recebe 0 bytes de A e cliente A recebe 0 bytes na fronteira exata de expiração (clock >= accessExpiresAt).

**Antes de COMMIT:** o ponteiro de publicação anterior permanece, sem receipt/outbox, embora objeto simulado possa ter sido armazenado. **Após COMMIT:** recibo/outbox/pointer permanecem; falha de transporte marca outbox failed sem desfazer publicação. Validação de candidata: prova não confirmada, candidata rejeitada, prova pertencente ao cliente B e ID desconhecido não podem ser publicados. Corrupção sintética de bytes de final publicada gera fail-closed/0 bytes. Recuperação de objetos órfãos: elegibilidade por idade simulada de 24 horas, nova checagem depois de pelo menos 1 hora, sem apagar automaticamente; objetos referenciados pelo histórico não são elegíveis. A aplicação real deverá ainda considerar uploads ativos, leases, retenção LGPD e rechecagem imediatamente antes de DELETE.

**Escopo exato:** os 161 checks avaliam **um algoritmo-modelo inventado**, não são 161 asserts executadas contra a R5. Nenhuma integração HTTP, D1, R2, Images Binding, cache, e-mail, CPU, RAM, streaming ZIP ou dispositivo. O script de teste escreve bytes inválidos em um **arquivo temporário local** para simular corrupção — não afirma que R2 permita overwrite equivalente. A conta, custos e limites remanescentes não foram lidos. A reabertura de uma conexão local não comprova crash real em múltiplas regiões. Nenhum reviewer independente esteve disponível.

## 3. Confronto com Worker e contratos existentes

- worker/api/client-gallery-upload.ts:217–251, blob 19d08186de68469c280be041f82ecaa4eb36a733: o R4 já usa put com onlyIf(etagDoesNotMatch="*"), trata retorno null sem sobregravar objeto existente, compara bytes para retry idêntico e faz UPDATE condicional no D1. Reutilizar **o princípio**, não assumir que o caminho de upload R4 implementa publicação/versão imutável da R5.
- worker/api/client-gallery-upload.ts:289–329 usa batch para concluir upload, mas não pode tornar um PUT R2 parte de transaction D1.
- worker/api/client-admin.ts:262–273,314–324 confere e publica capa R4 sob suas próprias regras. Não equivale a confirmação de seleção, snapshot imutável ou CAS R5.
- worker/client/auth.ts:58–112 confere HMAC, audience, expiração e sessionVersion; worker/client/repository.ts:69–104 filtra dono, galeria publicada e foto ready. R5 também requer prova confirmada, recurso elegível, status de candidata, snapshot atual, accessExpiresAt e mídia rasterizada marcada.
- docs/operations/private-albums-r5-guided/03-api-auth-contracts.md:15–40,67–75 já exige publicação do ponteiro D1, outbox pós-commit e nenhum vazamento de chave R2. Este novo teste cobre falhas **entre** esses passos, e estados de retry após restart.
- worker/utils/auth.ts:108–145 e auditPrincipal: identidade administrativa via senha compartilhada não é pessoa comprovada; em R5, ação editorial de Maria precisa assertiva de operador individual aprovada ou controle equivalente, e a auditoria não pode inventar autora.

## 4. Critérios RED adicionais realmente novos (não executados na R5)

1. **Falha R2 PUT/HEAD/digest:** injetar erro antes de D1 commit e exigir ponteiro antigo, nenhum recibo/outbox falso, zero bytes de prova sem marca ou final não confirmado; não usar original como fallback.
2. **Após R2 PUT, antes de D1:** simular queda real e reinício de Worker, repetir mesma idempotency-key + payload + principal validado, exigir mesma versão de objeto sem overwrite, sem snapshot duplicado; objeto órfão só removível após reconciliador com duas leituras, janela de segurança e referência a todo histórico.
3. **CAS obsoleto:** no D1 local, rowcount 0 deve gerar falha SQL que reverta receipt/outbox/ponteiro no batch. Ensaios 62/62 anteriores provaram que 0 linhas, sozinho, pode permitir commit de eventos errados. Testar duas invocações simultâneas e falha antes/depois de cada statement.
4. **Depois de D1 COMMIT, antes de resposta:** novo retry idêntico retorna receipt anterior, nenhum segundo evento/email, acesso do cliente A somente último snapshot; B/URL antiga/candidata rejeitada/HEAD/Range recebem 0 bytes.
5. **Email fora de D1 transaction:** falha do provedor não desfaz entrega; outbox pending/failed e próxima tentativa de baixo custo, somente sent após receipt externo. Revisar compatibilidade da escolha de transporte e autorização.
6. **R2 final ausente ou corrompido:** GET/HEAD nega bytes, relatório reparável por operador individual, R2/Images watermark e SHA da derivada são verificados por teste real, jamais acesso ao original cru.
7. **GC:** após tempo mínimo, duas leituras com espaçamento, lease e referenciação de **todas** revisões anteriores, mais política LGPD. Não efetuar DELETE durante testes iniciais; testar rollback de plano de coleta e rechecagem final.
8. **Maria/cliente UX:** erro de upload, conflito 409, reabertura proibida, 25/30 finais, 4/5 ajustes, expiração e email falho devem preservar foco, rascunho, teclas/leitor de tela, 320–1440px/zoom 200%; sem screenshots ou QA física executada nesta sessão.

## 5. Fato externo novo de custo — não medição Punctum

Segundo documentação oficial Cloudflare atual, Workers Free/D1 inclui **5 milhões de linhas lidas por dia e 100 mil linhas escritas por dia**. A Cloudflare anunciou em 01/09/2026 o enforcement diário; acima da franquia consultas passam a falhar até meia-noite UTC. Loops automáticos de outbox e reconciliador de órfãos precisam de cota/budget, indexação, backoff/jitter e circuito de suspensão de jobs, **sem** bloquear acesso privado por tempestade de retries. Não afirmar Workers Free viável, uso real medido, custo zero ou BLOCKED_COST sem evidência da conta.

Fontes oficiais:
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/d1/worker-api/d1-database/ — batch reverte em **falha** SQL, não automaticamente em 0 linhas afetadas
- https://developers.cloudflare.com/r2/api/workers/workers-api-reference/ — put condicional pode retornar null e R2 não participa do commit D1

Limites anteriores de 10 ms CPU/request/128 MB isolate Workers Free, Images transformações únicas e R2 Class A/B/storage/ZIP já estão em 04/11/17, sem medição adicional. Não repetir estimativas como medições.

## 6. Gates, segurança e desbloqueio

PP00 **BLOCKED_EXTERNAL** (aprovação humana SPEC/plan + ownership/worktree); PP01–PP08 **NOT_RUN**; PP09 e PP10 **BLOCKED_EXTERNAL** (parecer segurança/LGPD/rollback, QA real, release). R4 G05/G17 **FAIL** e G15/G19/G20/G22/G23 **BLOCKED_EXTERNAL**, sem mudança. testSha=null, implementação bloqueada.

Pré-requisito após autorização formal: vincular aceite humano a SPEC Git blob db25502f25eed89131bac16e3a3172248f716ec1 e plano blob 41e06e5fdd353eaff9a5f43357fbcbce741b2770; inventariar AGENTS.md root/parent/subfolders, owner, processos, status, locks, branches/worktrees, PRs/main, antes de criar worktree R5; executar verificadores versionados, npm ci/typecheck/lint/Vitest/Playwright/build, D1 0009+0010 **somente local**, R2/Images/HTTP/real UI/a11y/CPU/custo e três revisões independentes. Tasks 00–12 com RED → GREEN → REFACTOR → REVIEW → COMMIT → CHECKPOINT. PR draft de implementação só após aprovação, sem merge/deploy/migração remota/billing/clientes. **NO_GO**, nunca GO_PRODUCTION automático.
