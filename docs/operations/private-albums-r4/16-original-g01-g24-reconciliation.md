# R4 — Reconciliação vinculante do DoD original G01–G24 e handoff

Estado atual: 28/10/2026, relatórios23/24 e execution-state.json. PR24 sobre20 sobre17; apenas recursos QA dedicados foram usados, com fixtures parciais preservadas. Main/produção/Access/billing e aplicações PersistFlow não alterados pelo agente. Registros anteriores abaixo são históricos.

## Retificação pela fonte primária — 28/10/2026

O mapeamento anterior de G13–G15 estava incorreto. A seção 23 do arquivo original define cliente/browser, admin/browser e acessibilidade/matriz assistiva respectivamente. A tabela abaixo foi corrigida; dispositivos físicos e SEO ficam como verificações suplementares, sem renomear gates. Snapshot anterior preservado no Git e no estado v3. Relatório atual: `23-r4-final-homologation-2026-10-28.md`.

## Regra de interpretação
Os números G01–G22 do relatório `15-argon-execution-2026-10-27.md` são uma **matriz diferente**. Não representam os G01–G22 originais e não podem substituir a SPEC. Esta matriz volta aos **24 requisitos originais**. A tabela atual usa os seis estados da SPEC: PASS, FAIL, BLOCKED_EXTERNAL, BLOCKED_SECURITY, NOT_RUN, NOT_APPLICABLE. Escopo local/sintético é registrado separadamente; PASS local nunca comprova Access/Workers/R2 real. Os nomes de estados legados são mantidos apenas nos registros históricos. G23 e G24 **não foram eliminados**.

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
