# Punctum Picture R4 — ciclo AG — 16/11/2026

**Decisão: `NO_GO_PRODUCTION`.** Integração R1 na [PR #40](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/40), ainda draft e sem merge. O DoD da SPEC R4 §23 continua sendo **G01–G24 integral**.

## Delta verificável de G18

- A prova já existente em `tests/integration/client-recovery.spec.ts` cria duas contas, duas galerias e dez imagens sintéticas em D1/R2 locais segregados. O teste agora verifica **cada um dos dez objetos restaurados** pelo SHA-256 dos bytes efetivamente lidos, o vínculo de cada linha ao ID de galeria e à chave R2, `PRAGMA foreign_key_check` vazio, e a recusa do cookie anterior após a troca do segredo de sessão. Preserva a prova de downloads entre titulares A/B e o resultado do restore (`rows: 16`, `objects: 10`, contas em quarentena).
- **Resultado:** `npm exec vitest run tests/integration/client-recovery.spec.ts` → **20/20 PASS**, um arquivo; ambiente Vitest/Cloudflare Workers local com bancos D1 e buckets R2 de teste. Não houve contato com dados, storage ou sessão reais. A fixture usa dez IDs/chaves distintos com bytes PNG idênticos; a correspondência de conteúdo distinto por foto e o teste em destino remoto permanecem pendentes.
- **Classificação:** `G18 = NOT_RUN` para o DoD operacional integral. Esta é prova `QA_SYNTHETIC_LOCAL_PARTIAL`, sem afirmar homologação no runtime alvo. O operador QA precisa restaurar duas contas, duas galerias e dez fotos sintéticas em D1/R2 segregados **do alvo autorizado**, conferir FKs, SHA-256, autorização A/B e revogação, e guardar recibos sanitizados.

## Continuidade e CI

- Ponto de partida deste ciclo: `c0faf2f521d333e70bedba96d665a5c37488a669`, branch `codex/punctum-r4-goal-20261115`.
- [CI #760](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43801851791) foi `SUCCESS` **no commit anterior `c0faf2f`**; `verify` aprovado, `hostinger-node-qa` ignorado. Após a publicação deste delta, conferir a CI do novo SHA, sem reaproveitar a #760 como prova dele.
- [Ciclo AF](71-cycle-af-partial-network-abort-2026-11-16.md): upload Node/Sharp sintético local de 25 MiB, 49 checks HTTP, abort de conexão, retry e SHA-256. `G05` permanece `FAIL` até homologação remota.
- A matriz integral de 24 gates, com ID, estado, versão, superfície, evidência, tipo da prova, data, responsável e próxima ação, está em `execution-state.json` → `currentCycle20261116AF.gateRecords`; aplicar a substituição de G18 em `currentCycle20261116AG.gateRecordOverrides` para obter o estado mais recente.
- Contagem inalterada: **1 PASS (G01), 2 FAIL (G05/G17), 6 BLOCKED_EXTERNAL (G07/G15/G19/G20/G22/G23), 15 NOT_RUN (demais)**.
- Custo incremental desta execução local: **R$ 0,00**. Custo efetivo do Hostinger, armazenamento, Clerk e eventual CDN: **indeterminado**. Alvo, flags, login Clerk do cliente e autenticação efetiva do Node seguem sem prova operacional.

## Próximas dependências

Engenharia: publicar o commit de R1 e confirmar CI exata, artefato e revisão independente. Operações/QA: identificar conta, site e runtime Hostinger corretos, confirmar modos `ADMIN_AUTH_MODE`, `CLIENT_AUTH_MODE`, `CLERK_AUTH_ENABLED`, storage, limites e isolamento antes de qualquer ensaio mutável; executar G05/G17/G18/G23 em QA especificamente autorizado. Testadores físicos: TalkBack/VoiceOver e revisão manual de contraste (G15). Revisor independente: G19. Controladora do estúdio: G20. Proprietário: autorização específica para cada ato R2/R3 (G22). Engenharia: atualizar a [cópia durável no Drive Sgtmenezes](https://docs.google.com/document/d/1C_0pEAiCoWAC0T-z2cUXswOqcsEbzBO9H_nvwmHGUnI/edit) e confirmar leitura (G24).

Preservada a modificação preexistente de `services/punctum-hostinger-production/dist/server/BUILD_ID` fora deste incremento; nenhum merge, deploy, DNS, login, flag, billing, migração remota ou dado real foi alterado. **`NO_GO_PRODUCTION`** até todos os aceites mandatórios da SPEC.
