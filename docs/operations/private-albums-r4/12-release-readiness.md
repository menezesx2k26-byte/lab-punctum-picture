# Readiness R4

**NO-GO para produção.** Estado corrente e limites no relatório 25. Matriz retificada pela SPEC R4 original, seção 23, SHA-256 2989e0ba18982658570dc699842393b3f980c9a5312237af33ab02292d10ecfb. PASS local contém escopo e não equivale a aprovação operacional. A main aciona deploy/migrations; nenhum merge está autorizado.

| Gate original | Definição exata da SPEC §23 | Estado | Evidência e limite |
|---|---|---|---|
| G01 | Baseline atualizado — SHAs/inventário | PASS | Original SPEC and handoff fully read and hash-verified; PR17/20/24, remote HEAD, worktrees and main-only diff audited. Existing work preserved. |
| G02 | Integração sem regressão — diff auditado/testes | PASS | CI exact-head checkout fixed; deterministic tests, lint, typecheck, build and Chromium on stacked PR. No merge into main authorized. |
| G03 | Cadastro admin — E2E/D1 | PASS | Local Chromium creates Access client without password; D1 verifies persisted data. Synthetic QA identity; no real OTP claim. |
| G04 | Galeria e publicação — E2E | PASS | Local browser creates, edits and publishes gallery, cover/theme/intro verified in D1; public approved UI preserved. |
| G05 | Upload confiável — bytes/retry | FAIL | Local bytes/retry/progress tests pass, but real isolated recovery upload returned400 INVALID_IMAGE because QA lacked IMAGES. New503 guard preserves upload instead of falsely corrupting it. Remote upload not homologated. |
| G06 | JWT Access — testes criptográficos | PASS | CI cryptographic claim regressions plus actual provider JWKS/RS256 issuer/audience verification in QA; tampered signature and wrong issuer/audience denied. Expiration negative uses verifier future clock, not an elapsed-hour observation. |
| G07 | OTP real — evidência real sanitizada | PASS | PASS for real human OTP on Access QA: live JWKS verification, current deployed1c9cee9/eb6d11b2 browser me200, logout/old-cookie401/reentry, Access logout and reauthentication observed; controlled QA-only disable same valid v4 cookie401 and reenable fresh v5 me200. Android entry reported by human; no phone gallery approval. Prior Android owner+OTP denial cause remains opaque; policy not widened. |
| G08 | Sessão segura — auth/revogação | PASS | Real QA logout invalidates old cookie401; disabled new synthetic owner version4->5 denies same previously valid cookie401; reenabled version5 and fresh Access session200. Original five clients unchanged. Separate old-v4 replay AFTER reenable not run because automatic entry replaced cookie; earlier real logout replay and local version checks remain explicit evidence. |
| G09 | Isolamento — matriz A/B | PASS | CI A/B galleries/media/download/favorites and pending-navigation isolation; real restored/source synthetic A/B PASS in40786688338. Real owner session foreign gallery404 and media404/0 bytes. Two-client real OTP not claimed. |
| G10 | Mídia privada — zero bytes indevidos | PASS | CI denied media zero bytes; remote source synthetic ownership and real-owner foreign-media denial; private buckets checked. After flag-off, Chromium GET/HEAD media404/0 bytes on versione05a3001. Python channel got403 without version header, recorded separately and not counted as Worker evidence. |
| G11 | Favoritos — persistência E2E | PASS | Local browser favorite persisted across reload with D1 verification and A/B tests. |
| G12 | Downloads — API/UI | PASS | Local API/UI downloads checked byte/hash and foreign gallery denial; no real private photos used. |
| G13 | Frontend cliente — browser | PASS | 14-check real Chromium against local production bundle: libraries/viewer/lightbox/Escape/focus/loading/errors/empty and A/B navigation. Mobile viewports are emulation. |
| G14 | Frontend admin — browser | PASS | Admin browser creation/upload/progress/edit/publish at8 widths. CSS chunk404 fixed and clipped action labels at320px reproduced/fixed; screenshots retained. |
| G15 | Acessibilidade — matriz assistiva | BLOCKED_EXTERNAL | BLOCKED: human Android Chrome entry only, then explicitly reported empty/static page cannot exercise gallery. No physical lightbox/favorites/download/overflow proof, model/versions unknown; iOS unavailable and full assistive matrix incomplete. Emulation remains separately scoped. |
| G16 | Não regressão pública — testes main | PASS | Public home/Studio/Colagem preserved; production bundle and SSR import checks, Colagem7tests and browser flows pass. Main-only diff is CI permission-probe receipt, no public app code. |
| G17 | CPU/custos — fontes/medição | FAIL | FAIL: latest actual Edge run40779241089 candidate1d30b97 CPU telemetry p50/p95/p99=31/57/145ms n63, HTTP0/64; baseline53/106/160 n61, HTTP14/64. Baseline field error preserved with erratum: actual build16c86d1. Not billed invoice, not current13a6 CPU qualification. Free entitlement/capacity/cost not fully proven; Hostinger v2 Node200 does not prove SSR. |
| G18 | Backup/restauração — D1/R2 byte a byte | PASS | PASS scoped remote40786688338 exact13a6c83: two new synthetic clients,26 rows/10 PNG79B restored, hashes/relations/FK checked, private backup readback hash verified, both restored accounts quarantined, old sessions401 after rotation. Original failed case full-row/object digests unchanged. Finally source3clients/restore2, buckets retained, current versione05a3001 flagfalse/noR2. No historical DB restore, no G05 upload homologation. |
| G19 | Segurança independente — sem P0/P1 | BLOCKED_EXTERNAL | BLOCKED: auxiliary distinct technical reviews and corrected findings are reproducible, but no formal authorized independent security signoff. Individual administrative identity and full runtime boundary audit still require reviewer. |
| G20 | LGPD — aprovação estúdio | BLOCKED_EXTERNAL | Controller decisions prepared for purpose/legal basis, retention/deletion, third parties, backups/export/delivery. No legal or controller approval invented. |
| G21 | PR integração — CI/revisão | PASS | PASS code CI40786692800 exact13a6c83:223Workers/54files,7Colagem,57Node(including14Bridge and real two-origin cookie regression),14Chromium. Artifact12858889396 readback exactSHA/clean checkout/5PNGs/no unexpected browser errors. Final documentation HEAD must receive separate exact-SHA CI before closure. |
| G22 | Release — autorização específica | BLOCKED_EXTERNAL | No explicit production release authorization. No main merge/deploy/real-client activation/migration/production Access or billing changes. |
| G23 | Rollback — procedimento testado | BLOCKED_EXTERNAL | BLOCKED, remote partial: G18 restore/quarantine/secret rotation and Worker return flagfalse/noR2 observed; actual Chromium private GET/HEAD404/0 bytes after return. Missing complete previously-verified-version/config comparison, validated reopening and isolated Studio/Colagem preset rollback. G18 does not promote G23. |
| G24 | Handoff — relatório verificável | PASS | PASS: new continuation Drive1qoEvcvRKPn4D5uRpbJuj5kb38fuEBxDV14404B/SHA7dce4add... metadata+raw independent byte readback; Engram SAME private conversation message4 verified; PersistFlow SAME run generation1/checkpoint5 at23:32:22.712Z inspected, checkpointOnly=true/takeover=false/automaticContinuation=false. Repo24gates/evidence retained. Final documentary HEAD CI is verified in final closure receipt and PR24, without self-referential SHA claim. |

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
