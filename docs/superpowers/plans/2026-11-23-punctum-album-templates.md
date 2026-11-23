# Superpowers | Plano executável | R4 álbuns privados com Clerk e cinco templates
**Data:** 23/11/2026. **Base:** PR #45 `codex/punctum-unlimited-release-20261120`; **branch:** `feature/punctum-album-templates-20261123`; **PR draft #48**. Este plano é um incremento do DoD R4, não cria gates, autenticação ou release paralelo.

## Pré-condição 0: leitura e invariantes
1. Ler SPEC §22–23, `docs/operations/private-albums-r4/execution-state.json`, handoff R5 22/11, PR #45 e `worker/auth/clerk-auth.ts`. Checar HEAD e runtime real.
2. Confirmar `PRIVATE_GALLERIES_ENABLED` e `CLERK_PILOT_ENABLED` desligados em produção antes de qualquer release; não realizar consultas mutáveis fora de QA autorizado.
3. Não vincular VPS 2135319 Conthabil ao Punctum. Hostinger Unlimited já tem website associado; TLS de origem continua pendente e não permite supor readiness.
4. Preservar `ADMIN_AUTH_MODE`, `CLIENT_AUTH_MODE`, `CLERK_AUTH_ENABLED`, vínculos Clerk/D1, sessões, Colagem, drafts, fotos privadas, Site público e custo incremental R$ 0,00.

## Tarefa 1: contratos TDD e segurança (G02,G06–G12)
- `tests/unit/client-gallery-templates.spec.ts`: 5 IDs exatos, labels, fallback legados, rejeição de CSS/HTML, default.
- `tests/integration/client-gallery-layout.spec.ts`: CREATE/PATCH com admin sintético, leitura D1, auditabilidade e rejeição de IDs inválidos, preservando proprietário/status/flags/capa.
- Ampliar QA sintético existente sob `tests/integration/clerk-r4-security-matrix.spec.ts` **apenas se lacuna comprovada**: Cliente A não altera layout de A/B, não lê galeria B, não obtém bytes/metadata/preview admin. Logout, revogação e despublicação não mudam com template; compare 5 presets. Não inserir segredo/conta real em teste.
- Usar RED → GREEN → REFACTOR; não eliminar assertions para obter CI verde.

## Tarefa 2: modelo e servidor (G03/G04/G09/G10/G21)
- Registry, Zod e tipos em `shared/client-galleries.ts`.
- Migração **aditiva** 0016 `layout_preset` default `classico` e CHECK; prova com banco sintético antigo/atualizado e proibição de downgrade destrutivo.
- Integrar INSERT/PATCH ao handler administrativo existente com `requireAdmin`, Origin, audit e D1 batch. Não abrir rota a `requireClient`.
- Retornar o ID de layout nos serializers autorizados sem escapar do boundary privado. Para clientes, autorizar propriedade por `client_accounts.id` e publicação em cada leitura.
- Testar sem alterar Clerk, cookies, PBKDF2, token validation, R2, upload ou `PRIVATE_GALLERIES_ENABLED`.

## Tarefa 3: UX acessível (G13–G15)
- Picker em criação e edição, com 5 cartões e miniaturas **sintéticas**; `aria-pressed`, foco e 44px; selecionar não publica.
- CSS escopado da galeria do cliente: Clássico, Editorial, Colagem, Mosaico, Cinema, sem crop forçado nem mídias externas.
- QA por browser: vazio, 1/2/10/100 fotos, retrato/paisagem, mobile 320/360/390/430, desktop 1280/1440, foco/zoom real, favorita/desfavorita, download permitido/proibido, viewer/Escape, sessão expirada e A/B. Coletar screenshot e vídeo/relatório sanitizados.
- G15 real TalkBack e VoiceOver + aceite físico permanecem externos mesmo que axe/browser headless passem.

## Tarefa 4: não regressão e fluxo Clerk (G06–G08/G16)
- Reusar provas `clerk-r4-security-matrix.spec.ts` e o fluxo `/albuns/entrar` → `/api/client/clerk-session` → sessão privada → `/albuns/[galleryId]`; `/acesso` e `/admin/api/clerk-session` continuam segregados.
- Avaliar origin, issuer, azp, sid, vínculo interno, revogação e falhas de D1; não reduzir checks para templates.
- Rodar `npm ci`, `npm audit --audit-level=low`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, QA E2E atual e `git diff --check`, na árvore exata. Anexar run ID / SHA / evidência do escopo aprovado.
- Site público/Studio possuem sete presets que NÃO fazem parte desta PR; nada de `StudioStylePanel`, rascunhos, Publish/Restore, DNS ou main.

## Tarefa 5: gates externos e rollout (G05,G15,G17–G24)
- Separar QA local/CI sintético de QA Hostinger Node + Clerk Development efetivo; provar G05 até 25 MiB em origem autorizada, G17 custo/carga por provedor incluindo Clerk, G18 restore isolado, G23 rollback end-to-end.
- Obter G15 físico, G19 revisor independente, G20 controller LGPD e G22 autorização específica. Não elevar status por mérito visual dos templates.
- Releases A e B **separados**: A público com R4 OFF; B privado só após gates aplicáveis. Sem alteração de domínio, Cloudflare/Hostinger/Clerk Production, billing, flags, dados reais ou migration remota sem autorização.
- Atualizar `execution-state.json` somente após prova compatível e readback; não tocar contagens canônicas só para incluir templates. Handoff G24 com SHA/CI, prazos, responsáveis e blockers.

## DoD deste incremento
PR com cinco layouts allowlisted navegáveis e persistência testada, contrato de auth intacto, regressões CI verificadas no SHA final, QA de interface declarada por ambiente, sem aumento de custo ou exposição. **DoD completo R4 exige G01–G24 e H01–H06 aplicáveis**; `PRODUCTION_NO_GO` até lá.

Refs: [DoD original](https://docs.google.com/document/d/1UtLEPN-XpXUW3bC5owcLRVfEDCqM6bEM/edit) · [checkpoint 22/11](https://docs.google.com/document/d/1SXWSo4TeYZ0LZd-K7OgkGVFi_Y_Eqj77XVgK5AsELiQ/edit) · [PR #45](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/45).
