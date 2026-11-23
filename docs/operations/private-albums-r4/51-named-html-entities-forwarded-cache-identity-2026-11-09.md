# PUNCTUM R4 — ciclo N | fail-closed de snapshots HTML e identidade no cache público

**Data:** 09/11/2026 (America/New_York). **Decisão:** `NO_GO_PRODUCTION`. Alterações restritas à branch draft da PR #32; nenhuma publicação de produção, merge, ativação de galerias privadas, billing, fotografia real ou operação D1/R2 remota.

## Reconciliação do estado

- Baseline remoto M: `b7332634daefa6feb4fbdaa49c861899f52dc522`, tree `0e67db3c1748d562e0650f3b002c7caf043f4cc4`, parent `b0175cb95979a04555512453a5955e7697de3975`. PR #32 `open/draft/unmerged`; GitHub Actions M [#42548180845](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42548180845) `completed/success`, verify 31/31, no browser-local M pass retroativo.
- Conector Linux/Chat On Steroids estava sem túnel: `Tunnel-client did not poll`. **Checkout/worktree local atual não foi verificado nem modificado**. O ciclo N foi implementado via GitHub API diretamente sobre o parent remoto, com atualização de referência não forçada, evitando reconciliar por reset as genealogias irmãs locais.
- SPEC literal original seção 23 não localizada neste ciclo. Fonte disponível: GOAL 36, reconciliação 16, relatórios e matriz G01–G24; não atribuir requisitos não lidos.

## TDD RED — GitHub Actions real, SHA exato

