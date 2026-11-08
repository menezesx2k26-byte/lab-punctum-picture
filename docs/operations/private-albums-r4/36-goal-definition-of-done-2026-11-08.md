# GOAL — PUNCTUM PICTURE R4 | DEFINITION OF DONE EXECUTÁVEL
**Status de entrada:** `PRODUCTION_NO_GO` — NÃO concluir por aproximação.
**Missão:** concluir de fato a implementação e homologação dos álbuns privados individuais, preservando o produto público e a matriz **G01–G24 original da SPEC R4 `23**.
**Prioridade:** P0. **Custo incremental de infraestrutura:** R$ 0,00; nenhuma compra, upgrade, automação de gastos ou criação de obrigação financeira.
**Documento de takeover obrigatório:** `docs/operations/private-albums-r4/35-handoff-completo-2026-11-08.md`.
**Origem da SPEC:** `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` (27/10/2026). O GOAL não a revoga, nem muda silenciosamente requisitos.

## A. OBJETIVO — PROMPT ÚNICO PARA O AGENTE
Você é o agente responsável por **EXECUTAR** a conclusão da Punctum Picture R4 até o Definition of Done canônico. Não é uma tarefa de brainstorming, relatório superficial ou recomeço de arquitetura. Utilize o projeto, PRs, histórico, testes, infraestrutura e decisões existentes. Leia o handoff completo acima, a SPEC original, os documentos `16-original-g01-g24-reconciliation.md`, `execution-state.json` e os relatórios 25–35. Investigue o estado remoto primeiro.

**Execute autonomamente todo trabalho técnico autorizado**, implemente mudanças com TDD, testes e evidência real, e resolva os gates até onde for seguro. Não pare após um diagnóstico e não peça ao proprietário para fazer o que as ferramentas autorizadas conseguem executar. Entretanto, **NÃO** faça merge, deploy, ativação, migração remota, alterações Access produção, escrita em fotos/dados reais, contratação ou exclusão de recursos históricos sem autorização específica. G15/G19/G20/G22 exigem humanos reais e não podem ser falsificados pelo agente.

Resultado pretendido: módulos privados testados ponta a ponta, SSR/custos compatíveis com os recursos gratuitos, isolamento comprovado, backup e rollback reais, experiência acessível, segurança revisada independentemente, decisões LGPD aprovadas e release autorizado especificamente. Se depender de terceiro, produza pacote objetivo de decisão/evidência e siga tarefas independentes; termine relatando **NO_GO** enquanto qualquer gate bloqueante existir.

## B. BASELINE OBRIGATÓRIO (REVALIDAR, NÃO ASSUMIR COMO IMUTÁVEL)
- Repo: https://github.com/menezesx2k26-byte/lab-punctum-picture .
- PR principal R4: https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32 ; em 08/11/2026 está `draft/open/unmerged`.
- Worktree operacional isolada: `D:\Repos\punctum-r4-completion-20261107`.
- Branch: `fix/punctum-albums-r4-completion-20261107`.
- HEAD de **código** capturado antes dos documentos desta rodada: `baab1bac1e58a90d8fe2fd43d8e71f17d726cdf3`; o commit documental subsequente terá outro SHA. Sempre verificar o HEAD efetivo e upstream antes de editar/push.
- Main remota capturada: `0636ab7105cf54455bf7db9ad640471ea764e5a2`; refazer comparação main…branch antes de integração. No snapshot: main 19 à frente/branch 193 à frente.
- Stacked PRs abertos: #13 → #17 → #20 → #24 → #32. A base de #32 é a branch da #24. Não apagar PRs, branches, worktrees nem rebasear trabalho alheio silenciosamente.
- Baseline CI de código: [#42497465093](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42497465093), `completed/success` no SHA `baab1ba`. Local: **232 Workers/56 arquivos**, **11 testes Node Images**, typecheck, lint, build, audit0; browser E2E aprovado na CI. Qualquer novo HEAD precisa nova prova.
- QA Cloudflare Images de mesma base: [#42497461077](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42497461077), `SYNTHETIC_IMAGES_BINDING_PASSED_AND_CLEANED`; 2×2 PNG→1×1 67B, Worker criado/excluído, inventário 17→17, 0 operações D1/R2. NÃO é upload integrado.
- Histórico ledger 28/10: **17 PASS, 2 FAIL (G05/G17), 5 BLOCKED_EXTERNAL (G15/G19/G20/G22/G23)**. Mantenha estados separados por escopo/SHA. Não reciclar PASS antigo para uma alteração presente sem prova.
- Private galleries flag: `PRIVATE_GALLERIES_ENABLED=false` na configuração versionada de produção. Confirmar runtime separadamente antes de qualquer conclusão.
- QA D1 Free estava em **10/10 bancos ocupados**; não criar banco adicional por suposição, não deletar um existente, não alterar fixtures históricas.

## C. INVARIANTES E ESCOPO PROTEGIDO
1. O site da Maria (Studio, drafts, Colagem Autoral, hero, carrossel, portfólio, responsividade, identidade Punctum e Anti AI-Slop) deve permanecer funcional e visualmente íntegro. Jamais publicar um rascunho involuntariamente.
2. Originais e derivados de clientes não podem ser públicos. Sem JWT/sessão/autorização D1, mídia privada sempre negada, **HTTP 404/zero bytes reais**, inclusive HEAD, download, Web optimizer, fallback, caches e caminhos codificados.
3. **Cloudflare Access Free OTP + JWT RS256/JWKS** é o principal login de clientes. Cookie Punctum independente, allowlist admin explícita, autorização por `client_id` no D1, revogação e logout. Sem senha bridge ativa por improviso, sem duas experiências concorrentes.
4. Dados e recursos QA históricos imutáveis. R2 privados, DB legado, backups e fixtures QA de 28/10 não são descartáveis. Inventário antes/depois com hashes/relações; experiências apenas em recursos segregados e dentro do orçamento/autorização.
5. Nenhum novo plano pago/Workers Paid/Images hosting contratados; confirmar assinatura/cotas/uso e limite de responsabilidade, **não** declarar fatura R$0 sem Billing Read ou evidência equivalente.
6. Especificação original de uploads privados até **25 MiB/26.214.400 bytes** permanece referência. Código `baab1ba` introduziu limite **20.000.000 bytes**, necessário para evitar falha tardia no Images Binding (20 MB). **É GAP de produto, não escopo aprovado.**
7. Preservar branches/PRs/commits/histórico de versões rejeitadas, backups, snapshots e demais workers. Sem force-push, overwrite de evidência ou remoção de asserções para tornar CI verde.
8. Proteção de privacidade e governança precede velocidade. Redações de LGPD ou segurança elaboradas pelo próprio agente NÃO são assinaturas válidas.

## D. FLUXO DE EXECUÇÃO — NUNCA ENCERRAR NO PLANO
### Fase P0 — baseline, readback e proteção (G01/G02/G21)
a. Executar `git fetch origin --prune`, `status`, `rev-parse`, `ls-remote`, `merge-base`, ahead/behind e diff contra main/parent. Confirmar worktree limpa e estado aberto/draft de PR #32 e a cadeia #13/#17/#20/#24.
b. Ler a SPEC original `23 e ``0, 2, 15, 16, 17, 18, 22, 26`; docs de rollout/QA/segurança; validar que a matriz original tem 24 gates. Preservar snapshot antigo `execution-state.json`, criar novo checkpoint com escopo e provas, não reescrever retrospectivamente resultados.
c. Inventariar **somente leitura** conta Cloudflare correta: plano Workers/Images/Access, D1 count/id/quotas, R2 buckets e uso, Workers/rotas, CI secrets disponíveis (somente nomes), billing se permitido; Hostinger QA separado de PersistFlow. Abort remote writes se houver divergência ou risco.
d. Criar testes/reproduções do bloqueio prioritário e definir posse exclusiva de arquivos se houver workers paralelos. Nenhum worker remoto inicia experimento sem preflight.

**Aceite P0:** planilha/matriz dos 24 gates com `status + owner + source SHA + evidência + next safe action`; inventário read-only atual, sem segredo.

### Fase P1 — G05 upload privado integrado, contrato 25 MiB
**Bloqueio conhecido:** o R4 QA remoto anterior não possuía binding `IMAGES`; o shared raster do produto passou em Worker efêmero separado, porém D1/R2 não fizeram parte desse ensaio. A especificação prevê 25 MiB, mas `IMAGES.input()` suporta somente 20 MB: https://developers.cloudflare.com/images/get-started/limits/ . Conta Free já mostrou 10/10 D1; não reaproveitar banco ocupado com escrita de teste.

1. Reproduzir caso de 20.000.001 bytes, 26.214.400 bytes, MIME errado e dimensões inválidas; verificar **antes de qualquer intenção/arquivo** e não deixar órfão D1/R2. Preservar teste fail-closed do HEAD.
2. Investigar alternativa arquitetural sem custo adicional para manter **25 MiB efetivos**, com validação segura e derivativos privados. Exemplos a avaliar, **sem presumir aprovação**: pipeline pré-validado fora do Images Binding, processamento compatível e barato/sem custo demonstrado no QA autorizado, ou ajuste editorial com **aceite expresso do proprietário** e revisão da SPEC. Não contornar validação, não expor foto via URL pública e não reduzir requisito silenciosamente.
3. Criar ou identificar QA D1 **verdadeiramente segregado** sem exclusão/reutilização de fixture histórica; se o limite 10/10 impedir, registrar `BLOCKED_EXTERNAL` da prova remota e continuar preparação/testes locais. **Não** inventar slots, upgrades ou chamar teste Miniflare de “Cloudflare D1 remoto”.
4. Testar fluxo de produto com identidade correta, não probe substituto:
   - admin autorizado cria conta/galeria e intenção, recebe URL restrita;
   - upload binário real sintético via caminho do produto, R2 privado, verificação `Content-Type`, size e SHA256;
   - confirmar ready/metadata/capa/lista/download original com hash idêntico;
   - reenvio idempotente, HTTP 409 conflito real, retry de timeout/falha parcial, rota IMAGES 503 sem invalidar estado legítimo, expiração de intent, ordem da fila até três uploads;
   - MIME mismatch, pixel bombs, arquivo truncado, arquivo acima do limite, D1/R2 falhos, revogação no meio do fluxo;
   - contas A e B, cliente desligado, galeria draft/archived, requisição anônima, mídia HEAD/GET sem corpo, sem cache público;
   - contagens/IDs antes/depois do QA, zero mutação dos recursos históricos e cleanup verificado.
5. Prova de conformidade de custo e imagens Free com amostra real, sem extrapolar do pequeno probe. Se 25 MiB não for viável e nenhuma mudança de produto for aprovada, G05 permanece **FAIL**.

**Aceite G05:** E2E no mesmo código/config/sha com D1, R2, IMAGES, Access/auth e evidências sanitizadas de bytes/hash e falhas; requisito de tamanho resolvido explicitamente; sem dados reais ou custo novo.

### Fase P2 — G17 CPU **cold** e custos Free
**Falha conhecida:** sem cache a home SSR teve amostra CPU p50 ≈46,9ms e p95 ≈72,5ms (QA #42441525618), acima de 10ms Workers Free. Cache nomeado `PublicHome` (anonymous GET / HTML) produziu 35 HIT/36 e purge `HIT→MISS→HIT`, mas **não prova** CPU no primeiro acesso. Referências: https://developers.cloudflare.com/workers/platform/limits/ e https://developers.cloudflare.com/workers/cache/ .

1. Avaliar e testar opções R$0 que eliminem renderização cara em **cold MISS**, não apenas a disfarçam: por exemplo, snapshot HTML/estático versionado pela publicação editorial, serviço SSR comprovado com capacidade e custo existentes, ou outra arquitetura demonstrável. Não comprometer Studio, Colagem, SEO, conteúdo dinâmico, login, links de mídia e consentimento.
2. Implementar com TDD e rollback, mantendo cache **somente** público-anônimo; nenhuma resposta autenticada/privada/404 de cliente com dados internos é cacheável. Invalidação após publicação bem-sucedida não duplica writes. Provar que navegador não exibe snapshot antigo indevidamente.
3. Medir no Worker Free real e **código exato**: first cold request, purged MISS, rewarm HIT, sessões A/B, logout, home/portfolio/Studio/admin/media/imagem/client APIs, conjunto representativo de formatos e concorrência segura. Capturar amostragem, quantis, máximo observado, HTTP 200/4xx esperados, 5xx, `exceededCpu`/1102, billing/uso, cold path e quota diária; não usar somente wall latency como CPU.
4. Critério conservador: **nenhuma invocação observada ultrapassa 10 ms CPU** em cenários-alvo, sem erros `exceededCpu` ou 5xx inesperados, com amostra/rastreabilidade adequadas para as rotas. Se telemetria vier vazia/incompleta, `FAIL/BLOCKED`, nunca PASS por workflow verde.
5. Revalidar custo total do Worker/Images/D1/R2/Access/Actions dentro da franquia disponível e **sem nova obrigação**, incluindo janela temporal e tráfego agregado.

**Aceite G17:** CPU cold e custos demonstrados por provas reais, reproduzíveis, representativas do HEAD final, sem migração para plano pago.

### Fase P3 — segurança funcional, identidade, frontends e não regressão (G02–G04, G06–G14, G16)
- Testar JWT Access RS256/JWKS com issuer/audience, exp/iat/sub/email/type, jti/scope quando exigidos; tokens falsos, expirados, issuer/aud errados e cliente com token admin não autenticam.
- Revalidar o OTP real histórico G07 no contexto correto sem solicitar código secreto pelo chat; registrar evidência sanitizada e escopo de aparelho.
- Revalidar A/B/IDOR, `client_id` D1, mime/bytes, favoritos, downloads, logout/reentry/revocation/version, desativação e reativação em QA, cache e URL traversal/double encoding.
- Cobrir UI cliente/admin em **320, 360, 375, 390, 430, 768, 1024, 1440 px**; foto portrait/landscape, lightbox, teclado Escape/setas, foco/retorno, reduced motion, loading, 404, 409 e retry. Sem erros de JS/console/404 de chunks.
- E2E real de Studio/Colagem com preservação do rascunho, mudança de preset sem alterar conteúdo, hero/carrossel e portfólio conforme baseline público. Comparar snapshots e comportamento com main antes de merge. Não substituir prova por screenshot estático.
- Testar logout/admin Access, cache headers, fotos privadas sem dados/logs/HTML/RSC.
- Corrigir cada defeito RED→GREEN→regressão antes de avançar.

**Aceite:** G02–G04, G06–G14 e G16 novamente comprovados no HEAD relevante; PR revisável e CI exata sem regressão.

### Fase P4 — G15 acessibilidade/matriz assistiva **real**
Cobertura mínima: aparelhos reais Android + TalkBack e iPhone/iOS + VoiceOver (ou documentar precisamente indisponibilidade), mais teclado desktop/zoom real 200%/reduced motion/contraste/foco visível/alvos toque, galeria com foto, favorito, download permitido/negado, logout, estados vazios. Capturar navegador, modelo/versão, data, cenário e resultado sem fotografias privadas. Emulação só cobre seu próprio escopo; não aprovar G15 se não tiver a matriz física exigida.

### Fase P5 — G18/G23 backup/restauração e rollback integral
- Preservar relatório de G18 histórico run #40786688338; repetir o que for necessário no HEAD final, sem claims retroativos.
- Antes de mexer em QA remoto: snapshot D1/R2 sintéticos, SHA256 por objeto, relações/FKs, versão/rotas/flags Worker e versão Studio/Colagem/draft. Criar ambiente destino verdadeiramente isolado ou interromper.
- Exercitar backup→restore byte a byte→relação→A/B→revogação/quarentena→flag-off/404/0 bytes.
- **G23 adicional:** retornar Worker/Assets/config para a **versão anterior previamente verificada**, restaurar versão pública Studio/Colagem sem publicar rascunho, comparar hashes/dados/rotas e reabrir QA controladamente. Não destrua dados reais, histórico QA, nem use migration reversa. Teste local `tests/integration/r4-public-rollback.spec.ts` é prova parcial e não substitui este ensaio remoto.
- Registrar RTO/RPO observados/limites, tabela de evidência e responsável pela execução. Não inferir disponibilidade após rollback sem GETs reais.

**Aceite G18:** dados/bytes/relações/isolamento e sessões antigas consistentes em restore autorizado. **Aceite G23:** versão Worker/config/Studio/Colagem realmente revertida e reaberta em QA com verificação funcional, privacidade e data integrity.

### Fase P6 — G19 segurança **independente**
O revisor deve ser tecnicamente independente do agente implementador, ter escopo claro e entregar parecer versionado/sanitizado. Cobrir IDOR, confusão admin/cliente, JWT/OTP, auditPrincipal em senha compartilhada, revogação de sessão, RBAC/allowlist, rate limit, cache + Images optimizer, R2 traversal, favoritos, uploads concorrentes e objetos órfãos, exportação LGPD, incidentes, logs, restore e CPU. Achados identificados com severidade, reprodução, fix, RED/GREEN, status e SHA. **Zero P0/P1 abertos**; relatório sem assinatura/autorização de revisor não aprova G19. Não se autoassinar como revisor distinto.

### Fase P7 — G20 LGPD e G22 autorização do proprietário
**G20:** preparar pacote de decisão para Maria, responsável pelo estúdio/controladora, com identificação/contato, finalidade e base aplicável verificada, política de comunicação, retenção por categorias (fotos, favoritos, contas, intents, auditoria, backup), solicitação do titular, exportação sanitizada, exclusão e exceções, incidentes, terceiros/suboperadores, entrega segura de fotos/links e direitos de terceiros. Não inventar prazo/base jurídica nem apagar dados reais. Solicitar **aceite expressamente identificado e datado**, versionado em registro privado apropriado.
**G22:** apenas quando os demais gates críticos estiverem PASS, pedir aprovação **específica** do proprietário para R1 (integração/código), R2 (merge/deploy com flag OFF e migrações somente aditivas), R3 (ativação com flag ON e teste sintético pós-release). Uma mensagem genérica “termina” não libera merge ou dados reais. Em caso de não autorização, **NO_GO** com release pack pronto; não rebaixar gate.

### Fase P8 — CI, PR, relatório e continuidade (G21/G24)
- Após cada alteração de código: `npm ci`, `npm audit --audit-level=low`, `npm run typecheck`, `npm run lint`, `npm test`, `npx vitest run --config vitest.collage.config.ts`, Node scripts R4, `npm run build`, SSR imports e Chromium E2E; `git diff --check`. Registrar contagens reais, skips, avisos e duração.
- CI exata no HEAD da PR #32, verificar SHA de checkout, jobs e conclusão, artefatos de navegador/CPU/Images e paths; **não confundir workflow success com gate PASS**. Revisar diff main e stack, dependabot default branch versus npm audit do lockfile atual.
- Persistir novos registros no **repo**, PR e Drive Sgtmenezes → Punctum Picture; anexar evidências sanitizadas, links reais, hashes e razões dos bloqueios. Engram por append+get; PersistFlow por checkpoint+inspect, sem declarar takeover/auto-run que não existe.
- Atualizar ``docs/operations/private-albums-r4/execution-state.json`` com validade temporal e **não apagar histórico**; se mudar o schema, versionar e validar leitura idempotente. Revisão/handoff final com SHA exato e relatório honesto.

## E. MATRIZ DE ACEITE — DoD CANÔNICO G01–G24
Para cada gate preencher ``STATUS | OWNER | SOURCE SHA | TESTE/COMANDO | AMBIENTE | OUTPUT/ARTIFACT | EVIDÊNCIA LINK | LIMITAÇÕES | NEXT ACTION``. A coluna inicial abaixo refere ao histórico reconciliado; ela **não** substitui prova do HEAD de entrega.

| Gate | Definição original | Entrada | Critério para marcar PASS |
|---|---|---|---|
| G01 | Baseline atualizado — SHAs/inventário | PASS histórico | Main/stack/branch/worktrees/infra e divergências verificados agora |
| G02 | Integração sem regressão — diff auditado/testes | PASS histórico | Diff/CI/Studio/Colagem/portfólio íntegros no HEAD final |
| G03 | Cadastro admin — E2E/D1 | PASS histórico | Admin autorizado cria cliente, row no D1 e negativas comprovadas |
| G04 | Galeria e publicação — E2E | PASS histórico | Draft→edição→capa→publicação→revogação/arquivar |
| **G05** | **Upload confiável — bytes/retry** | **FAIL** | Auth→intent→R2→Images→ready→mídia real QA, SHA/retry/órfãos/tamanho 25 MiB resolvido |
| G06 | JWT Access — testes criptográficos | PASS histórico | JWT verificado; negativos de assinatura, issuer/aud/time/claims |
| G07 | OTP real — evidência real sanitizada | PASS histórico real desktop | Fluxo em ambiente correto/revalidado, logs sanitizados e sessão |
| G08 | Sessão segura — auth/revogação | PASS histórico | Logout/disabled/rotation, cookie replay negado e sessão independente |
| G09 | Isolamento — matriz A/B | PASS histórico | Nenhum A acessa informações/bytes/favoritos de B |
| G10 | Mídia privada — zero bytes indevidos | PASS histórico | GET/HEAD/admin/optimizer anon/foreign/flag-off 404 e zero bytes |
| G11 | Favoritos — persistência E2E | PASS histórico | Toggle/reload/D1 e isolamento |
| G12 | Downloads — API/UI | PASS histórico | Original byte/hash válido, negação quando off/foreign |
| G13 | Frontend cliente — browser | PASS histórico | Fotos, lightbox, teclado/foco, loading/erro/empty/revogação |
| G14 | Frontend admin — browser | PASS histórico | Cadastros, upload/progresso, reorder/capa/publish/erros |
| **G15** | **Acessibilidade — matriz assistiva** | **BLOCKED_EXTERNAL** | Android/iOS físicos, assistivas, zoom, foco e relatório humano real |
| G16 | Não regressão pública — testes main | PASS histórico | Baseline público vs código final sem mudança editorial indevida |
| **G17** | **CPU/custos — fontes/medição** | **FAIL** | Free CPU cold <=10ms por invocação observada no cenário qualificado, erros 0, custos/quotas verificados |
| G18 | Backup/restauração — D1/R2 byte a byte | PASS histórico | Restore autorizado com hashes/contagens e proteção de sessão |
| **G19** | **Segurança independente — sem P0/P1** | **BLOCKED_EXTERNAL** | Revisor externo/distinto e relatório formal, zero P0/P1 |
| **G20** | **LGPD — aprovação estúdio** | **BLOCKED_EXTERNAL** | Decisões versionadas e aprovação expressa da controladora |
| G21 | PR integração — CI/revisão | PASS histórico | PR revisável, CI no HEAD exato, artefatos examinados |
| **G22** | **Release — autorização específica** | **BLOCKED_EXTERNAL** | Aprovação explícita de proprietário para operações de produção |
| **G23** | **Rollback — procedimento testado** | **BLOCKED_EXTERNAL** | QA remoto Worker+config+Studio/Colagem+dados/sessões e reabertura |
| G24 | Handoff — relatório verificável | PASS histórico | Estado completo Git/Drive/Engram/PersistFlow com readback |

## F. COMO CALCULAR O VEREDITO
**FULL_OPERATIONAL_DOD = todos os 24 gates obrigatórios PASS no escopo atual + nenhuma violação dos invariantes + autorizações exigidas.** Um `NOT_APPLICABLE` só é legítimo com justificativa e alteração explícita de escopo autorizada; não remover G15/G19/G20/G22/G23 para fazer a contagem fechar.
- `TECHNICAL_READY_AWAITING_EXTERNAL`: código/CI/QA técnico pronto com dependência humana formal ainda pendente; **não** equivale a FULL_OPERATIONAL_DOD nem GO produção.
- `PARTIAL_WITH_BLOCKERS`: implementação incremental verificada, mas faltam gate técnico ou externo.
- `NO_GO_PRODUCTION`: qualquer G05/G06/G07/G08/G09/G10/G15/G17/G18/G19/G20/G22/G23 obrigatório não aprovado no escopo atual. O status de entrada é NO_GO.
- `GO_FOR_R1`, `GO_FOR_R2_FLAG_OFF` e `GO_FOR_R3_FLAG_ON` são **aprovações separadas**, nunca inferidas automaticamente da CI ou do desejo de terminar.

## G. CRITÉRIOS DE PARADA IMEDIATA — somente a operação perigosa
1. Qualquer risco de expor original, thumbnail, link, cookie, JWT ou dados de cliente.
2. QA apontando para D1/R2/Access/Workers produção ou histórico sem autorização específica.
3. Falha de permissão/segredo, uso de credencial de outra conta, upgrade ou cobrança não autorizada.
4. Destruição, purge de fotos, migration reversa, restauração sobre DB ocupado.
5. Risco de Studio/draft/Colagem/portfólio/main.
6. Autenticação aceita sem assinatura/audience/allowlist ou falha cross-client.
7. CPU incompatível, telemetria vazia ou prova só de cache HOT.
8. Revisão de segurança autoassinada, política LGPD inventada ou release sem autorização.

Ao parar a operação perigosa, preservar log sanitizado, indicar `BLOCKED_EXTERNAL`/`BLOCKED_SECURITY` ou `FAIL`, e avançar outro trecho seguro. Não repetir o mesmo experimento sem hipótese/teste novo e sem checar quotas.

## H. Definition of Done para os artefatos e o último turno
Entregar efetivamente, com readback:
- Código versionado, migrações seguras e testes RED/GREEN, sem regressão pública.
- Matriz original de 24 gates com status e prova por SHA/ambiente/artefato, **incluindo falhas**.
- Evidência da homologação Cloudflare real quando autorizada, com pré/pós inventário e custo/CPU cold.
- Experiência cliente/admin e matriz A/B, mídia privada, download hash, upload seguro e recuperável.
- Matriz de acessibilidade física; parecer independente; aprovação LGPD da controladora; backup/rollback remoto completo.
- PR #32 e CI exatas, reviewer, release pack R1/R2/R3, autorização específica antes de qualquer ativação.
- Handoff reprodutível e checkpoint do projeto no repo, Drive, Engram e PersistFlow, com verificação da escrita.
- Relatório final no formato ``RESULT / CHANGES / VALIDATION / GATES / BLOCKERS / COST / PRODUCTION / NEXT_SAFE_ACTION``; texto objetivo, sem promessas de trabalho assíncrono.

**Instrução de execução final:** faça o trabalho técnico até o máximo estado seguro possível. Se restar qualquer gate bloqueante, comunique exatamente o que está faltando, com responsável e evidência; preserve ``PRIVATE_GALLERIES_ENABLED=false``, PR draft e **NO_GO**, nunca alterando o status para satisfazer artificialmente uma meta.
