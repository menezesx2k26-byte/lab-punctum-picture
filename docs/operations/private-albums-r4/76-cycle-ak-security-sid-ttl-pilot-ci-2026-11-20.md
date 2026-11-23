# Ciclo AK | GOAL PUNCTUM-FINAL-COMPLETION-20261119

Data: 2026-11-20. Estado de release: **NO_GO_PRODUCTION**.

## G00 takeover

| Item | Valor |
| --- | --- |
| Host / user / cwd | `cursor` / `ubuntu` / `/workspace` |
| OS | Linux 6.12.113+ x86_64 |
| Git identity | Cursor Agent `<cursoragent@cursor.com>` |
| Cloud run | `bc-a0ce00cf-07fc-5e77-803d-f05dceb305a4` |
| Base observed | `main` @ `f0c82f2c7200417e41c1fd3a21414607c2c5a973` |
| Integration tip | `codex/punctum-r4-goal-20261115` @ `f0f951d9f30225d717c1f82df7661889e287ec34` (PR #40 draft) |
| Working branch | `cursor/r4-aj-security-phase-b-ae72` (from R4 tip) |
| CI on AJ tip | run `44456998296`: `verify` **FAILURE** (`npm audit` Next.js GHSA), `hostinger-node-qa` skipped |
| Connectors | GitHub OK; Hostinger Composio Conthabil ACTIVE; Drive R4 handoff doc `1C_0pEAi…` **404** for this account; CF token unset in shell |

Architecture (current R4 stack): public vinext Worker + Studio; D1/R2/Images on Cloudflare; managed Hostinger Node/SQLite/Sharp candidate (`services/punctum-hostinger-production`); Clerk dual-path; backups/scheduled hygiene.

## Reconciliação AJ → AK

Fontes: `75-cycle-aj-security-hardening-2026-11-19.md`, `execution-state.json` (`currentCycle20261119AJ`), `hostinger-managed-release-status-2026-11-14.md`, SPEC §23 via `16-original-g01-g24-reconciliation.md` (arquivo `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` não presente neste clone; definição canônica mantida pela reconciliação). Drive Sgtmenezes R4 handoff: **indisponível** nesta conexão (404), sem PersistFlow.

AJ já corrigiu rebind de sessão, fail-closed de revogação/logout e UI Trocar conta. Residuais P1: TTL `sid:` 24h, piloto Clerk sem `sid` obrigatório alinhado ao verificador principal, CI audit quebrada.

## Mudanças funcionais deste ciclo

1. **TTL de revogação diferenciado**: `tk:` permanece 24h; `sid:` passa a 14 dias (`CLERK_SESSION_REVOCATION_TTL_SECONDS`). `ON CONFLICT` estende `expires_at` (nunca encurta). Após expirar o digest do JWT, o mesmo `sid` continua bloqueado.
2. **Logout coleta `sid` do Bearer/__session`**: `collectClerkRevocationKeys` + `clerkSessionIdFromRawToken` (decode só para deny-list).
3. **Clerk pilot alinhado**: exige `sessionId`, checa revogação `sid:`/`tk:`, falha 401/503 como o contrato principal.
4. **CI audit**: `next` / `eslint-config-next` → `16.4.6` (0 vulnerabilidades em `npm audit --audit-level=low`).

Arquivos: `worker/auth/clerk-auth.ts`, `worker/client/clerk-pilot.ts`, `tests/integration/clerk-r4-security-matrix.spec.ts`, `tests/integration/clerk-pilot.spec.ts`, `package.json`, `package-lock.json`.

## Provas locais

| Prova | Resultado |
| --- | --- |
| Focused security (4 files) | **20/20 PASS** |
| Full Worker Vitest | **326/326 PASS**, 62/62 files |
| typecheck | **PASS** |
| eslint (arquivos alterados) | **PASS** |
| `npm audit --audit-level=low` | **0 vulnerabilities** |
| G05 local 25 MiB | **PASS_LOCAL_SYNTHETIC_NODE** após `build:hostinger:candidate`: 26 214 400 bytes, SHA-256 `c16e100efa8b3233461abdf30df0be13c291ed17c5cd4f6c4dbc40c562aab4ce`, checks HTTP sintéticos (abort/retry/A/B/derivados). **Não** promove G05 remoto |
| Hostinger remoto `/health` | `aliceblue-locust-…` **unreachable** (empty reply); domínio temporário **ausente** na lista Conthabil |
| Conthabil websites | `punctumpicture.com` Node main order `1008628483` / `u571409090` (somente leitura) |
| Drive handoff | **NOT_AVAILABLE** nesta conta |
| Hostinger Node unit (`*.test.mjs`) | **68 pass / 1 fail / 1 skip** — falha pré-existente `reverse export preserves post-snapshot…` (não introduzida neste ciclo); `BUILD_ID` local preservado fora do commit |

Nenhum PASS histórico promovido. Sem Clerk real, OTP real, merge, DNS, cutover ou dados reais.

## Matriz G01–G24 (conservadora — SPEC §23)

| Gate | Estado | Nota determinante |
| --- | --- | --- |
| G01 | PASS | Inventário Git/PR/worktree/Hostinger read-only reconciliado neste ciclo |
| G02 | NOT_RUN | 326 testes locais PASS; CI do SHA final pendente até push |
| G03 | NOT_RUN | Admin sintético; falta E2E Clerk real no alvo |
| G04 | NOT_RUN | Galeria sintética; falta alvo |
| G05 | FAIL | Contrato 25 MiB local histórico; QA Hostinger real + restart/retry ausentes |
| G06 | NOT_RUN | RS256/`sid` sintético reforçado; identidade real ausente |
| G07 | BLOCKED_EXTERNAL | Login/OTP real QA |
| G08 | NOT_RUN | TTL/`sid`/logout TDD local; ciclo real ausente |
| G09 | NOT_RUN | A/B local; isolamento remoto ausente |
| G10 | NOT_RUN | Negativas locais; CDN remoto ausente |
| G11 | NOT_RUN | Favoritos locais |
| G12 | NOT_RUN | Download local |
| G13 | NOT_RUN | Frontend cliente browser real |
| G14 | NOT_RUN | Frontend admin browser real |
| G15 | BLOCKED_EXTERNAL | Matriz assistiva física |
| G16 | NOT_RUN | Regressão local 326/326; staging remoto não homologado |
| G17 | FAIL | CPU/custo alvo não medidos |
| G18 | NOT_RUN | Restore sintético histórico; não refeito no managed atual |
| G19 | BLOCKED_SECURITY | Revisão independente no SHA final não obtida |
| G20 | BLOCKED_EXTERNAL | LGPD estúdio |
| G21 | NOT_RUN | PR draft + CI exact SHA após push |
| G22 | BLOCKED_EXTERNAL | Sem autorização de release |
| G23 | BLOCKED_EXTERNAL | Rollback alvo não ensaiado |
| G24 | NOT_RUN | Handoff Drive indisponível; checkpoint repo neste ciclo |

Contagem: **1 PASS / 2 FAIL / 5 BLOCKED_EXTERNAL / 1 BLOCKED_SECURITY / 15 NOT_RUN**.

## Matriz H00–H10 (managed Hostinger — status 2026-11-14 + readback 2026-11-20)

| Gate | Estado | Nota |
| --- | --- | --- |
| H00 takeover | PASS | Conta Conthabil listada; order/site inventariados |
| H01 Clerk production | BLOCKED_EXTERNAL | Prova browser isolada histórica ≠ Hostinger TLS/apex |
| H02 D1/R2 parity | BLOCKED_EXTERNAL | Freeze/delta final ausente |
| H03 app E2E | NOT_RUN | Histórico no temporary hostname; hostname atual é apex Node |
| H04 HTTPS/routing | BLOCKED_EXTERNAL | Apex TLS challenge historicamente falhou; aliceblue ausente |
| H05 rollback | BLOCKED_EXTERNAL | Restore remoto D1/R2 incompleto |
| H06 operations | BLOCKED_EXTERNAL | Jobs/writer cutover |
| H07 performance | BLOCKED_EXTERNAL | Load auth/upload |
| H08 DNS preflight | PASS (histórico read-only) | Inventário CF; sem cutover |
| H09 cutover | BLOCKED_EXTERNAL | Não autorizado |
| H10 release | BLOCKED_EXTERNAL | NO_GO |

## DoD

| DoD | Estado |
| --- | --- |
| ENGINEERING_DOD | **PARTIAL** — defeitos P1 sid TTL / pilot / audit corrigidos com TDD; CI exact SHA e G05 managed ainda abertos |
| OPERATIONAL_DOD | **BLOCKED** — alvo managed/Clerk/custo/restore |
| PRODUCTION_DOD | **NO_GO** — sem G22; G05/G17 FAIL; G19 BLOCKED_SECURITY |

## Próximo bloco concreto

1. **Abrir draft PR** `cursor/r4-aj-security-phase-b-ae72` → `codex/punctum-r4-goal-20261115` (token deste agente: push OK, create PR/comment/workflow_dispatch **403**). CI do repo só dispara em `pull_request` ou push `main`.
2. Confirmar CI exact SHA `db3e768` (audit 0 esperado).
3. Autorização humana para QA no Node managed em `punctumpicture.com` **sem** cutover DNS público, ou recriar hostname de staging isolado.
4. Revisão de segurança independente no SHA final (G19).
5. Drive handoff com conta que vê `sgtmenezes` R4 doc; só então G24.
