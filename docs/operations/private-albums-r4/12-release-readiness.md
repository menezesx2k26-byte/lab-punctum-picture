# Readiness R4

**NO-GO para produção.** Estado corrente e limites no relatório 23. Matriz retificada pela SPEC R4 original, seção 23, SHA-256 2989e0ba18982658570dc699842393b3f980c9a5312237af33ab02292d10ecfb. PASS local contém escopo e não equivale a aprovação operacional. A main aciona deploy/migrations; nenhum merge está autorizado.

| Gate original | Definição exata da SPEC §23 | Estado | Evidência e limite |
|---|---|---|---|
| G01 | Baseline atualizado — SHAs/inventário | PASS | Original SPEC and handoff fully read and hash-verified; PR17/20/24, remote HEAD, worktrees and main-only diff audited. Existing work preserved. |
| G02 | Integração sem regressão — diff auditado/testes | PASS | CI exact-head checkout fixed; deterministic tests, lint, typecheck, build and Chromium on stacked PR. No merge into main authorized. |
| G03 | Cadastro admin — E2E/D1 | PASS | Local Chromium creates Access client without password; D1 verifies persisted data. Synthetic QA identity; no real OTP claim. |
| G04 | Galeria e publicação — E2E | PASS | Local browser creates, edits and publishes gallery, cover/theme/intro verified in D1; public approved UI preserved. |
| G05 | Upload confiável — bytes/retry | FAIL | Local bytes/retry/progress tests pass, but real isolated recovery upload returned400 INVALID_IMAGE because QA lacked IMAGES. New503 guard preserves upload instead of falsely corrupting it. Remote upload not homologated. |
| G06 | JWT Access — testes criptográficos | PASS | Cryptographic issuer/audience/signature/claim tests pass; admin exp/iat/sub/email/type hardened with RED-GREEN. Real Access token remains G07. |
| G07 | OTP real — evidência real sanitizada | BLOCKED_EXTERNAL | Needs authorized human OTP on historical isolated Access QA plus real JWT/session/revocation evidence; never print OTP/cookie/JWT. Synthetic signed fixtures do not pass this gate. |
| G08 | Sessão segura — auth/revogação | PASS | Local client logout/version revocation, disabled account and admin credential revision tests pass; real identity revocation depends G07. |
| G09 | Isolamento — matriz A/B | PASS | Local A/B galleries/API/media/download/favorites isolation, including pending navigation and foreign IDs. Remote restored-session checks blocked. |
| G10 | Mídia privada — zero bytes indevidos | PASS | Local unauthorized media returns zero bytes; private originals not public optimizer/media. Dedicated remote buckets have public endpoints disabled; real OTP boundary pending. |
| G11 | Favoritos — persistência E2E | PASS | Local browser favorite persisted across reload with D1 verification and A/B tests. |
| G12 | Downloads — API/UI | PASS | Local API/UI downloads checked byte/hash and foreign gallery denial; no real private photos used. |
| G13 | Frontend cliente — browser | PASS | 14-check real Chromium against local production bundle: libraries/viewer/lightbox/Escape/focus/loading/errors/empty and A/B navigation. Mobile viewports are emulation. |
| G14 | Frontend admin — browser | PASS | Admin browser creation/upload/progress/edit/publish at8 widths. CSS chunk404 fixed and clipped action labels at320px reproduced/fixed; screenshots retained. |
| G15 | Acessibilidade — matriz assistiva | BLOCKED_EXTERNAL | Local keyboard/focus/reduced-motion coverage exists; assistive/contrast/200%-zoom matrix and physical Android Chrome/iOS Safari remain incomplete; adb found no device. |
| G16 | Não regressão pública — testes main | PASS | Public home/Studio/Colagem preserved; production bundle and SSR import checks, Colagem7tests and browser flows pass. Main-only diff is CI permission-probe receipt, no public app code. |
| G17 | CPU/custos — fontes/medição | FAIL | Real isolated run40768574085 on d02e774: baseline CPU31/58/104ms n65; candidate30/62/114ms n63; HTTP0/64 each, zero version mismatch. Still above Free10ms reference; not a billed invoice or CPU proof for subsequent HEAD. |
| G18 | Backup/restauração — D1/R2 byte a byte | BLOCKED_EXTERNAL | Remote fixture setup attempted, failed before backup/restore on absent Images binding. Source1synthetic client and restore0 preserved, no deletion. Need verified Images transformation allowance and explicit continuation of owned fixtures; historical5-client databases untouched. |
| G19 | Segurança independente — sem P0/P1 | BLOCKED_EXTERNAL | Auxiliary distinct CoS review found/fixed admin JWT claims and missing audit events; not formal authorized independent sign-off. Real administrative individual identity and runtime Access review pending. |
| G20 | LGPD — aprovação estúdio | BLOCKED_EXTERNAL | Controller decisions prepared for purpose/legal basis, retention/deletion, third parties, backups/export/delivery. No legal or controller approval invented. |
| G21 | PR integração — CI/revisão | PASS | CI40772288364 SUCCESS exact96b71ea;218Workers/53files,7Colagem,45Node,14Chromium checks; artifact12853401485 readback clean checkout/SHA/5PNGs. PR24 draft; formal G19 independent approval remains separate. |
| G22 | Release — autorização específica | BLOCKED_EXTERNAL | No explicit production release authorization. No main merge/deploy/real-client activation/migration/production Access or billing changes. |
| G23 | Rollback — procedimento testado | BLOCKED_EXTERNAL | Real dedicated Worker baseline rollback and return to candidate PASS. Finally restored d02e774 flagfalse versionc9f54971-adcf-4e2b-aa5d-b356caf7b830 after private QA failure. Remote D1/R2/session rollback not executed. |
| G24 | Handoff — relatório verificável | PASS | Repository state/24gates, Engram private episode create/append/get and PersistFlow generation1 checkpoint3 inspection verified; no takeover/automatic continuation. Drive Sgtmenezes consolidated handoff uploaded and metadata/content/hash readback verified; receipt versioned. |

