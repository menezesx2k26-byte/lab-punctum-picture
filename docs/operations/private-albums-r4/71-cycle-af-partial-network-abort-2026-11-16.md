# Punctum Picture R4 — ciclo AF — 16/11/2026

**Decisão: `NO_GO_PRODUCTION`.** Fase **R1**, [PR #40](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/40) aberta em draft, sem merge. O objetivo original da SPEC R4 §23 permanece **G01–G24 integral**; este incremento é uma evidência sintética local adicional de G05. A matriz completa com status, SHA, superfície, tipo da prova, data, responsável e próxima ação está em `execution-state.json` → `currentCycle20261116AF.gateRecords`, preservando a matriz AE anterior.

## Incremento verificável em G05

- **Arquivo:** `scripts/hostinger-r4-25mib-local-proof.mjs`. A prova HTTP Node/Sharp que já verificava o original de **26.214.400 bytes** agora abre um PUT com `Content-Length` total, confirma uma escrita inicial de **256 KiB** pelo cliente e encerra deliberadamente a conexão após 150 ms. Ela exige que a intenção de upload continue `pending` e que o diretório privado de originais não contenha arquivos. Em seguida, exercita upload completo, repetição idempotente, finalização, download com SHA-256 e negações de acesso A/B.
- **Resultado local:** `PASS_LOCAL_SYNTHETIC_NODE`, **49 verificações HTTP**, `git diff --check` e `node --check` sem erros. Ambiente: Ubuntu/WSL, Node.js **24.21.0**, Sharp **0.35.5**, `127.0.0.1:3025`, banco SQLite descartável, originais em armazenamento privado temporário e autenticação **legada sintética**. PNG SHA-256 `c16e100efa8b3233461abdf30df0be13c291ed17c5cd4f6c4dbc40c562aab4ce`. A conclusão do callback de escrita confirma o envio ao transporte local do cliente; a prova não mede os bytes efetivamente recebidos pelo servidor antes do fechamento.
- **Limite da prova:** não valida o Hostinger remoto, o storage real, o modo Clerk de cliente, falha de rede remota, CPU/carga/custo ou CDN de produção. Portanto, **G05 segue `FAIL`** até a homologação no runtime-alvo. Não foi introduzido serviço, dependência, custo incremental ou alteração de produto.

## Referências e estado de integração

- Worktree `C:/Users/Pichau/Documents/ChatGPT/.punctum-r4-goal-20261115`, branch `codex/punctum-r4-goal-20261115`; HEAD anterior a este incremento `da3a4165debd8fc8c95c78712d8cf28441f58a37`.
- Base PR `codex/punctum-managed-production-20261114` em `8abb9f38a0bc7a265ddde10e71686964f21a5dd9`; `main` anteriormente observado em `f0c82f2c7200417e41c1fd3a21414607c2c5a973` (reconciliar se avançar).
- [CI #759](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43798592306) teve `success` no SHA documental **anterior** `da3a4165`, com `verify` aprovado e `hostinger-node-qa` pulado. A nova prova precisa de **CI no novo SHA publicado** e de readback. Browser anterior: 23 checks locais, sete auditorias axe sem violações automáticas e zoom real Chromium de 200% em cinco superfícies; esses dados não são homologação remota.
- Alteração preexistente em `services/punctum-hostinger-production/dist/server/BUILD_ID` **preservada fora do commit**. Nenhum deploy, merge, alteração de DNS, flag, login, billing, migração remota ou uso de dados reais foi autorizado/executado.

## Matriz de decisão AF

| Status | Gates | Critério que continua faltando |
| --- | --- | --- |
| `PASS` | G01 | Baseline reconciliado na prova anterior; verificar SHA da nova PR após push. |
| `FAIL` | G05, G17 | G05: upload/recuperação Node real, Clerk e armazenamento; G17: medições cold/HIT/invalidação, CPU, carga, franquias e custo do conjunto. |
| `BLOCKED_EXTERNAL` | G07, G15, G19, G20, G22, G23 | Login Clerk real do cliente QA; Android TalkBack/iOS VoiceOver e contraste; revisão independente sem P0/P1; aceite da controladora LGPD; autorização específica para cada etapa; rollback integral com escritas pós-virada em QA segregado. |
| `NOT_RUN` | G02–G04, G06, G08–G14, G16, G18, G21, G24 | Completar testes e homologações no escopo da SPEC; G18 exige duas contas, duas galerias, dez originais, integridade e revogação após restore; G21 exige revisão e CI do SHA final; G24 exige readback do handoff. |

**Contagem:** 1 `PASS`, 2 `FAIL`, 6 `BLOCKED_EXTERNAL`, 15 `NOT_RUN`. O custo incremental **desta execução local** é R$ 0,00; o custo do runtime Hostinger, plano e franquia Clerk e armazenamento continua **indeterminado**, sem prova de custo incremental zero em produção.

## Aceites necessários e próxima ação executável

O responsável técnico deve identificar **por leitura** o site Hostinger correto, conta titular, plano/cotas, armazenamento e o valor efetivo de `ADMIN_AUTH_MODE`, `CLIENT_AUTH_MODE`, `CLERK_AUTH_ENABLED` e flag dos álbuns. O operador QA deve aprovar e executar homologação segregada do Clerk cliente e dos originais de 25 MiB, incluindo interrupção, retry, derivados privados e restauração. Os testadores Android/iOS devem produzir recibos físicos para G15; o revisor independente deve assinar G19 após eliminar P0/P1; a controladora do estúdio deve aceitar G20; e o proprietário deve autorizar especificamente cada operação de R2/R3 quando elegível. G23 exige procedimento de rollback completo com preservação de escritas feitas após a virada.

**Continuidade:** publicar o incremento mínimo na mesma PR #40, confirmar novo SHA/CI, atualizar corpo da PR e o [checkpoint Drive Sgtmenezes](https://docs.google.com/document/d/1C_0pEAiCoWAC0T-z2cUXswOqcsEbzBO9H_nvwmHGUnI/edit) com leitura de volta. Enquanto faltarem provas mandatórias ou autorizações, permanece `NO_GO_PRODUCTION`.
