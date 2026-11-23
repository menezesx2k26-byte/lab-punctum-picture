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
