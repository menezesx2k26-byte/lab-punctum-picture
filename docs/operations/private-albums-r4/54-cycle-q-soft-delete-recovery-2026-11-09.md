# PUNCTUM R4 — ciclo Q | recovery preserva revogação de imagem soft-deleted

**Data:** 09/11/2026. **Decisão global:** `NO_GO_PRODUCTION`. Continuação técnica integrada com ciclo P; não houve merge, deploy, ativação, foto real, operação Cloudflare remota, autorização LGPD, billing ou serviço pago. R$ 0,00 incremental autorizado (faturamento não comprovado).

## Baseline e genealogia

- P remota efetivamente publicada: HEAD `eb006f85339b584b495fb426567505aaf38372b5`, parent O `a99257ec8f89de674a2b8c5921a4f52bcb56d411`, tree `0277c5fc013d870a61126b0cc93f759ef4a20ea2`.
- CI P [#42676752930](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42676752930) `completed/success`, verify 31/31, Chromium Linux. Artefato navegador GitHub ID `13701251264`, tamanho 5.888.738 B, digest `sha256:d7df8de92894cc71ceb738964a858386f74ebc003e1c243583ad941ec4f5654c` (ZIP não auditado internamente). Checkpoint PR P `6748498293` e Drive Sgtmenezes com controle de revisão/readback.
- Checkout original irmão M, worktree isolada P e relatório 53 preservados. Worktree **Q destacada**, `/home/desktop/Documents/punctum-r4-cycle-q-20261109`, criada a partir do commit remoto P, sem reset/rebase/clean ou force. Nenhum arquivo G18 histórico alterado.
- SPEC literal `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` §23 continua não localizada; reconciliação 16 e GOAL 36 usados apenas como fontes secundárias.

## Defeito real G23 detectado após o ciclo P

O novo preflight P bloqueava corretamente `client_gallery_upload_intents.status='completed'` apontando para imagem `pending`. Porém também rejeitava `client_gallery_images.status='ready'` quando `deleted_at` não era nulo, embora **soft-delete seja estado legítimo de revogação posterior a um upload já concluído**. Esse falso positivo impedia backup/restauração do original privado, deixando uma galeria histórica completa irrecuperável para fins de reconciliação legal/auditoria. A visibilidade de mídia deve permanecer negada; não se deve reabrir imagem soft-deleted.

### TDD RED

- Novo teste real em `tests/integration/client-recovery.spec.ts` cria cliente/galeria/imagem sintéticos, PUT R2 com hash SHA-256 e metadata, intenção `completed`, imagem `ready` com `deleted_at` antigo.
- **RED observado:** 19/20 testes passaram; captura falhou `Recovery lifecycle mismatch` antes do GET, na condição adicionada em P. Um cenário legitimamente revogado ficava impossibilitado de passar pelo operador de recuperação.

### GREEN

- `scripts/lib/private-recovery.ts`: `assertRowScope()` continua exigindo `image.status='ready'` para intenção `completed`, mas **não obriga `deleted_at=NULL`**, pois revogação posterior não invalida a conclusão histórica.
- O teste verifica: capture preserva `deleted_at`; restore D1/R2 mantém SHA, bytes e data de revogação; conta volta em quarentena; após reabertura controlada sintética com segredo de sessão independente, as variantes GET original, HEAD original e GET download continuam negadas com HTTP 404 (zero bytes privados ao cliente).
- Teste adversarial P de `completed` ligado à imagem `pending` continua rejeitando antes de R2 GET no capture e antes de PUT no restore. Nenhuma alteração em chave legada, fixtures G18, output público, Studio, Colagem ou banco remoto.

## Validação, estado e limites

- GREEN local dirigido após a correção: **37/37** testes (20 recovery + 17 mídia privada).
- Workers integral **272/272** em 57 arquivos antes do ajuste de tipo apenas no teste; Colagem **7/7**; G18 histórico **1/1**; Node R4 **14/14**. Depois do ajuste “original”→“gallery” para o preset da asserção, rerun focado **37/37** (20 recovery + 17 media), TypeScript, ESLint, Vinext build, SSR/Miniflare após build, npm audit 0 vulnerabilidades, JSON/diff: **PASS**. Chromium local Q não executado; aguarda CI Linux exact-SHA para E2E Chromium e regressão integral na versão final.
- SHA GitHub novo, CI Linux exact-SHA, comentário PR e checkpoint Drive: **PENDENTES NO MOMENTO DE REDIGIR**.
- QA real D1/R2/Images, Worker predecessor, rollback, CPU cold/MISS e custo efetivo: **NOT_RUN**; simulação Miniflare não é homologação remota.
- **G05 FAIL:** limite da SPEC 25 MiB (26.214.400 B) versus guarda operacional 20.000.000 B Cloudflare Images Binding. Sem solução demonstrada para original integral, derivados privados, hash/proveniência, RAM/CPU/quotas/custo R$0, não aumentar a guarda.
- **G17 FAIL:** ausência de CPU real remota de cold/MISS/pós-invalidação do SHA atual no Workers Free; CI/cache HIT/latência não substituem medição.
- **G23 BLOCKED_EXTERNAL:** exclusão mútua entre D1 e R2 externos, recovery de conflito tardio e rollback remoto autorizado com versões/sessões/revogação/reabertura ainda não comprovados. O preflight não transforma D1/R2 em transação distribuída.
- **G15/G19/G20/G22 BLOCKED_EXTERNAL:** dispositivos físicos TalkBack/VoiceOver, parecer de segurança independente, aprovação LGPD formal e autorização específica de release.
- `PRIVATE_GALLERIES_ENABLED=false` preservado na configuração versionada; runtime de produção não revalidado. Produção intocada, sem exclusão/ criação de D1, billing ou alteração de permissões.

## Matriz canônica G01–G24

Campos: **GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO**. Resultados históricos são escopados ao próprio SHA/ambiente.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | L/M | PR/ref/HEAD/tree | GitHub/local | relatório 49 | SPEC ausente | Localizar SPEC e conferir inventário |
| G02 | PASS histórico | Eng./Reviewer | O | CI 31/31 | GitHub Actions | #42668107238 | CI P pendente | Exigir CI P exact-SHA |
| G03 | PASS | Admin | L | D1/cadastro | Chromium local | relatórios prévios | sem QA M | Revalidar QA seguro |
| G04 | PASS | Admin | L | publish/capa/galeria | Chromium | histórico e2e L | release não autorizado | Preservar Studio |
| G05 | FAIL | Engenharia/QA Images | P/Q local | uploads e mídia privada sintética | Vitest | P 271/271; Q focado 37/37 | SPEC 25MiB vs 20MB e D1/R2 sem atomicidade | QA e pipeline 25MiB com custo verificado |
| G06 | PASS | Segurança | G/L | JWT/JWKS | QA histórico | reconciliação 16 | G19 | Auditoria independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | físico | G15 |
| G08 | PASS | Segurança | L/M | sessão/revogação | local | 46–50 | sem QA remoto M | Revogação QA autorizada |
| G09 | PASS | Segurança | L/M | isolamento A/B | Miniflare | 44–50 | auditor externo | G19 |
| G10 | PASS | Segurança | L/M | private GET/HEAD negados | Miniflare | 44–50 | flag produção não verificada | Revalidar runtime |
| G11 | PASS | Produto | L | favoritos | Chromium | CI L | físico | G15 |
| G12 | PASS | Produto | L | download/hash | Chromium | CI L | QA real | Homologação segura |
| G13 | PASS | UI cliente | L | lightbox/teclado | Chromium | CI L | TalkBack/VoiceOver | G15 |
| G14 | PASS LOCAL | UI/Admin | P local | uploads + 8 widths | Chromium real local | E2E 14 cenários PASS | CI P e QA remoto ainda pendentes | Validar CI exact-SHA |
| G15 | BLOCKED_EXTERNAL | Testadores | — | TalkBack/VoiceOver | físico | GOAL36 | NOT_RUN | Homologar Android e iOS reais |
| G16 | PASS | UI/Studio | L | Colagem/SEO | Chromium/CI | #42544637971 | M sem CI | Revalidar M |
| G17 | FAIL | Cloudflare/Infra | P | cache CSP/snapshot | Workers local | CI P #42676752930 PASS 31/31 | CPU cold/MISS real não medida | QA segregada autorizada |
| G18 | PASS LOCAL_HISTÓRICO | Operador G18 | P | fixture G18 e legacy key | Node local | G18 P 1/1; Q em validação | não é rollback remoto | regressão Q e QA remoto |
| G19 | BLOCKED_EXTERNAL | Auditor independente | — | parecer formal | humano | GOAL36 | sem aprovação | Auditoria independente |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD formal | humano | GOAL36 | sem aceite | Aprovação formal |
| G21 | PASS histórico | CI/Reviewer | P | CI exata 31/31 | GitHub Actions | #42676752930 | CI Q pendente | acompanhar Q exact-SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização de release | humano | GOAL36 | ausente | Autorizar especificamente após gates |
| G23 | BLOCKED_EXTERNAL | Segurança/QA | Q local | captura + restauração soft-delete | Vitest D1/R2 sintético | TDD Q GREEN 37/37 focado, negative media 404 | rollback remoto e exclusão mútua D1/R2 ausentes | preparar QA segregada sem custos |
| G24 | PASS histórico | Documentação | P | PR e Drive revision readback | GitHub/Drive | PR #6748498293, Drive P | checkpoint Q pendente | versionar e readback Q |

**NO_GO_PRODUCTION**. Após CI Q, registrar readbacks GitHub/Drive e continuar frente G05/G23 cleanup/restore externo e G17 CPU real com QA autorizada; manter gates humanos abertos.
