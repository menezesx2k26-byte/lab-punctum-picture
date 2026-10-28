# R4 — Reconciliação vinculante do DoD original G01–G24 e handoff

Data: 2026-10-27. Contrato: matriz original preservada em `12-release-readiness.md`. Base da PR #20: PR #17; **main, produção, Cloudflare D1/R2/Access, billing e migrações remotas intactos nesta continuação**.

## Retificação pela fonte primária — 28/10/2026

O mapeamento anterior de G13–G15 estava incorreto. A seção 23 do arquivo original define cliente/browser, admin/browser e acessibilidade/matriz assistiva respectivamente. A tabela abaixo foi corrigida; dispositivos físicos e SEO ficam como verificações suplementares, sem renomear gates. Snapshot anterior preservado no Git e no estado v3. Relatório atual: `23-r4-final-homologation-2026-10-28.md`.

## Regra de interpretação
Os números G01–G22 do relatório `15-argon-execution-2026-10-27.md` são uma **matriz diferente**. Não representam os G01–G22 originais e não podem substituir a SPEC. Esta matriz volta aos **24 requisitos originais**. A tabela atual usa os seis estados da SPEC: PASS, FAIL, BLOCKED_EXTERNAL, BLOCKED_SECURITY, NOT_RUN, NOT_APPLICABLE. Escopo local/sintético é registrado separadamente; PASS local nunca comprova Access/Workers/R2 real. Os nomes de estados legados são mantidos apenas nos registros históricos. G23 e G24 **não foram eliminados**.

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

### Tratamento obrigatório de G23 (rollback)
1. Rollback lógico imediato: **flag `PRIVATE_GALLERIES_ENABLED=false`**, por alteração/release somente após aprovação específica; a configuração de código atual está desligada. Não confundir flag versionada com estado efetivo remoto (não lido aqui).
2. Reverter Worker/deploy apenas mediante autorização: restaurar artefato imutável anterior e conferir roteamento público, sem executar migrations reversas destrutivas.
3. Para corrupção D1/R2: **preservar originais**, capturar snapshot e hashes; restaurar apenas em QA vazio/isolado sob procedimento `10-d1-r2-recovery.md` e rotação independente de segredo; nunca executar UPSERT global histórico ou restaurar sobre D1 ocupado.
4. Registrar evidência, novo SHA, responsável, diffs, logs sanitizados, estado dos objetos e sessões; rollback completo remoto **não executado**, logo G23 **PARTIAL**.

### Correção de segurança implementada nesta continuação
- RED `ac7ef4e`: teste `rejects a valid administrative Access JWT if ADMIN_ALLOWED_EMAILS is unset or empty` falhou em Codespace: o JWT assinado de `unapproved@example.com` retornou papel admin.
- GREEN `bdd00f9`: `worker/utils/auth.ts` agora exige `allowed.includes(email)` inclusive se a lista é vazia. O focused Vitest passou **4/4**; execução no Codespace com JWT/JWKS **sintéticos**. Não houve JWT real nem troca de políticas Access.
- Sessões por senha já exigiam allowlist explícita; o caminho JWT era assimétrico e agora segue o mesmo princípio fail-closed.

### LGPD — revisão complementar local (não é aprovação da controladora)
- `loadSanitizedTitularExport` seleciona colunas explicitamente; a consulta de contas não seleciona `password_hash`, `password_salt`, iterações nem versão de sessão. Galerias são filtradas por `client_id`; fotos por JOIN ao cliente + status ready/não excluída; favoritos por `client_id`.
- `buildSanitizedTitularExport` monta saída a partir de propriedades explícitas, sem `storage_key`, segredo de sessão, JWT/OTP, fotos binárias, hashes ou salts. A rota `/admin/api/clientes/:id/lgpd-export` chama `requireAdmin`, emite `Cache-Control: private, no-store` e audita a operação.
- Não há garantia de que texto/nomes/fotos de um titular não contenham dados pessoais incidentais de terceiros; isso exige revisão humana LGPD e regras de retenção e atendimento. Não copiar exportações para logs/CI.

