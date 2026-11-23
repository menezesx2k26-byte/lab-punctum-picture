# Punctum Picture R4 — ciclo X: Streams de upload privado e retomada segura

**Data:** 09/11/2026. **Decisão:** `NO_GO_PRODUCTION`. Este incremento é local e reversível; não é homologação G05/G17/G23 nem autorização de release.

## Readback e fronteira de trabalho

- Fonte remota consultada: [PR #32](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32), `open/draft/unmerged`, branch `fix/punctum-albums-r4-completion-20261107`, HEAD inicial `52b12308b46c498c4f835e6c43d0edefd2b25416`, base `agent/hst-001-hostinger-qa-20261028`. Desde `eb99c11120e48baab0a4723860e27df251a2df52` houve 26 commits remotos, sem retroceder o histórico.
- CI **do baseline**, não deste incremento: [run #42713311846](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42713311846), job `verify` concluído com sucesso. Artefato `r4-browser-evidence` ID `13717595698`, tamanho 6.094.716 B, digest registrado pelo GitHub `sha256:08e61bd1d19131eb425b80eefdc24d0cf6ec1cb08fd84e68f41909c2c5949272`. ZIP interno não auditado nesta rodada.
- A branch local anterior estava em `fc5293dc859c717f9a314744e9085ec3a548a107`, divergente do remoto. A worktree V tinha alterações não commitadas em `worker/public-home-cache.ts` e `tests/unit/public-home-cache.spec.ts`. Preservadas. Trabalho deste ciclo isolado em `punctum-r4-cycle-x-20261109` a partir do SHA remoto, sem reset, clean ou rebase.
- Lidos os documentos 35, 36, reconciliação 16 e relatórios 25–34 e 37–58. `execution-state.json` foi inspecionado. A fonte literal `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` não foi localizada no checkout, na busca do Drive Sgtmenezes nem na busca da Library. Não inventar o conteúdo ausente: usar a matriz canônica transcrita em 16/35/36 até obter a SPEC.

## Problema e comportamento corrigido

O caminho assinado `admin → intenção → PUT /direct` tinha dois modos de falha anteriores à persistência:

1. Uma `ReadableStream` com 65 chunks vazios, seguida de uma PNG íntegra e `Content-Length` correto, era aceita. A leitura fazia trabalho sem progresso pelo tamanho assinado, vulnerável a consumo de CPU por stream adversarial.
2. Uma `ReadableStream` que entregava parte dos bytes e depois falhava propagava um `Error` de transporte cru, que podia ser tratado como falha interna 500. O cliente precisava de resposta classificável para um retry da intenção pendente.

No `readBounded` do `worker/api/client-gallery-upload.ts`, agora rejeitar mais de 64 chunks vazios acumulados com `AppError(400, UPLOAD_STREAM)` e cancelar o leitor; mapear erro de `reader.read()` para o mesmo código sem persistir bytes ou avançar a intenção. Uploads normais ainda exigem exatamente o tamanho assinado, MIME compatível e digest antes do R2. O limite 20.000.000 B do Images Binding permanece inalterado, com GAP explícito para a SPEC de 25 MiB.

## Evidências TDD

| Etapa | Teste | Evidência |
|---|---|---|
| RED 1 | 65 chunks vazios + PNG válida | Promise retornou `Response{}` quando o teste exigia `UPLOAD_STREAM`; arquivo de integração reprovou 1/29 no baseline, outros 28 PASS |
| GREEN 1 | Mesmo caso após guarda | `1 PASS / 11 skipped` no filtro; D1 intent `pending`, R2 `head=null` |
| RED 2 | Stream interrompida depois dos primeiros bytes | Recebido `Error: simulated transport interruption`, sem status/código de API |
| GREEN 2 | Mesmo caso e retry íntegro | `2 PASS / 11 skipped` no filtro; erro 400 tipado, intenção pendente, R2 vazio antes do retry; reenvio autenticado 200, status `uploaded`, bytes R2 idênticos à entrada |

Os testes são sintéticos em Miniflare/Workers local e verificam comportamento real do handler com D1 e R2 simulados. Não demonstram CPU Cloudflare Free, conta/quota/billing, Access OTP real, Workers remotos ou 25 MiB.

## Validação independente do teste focado

- Node v24.22.2. `npm run typecheck`, `npm run lint` e `git diff --check`: **PASS**.
- `npm audit --audit-level=low`: **0 vulnerabilidades** (info/low/moderate/high/critical).
- `node --test scripts/r4-*.test.mjs`: **70/70 PASS**, incluindo escopo G18 local e classificação de recuperação somente leitura.
- `npm test` completo sob o host Linux compartilhado: **testes de upload/mídia privados PASS**, porém houve timeouts no teste PBKDF2 com fallback de 310.000 iterações (`client-passwords.spec.ts`, limite de 60s), no piloto de 10 uploads (`client-pilot.spec.ts`, limite 30s) e no audit de reorder (`client-admin-audit.spec.ts`, limite 20s). Essas falhas locais permanecem abertas até replay isolado e CI final; não remover assertions nem aumentar timeouts apenas para marcar verde.
- `npm run build`: **PASS**, Vinext 5/5 ambientes, com avisos de sourcemaps/Vite já conhecidos. E2E Chromium: execução/resultado final devem ser conferidos no SHA do commit, sem extrapolar os jobs do baseline.

## Ledger canônico G01–G24 — status e evidência de escopo

`PASS hist.` representa prova prévia, jamais homologação automática deste commit. Onde falta revalidação do HEAD, a próxima ação a exige. Colunas: `GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO`.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS hist. Git; infra pendente | Engenharia | 52b12308 | PR, refs, compare, worktrees | GitHub/Linux | PR #32; +26 commits desde eb99c11 | SPEC literal, inventário Cloudflare atual | Inventário QA read-only e localizar SPEC |
| G02 | PASS hist. escopado | Eng./Reviewer | 52b12308 | CI baseline | GitHub | #42713311846 | CI do commit X pendente | CI e browser no SHA final |
| G03 | PASS hist. escopado | Admin | anterior | cadastro/D1 | Chromium local | reconciliação 16 | QA atual | Revalidar em QA segregado |
| G04 | PASS hist. escopado | Admin | anterior | galeria/capa/publicação | local | reconciliação 16 | QA atual | E2E atual |
| G05 | **FAIL** | Eng./QA Images | ciclo X local | stream RED→GREEN, MIME, bytes/retry | Miniflare local | este relatório e testes de integração | 25 MiB vs Images 20 MB; Access/R2/D1/Images QA real | Arquitetura 25 MiB ou decisão expressa; E2E remoto segregado |
| G06 | PASS hist. escopado | Segurança | anterior | JWT RS256/JWKS | QA/local | reconciliação 16 | revisão externa | Revalidar negativos e claims |
| G07 | PASS hist. escopado | Access QA | anterior | OTP real | QA histórico | reconciliação 16 | ambiente/físico atual | Revalidar sem registrar OTP |
| G08 | PASS hist. escopado | Segurança | anterior | logout/revogação | QA/local | reconciliação 16 | QA atual | Replay/rotação em QA seguro |
| G09 | PASS hist. escopado | Segurança | anterior | A/B e IDOR | Miniflare/QA hist. | reconciliação 16 | QA atual | Matriz no SHA final |
| G10 | PASS hist. escopado | Segurança | anterior | GET/HEAD 404/0B | local/QA hist. | reconciliação 16 | runtime flag não lido | Revalidar bytes em QA |
| G11 | PASS hist. escopado | Produto | anterior | favoritos D1 | Chromium | reconciliação 16 | QA atual | Favoritos/reload |
| G12 | PASS hist. escopado | Produto | anterior | download/hash | Chromium local | reconciliação 16 | E2E remoto | Comparar SHA original |
| G13 | PASS hist. escopado | UI cliente | anterior | lightbox/teclado | Chromium | reconciliação 16 | físico | Revalidar atual e G15 |
| G14 | PASS hist. escopado | UI admin | 52b12308 | CI Chromium anterior | GitHub | artifact 13717595698 | ZIP não auditado | Inspecionar artifact/E2E final |
| G15 | **BLOCKED_EXTERNAL** | Testadores físicos | — | TalkBack/VoiceOver | Android/iOS reais | GOAL 36 | NOT_RUN atual | Matriz real assinada |
| G16 | PASS hist. escopado | Studio/Maria | 52b12308 | CI, Colagem, regressões | GitHub/local | #42713311846 | não comparado a produção | QA visual e drafts |
| G17 | **FAIL** | Infra Cloudflare | anterior | cache hot, scripts CPU | QA histórico | docs 28–31/58 | CPU cold/MISS do HEAD e custo Free sem medição | Teste remoto autorizado de CPU efetiva e quotas |
| G18 | PASS hist. escopado | Operador | anterior | D1/R2 backup/restore | QA anterior | run #40786688338 | não equivale G23 | Preservar dados e hashes |
| G19 | **BLOCKED_EXTERNAL** | Auditor independente | — | revisão completa | externo | GOAL 36 | parecer e zero P0/P1 ausentes | Revisão independente formal |
| G20 | **BLOCKED_EXTERNAL** | Maria/controladora | — | decisão LGPD | estúdio | GOAL 36 | aceite escrito ausente | Aprovação formal, datada |
| G21 | PASS hist.; SHA X pendente | CI Reviewer | 52b12308 | verify baseline | GitHub | #42713311846 | CI X pendente | Confirmar PR, checkout, artefatos do commit X |
| G22 | **BLOCKED_EXTERNAL** | Proprietário | — | R1/R2/R3 | humano | GOAL 36 | autorização específica ausente | Decisão explícita por etapa após gates |
| G23 | **BLOCKED_EXTERNAL** | Operador QA | anterior | inventory offline, recovery local | Node/local | docs 38/58 | sem Worker/config/data rollback remoto segregado | Preflight, snapshot, restore e reabertura em QA |
| G24 | PASS hist.; X pendente | Documentação | 52b12308 | Git/Drive checkpoints | GitHub/Drive | docs 35–58 | checkpoint X e readback não concluídos | Commit, CI, PR, Drive e continuidade |

**Config versionada:** `PRIVATE_GALLERIES_ENABLED=false`. Estado runtime remoto não verificado. **Custo incremental autorizado:** R$ 0; fatura/uso Cloudflare atual não lidos. Nenhum merge, deploy, alteração de billing, banco remoto, R2 remoto, Access, fotos da Maria, Studio, Colagem ou publicação ocorreu neste ciclo.

**Próxima ação segura:** concluir verificações locais e CI do SHA final; coletar inventário de QA sem writes, preparar solução de 25 MiB e CPU cold com prova real e obter aprovações humanas G15/G19/G20/G22. A permanência de qualquer gate bloqueante mantém `NO_GO_PRODUCTION`.
