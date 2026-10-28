# Readiness R4

**NO-GO para produção.** A integração não autoriza merge: a main executa migrações D1 e deploy automático. A flag em produção, as políticas Access, custo real e recursos QA atuais não foram verificados.

| Gate original | Estado | Evidência ou dependência |
|---|---|---|
| G01 baseline | PASS_LOCAL | 00-baseline.md e relatório 18; checkout original preservado |
| G02 integração | PARTIAL | PRs#17/#20 e HST empilhadas; sem merge, CI nova pendente |
| G03 cadastro de clientes | PASS_LOCAL | suíte completa203 Workers; sem E2E remoto de titular |
| G04 publicação de galerias | PASS_LOCAL | fluxos locais; nenhuma publicação privada em produção |
| G05 upload privado/falhas | PASS_LOCAL | D1/R2 emulados; nenhuma foto transferida à Hostinger |
| G06 JWT/claims | PASS_LOCAL | JWT/JWKS sintéticos; configuração não substitui OTP |
| G07 OTP real | BLOCKED_EXTERNAL | OTP/JWT/identidade real ainda não homologados |
| G08 sessões e revogação | PASS_LOCAL | hardening de#20 preservado; testes locais |
| G09 isolamento entre clientes | PASS_LOCAL | D1/R2 local e credenciais sintéticas A/B |
| G10 mídia privada e negações | PASS_LOCAL | testes locais; sem transferência de objetos privados |
| G11 favoritos e titular | PASS_LOCAL | testes existentes; QA remoto pendente |
| G12 downloads e privacidade | PASS_LOCAL | autorização local; QA edge pendente |
| G13 acessibilidade | PASS_LOCAL | registro Chromium anterior; não repetido nesta missão |
| G14 dispositivos físicos | PARTIAL | Android Chrome/iOS Safari físicos não ensaiados |
| G15 SEO/cache/noindex | PASS_LOCAL | testes locais; configuração real completa pendente |
| G16 site público/Studio/Colagem | PASS_LOCAL | 203 Workers +7 Colagem +26 Node; browser atual não executado |
| G17 CPU/franquia/R$0 | BLOCKED_EXTERNAL | relatório 18: home QA129–166ms; Billing 200 parcial; Hostinger sem inventário, sem offload/mediçãoHEAD |
| G18 recuperação D1/R2 | BLOCKED_EXTERNAL | históricos 5 contas preservados; par vazio e ensaio remoto ausentes |
| G19 segurança independente | PARTIAL | revisão dirigida e fixes não são sign-off formal independente |
| G20 LGPD | BLOCKED_GOVERNANCE | aprovação da controladora não obtida |
| G21 PR/CI/SHA | PARTIAL | R4 CI histórica PASS; full CI HST deve ser conferida no SHA final da nova PR |
| G22 autorização de release | BLOCKED_GOVERNANCE | nenhum GO de produção; main aciona deploy/migrations |
| G23 rollback | PARTIAL | runbook 19; replay/flags locais; remotoNOT_RUN |
| G24 handoff | PASS_LOCAL | relatórios18/19, JSON e estado; PR/CI/Drive final no corpo daPR |

## Continuação — 27/10/2026

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