### Segurança e dependências: limites
- Testes emulador existentes abrangem isolamento A/B, JWT synthetic, mídia negada sem corpo e tentativas de traversal, concorrência/retry, sessões e recuperação local. Histórico: overrides de `satori` e `fflate` em lockfile com audit anterior zero; executar novo `npm audit` sobre lockfile final.
- Revisão anterior foi direcionada, sem pentest ou verificação independente integral; não declarar G19 PASS. Sem credenciais, OTP, JWT completo ou mídia privada real em testes/evidências.
- Cloudflare Access real, billing CPU, REST/D1/R2 remotos, QA físico, aprovação LGPD e autorização de release permanecem bloqueios. **PRODUCTION_NO_GO.**

## Fechamento técnico atualizado em 28/10/2026 — sem autorização de produção

- **R4-LGPD**: RED `840b702` confirmou omissão de metadados retidos (pending/failed/deleted), GREEN `f318e5b` corrige projeção sanitizada sem storage key/R2; RED `c271128` identificou quatro leituras D1 independentes, GREEN `3347c93` consolida as quatro consultas em um único `D1.batch` transacional. Integração local A/B sintética `eddccc0` PASS.
- **R4-AUDIT**: RED `c21dfc4` confirmou possibilidade de imputação de ato a e-mail não verificado com senha global; GREEN `3242adc` + propagação às rotas de escrita usa `auditPrincipal` genérico em modo senha compartilhada e mantém e-mail JWT de Access verificado. Integração real D1 local `44d0615` PASS. Isto **não** cria login individual e G19 continua PARTIAL.
- **Validação de código** SHA `7fccea1dbc7e9b2f7589bab11bb4496ec124ae66`: Vitest 47 arquivos/199 PASS; Colagem 7 PASS; Node 22 PASS; typecheck, lint, build e npm audit 0 vulnerabilidades PASS, com avisos legados do builder. CI `40690668055` completed/success.
- **G20**: técnica corrigida, controladora do estúdio ainda **não aprovou** escopo, retenção nem entrega segura. Não declarar conformidade total LGPD.
- **G21**: PASS no código CI, mas qualquer novo HEAD documental precisa de sua própria verificação de CI.
- **G02/G07/G14/G17/G18/G19/G20/G22/G23**: mantidos seus bloqueios originais. Nenhum merge na main, deploy, billing, migração remota, alteração Access, Cloudflare real ou ativação foi realizado. **PRODUCTION_NO_GO**.

## HST-001 — atualização28/10/2026

Mantidos os24 gates originais. G17 BLOCKED_EXTERNAL e G23 PARTIAL: nenhuma ativação, restart, integração ou rollback remoto; o domínio histórico é PersistFlow. G21 temporariamente PARTIAL para a nova PR até CI do SHA final; CI anterior de #20 permanece prova histórica. HST local:203 Workers/7 Colagem/26 Node e checksPASS. [Relatório18](18-hst-001-hostinger-qa-2026-10-28.md); [runbook 19](19-hst-001-deploy-rollback.md).

Atualização de CI HST: run [40739701038](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40739701038) **completed/success** verificado em `f25d51f56ea96fbe8ef88069b7954383d9d134ff`; G21 PASS para esse SHA. A CI do HEAD documental final é registrada separadamente na PR #24. O estado temporário PARTIAL acima está superado por esta verificação, sem alterar G17/G23.

## Continuação por SSH — 28/10/2026

[Relatório21](21-hst-001-hostinger-ssh-followup-2026-10-28.md): autenticação SSH resolvida, Node 22/24 executam; consultas do gerenciador falham e loopback TCP é recusado em Node/Python. Replay entre novos processos SSH PASS, sem restart/redeploy do provedor ou app HTTPS. G17 BLOCKED_EXTERNAL e G23 PARTIAL preservados. G21 usa a CI anterior exata f274f29 e a CI documental final registrada na PR #24. Nada foi integrado ao Worker ou ao PersistFlow.
