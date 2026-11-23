# Punctum Picture R4 — ciclo AH — 16/11/2026

**Decisão: `NO_GO_PRODUCTION`.** R1 continua na PR #40, draft e sem merge. A SPEC R4 §23 conserva integralmente os gates G01–G24.

## Evidência incremental G18

- No teste existente `tests/integration/client-recovery.spec.ts`, a fixture de duas contas e duas galerias agora utiliza **dez PNGs 2×2 válidos com pixels diferentes**, dez hashes SHA-256 distintos e dez registros D1 com `original_sha256` correspondente. A restauração confere a lista de hashes, cada objeto original R2 por bytes/hash, vínculo do ID da imagem à galeria e storage key, FKs, quarentena, expiração de sessão de origem e negativas entre A/B.
- **RED:** novo assert de unicidade falhou com 1 hash onde se esperavam 10 (19/20 PASS). **GREEN:** `npm exec vitest run tests/integration/client-recovery.spec.ts -- --reporter=dot` → **20/20 PASS**, `npm exec eslint tests/integration/client-recovery.spec.ts` → PASS, `npm run typecheck` → PASS, `git diff --check` → PASS. Testes sintéticos no runtime local Cloudflare Vitest D1/R2.
- Esse avanço impede que a permuta silenciosa entre objetos com bytes idênticos mas chaves diferentes passe no ensaio. **G18 permanece NOT_RUN** para aceitação operacional: ainda não houve restore de dez fotos distintas no D1/R2 segregado da Hostinger efetivamente autorizada; também faltam recibos do runtime, configuração, storage, identidade e custo.

## Matriz integral rastreável

Use `execution-state.json`: os 24 registros originais estão em `currentCycle20261116AF.gateRecords`. Aplique a substituição de G18 do ciclo AG e depois a do ciclo AH. Todos os IDs, estados, versões, superfícies, evidências, tipos, datas, responsáveis e ações permanecem preservados. Contagem final sem promoção: **PASS 1 (G01); FAIL 2 (G05/G17); BLOCKED_EXTERNAL 6 (G07/G15/G19/G20/G22/G23); NOT_RUN 15**.

## Estado e próximo passo

Baseline de início: `13ab3589da6dcd53d9b3d6f1da0ae87c3ac8a815`; branch `codex/punctum-r4-goal-20261115`. CI anterior #761 foi SUCCESS no baseline. Qualificar no SHA publicado deste ciclo, sem tratar CI local como execução no alvo. Nenhum deploy, merge, mudança de DNS, modo Clerk, flags, R2/D1 remoto ou dados reais. O `BUILD_ID` preexistente continua fora do commit.

Operações/QA: identificar read-only a conta/instância Hostinger autorizada e suas cotas; executar G05 (25 MiB e recuperação), G17 (carga/custo), G18 (restore remoto) e G23 (rollback e escritas pós-virada) em QA segregado. QA humano: Clerk cliente real (G07/G08), dispositivos físicos TalkBack/VoiceOver (G15). Revisor independente: G19. Controladora do estúdio: G20. Proprietário: autorizações específicas R2/R3 (G22). Engenharia: revisão/CI no SHA final (G21) e cópia durável Drive com readback (G24).

Custo incremental local: **R$ 0,00**; custo efetivo Hostinger/Clerk/storage/CDN: **indeterminado**.
