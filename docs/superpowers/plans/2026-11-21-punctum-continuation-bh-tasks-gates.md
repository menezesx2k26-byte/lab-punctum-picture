# Prompt de continuidade integral — Punctum Picture após BH

> Prompt pronto para um novo chat/agente. Leia este arquivo integralmente antes de agir. O objetivo é execução e homologação do que falta; não reiniciar o projeto nem recriar o Hero.
>
> Quando executar um incremento com código, use o plano existente e as skills aplicáveis de execução/TDD. Este documento não concede autorização de produção.

**Goal:** avançar até o último DoD seguro dos dois releases independentes, preservando o site, o trabalho de Studio/Hero/Colagem, a integridade dos álbuns R4 e as evidências anteriores.

**Architecture:** reutilizar os candidatos Worker e Node/Vinext/SQLite/Sharp existentes. Hostinger Unlimited é o destino proposto; Cloudflare continua sendo a produção preservada. A VPS é exclusivamente QA auxiliar. Reaproveitar código e testes do Hero já presentes, corrigindo somente defeitos reproduzidos.

**Tech Stack:** TypeScript/React/Vinext, Cloudflare Workers/D1/R2, Node 24, SQLite/Sharp, Clerk, Hostinger Unlimited, Vitest/Playwright e GitHub Actions.

**Spec e fontes:** os documentos abaixo compõem o escopo. O plano do Hero é histórico e contém divergências documentadas; o código atual não pode ser substituído cegamente por suas instruções antigas.

**Contrato adicional para LUNA (22/11/2026):** antes de T00, ler integralmente [o plano de fechamento LC0–LC6](2026-11-22-punctum-luna-gate-closure.md). Ele torna obrigatórios: precedência entre documentos/SHAs, reconciliação sem sobrescrever o WIP Clerk, critério mensurável de G16/G17, recuperação D1/R2 com escritas posteriores, revisão humana separada e proveniência de CI. Este contrato complementa T00–T06 e **não altera** o significado nem o estado de G01–G24. Se houver conflito de HEAD, revalidar Git, ledger e decisões aprovadas; não seguir baselines históricas cegamente.

**Regra de execução:** somente branches/commits pequenos e testes no escopo autorizado; nenhuma mudança de produção, Clerk Production, DNS, release ou billing decorre desta atualização documental.


## 1. Fontes obrigatórias e ordem de leitura

Use arquivos da revisão obtida por Git; links imutáveis de evidência são fornecidos quando o SHA importa.