## Histórico — 27/10/2026 (superado pelo relatório 23)

A biblioteca e o transporte standalone de QA foram implementados e validados localmente. Suíte atual: 187 testes do projeto, 7 de Colagem e 22 Node; typecheck/lint/build passaram. Isso não promove G18: o par QA observado tem 5 contas em cada D1 e agora é recusado pelo preflight antes de qualquer escrita. Não limpar o histórico para obter PASS. A revisão direcionada fechou seus achados específicos; a auditoria integral e o teste no edge continuam pendentes.

G13–G15 seguem bloqueados: tentativa de instalar navegador local recebeu HTML em vez de ZIP. G07 OTP real, G17 billing/CPU e G20 aprovação LGPD não foram concluídos. Nenhuma autorização de merge/deploy/ativação foi solicitada nesta rodada; o estado continua NO-GO. Ver 14-recovery-followup-2026-10-27.md para evidências e falhas observadas.

## Atualização incremental Argon R4 (2026-10-27)

- **Consolidação técnica local/CI (`TECHNICAL_DOD_PASS / PRODUCTION_NO_GO`)**:
  - `typecheck`: `PASS` (`0` erros)
  - `lint`: `PASS` (`0` erros, `0` warnings)
  - `vitest` (workers/unit/integration): `PASS` (`46` arquivos / `191` testes)
  - `vitest.collage.config.ts`: `PASS` (`1` arquivo / `7` testes)
  - `node --test`: `PASS` (`22` testes)
  - `npm run build`: `PASS` (`vinext build` 5 estágios)
  - `node --check scripts/private-galleries-preview.mjs`: `PASS`
  - `npm audit --json`: `PASS` (`0` vulnerabilidades com overrides `satori@0.33.5` e `fflate@0.7.5`)
  - Browser real Chromium (`playwright-cli`) em `320`, `360`, `375`, `390`, `430`, `768`, `1024`, `1440` px: `PASS` (`0` falhas de overflow horizontal, `0` falhas de alvo de toque `>= 44 px`, `0` inputs sem label, navegação por teclado no `PhotoViewer` validada).
- **Gates atualizados com evidência**:
  - `G13` (`Acessibilidade e teclado`): promovido de `FAIL` para `PASS` após auditoria real em Chromium headless (`playwright-cli`) e correções de alvos de toque/foco/teclado.
  - `G14` (`Responsividade mobile/desktop`): promovido para `PARTIAL` com `PASS` em browser Chromium real nos 8 viewports (`320`–`1440` px) e pendência apenas de hardware físico iOS Safari / Android Chrome.
  - `G07`, `G17`, `G18` permanecem `BLOCKED_EXTERNAL`; `G19` permanece `PARTIAL`; `G20` e `G22` permanecem `BLOCKED_GOVERNANCE`.

## HST-001 — 28/10/2026

A tabela acima foi reconciliada com os24 gates originais, sem substituir sua numeração pela matriz Argon. Detalhes: [relatório 18](18-hst-001-hostinger-qa-2026-10-28.md), [runbook 19](19-hst-001-deploy-rollback.md) e `execution-state.json`. HOSTINGER_BRIDGE_QA_BLOCKED; PRODUCTION_NO_GO.