Commit apenas de testes: `546bb8b6642811e0a0b364f884bf5fab6138cef1` (filho direto de M); CI [#42665231687](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42665231687) **completed/failure** de maneira causal: `263 passed / 2 failed / 265 tests` em 57 arquivos.

1. `tests/unit/public-home-snapshot.spec.ts:48`: `punctum&lowbar;client&lowbar;session=secret` foi indevidamente aceito (`expected false, received true`). O HTML nomeado `&lowbar;` decodifica para underscore no navegador. Casos adicionais codificados com `&percnt;` exercitam o marcador `client-galleries/` e a rota privada `/api/client/galleries`.
2. `tests/unit/public-home-cache.spec.ts:97`: `X-Forwarded-Authorization` era elegível (`expected false, received true`) para request de HTML público, apesar de transportar credencial. O teste cobre também `X-Client-Session`, `X-Forwarded-Cookie` e response headers `X-Authenticated-User`, `X-Client-Id`, `X-Forwarded-User`.

Não modificar nem apagar o commit vermelho: ele registra a contraprova independente de segurança.

## GREEN — alteração de produção restrita

Commit de código: `72b557f019cdb4d571ec1120973e7d82199e5ec0` (filho do RED).

- `worker/public-home-snapshot.ts`: normalização fail-closed e limitada de entidades HTML nomeadas `&lowbar;`, `&underbar;` e `&percnt;` antes das regexes de marcadores privados; `&percnt;` revela percent-encoding aninhado nas passagens existentes. Nenhuma avaliação/execução de HTML.
- `worker/public-home-cache.ts`: bloqueia os três novos cabeçalhos de identidade por requisição e impede cache compartilhado quando os três response headers identificadores aparecem; remove esses headers da resposta resultante.
- Nenhuma alteração em Studio, Colagem, rascunhos da Maria, SEO, migrações, fotos ou contratos G05. Proteções existentes e comportamento de HTML anônimo continuam cobertos pelas regressões anteriores.

**Validação no momento deste documento:** o GREEN foi publicado sem force, com parent remoto verificado. A CI do SHA GREEN estava em andamento e **não deve ser contada como PASS** até readback final. A CI do SHA documentário também exige verificação própria. Testes locais do checkout do usuário não rodaram porque o túnel do host estava indisponível.

## Riscos não resolvidos e critério de release

- **G05 FAIL:** requisito 25 MiB (26.214.400 bytes); guarda Images Binding de 20.000.000 bytes; pipeline completo D1/R2/Images e coordenação de concorrência não homologados.
- **G17 FAIL:** reforço de cache/snapshot não comprova CPU cold/MISS real do SHA final no Workers Free; latência e CI não são CPU.
- **G23 BLOCKED_EXTERNAL:** D1 401, billing 403 no histórico; sem QA segregado/autorizado e sem rollback remoto com versões, sessões e recuperação.
- **G15, G19, G20, G22 BLOCKED_EXTERNAL:** faltam TalkBack/VoiceOver físicos, parecer de segurança independente, aprovação LGPD e autorização de release específica.
- `PRIVATE_GALLERIES_ENABLED=false` na configuração versionada; runtime de produção não revalidado. Sem merge/deploy. Custo incremental autorizado R$0, sem inferir faturamento real.

## Matriz canônica G01–G24

Os PASS históricos permanecem limitados à evidência, SHA e ambiente de cada ciclo. O ciclo N reforça G17 mas **não promove G17 a PASS**.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | L/M | PR/ref/HEAD/tree | GitHub/local | relatório 49 | SPEC ausente | Localizar SPEC e conferir inventário |
| G02 | PASS histórico | Eng./Reviewer | M | CI #42548180845 | GitHub Actions | M exact-SHA 31/31 | N CI pendente | Validar N exact-SHA |
| G03 | PASS | Admin | L | D1/cadastro | Chromium local | relatórios prévios | sem QA M | Revalidar QA seguro |
| G04 | PASS | Admin | L | publish/capa/galeria | Chromium | histórico e2e L | release não autorizado | Preservar Studio |
| G05 | FAIL | Produto/Images QA | M | upload/sha/rollback sintético | Miniflare/Actions | relatório 50 e CI M | 25 MiB vs 20 MB; D1/R2 sem atomicidade | Engenharia e QA integrado autorizado |
| G06 | PASS | Segurança | G/L | JWT/JWKS | QA histórico | reconciliação 16 | G19 | Auditoria independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | físico | G15 |
| G08 | PASS | Segurança | L/M | sessão/revogação | local | 46–50 | sem QA remoto M | Revogação QA autorizada |
| G09 | PASS | Segurança | L/M | isolamento A/B | Miniflare | 44–50 | auditor externo | G19 |
| G10 | PASS | Segurança | L/M | private GET/HEAD negados | Miniflare | 44–50 | flag produção não verificada | Revalidar runtime |
| G11 | PASS | Produto | L | favoritos | Chromium | CI L | físico | G15 |
| G12 | PASS | Produto | L | download/hash | Chromium | CI L | QA real | Homologação segura |
| G13 | PASS | UI cliente | L | lightbox/teclado | Chromium | CI L | TalkBack/VoiceOver | G15 |
| G14 | PASS | UI admin | L/M | upload/viewport | Chromium | CI L/foco M | QA remoto não homologado | E2E M |
| G15 | BLOCKED_EXTERNAL | Testadores | — | TalkBack/VoiceOver | físico | GOAL36 | NOT_RUN | Homologar Android e iOS reais |
| G16 | PASS | UI/Studio | L | Colagem/SEO | Chromium/CI | #42544637971 | M sem CI | Revalidar M |
| G17 | FAIL | Cloudflare/Infra | N | RED #42665231687; GREEN pendente | GitHub Actions/QA | Testes de entidades HTML/cabeçalhos no ciclo N | CPU cold/MISS Free não medida em SHA atual | Medir remoto em QA seguro |
| G18 | PASS | Operador backup | L/M local | G18 histórico | Miniflare | relatório 49 | não é rollback remoto | Quarentena/QA |
| G19 | BLOCKED_EXTERNAL | Auditor independente | — | parecer formal | humano | GOAL36 | sem aprovação | Auditoria independente |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD formal | humano | GOAL36 | sem aceite | Aprovação formal |
| G21 | PASS histórico | CI/Reviewer | M | CI 31/31 | GitHub Actions | #42548180845 | CI N pendente | Validar N exact-SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização de release | humano | GOAL36 | ausente | Autorizar especificamente após gates |
| G23 | BLOCKED_EXTERNAL | Operador QA | M | D1/R2 recovery/retry local | Miniflare | relatórios 47–50 | D1 HTTP 401; billing HTTP 403; rollback remoto não feito | QA segregado autorizado |
| G24 | PASS histórico | Documentação | M | PR/Drive readback | GitHub/Drive | checkpoint M #6730457462 | Checkpoint N pendente | Persistir e conferir N |

**Decisão global `NO_GO_PRODUCTION`.** Próximos passos: CI exact-SHA GREEN/documentação; checkpoint PR/Drive sob revisão; medição CPU cold/MISS em QA segregado, arquitetura 25 MiB e coordenação D1/R2, rollback remoto autorizado, gates humanos.