| Ref | Fonte | Uso e limite |
| --- | --- | --- |
| R01 | https://github.com/menezesx2k26-byte/lab-punctum-picture | Repositório |
| R02 | https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/45 | PR de integração, OPEN/DRAFT na última leitura; não fazer merge |
| R03 | https://github.com/menezesx2k26-byte/lab-punctum-picture/issues/44 | Bloqueio canônico de associação Hostinger; ler também comentários |
| R04 | [Plano Unlimited/R4](2026-11-20-punctum-post-transfer-unlimited-r4-dod.md) | Plano complementar de execução; não reiniciar tasks já comprovadas |
| R05 | [Plano de domínio e release](2026-11-20-punctum-unlimited-domain-unblock-and-r4-release.md) | Separação de registro, associação, TLS e cutover |
| R06 | [Ledger](../../operations/private-albums-r4/execution-state.json) | Preservar histórico e os 24 registros em currentCycle20261121AY.gateRecords; ler o fechamento BH |
| R07 | [Relatório BE–BH](../../operations/private-albums-r4/89-cycle-be-vps-parity-sitemap-2026-11-21.md) | Execução, limites, inventário residual e recibo final |
| R08 | [CI do código BH](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44889674474) | Evidência exclusiva de f020e1b1a1e1667029fc0bb50c7073d23a117d79 |
| R09 | [Checkpoint Sgtmenezes](https://drive.google.com/file/d/1x7-qc48BbWYdCvVuuXZKD4UOazuIMtWe/view) | Histórico até BH; reconciliar com Git, sem sobrescrever conteúdo novo |
| R10 | [Plano histórico do Hero](2026-08-25-direct-hero-upload.md) | Ler a nota de reconciliação inserida no início |
| R11 | [Design histórico do Hero](../specs/2026-08-25-direct-hero-upload-design.md) | Intenção funcional; resolver divergências antes de alterar comportamento |
| R12 | [Definições G01–G24](../../operations/private-albums-r4/16-original-g01-g24-reconciliation.md) | Definições e correção G13/G14/G15; estados de outubro são históricos |
| R13 | [Pacote G19](../../operations/private-albums-r4/g19-independent-review-package-2026-11-20.md) | Revisão de segurança; não equivale a aprovação formal |
| R14 | [Decisões LGPD](../../operations/private-albums-r4/11-lgpd-decisions.md) | Decisões da controladora ainda necessárias |
| R15 | [Checklist de sessão Clerk](../../operations/private-albums-r4/r1-clerk-session-lifetime-ops-checklist-2026-11-20.md) | Distinguir duração da sessão e expiração do JWT |
| R16 | [Rollback](../../operations/PUNCTUM-ROLLBACK.md) e [Studio/Colagem](../../operations/private-albums-r4/33-rollback-studio-colagem-2026-11-08.md) | Baselines históricas: não executar restore nem promover G23 pelo título do runbook |
| R17 | [Plano de fechamento LUNA LC0–LC6](2026-11-22-punctum-luna-gate-closure.md) | Obrigatório antes de T00; precedência, proteção WIP Clerk, thresholds propostos versus aprovados, G18/G23 independentes e DoD separados |

Se uma referência não existir no checkout, confira a revisão/branch antes de inferir ausência. Não dependa exclusivamente de outputs ignorados ou do histórico do chat. Publique referência sanitizada em documentação existente quando ela for necessária para continuidade.

## 2. Baseline comprovada e proteção de WIP

- Worktree de continuidade: `C:\Users\Pichau\.codex\worktrees\punctum-unlimited-release\Punctum Picture`.
- Branch: `codex/punctum-unlimited-release-20261120`.
- Último SHA de código qualificado: `f020e1b1a1e1667029fc0bb50c7073d23a117d79`.
- Baseline anterior: `1d14ee29db93b67deb2f37efdb60d02c45d46683`.
- Commits documentais posteriores não invalidam automaticamente a prova do código, mas devem ser identificados separadamente. Conferir refs atuais; este prompt não congela o HEAD.
- O checkout principal em `C:\Users\Pichau\Documents\ChatGPT\Punctum Picture` foi observado na branch `agent/punctum-clerk-auth/20261121-045514`, HEAD `b417405c0406daf286b192a8151cf45c4a50f89c`, com WIP Clerk em código, dependências e migrações. Não resetar, sobrescrever, importar por cópia ou commitar esse WIP como se fosse desta retomada.
- Não iniciar controladores, CI, smoke ou reviewers duplicados. Reconferir processos e execuções existentes antes de disparar trabalho.

### Já concluído; não refazer

1. Access `POST /admin/api/clientes/:id/reset-password`: UPDATE da conta e `prepareAudit(client.access_reauthorized)` estão no mesmo D1 batch.
2. RED reproduziu HTTP 500 com estado persistido incorretamente; GREEN exige conta inteira intacta, zero evento parcial, retry HTTP 200, sessão 7→8 e um único evento atribuído.
3. Local: 17 testes em quatro arquivos, typecheck, lint focado e diff check passaram.
4. CI R08: verify e hostinger-node-qa passaram; 336 testes/64 arquivos; cinco casos de auditoria, com o nome Access no log; sete testes Colagem; audit de dependências zero vulnerabilidades.
5. Revisão nativa delimitada: sem bloqueios no patch. G19 formal permanece HOLD.
6. Correções anteriores de sitemap e archive/unpublish mantêm suas provas. Reutilizar quando o código coberto não mudou.
7. VPS auxiliar: 28 testes e fixture 25 MiB com hash/decodificação comprovados; não executar novo smoke sem necessidade técnica.
8. Os dois artefatos da CI foram baixados e tiveram SHA-256 e ZIP conferidos. Ambos registram sourceSha exato e checkoutDirtyAtRun=true; não alegar execução inteiramente limpa nem homologação gerenciada.

## 3. Restrições e gate zero

- Custo incremental autorizado: R$ 0. Não comprar VPS, plano, créditos ou serviços.
- Sem autorização específica: NO MERGE, DEPLOY, DNS, NS, TXT, CUTOVER, migração de produção, alterações Clerk Production, ativação R4, billing ou restore destrutivo.
- Manter `PUNCTUM_CANDIDATE_PRIVATE_GALLERIES_ENABLED=false` no release público e `CLERK_PILOT_ENABLED=false` até autorização própria.
- Não ativar Clerk porque a instância foi encontrada; não criar usuários ou aplicações duplicadas.
- Não contactar suporte sem autorização de contato. Texto preparado não equivale a mensagem enviada.
- Não reutilizar identidades/aplicações Miranda, Conthabil ou outros projetos.
- Não armazenar chaves completas, tokens, cookies, OTP, credenciais nem fotos/dados reais em prompts, evidências ou commits.
- Ler integralmente `C:\Users\Pichau\.agents\skills\context-budget-manager\SKILL.md` e amostrar a telemetria atual antes de implementação/fan-out. Última amostra final BH: primária 33%, semanal 67%, contexto 52,10%, PRESSURE. É histórica, não liberação atual.
- Usar guard existente em `C:\Users\Pichau\.agents\persistd\src\quota-guard.js`. Em ROLLOVER/CHECKPOINT_ONLY, não abrir nova implementação pesada; em EMERGENCY/CHECKPOINT_ONLY, somente leitura direcionada, checkpoint e handoff. Não contornar quota com outro chat/agente.
- Em PRESSURE, sem polling de modelo ou expansão pesada; priorizar integração e provas já existentes.
- CoS anterior passou health/actions, mas o worker-3 não iniciou; run d9d82862-0654-44fb-8cea-aa285d8fb80c, mensagem e436c67b reconhecida. Não repetir startup sem resolver a causa.
- Gemini teve health válido e requisição anterior bloqueada por HTTP 429/créditos insuficientes. Não repetir requisições enquanto esse bloqueio persistir.
- Antes de nova delegação, revalidar health, autorização, quota e workers. Trabalho mutável exige worktree isolado, branch agent/*, commit/testes e integração pelo coordenador.
- Não executar matriz completa no início; reaproveitar R08 para código inalterado. Para defeitos, RED→patch mínimo→GREEN focado→CI exato→revisão. Builds completos ficam preferencialmente na CI.

## 4. T00 — Takeover e reconciliação

**Entradas:** R01–R12, Git local/remoto, telemetria e processos.
**Arquivos:** leitura do ledger/relatório; escrever somente diferença factual no registro existente.

- [ ] Conferir branch, HEAD, upstream e dirty state antes de tocar em arquivos.
- [ ] Ler as refs atuais da PR #45 e issue #44/comentários; separar produto, documentação, CI e produção.
- [ ] Identificar mudanças posteriores a f020e1b1 e conferir se alteram os arquivos já qualificados.
- [ ] Reconciliar Drive com Git, preservando ambos; não substituir ledger por uma tabela histórica de outubro.
- [ ] Preservar o WIP Clerk do checkout principal e registrar sua localização sem integrá-lo automaticamente.
- [ ] Produzir matriz SHA × branch × ambiente × evidência × limite × próximo responsável.

Comandos iniciais, no worktree correto:

```powershell
git status --short --branch
git rev-parse HEAD
git log -5 --oneline
git diff --stat
git ls-remote --heads origin codex/punctum-unlimited-release-20261120
```

**Aceite:** G01/G24 com refs reais, sem operações repetidas, reset, stash destrutivo ou perda de WIP.

## 5. T01 — QA Linux auxiliar e orçamento de execução

**Referências:** R07 e runner já existente; VPS Hostinger 2135319, exclusivamente auxiliar.

- [ ] Reutilizar a prova de 28 testes, fixture 25 MiB, SSH ~10,766 s e pico amostrado ~90,7 MiB enquanto os arquivos cobertos não mudarem.
- [ ] Se um defeito exigir Linux, selecionar o menor teste reproduzível e verificar capacidade/limites antes do job.
- [ ] Preservar limites por job, outros serviços/containers e diretório exclusivo do runner.
- [ ] Não subir build completo no PC/WSL ou na VPS por conveniência; usar o caminho já qualificado.
- [ ] Registrar SHA, comando, saída, tempo, memória e escopo. Capacidade disponível não significa custo/capacidade do destino gerenciado.

**Aceite:** nenhuma interferência em outro projeto; não usar VPS como destino público ou substituir G17 por um smoke.

## 6. T02 — Integridade, sessões e auditoria

**Arquivos:** `worker/api/client-admin.ts`, `worker/utils/audit.ts`, `tests/integration/client-admin-audit.spec.ts`.

- [ ] Preservar a correção Access e os testes de archive/unpublish; não reimplementar o mesmo batch.
- [ ] Inventariar o diff atual antes de selecionar qualquer novo defeito. Os dez caminhos abaixo permanecem fora da correção BH:
  - criação de cliente; reset não Access; Clerk link/unlink; habilitar/desabilitar conta;
  - criação de galeria; capa; ordem; publicação; edição de metadados/downloads.
- [ ] Para um caminho que mereça correção, abrir um incremento delimitado: trigger de audit INSERT, estado integral antes/depois, HTTP esperado, zero evento parcial e retry atribuído. Não converter todos os caminhos em uma reescrita geral.
- [ ] Reutilizar prepareAudit/batch quando aplicável. Preservar identidade administrativa, payload, permissões e erros que evitam perda de dados.
- [ ] Não confundir um retry após falha com idempotência de múltiplos pedidos bem-sucedidos.
- [ ] Se houver mudança no código Access/audit, executar primeiro:

```powershell
npm test -- tests/integration/client-admin-audit.spec.ts tests/integration/client-access.spec.ts tests/integration/client-access-flow.spec.ts tests/integration/admin-session-rotation.spec.ts
npm run typecheck
node node_modules/eslint/bin/eslint.js worker/api/client-admin.ts tests/integration/client-admin-audit.spec.ts
git diff --check
```

**Aceite:** reproduzir o defeito escolhido antes do patch e demonstrar o contrato depois; G19 continua dependente de revisão formal do release inteiro.

## 7. T03 — Hostinger, associação e identidade Clerk

### T03.A — Hostinger: distinguir registro, hospedagem e roteamento

**Referências:** R03/R05/R07; `scripts/punctum-hostinger-account-preflight.py`, workflow `.github/workflows/punctum-hostinger-account-preflight.yml`.

Estado conhecido:
- Unlimited: pedido 1008583103; usuário u775492464.
- Node existente: magic-lime-guanaco-79.hostingersite.com, Node 24.x.
- Domínio registral punctumpicture.com Active; associação recusada, TXT vazio.
- Não usar credencial Premium antiga, pedido 1008628483/usuário u571409090.
- Browser confirmou o Node temporário separado do recurso de registro; o ZIP instalado era sintético a136f721, com variáveis None. Não é o release BH instalado.
- Não houve resposta oficial/protocolo que comprove liberação do vínculo.

- [ ] Ler a issue antes de nova consulta; manter BLOCKED_PROVIDER se nada mudou.
- [ ] Sem nova transferência, ownership workflow, DNS/TXT inventado, exclusão/recriação ou suporte não autorizado.
- [ ] Após confirmação objetiva do provedor, realizar uma única verificação na conta Unlimited e exigir vínculo ao Node exato.
- [ ] Só depois qualificar Host/certificado para apex/www e roteamento pretendido, sem cutover automático.
- [ ] Registrar correlation IDs e protocolo reais, nunca inferidos.

**Aceite:** registro Active sozinho não satisfaz associação, TLS, paridade ou autorização de release.

### T03.B — Clerk: control plane e QA isolado

**Arquivos:** `worker/auth/clerk-auth.ts`, `worker/client/clerk-pilot.ts`, R15, `tests/integration/clerk-pilot.spec.ts`.

Identidade já reconciliada:
- Workspace Personal Workspace; aplicação My Application ligada a punctumpicture.com.
- App app_3M14L9JyjaJ9ySitVTsQFf6xJ2A.
- Instância Production ins_3M6H9ktM3jO84RvEu5BmKFokCfr.
- Issuer/Frontend API https://clerk.punctumpicture.com; JWKS /.well-known/jwks.json.
- Prefixo público pk_live_; nunca copiar a chave completa.
- Frontend API, portal e Email 3/3 mostravam Verified, certificados Issued; último check do painel tinha sete dias.
- O banner Email setup recomenda segundo provedor, desligado; não comprova falta dos registros principais.
- Sessão máxima configurada: sete dias; inactivity OFF; reverificação dez minutos; native igual web; multisession OFF.
- Restrição Allowed subdomains OFF; isso não comprova os authorizedParties do Worker.
- GET de produção /api/clerk-pilot/me retornou 404; não houve ativação.

- [ ] Reconciliar SITE_ORIGIN, CLERK_ISSUER, CLERK_PILOT_ISSUER, CLERK_PUBLISHABLE_KEY (só prefixo), presença de CLERK_JWT_KEY, CLERK_AUTHORIZED_PARTIES e flags. Valores remotos não foram comprovados pelo arquivo versionado.
- [ ] Inventariar a instância Development/QA antes de criar aplicação ou identidades. Production descoberta não é QA autorizado.
- [ ] Usar apenas identidades sintéticas e alvo isolado expressamente autorizados.
- [ ] Testar issuer/audience/JWKS/azp/sid, assinatura inválida, sessão ausente/expirada/revogada, logout, desligamento da conta, unlink/rebind e replay antigo.
- [ ] Exercitar A/B: biblioteca, galeria, mídia GET/HEAD, favoritos e downloads; terceiro sem vínculo deve ser negado.
- [ ] Provar zero bytes indevidos, private/no-store e ausência de tokens/dados pessoais nos logs.
- [ ] Não publicar DNS de e-mail/Frontend API, criar usuários Production nem alterar flags como efeito da descoberta.

**Aceite:** G03/G06–G10/G13 somente podem avançar com prova do ambiente correto; dashboard, JWT sintético e HTTP 200 isolados não bastam.

## 8. T04 — Hero, Studio, Colagem, público e acessibilidade

**Owner:** usar frontend-director para qualquer mudança material de UI. Antes de aprovar fotos/assets, usar visual-quality-director; se houver geração/edição raster, preparar o briefing antes de imagegen. Sem redesign por iniciativa própria.

### T04.H0 — Reconciliar o plano histórico antes de editar

O upload Hero já existe. Estes são os caminhos reais:
- `migrations/0008_site_media.sql`, `db/schema.ts`;
- `shared/config/index.ts` e módulos de schema/registry existentes;
- `worker/site-media.ts`, `worker/media/serve.ts`, `worker/api/admin.ts`, `shared/site-config-storage.ts`;
- `app/admin/components/studio/StudioPhotosPanel.tsx` e `hero-media.ts`;
- `app/lib/public-visuals.ts`, `app/sections/home/HomeHeroSection.tsx`;
- testes em `tests/integration/site-media.spec.ts`, `tests/unit/site-media-suitability.spec.ts`, `studio-hero-media.spec.ts`, `site-config.spec.ts`, `public-visuals.spec.ts`.

Divergências estáticas observadas, ainda sem nova homologação:
1. Plano antigo cita migração 0006, mas a implementação usa 0008; não renumerar migrações.
2. Não existem os arquivos propostos HeroUploadControl.tsx, app/lib/hero-media.ts e alguns testes antigos. A função foi implementada em arquivos existentes; não criar duplicatas apenas para combinar com o plano.
3. Código aceita 1280×720 ou 720×1280; teste mantém 1536×961 aceito. Plano/design antigos dizem 1920×1080/1080 no lado curto. Identificar a decisão posterior antes de apertar ou afrouxar limites; preservar a regressão existente até decisão fundamentada.
4. Fluxo atual usa fetch PUT para rota admin /direct; o plano antigo descreve XHR/progresso e upload direto R2. Não trocar o transporte sem defeito/necessidade comprovada.
5. Resolver atual constrói URL de site-media sem receber status D1. Servidor verifica ready, mas a publicação e o vínculo ao snapshot precisam ser rastreados e testados. Não declarar fallback/publicação seguros apenas pelo retorno de uma URL.

- [ ] Produzir uma reconciliação requisito × código × teste × prova × lacuna. Corrigir documentação incompatível com decisão aprovada; bug funcional exige RED/GREEN.

### T04.H1 — Upload independente e confiável

- [ ] Provar JPEG/PNG/WebP; 26.214.400 bytes exatos; rejeição de 26.214.401 bytes e conteúdo/MIME incompatível.
- [ ] Confirmar que intent/direct/complete/list exigem administrador e origem permitida, inclusive fora do bypass local.
- [ ] Validar tamanho real, decodificação, resolução e repetição/interrupção; extensão/header sozinhos não bastam.
- [ ] Upload sem albumId; nenhuma entrada indevida em álbuns, portfólio ou arquivo.
- [ ] Falha preserva o Hero anterior; pending/failed nunca se tornam o Hero público ativo.
- [ ] Não introduzir álbum oculto, biblioteca genérica, editor ou upscale.

### T04.H2 — Rascunho, publicação e fallback

- [ ] Upload pronto e seleção no draft não alteram Home publicada.
- [ ] Publish de referência ready/hero promove a referência correta; pendente, ausente, inválida ou falha deve preservar o snapshot anterior.
- [ ] Verificar a fronteira de serving: uma mídia ready apenas no draft não pode ser tratada como publicada por suposição. Confirmar o contrato desejado com teste de integração e a fonte de design.
- [ ] Testar precedência e recuperação reais: site-media pronta/publicada → imagem de portfólio publicada → /images/hero-maria.webp.
- [ ] Snapshots legados backgroundImageId continuam legíveis; referência quebrada não pode deixar Home sem imagem.
- [ ] Reaproveitar pipeline e resolução existentes; nada de deploy para cada futura troca de foto.
- [ ] Escrever regressão no arquivo existente mais próximo; criar teste novo somente quando necessário. Não criar arquivo vazio para satisfazer nome antigo.

### T04.H3 — Celular e aprovação de uso

- [ ] No alvo QA autorizado, testar picker nativo, upload, falha/retry, preview, seleção, publish e retorno ao Hero pretendido.
- [ ] Medir recorte desktop/mobile, legibilidade, proporção, LCP/layout shift e enquadramento com conteúdo aprovado.
- [ ] Preservar logo, foto 4K e composição mobile atual. Viewport emulado não equivale a aparelho físico.
- [ ] Verificar teclado, foco, labels, estados, zoom e reduced motion; TalkBack/VoiceOver físicos exigem execução/evidência humana.
- [ ] Verificar também Studio/Colagem e as pendências anteriores: faixa branca em captura administrativa e texto singular de favorito, sem redesenhar todo o produto.

Comando focado inicial, somente se a mudança ou a lacuna justificar nova execução:

```powershell
npm test -- tests/integration/site-media.spec.ts tests/unit/site-media-suitability.spec.ts tests/unit/studio-hero-media.spec.ts tests/unit/site-config.spec.ts tests/unit/public-visuals.spec.ts
```

**Aceite:** gates suplementares H01–H06 abaixo e G13–G16 comprovados no escopo real. Não realizar o deploy da Task 6 do plano histórico sem a autorização de release independente.

## 9. T05 — Paridade, dados, operação, CI e revisão

### T05.A — Release A público

- [ ] Comparar origem Cloudflare e candidato Unlimited sem escrever dados: Home, Portfólio, arquivo, SEO/canonical/robots/sitemap, APIs e imagens.
- [ ] Usar `scripts/live-parity-audit.mjs` e os testes existentes; preservar os controles de host/protocolo/porta e loc sem filhos.
- [ ] Executar o candidato com R4 OFF e provar /albuns, APIs e mídia privada negadas conforme o contrato, GET/HEAD e zero bytes.
- [ ] Conferir Studio, Hero, Colagem, rascunhos e snapshots, incluindo dependências compartilhadas.
- [ ] Qualificar TLS/Host gerenciados somente após associação; temporary host válido não satisfaz certificado canônico.

### T05.B — Release B e recuperação

- [ ] No alvo isolado autorizado, cadastrar cliente, criar/editar/publicar/arquivar galeria, capa e ordem.
- [ ] Provar upload 25 MiB, byte/hash, retry/interrupção, favoritos após reload/restart e downloads autorizados/negados.
- [ ] Reutilizar `scripts/hostinger-r4-25mib-local-proof.mjs` como prova sintética, sem promovê-la a prova gerenciada.
- [ ] Qualificar backup retido, restore vazio/descartável, deltas após snapshot, restart/rebuild e quarentena de sessões.
- [ ] Registrar manifestos, hashes, integridade/FK, RTO/RPO medidos e reabertura validada. Snapshot temporário não é backup retido.
- [ ] Ensaiar rollback completo de artefato, configuração, dados, sessões e Studio/Colagem, sem restore sobre produção.
- [ ] Medir latência/carga/capacidade/custo reais. Não inventar SLA, retenção ou limiar aprovado; documentar critério operacional e responsável antes da aceitação.

### T05.C — Verificação e revisão

- [ ] Selecionar testes pelos arquivos/comportamento alterados; RED deve falhar pelo defeito, não por fixture inválida.
- [ ] Executar typecheck/lint focados e diff check quando pertinentes; uma matriz completa no gate de integração, não em cada etapa.
- [ ] Publicar commits pequenos na branch adequada; aguardar CI do SHA novo quando houver código.
- [ ] Conferir os dois jobs, teste novo efetivamente executado, logs, artefatos e hashes. Registrar warnings materiais sem atribuí-los ao patch sem prova.
- [ ] Solicitar revisão delimitada e depois revisão formal de segurança do release exato conforme R13. Review de um patch não aprova G19.
- [ ] Não instalar dependências por conveniência ou alterar fundações para obter GREEN.

**Aceite:** G02/G05/G11/G12/G16–G19/G21/G23 apenas com o conjunto de evidências exigido para cada ambiente.

## 10. T06 — Governança, releases e handoff

- [ ] G20: obter decisão expressa da controladora sobre finalidade/base legal, contato, retenção, exclusão, terceiros, incidentes e canal privado de entrega; não assinar ou inferir aceite.
- [ ] Preparar dois pacotes independentes: Release A público/R4 OFF e Release B privado. Autorização de A não autoriza B.
- [ ] Antes de qualquer merge/deploy/cutover, apresentar SHA, diff, CI, plano de dados/rollback, resultado dos gates e ação exata para aprovação final.
- [ ] Sem autorização, finalizar no último estado seguro; manter PRODUCTION_NO_GO. Planejar deploy não é executar deploy.
- [ ] Atualizar o relatório/ledger existentes sem apagar histórico ou renomear os 24 gates.
- [ ] Referenciar commit/branch, UTC e BRT, ambiente, comandos, resultados, hashes, revisão, bloqueios e responsável pela próxima ação.
- [ ] Atualizar o mesmo checkpoint Drive quando houver informação nova, reler e conferir bytes/hash. Não criar cópias redundantes.
- [ ] Não declarar PersistFlow ativo, contato enviado, worker executado ou serviço homologado sem recibo real.
- [ ] Decidir ingestão de memória: estado deste projeto fica no projeto; só persistir contexto global estável conforme instruções de memória vigentes.

## 11. Gates canônicos G01–G24

Estados de referência preservados do ledger AY, reconciliados no fechamento BH. São estados de release, não placar de testes locais. Só promover com evidência correspondente e responsável.

| Gate | Estado | Prova mínima pendente/critério de aceite |
| --- | --- | --- |
| G01 Baseline | PASS | Revalidar SHA, refs, inventário, WIP e ambiente se houver drift |
| G02 Integração | HOLD | Diff integrado sem regressão, checks e revisão do candidato exato |
| G03 Cadastro admin | NOT_VERIFIED | E2E/persistência no alvo QA correto e identidade autorizada |
| G04 Galeria/publicação | NOT_VERIFIED | Criar/editar/publicar, capa/ordem e estado persistido no alvo |
| G05 Upload confiável | BLOCKED | 25 MiB real, hash, limite+1, retry/interrupção no alvo |
| G06 Identidade criptográfica | BLOCKED | Issuer/audience/JWKS/azp/sid reais, negativos e contrato vigente; preservar histórico Access |
| G07 Login real | BLOCKED | Login/OTP real autorizado, sanitizado, no Clerk QA correto |
| G08 Sessão/revogação | BLOCKED | Duração, logout, revogação, unlink/rebind e replay após reativação |
| G09 Isolamento A/B | BLOCKED | Matriz de titulares distintos em todas as rotas e após restart |
| G10 Mídia privada | BLOCKED | GET/HEAD negados sem bytes, cache seguro e vínculo correto |
| G11 Favoritos | NOT_VERIFIED | Persistência após reload/restart no provedor |
| G12 Downloads | NOT_VERIFIED | UI/API, autorização/revogação e bytes/hash no alvo |
| G13 Frontend cliente | NOT_VERIFIED | Jornada autenticada, estados/lightbox/foco/larguras no alvo |
| G14 Frontend admin | NOT_VERIFIED | Studio/galerias/upload/publish nas larguras e origens corretas |
| G15 Acessibilidade | BLOCKED | Matriz assistiva, teclado/zoom/contraste e provas físicas faltantes |
| G16 Público | FAIL | Paridade real de Home/Portfólio/Studio/Colagem/Hero/SEO e R4 OFF |
| G17 CPU/custo/capacidade | NOT_VERIFIED | Medições reais e custo/limites aceitos; sem upgrade presumido |
| G18 Backup/restore | BLOCKED | Backup retido, restore isolado byte/hash, delta, restart/rebuild |
| G19 Segurança independente | HOLD | Aprovação formal autorizada do release exato, sem P0/P1 |
| G20 LGPD | HOLD | Aprovação expressa da controladora, política e entrega privada |
| G21 PR/CI/review | HOLD | CI/review do candidato de integração; verde BH é prova técnica delimitada |
| G22 Autorização release | HOLD | Aceites separados de A/B, merge/deploy/cutover/ativação quando cabíveis |
| G23 Rollback | BLOCKED | Código/config/dados/sessões e reabertura ensaiados no alvo aprovado |
| G24 Handoff | PASS | Referências versionadas, checkpoint verificável e próxima ação exata |

### Gates suplementares do Hero — não substituem G01–G24

| Gate | Estado inicial | Evidência para aceite |
| --- | --- | --- |
| H01 Contrato reconciliado | NOT_VERIFIED | Caminhos reais, limite de resolução e decisão posterior ao plano antigo documentados |
| H02 Upload e independência | NOT_VERIFIED | MIME/bytes/decodificação/retry + nenhum álbum/portfólio indevido |
| H03 Draft/publicação | NOT_VERIFIED | Upload/draft não mudam Home; somente referência válida promovida; serving de não publicado testado |
| H04 Fallback/legado | NOT_VERIFIED | Ready/publicado, missing/pending/failed e snapshots legados com fallback real |
| H05 Uso/visual/a11y | NOT_VERIFIED | Picker, preview, recortes, foco, mobile, performance e aceite de conteúdo |
| H06 Ambiente/release | NOT_VERIFIED | Candidato gerenciado exato e autorização aplicável; nenhuma etapa antiga autoriza produção |

## 12. Encerramento obrigatório

**Conferência adicional LUNA:** completar LC0–LC6 no plano R17, registrando explicitamente WIP Clerk preservado, eventual auditor D1 histórico reconciliado, medições com critérios aprovados versus propostos, G18/G23 distintos e Release A/B em estados separados. Um plano concluído não significa projeto concluído.

Entregar os 12 campos:
1. RESULT: VERIFIED no escopo comprovado; manter PARTIAL_VERIFIED / PRODUCTION_NO_GO quando o produto não estiver homologado.
2. BASELINE SHA / BRANCH: HEAD atual, upstream e diferença em relação ao último código qualificado.
3. CHANGES: arquivos e comportamentos; separar código, documentação e decisões.
4. VALIDATION: RED/GREEN, comandos, resultados e limites.
5. T00–T06: concluído, preservado, pendente ou bloqueado com motivo.
6. G01–G24 e H01–H06: estados e evidência; nenhum gate omitido/renumerado.
7. CI E REVIEW: SHA exato, jobs, teste executado, artefatos/hashes, escopo de revisão.
8. HOSTINGER/CLERK BLOCKERS: conta/app/instância/alvo, protocolo e próxima ação.
9. COST: incremento efetivo e o que não foi medido.
10. PRODUCTION STATUS: A/B separados, flags, autorização e operações realmente realizadas.
11. CHECKPOINTS: URLs/commits e readback verificável, sem segredos.
12. NEXT SAFE ACTION: ação concreta e responsável, sem oferecer para reiniciar trabalho pronto.

Não declarar COMPLETED_VERIFIED do projeto enquanto os dois releases não tiverem homologação, autorizações e verificações correspondentes. Uma retomada pode concluir seu incremento técnico e ainda manter ambos NO_GO.

