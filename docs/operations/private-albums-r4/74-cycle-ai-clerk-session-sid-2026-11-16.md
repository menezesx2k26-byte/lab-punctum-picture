# Punctum Picture R4 — ciclo AI — 16/11/2026

**Decisão: `NO_GO_PRODUCTION`.** A PR #40 permanece em R1, draft, sem merge ou deploy. A matriz original G01–G24 continua integral; este ciclo melhora G06/G08 sem promoção operacional.

## Defeito confirmado e correção mínima

- `@clerk/backend` 3.27.0, com `acceptsToken: "session_token"`, aceitava um JWT RS256 sintético válido, vinculado a um administrador conhecido, **sem `sid`**. A troca em `/admin/api/clerk-session` retornava HTTP **200**, embora o token não tivesse vínculo verificável com uma sessão Clerk.
- RED: novo caso em `tests/integration/clerk-r4-security-matrix.spec.ts` esperava 403 e recebeu 200 (`:486`). Também foi adicionado caso de cliente equivalente, cuja expectativa é 401.
- GREEN: `verifyClerkSessionFromRequest` em `worker/auth/clerk-auth.ts` agora falha fechado quando `verified.sessionId` está ausente. A mesma decisão se aplica aos dois perfis e ao verificador SDK/injetável, conservando a verificação de assinatura, emissor, origem, vínculo interno e revogação existente.
- Base da decisão: tokens de **sessão** do Clerk têm `sid` entre os claims padrão; JWTs customizados não são necessariamente vinculados a uma sessão. Referências: [session tokens](https://clerk.com/docs/guides/sessions/session-tokens), [JWT templates](https://clerk.com/docs/guides/sessions/jwt-templates) e [authenticateRequest](https://clerk.com/docs/reference/backend/authenticate-request).

## Evidência reproduzível

- HEAD de início: `13f769eca855690cb31ffd300e49acef3f3bf850` (PR #40, branch `codex/punctum-r4-goal-20261115`). CI #762 no HEAD de início: `43885180719` **SUCCESS**; este resultado antecede a correção.
- `npx vitest run tests/integration/clerk-r4-security-matrix.spec.ts --testTimeout=60000`: RED 1/1 falhou (admin sem `sid`, 200 versus 403), GREEN 1/1 PASS.
- Regressão focada: `npx vitest run tests/integration/clerk-r4-security-matrix.spec.ts tests/integration/clerk-pilot.spec.ts tests/integration/admin-session-rotation.spec.ts tests/integration/client-security-matrix.spec.ts --testTimeout=60000` → **4 arquivos, 16 testes PASS**.
- `npm run typecheck`, `npx eslint worker/auth/clerk-auth.ts tests/integration/clerk-r4-security-matrix.spec.ts` e `git diff --check` → **PASS**.
- Testes locais com chaves e contas sintéticas no Cloudflare Vitest. Nenhum login Clerk real, Hostinger Node ou operação D1/R2 remota foi executado. Não há prova de revogação operacional do Clerk no runtime alvo.

## Matriz, custo e continuidade

No `execution-state.json`, aplicar `currentCycle20261116AF.gateRecords`, o override G18 de AG/AH e, por último, os overrides G06/G08 de AI. Estados atuais: **PASS 1 (G01), FAIL 2 (G05/G17), BLOCKED_EXTERNAL 6 (G07/G15/G19/G20/G22/G23), NOT_RUN 15**. G06/G08 permanecem `NOT_RUN` como gates completos; o defeito local de JWT sem sessão foi corrigido, mas falta QA no alvo autorizado.

Próxima execução: confirmar o runtime Hostinger, titularidade, isolamento, modos/flags efetivos e custo; testar ambos os logins Clerk reais, revogação e autorização em QA, além de G05/G17/G18/G23. Obter revisão independente G19, aceites humanos G15/G20/G22 e completar G21/G24. Preservar o `BUILD_ID` modificado anteriormente e deixar PR #40 draft. Custo incremental deste ciclo local: **R$ 0,00**; custo operacional Hostinger/Clerk/storage: **indeterminado**. Registrar o SHA/CI finais e realizar readback da cópia no Drive Sgtmenezes.
