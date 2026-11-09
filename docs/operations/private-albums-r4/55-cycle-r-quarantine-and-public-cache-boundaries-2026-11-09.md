# PUNCTUM R4 — ciclo R | quarantine de originais R2 e cache HTTP

**Data:** 09/11/2026. **Veredito global:** `NO_GO_PRODUCTION`. Desenvolvimento na PR #32 draft, sem deploy, merge, ativação de álbuns, foto real, alteração D1/R2 Cloudflare remota, permissões, plano ou billing. Custo incremental **autorizado** R$ 0,00; custo observado de retenção/capacidade não foi comprovado por Billing Read.

## Reconciliação e continuidade

- A referência histórica P é `eb006f85339b584b495fb426567505aaf38372b5`, CI #42676752930 successful 31/31; checkpoint PR #6748498293 e Drive confirmados. Q é o **HEAD de entrada atual** `dd03f844447be7978ec089a5489b6deab6f26828`, parent P, tree `4543805d049661a3e4759d9159a3d39db3b2dc3c`, CI #42680304657 completed/success 31/31; checkpoint PR #6748963999 e Drive revision/readback confirmados. Não duplicar.
- PR #32 `open/draft/unmerged`, base `agent/hst-001-hostinger-qa-20261028` em `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`. Worktree R destacada `punctum-r4-cycle-r-20261109`, a partir da tree remota Q; checkout original irmão M e worktrees P/Q preservados sem reset, rebase nem force.
- Fontes existentes: GOAL 36, matriz 16, handoff 35, relatórios 50–54 e `execution-state.json`. SPEC literal `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` §23 não localizada no Git nem nas buscas prévias da Biblioteca/Drive; o texto original não foi reconstruído.

## TDD RED→GREEN G23/G05: R2.delete concorrente após o último SELECT

**RED observado:** na manutenção de uploads privados, o cron validava em D1 que a imagem ainda estava `failed`, executava `ORIGINALS.delete(key)` **incondicional** e só então preenchia `completed_at`. Teste adversarial simulou restauração para `ready` no ponto de entrada de `R2.delete`, com o original sintético já gravado e SHA-256 correto. Código anterior fez **1 chamada destrutiva**, contra a expectativa de zero; uma imagem recém-validada podia perder seus bytes.

**GREEN:** a manutenção automática não executa mais `R2.delete` dos originais de galerias privadas. Mantém o objeto privado na mesma chave canônica como **quarentena recuperável**, marca imagem expirada `failed` e só preenche `completed_at` da intenção `expired` com UPDATE D1 condicional que reconfirma vínculo exato `gallery/image/storageKey/MIME/size`, `status='failed'`, `deleted_at IS NULL` e `updated_at` da transição. Um restore que promova a imagem antes da finalização mantém `completed_at=NULL`, sem perda R2. Segunda chamada é idempotente; não multiplica objetos ou altera digest.

**RED secundário:** um registro `pending` já excluído logicamente (`deleted_at != NULL`) era repetidamente alterado pelo cron: o teste observou `pending→failed` e mudança de timestamp. **GREEN:** seleção, claim e update de imagem exigem `deleted_at IS NULL`. Linhas revogadas não sofrem churn. Isso evita despesas e inconsistências D1 desnecessárias.

**Integração:** o teste captura snapshot scoped com a intenção expirada, original ainda em R2, `sha256` íntegro e imagem `failed`. Mesmo com a galeria publicada, sessão sintética válida e downloads liberados, GET gallery, HEAD gallery e GET download para essa imagem são negados por HTTP 404, sem bytes de foto. Testes históricos de chaves legadas seguem **exclusivamente** no operador G18; nenhum relaxamento de canonicalização ou de ownership A/B.

**Limitação técnica essencial:** `completed_at` em uma intenção `expired` representa **finalização da quarentena D1**, não prova de exclusão física dos bytes. Isso altera a semântica operacional que futuros scripts/operadores devem respeitar. As bytes R2 continuam consumindo capacidade de storage; NÃO presumir custo marginal zero de retenção. Um descarte físico futuro depende de exclusividade entre todos os escritores (upload, restore, cleanup), inventário de hashes/ETags, backup verified, autorização e rollback; R2 Workers `delete()` não oferece precondition `onlyIf`. Não existe promessa de atomicidade D1/R2 contra agentes externos não coordenados.

