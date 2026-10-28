# Readiness R4

**NO-GO para produção.** Estado corrente e limites no relatório 23. Matriz retificada pela SPEC R4 original, seção 23, SHA-256 2989e0ba18982658570dc699842393b3f980c9a5312237af33ab02292d10ecfb. PASS local contém escopo e não equivale a aprovação operacional. A main aciona deploy/migrations; nenhum merge está autorizado.

| Gate original | Definição exata da SPEC §23 | Estado | Evidência e limite |
|---|---|---|---|
| G01 | Baseline atualizado — SHAs/inventário | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G02 | Integração sem regressão — diff auditado/testes | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G03 | Cadastro admin — E2E/D1 | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G04 | Galeria e publicação — E2E | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G05 | Upload confiável — bytes/retry | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G06 | JWT Access — testes criptográficos | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G07 | OTP real — evidência real sanitizada | BLOCKED_EXTERNAL | Cloudflare QA Access self_hosted app and 'Owner QA OTP only' policy directly verified, 1h session, one IdP, CLIENT_AUTH_MODE=access and configured secrets. Real OTP/JWT/identity/session revocation and D1 authorization still NOT tested (G07 BLOCKED_EXTERNAL). |
| G08 | Sessão segura — auth/revogação | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G09 | Isolamento — matriz A/B | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G10 | Mídia privada — zero bytes indevidos | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G11 | Favoritos — persistência E2E | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G12 | Downloads — API/UI | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G13 | Frontend cliente — browser | PASS | Original: client frontend/browser. Current local Chromium libraries, private viewer, favorites, download, keyboard and A/B tests. Does not prove OTP or physical devices. |
| G14 | Frontend admin — browser | PASS | Original ADMIN/browser: expanded14-check local Chromium E2E passed after CSS chunk correction; Access client/gallery/upload/progress/cover/edit/publish at8 widths. Synthetic local auth only. |
| G15 | Acessibilidade — matriz assistiva | BLOCKED_EXTERNAL | Original: assistive accessibility matrix. Keyboard/focus/reduced motion locally exercised; 200% zoom, contrast and physical TalkBack/VoiceOver matrix incomplete. SEO is supplementary. |
| G16 | Não regressão pública — testes main | PASS | Testes locais determinísticos e relatório 23; nenhuma homologação de produção implícita. |
| G17 | CPU/custos — fontes/medição | FAIL | FAIL on real isolated QA da23806: baseline CPU telemetry p50/p95/p99=50/90/137ms (53 samples); candidate 57/111/204ms (48). Baseline 10/64 HTTP503, candidate 17/64; 0 version mismatches. Workflow success means measurement completed, not gate PASS. No cause assigned to bridge or 503 without evidence. |
| G18 | Backup/restauração — D1/R2 byte a byte | NOT_RUN | Dedicated new QA pair from prior run40756797747 now exists; prior claim no isolated pair is stale. Remote recovery being implemented independently; no restoration PASS yet. |
| G19 | Segurança independente — sem P0/P1 | BLOCKED_EXTERNAL | Targeted static review and local test regressions complete, including shared-password audit principal; individual verified admin identity and formal independent sign-off missing. Issue #21 remains for G19/G07. |
| G20 | LGPD — aprovação estúdio | BLOCKED_EXTERNAL | Technical export now includes retained metadata in sanitized allowlist and reads one D1 transaction batch, with tests; studio controller's retention, third-party-data review, delivery method and approval absent. Issue #22 remains. |
| G21 | PR integração — CI/revisão | PASS | Exact PR-head checkout and visual screenshot retention fixed RED588e499/GREEN53c13c6; CI40762657123 success on da23806. Later commits still require their own CI. |
| G22 | Release — autorização específica | BLOCKED_EXTERNAL | Explicit release authorization absent. No main merge, prod deploy, migration, policy changes or activation. |
| G23 | Rollback — procedimento testado | NOT_RUN | Real isolated Worker baseline rollback and candidate return passed at run40762650132. D1/R2 recovery/session portion remains unverified. |
| G24 | Handoff — relatório verificável | PASS | Reports18-21, original24gates, immutable sanitized Cloudflare/Hostinger/SSH evidence and PR #24 track progress; Drive handoff refreshed after this continuation. No PersistFlow takeover or Hostinger activation claimed. New machine-verifiable local CI/E2E evidence is attached to run 40758459104; latestR4Continuation details generated prior to this docs-only commit. |

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
