# R4 — Reconciliação vinculante do DoD original G01–G24 e handoff

Data: 2026-10-27. Contrato: matriz original preservada em `12-release-readiness.md`. Base da PR #20: PR #17; **main, produção, Cloudflare D1/R2/Access, billing e migrações remotas intactos nesta continuação**.

## Regra de interpretação
Os números G01–G22 do relatório `15-argon-execution-2026-10-27.md` são uma **matriz diferente**. Não representam os G01–G22 originais e não podem substituir a SPEC. Esta matriz volta aos **24 requisitos originais**. "PASS_LOCAL" significa validação reproduzível de código/simulações e **nunca** homologação Access/Workers/R2 real. "PARTIAL" não passa na liberação. "BLOCKED_EXTERNAL" e "BLOCKED_GOVERNANCE" exigem terceiros ou autorização específica. G23 e G24 **não foram eliminados**.

| Gate original | Requisito da SPEC (referência `12-release-readiness.md`) | Estado da evidência | Relação com gates Argon / prova | Próxima ação |
|---|---|---|---|---|
| G01 | Baseline e preservação | PASS_LOCAL | `00-baseline.md`, PR #17/#20; não é Argon G01 (schema) | Conferir baseline no merge autorizado |
| G02 | Integração e validação final | PARTIAL | PR #20 contra PR #17; Argon G01–G03 cobrem aspectos, não merge | CI SHA final + integração autorizada |
| G03 | Cadastro administrativo de clientes | PASS_LOCAL | Argon G04; `client-galleries.spec.ts` e `client-security-matrix.spec.ts` | QA real antes de GO |
| G04 | Publicação e gerenciamento de galerias | PASS_LOCAL | Argon G05; `client-galleries.spec.ts` | QA real antes de GO |
| G05 | Upload privado e falhas | PASS_LOCAL | Argon G06; `client-media.spec.ts` | QA edge com fixture sintética |
| G06 | JWT, audiences, claims | PASS_LOCAL | Argon G07 cobre apenas JWT simulado; `client-access.spec.ts`, `client-security-matrix.spec.ts` | Access JWT real em G07 |
| G07 | OTP real Cloudflare Access | BLOCKED_EXTERNAL | Argon G07 parcial sintético; sem identidade JWT/OTP real ou política QA autorizada | Operador Access + identidade QA |
| G08 | Sessões e revogação | PASS_LOCAL | Argon G07/G08; `client-galleries.spec.ts`, `client-access.spec.ts` | Revalidar com sessão real |
| G09 | Isolamento entre clientes | PASS_LOCAL | Argon G08/G12; `client-security-matrix.spec.ts` | QA remoto A/B |
| G10 | Mídia privada e negações | PASS_LOCAL | Argon G11/G12; `client-media.spec.ts`, negação com zero byte em `client-security-matrix.spec.ts` | Testar headers/bytes no edge |
| G11 | Favoritos e operações do titular | PASS_LOCAL | Argon G10; `client-galleries.spec.ts`, `client-pilot.spec.ts` | QA real A/B |
| G12 | Download, privacidade e autorização | PASS_LOCAL | Argon G11/G12; `client-media.spec.ts` | QA edge R2 privado |
| G13 | Navegação e acessibilidade | PASS_LOCAL | Argon G13; browser Chromium registrado em `15-argon-execution-2026-10-27.md` | Teste assistivo/hardware |
| G14 | Responsividade e dispositivos reais | PARTIAL | Argon G14: Chromium headless em 8 larguras; **não** é Android Chrome/iOS Safari físico | QA Android + iOS em aparelhos |
| G15 | SEO/cache/noindex e superfícies privadas | PASS_LOCAL | Argon G15; testes do router e browser | Confirmar configuração edge |
| G16 | Não regressão de site público, Studio e Colagem | PASS_LOCAL | Argon G03; suíte Colagem 7 testes + testes de app; Argon G16 é rate-limit, **não equivalente** | Smoke após release autorizado |
| G17 | CPU, Workers Free, franquia e orçamento R$ 0 | BLOCKED_EXTERNAL | HST-001 relatório 18:142 requisições QA p99=134,2ms, home 3 eventos129–166ms; Billing 200 via credencial existente, uso variável não provado; Hostinger ocupado/inventário bloqueado | Medir causa/home do HEAD e comprovar capacidade/custos antes de offload |
| G18 | Recuperação D1/R2 íntegra | BLOCKED_EXTERNAL | Argon G18; `client-recovery.spec.ts` em D1/R2 local, `10-d1-r2-recovery.md`; QA histórico contém 5 contas em cada D1 | Operador QA: autorizar par isolado vazio, verificar hashes, quarentena e rotação de segredo |
| G19 | Revisão independente de segurança | PARTIAL | Argon G19; revisão dirigida existente NÃO é auditoria independente integral | Revisor distinto, inspeção configuração real, sign-off |
| G20 | Decisão formal LGPD da responsável pelo estúdio | BLOCKED_GOVERNANCE | Argon G20; projeção explícita LGPD e testes `client-lgpd.spec.ts`; sem aprovação humana | Responsável do estúdio: revisar retenção, exportação, papéis e assinar |
| G21 | PR, CI e rastreabilidade do SHA final | PASS | Argon G21 significa piloto simulado, **não** equivale; CI código SHA `7fccea1` run `40690668055` PASS, suíte completa 199 Vitest + Colagem 7 + Node 22; CI do HEAD documental deve ser conferida separadamente | Preservar referência ao run final na PR |
| G22 | Autorização de release | BLOCKED_GOVERNANCE | Argon G22; release e flag desligados | Proprietário: GO explícito após todos gates |
| G23 | Rollback controlado | PARTIAL | **Omitido da matriz Argon**; guard `isPrivateGalleriesEnabled`, `private-rollout.spec.ts` e deploy restrito a main demonstram desativação local; **não demonstram rollback operacional de D1/R2/Worker em QA/produção** | Responsável infraestrutura: ensaio de recuperação QA isolado e procedimento supervisionado sem sobrescrita |
| G24 | Handoff rastreável e estado durável | PASS_LOCAL | **Omitido da matriz Argon**; este documento, `13-handoff.md`, PR #20 e `execution-state.json`; sem takeover PersistFlow comprovado | Manter atualização no HEAD final e compartilhar com responsável |

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