## TDD RED→GREEN G17: negociação e variantes de cache público

**RED observado:** home GET com `Range`, `If-None-Match`, `Cache-Control: no-store` e outros contextos ainda podia utilizar o cache CDN anônimo, embora suas chaves não representem condições, fragmentos e reescritas. O primeiro RED falhou em `Range`.

**GREEN:** `isPublicHomeCacheRequest()` agora nega `no-cache/no-store`, `Pragma: no-cache`, `Range/If-Range/If-Match/If-None-Match/If-Modified-Since/If-Unmodified-Since`, `X-Forwarded-Host/X-Original-URL/X-Rewrite-URL/Forwarded/Origin`. A resposta não recebe `Cloudflare-CDN-Cache-Control` nem `Cache-Tag` quando o request não é canônico. GET / anônimo normal continua permitido. Preservadas proteções N/P contra entidades codificadas, identidade e CSP nonce; Studio, Colagem, SEO e rascunhos inalterados.

## Regressões, ambiente e limitações

- TDD R RED em Workers/Miniflare local para ambas as falhas G23, mais um RED G17. GREEN direcionado: **44/44** em mídia privada, recovery e manutenção; **39/39** em maintenance, recovery e cache, com TypeScript PASS. Regressão **local** Workers/Vitest **276/276 em 57 arquivos**, Colagem **7/7**, G18 histórico imutável **1/1**, Node R4 **21/21**, TypeScript, ESLint, Vinext build, SSR/Miniflare após build, npm audit **0 vulnerabilidades**, JSON e git diff --check **PASS**. Chromium **local real 14/14 cenários PASS (exit 0)**: D1/R2 sintéticos A/B, Admin upload/cover/publish, Studio/Colagem, responsive oito larguras, download/focus, restart, rollback local e revogação; CI GitHub exact-SHA e QA Cloudflare remoto ainda **não executados para R**.
- Nenhuma operação R2 remota. Quarentena local preserva o hash, mas não é restore remoto, e retenção sem exclusividade não sana a coordenação de outras aplicações que possuam escrita externa.
- **G05 FAIL**: 25 MiB (26.214.400 bytes) exigidos versus entrada `IMAGES.input()` de 20.000.000 bytes; https://developers.cloudflare.com/images/get-started/limits/ . Não subir a guarda sem prova de decodificação integral, derivados privados, SHA/proveniência, custo/quota Free, RAM/CPU, autenticação e recuperação.
- **G17 FAIL**: Workers Free 10ms CPU HTTP e 128MB por isolate (https://developers.cloudflare.com/workers/platform/limits/); um HIT ou CI Chromium não mede cold/MISS/pós-invalidação. Instrumentação histórica read-only e probe segregado existente precisam autorização/segregação, SHA real e cobertura temporal para provar o gate.
- **G23 BLOCKED_EXTERNAL**: rollback real de predecessor Worker, versões, flags, sessões, relações D1/R2, inventário/quarentena, revogação e reabertura não executados em QA remoto autorizado. Préflight e simulações não substituem rollback.
- **G15/G19/G20/G22 BLOCKED_EXTERNAL**: dispositivos físicos TalkBack/VoiceOver, parecer independente de segurança, aprovação LGPD formal e autorização específica de release não foram simulados.
- `PRIVATE_GALLERIES_ENABLED=false` preservado na configuração de produção versionada; runtime não revalidado. Sem alegação de fatura R$0 ou de `TECHNICAL_READY_AWAITING_EXTERNAL`.

## Matriz de aceite canônico G01–G24

Campos: **GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO**. PASS histórico não é homologação do novo SHA.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS HISTÓRICO_ESCOPADO | Engenharia | Q | PR/ref/parent/tree/24 gates | GitHub readback | CI Q #42680304657 31/31 | SPEC literal §23 ausente; QA R pendente | Localizar SPEC e conferir última matriz |
| G02 | PASS histórico | Eng./Reviewer | O | CI 31/31 | GitHub Actions | #42668107238 | CI P pendente | Exigir CI P exact-SHA |
| G03 | PASS | Admin | L | D1/cadastro | Chromium local | relatórios prévios | sem QA M | Revalidar QA seguro |
| G04 | PASS | Admin | L | publish/capa/galeria | Chromium | histórico e2e L | release não autorizado | Preservar Studio |
| G05 | FAIL | Eng./QA Images | R local | limpeza segura, HMAC/retentativa e 25MiB guard | Vitest/D1-R2 sintético | TDD RED→GREEN R; ciclos P/Q | 25 MiB vs Images 20 MB, coordenação externa, custo real | Provar pipeline privado 25MiB e QA integrado |
| G06 | PASS | Segurança | G/L | JWT/JWKS | QA histórico | reconciliação 16 | G19 | Auditoria independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | físico | G15 |
| G08 | PASS | Segurança | L/M | sessão/revogação | local | 46–50 | sem QA remoto M | Revogação QA autorizada |
| G09 | PASS | Segurança | L/M | isolamento A/B | Miniflare | 44–50 | auditor externo | G19 |
| G10 | PASS | Segurança | L/M | private GET/HEAD negados | Miniflare | 44–50 | flag produção não verificada | Revalidar runtime |
| G11 | PASS | Produto | L | favoritos | Chromium | CI L | físico | G15 |
| G12 | PASS | Produto | L | download/hash | Chromium | CI L | QA real | Homologação segura |
| G13 | PASS | UI cliente | L | lightbox/teclado | Chromium | CI L | TalkBack/VoiceOver | G15 |
| G14 | PASS HISTÓRICO_ESCOPADO | UI/Admin | Q | 8 larguras/upload/admin | Chromium Linux | CI Q 31/31 | QA remoto R não executado | Revalidar CI R exata |
| G15 | BLOCKED_EXTERNAL | Testadores | — | TalkBack/VoiceOver | físico | GOAL36 | NOT_RUN | Homologar Android e iOS reais |
| G16 | PASS | UI/Studio | L | Colagem/SEO | Chromium/CI | #42544637971 | M sem CI | Revalidar M |
| G17 | FAIL | Cloudflare/Infra | R local | request bypass/HTTP variants, snapshot/cache | Vitest local | RED Range → GREEN R | CPU real cold/MISS/pós-invalidação do R não medida | QA segregada medir CPU exata |
| G18 | PASS HISTÓRICO_ESCOPADO | Operador | Q | fixture G18 imutável | Node local/CI | CI Q 31/31 + G18 1/1 | rollback remoto não homologado | G18 R sem modificar fixture |
| G19 | BLOCKED_EXTERNAL | Auditor independente | — | parecer formal | humano | GOAL36 | sem aprovação | Auditoria independente |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD formal | humano | GOAL36 | sem aceite | Aprovação formal |
| G21 | PASS HISTÓRICO_ESCOPADO | CI/Reviewer | Q | 31/31 | GitHub Actions | #42680304657 exact Q SHA | CI R pendente | Acompanhar R exact-SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização de release | humano | GOAL36 | ausente | Autorizar especificamente após gates |
| G23 | BLOCKED_EXTERNAL | Segurança/QA | R local | DELETE race, CAS D1, quarantine, restored revoke | Vitest local D1/R2 sintético | RED→GREEN R; SHA R pendente | R2 delete sem onlyIf; operador exclusivo e QA rollback remoto ausentes; retenção storage | Criar inventário e protocolo QA exclusivo autorizado |
| G24 | PASS HISTÓRICO_ESCOPADO | Documentação | Q | PR/Drive readback | GitHub/Drive | Q #6748963999, Drive revision Q | checkpoint R pendente | Persistir R após CI exact-SHA |

**Decisão:** `NO_GO_PRODUCTION`. Próximas etapas: comprovar versão/CI R, checkpoint PR/Drive; evoluir inventário e descarte exclusivo/recuperável, investigar 25MiB e CPU cold/MISS com QA segregado autorizado e comprovar gates humanos.
