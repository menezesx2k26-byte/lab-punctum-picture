# 93 — R4 Álbuns Privados com Clerk + 5 Templates Clicáveis: QA real, correções TDD e handoff (23/11/2026)

**Estado global:** `PARTIAL_VERIFIED / PRODUCTION_NO_GO` (Releases A e B **sem autorização**).
**Repositório:** `menezesx2k26-byte/lab-punctum-picture` · **PR draft:** [#48](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/48) (`feature/punctum-album-templates-20261123`, base `codex/punctum-unlimited-release-20261120` / [PR #45](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/45)).
**Custo incremental incorrido:** R$ 0,00.
**Fonte de verdade dos gates:** `docs/operations/private-albums-r4/execution-state.json` (contagens históricas **não promovidas** por testes locais/CI ou pela entrega dos templates).

## 1. Escopo e conformidade com restrições (§10)

Nenhuma operação proibida foi executada:
- Zero merge para `main` ou merge com efeito produtivo; zero deploy produtivo; zero migration remota; zero alteração de DNS/nameserver/Cloudflare; zero alteração de autenticação de produção; zero mutação em Clerk Production (`ins_3M6H9ktM3jO84RvEu5BmKFokCfr`); zero ativação remota de `PRIVATE_GALLERIES_ENABLED`; zero exclusão ou modificação de dados reais de clientes; zero vínculo à VPS `2135319` da Conthabil; zero serviço pago.
- Modos de autenticação (`ADMIN_AUTH_MODE`, `CLIENT_AUTH_MODE`, `CLERK_AUTH_ENABLED`, `CLERK_PILOT_ENABLED`, `PRIVATE_GALLERIES_ENABLED`), presets públicos do Studio/Colagem Autoral e contratos legados preservados sem alteração de defaults.

## 2. Defeitos reproduzidos via TDD (RED → GREEN) e endurecimento entregue

| Área | Defeito / lacuna reproduzida (RED) | Correção integrada (GREEN) | Arquivos |
| --- | --- | --- | --- |
| Restore R4 (`G18`) | `assertRestoreRowConstraints` não validava `client_galleries.layout_preset` antes da escrita em R2, aceitando valor inválido (`<script>`) | Validação contra `CLIENT_GALLERY_LAYOUTS` no restore; compatibilidade com snapshots pré-`0016` (default `classico`) e round-trip de `cinema` | `scripts/lib/private-recovery.ts`, `tests/integration/client-recovery.spec.ts` |
| Exportador Hostinger gerenciado | `MANAGED_EXPORT_MIGRATIONS` omitia `0016_private_gallery_layout_presets.sql` (encoberto porque `hostinger-node-qa` não roda em branches `feature/*`) | Inclusão da `0016` em `MANAGED_EXPORT_MIGRATIONS`, helper `applyManagedExportMigrations` e teste de regressão exigindo toda migration `>= 0009_` | `scripts/hostinger-managed-export.mjs`, `scripts/hostinger-managed-export.test.mjs`, `.github/workflows/ci.yml` |
| Validador de resposta do cliente (`Clerk`) | `validClientResponse("/api/client/me")` aceitava apenas `access`/`password`, falhando com HTTP 502 quando `CLIENT_AUTH_MODE="clerk"`; `layoutPreset` não era checado contra a allowlist | Inclusão de `"clerk"` em `/api/client/me` e validação allowlist de `layoutPreset` opcional em galerias | `app/albuns/components/responses.ts`, `tests/unit/private-api-recovery.spec.ts` |
| CSP administrativo em modo Clerk | Reproduzido em Chromium real: `AdminShell` monta `<ClerkProvider>` no `LogoutButton` em `/admin/*`, mas `worker/index.ts` liberava `clerkIssuer` no CSP apenas em `/acesso` e `/albuns/entrar`, bloqueando `clerk.browser.js` e quebrando a hidratação de `/admin/clientes` | Função `shouldAllowClerkCsp(pathname, env)` alinhada às rotas que montam `ClerkProvider` (`/acesso`, `/admin*` exceto `/admin/studio/preview`, `/albuns/entrar`, `/clerk-pilot`), mantendo CSP estrito nas páginas públicas e no modo legado | `worker/auth/clerk-auth.ts`, `worker/index.ts`, `tests/unit/response-security.spec.ts` |
| Gestão de vínculo Clerk na UI administrativa | `/admin/clientes` não exibia nem permitia vincular/desvincular identidades Clerk (`PUT/DELETE /clerk-link`), mostrava texto de "Cloudflare Access" em modo Clerk e `POST /reset-password` gerava senha em modo Clerk | `GET /admin/api/clientes` retorna `clerkEnabled` e `clerkUserId`; `reset-password` em modo Clerk revoga sessões com auditoria `client.clerk_sessions_revoked` sem senha; UI `/admin/clientes` com vincular/desvincular Clerk acessível (0 violações WCAG 2.1 AA) | `worker/api/client-admin.ts`, `app/admin/components/ClientAccountsManager.tsx`, `app/admin/components/private-gallery-utils.ts`, `app/admin/components/private-gallery-admin.css` |
| Contratos e matriz Clerk dos 5 templates | Cobertura inicial cobria apenas subconjunto de templates sem matriz Clerk completa no mesmo spec | Cobertura dos 5 IDs em POST/GET/PATCH, default `classico`, rejeição de HTML/CSS/JS/URL e origem cruzada, e matriz Clerk RS256 + `@clerk/backend` (isolamento A/B, não mutação pelo cliente 403, preservação de `clerk_pilot_identity_links`, download ON/OFF, não vazamento em `/media/`, revogação por despublicação/arquivo/logout/replay/desativação, `PRIVATE_GALLERIES_ENABLED=false`) | `tests/integration/client-gallery-layout.spec.ts`, `tests/integration/client-fixture.ts` |
| UX/CSS dos 5 templates | Descrição de `colagem` sugeria recorte; cartão selecionado dependia de borda/fundo; `mosaico` (`7n+1`) deixava lacuna em 3 colunas; foto única ficava estreita; moldura `cinema` fixa para temas claros | Descrição canônica `Composição de fotografias em proporções variadas.`, selo textual `Ativo` + contraste `#544d47`, cadência `5n+1` sem lacuna órfã preservando ordem DOM, regra `:only-child` centralizada e moldura `cinema` adaptada a `noir`/`ivory`/`warm` | `shared/client-galleries.ts`, `app/admin/components/PrivateGalleryTemplatePicker.tsx`, `app/admin/components/private-gallery-admin.css`, `app/albuns/albuns.css` |

## 3. Provas em navegador real (escopo local/isolado)

### 3.1 QA visual, funcional e de acessibilidade dos 5 templates (`scripts/e2e/private-album-templates-qa.mjs`)
- **Resultado:** `PASS_LOCAL_SYNTHETIC_TEMPLATES_QA` contra servidor compilado `dist/hostinger-candidate` + SQLite e storage sintéticos efêmeros.
- **Cobertura verificada:**
  - Seletor administrativo (`/admin/albuns-privados` criação e edição): 5 cartões, miniaturas 100% sintéticas (`0 <img>`, `0 url()`), alvos ≥ 44px, seleção por teclado (`Space`) e mouse, rascunho não publicado ao selecionar/salvar template, 0 violações WCAG 2.1 A/AA (`axe-core`), 0 overflow em `320/360/390/430/1280/1440px`.
  - Cliente nos 5 templates (`classico`, `editorial`, `colagem`, `mosaico`, `cinema`) combinados com os 3 temas (`noir`, `ivory`, `warm`): álbum vazio (0 fotos), álbum de 1 foto (centralizado e sem estreitamento), ensaio misto de 24 fotos (retrato, paisagem e quadrado) com todas as 24 decodificadas, ordem estrita preservada (`01`..`24`), zero `object-fit: cover`, 100% URLs privadas `/api/client/galleries/...` (zero `/_vinext/image`), 0 violações WCAG 2.1 A/AA, 0 overflow em `320–1440px`.
  - Favoritar e desfavoritar persistidos após reload; download habilitado com SHA-256 exato e desabilitado com link oculto + HTTP 403; lightbox com `ArrowRight`, `ArrowLeft`, `Escape` e restauração de foco; revogação de sessão (`session_version + 1`) redirecionando para `/albuns/entrar` com zero fotos expostas.
  - 12 capturas visuais geradas e inspecionadas localmente em `outputs/templates-qa/` (diretório ignorado pelo Git).

### 3.2 Prova E2E real com Clerk Development em Chromium (`scripts/e2e/clerk-dev-r4-templates-proof.mjs`)
- **Resultado:** `PASS_LOCAL_CLERK_DEVELOPMENT_BROWSER_PROOF` contra Clerk Development `ins_3M14L5pOMO7DQ8ZX4CW5bZ3w3eB` (`https://causal-leopard-4871.clerk.accounts.dev`).
- **Guardas fail-closed:** `parseDevProofInputs` (testado em `scripts/e2e/clerk-dev-r4-templates-proof.test.mjs`) recusa explicitamente `sk_live_`, `pk_live_` e qualquer issuer fora de `*.clerk.accounts.dev`. Nenhum segredo, JWT ou e-mail pessoal é impresso ou persistido.
- **Fluxo comprovado em Chromium real:**
  1. Login administrativo via Clerk JS SDK (`strategy: "ticket"`) em `/acesso` → JWT RS256 real com `azp` local e `sid` validado contra JWKS Development (`adminSessionStatus: "active"`).
  2. Conta Clerk não vinculada negada via clique real no botão `"Abrir painel administrativo"` → HTTP `403`, zero auto-vínculo em `clerk_admin_identity_links`.
  3. Após vínculo explícito no SQLite local, clique real em `"Abrir painel administrativo"` → `POST /admin/api/clerk-session` HTTP `200` → redirecionamento para `/admin`.
  4. Em `/admin/clientes` (sem erros CSP/hidratação após correção de `shouldAllowClerkCsp`): cadastro de Cliente A e Cliente B, vínculo Clerk do Cliente A diretamente pela UI (`"Vincular Clerk"` → badge `"Clerk vinculado"`), auditoria `axe-core` WCAG 2.1 A/AA com **22 passes, 0 incomplete, 0 violations**.
  5. Criação e publicação do Álbum A (`editorial`) e Álbum B (`classico`) com fotografias sintéticas.
  6. Novo contexto Chromium isolado (sem cookies admin) em `/albuns/entrar`: formulário de senha oculto (`CLIENT_AUTH_MODE=clerk`), login do Cliente A via Clerk JS SDK → clique real em `"Abrir meus álbuns"` → `POST /api/client/clerk-session` HTTP `200` → `/albuns` exibe apenas Álbum A (zero vazamento do Álbum B), `/api/client/me` (`authMode: "clerk"`) sem erro.
  7. Abertura do Álbum A: `data-layout-preset="editorial"`, decodificação privada, favorito persistido, download original SHA-256 exato; tentativa de leitura do Álbum B → HTTP `404`; tentativa de `PATCH /admin/api/albuns-privados/:id` pelo cliente → HTTP `403`.
  8. Alteração administrativa de `editorial` para `cinema` mantém `clerk_pilot_identity_links` e favorito intactos; reload do cliente reflete `data-layout-preset="cinema"`.
  9. Logout real do cliente (`Sair` → `DELETE /api/client/session`) e do admin (`DELETE /admin/api/session`) com replay do respectivo JWT Clerk real negado (`401` cliente, `403` admin).
  10. Limpeza integral verificada após o teste: sessões revogadas, ambos os usuários sintéticos `+clerk_test@example.com` excluídos via Backend API; readback confirmou exatamente `3` usuários na instância Development e `0` membros em `org_3MNtO768q73RF4fdLpOvHHLrMEC`.
- **Achado operacional crítico para Release B (Clerk Production):** a instância Development `ins_3M14L5pOMO7DQ8ZX4CW5bZ3w3eB` está configurada com `organization_settings.force_organization_selection = true`. Sem organização ativa, o Clerk emite `session.status = "pending"` (`currentTask = "choose-organization"`), fazendo `<Show when="signed-in">` e `@clerk/backend` (`treatPendingAsSignedOut: true`) tratarem a sessão como desconectada. Antes de habilitar Release B em produção, o operador deve confirmar no Clerk Dashboard de Production (`ins_3M6H9ktM3jO84RvEu5BmKFokCfr`) que `force_organization_selection = false` (ou Organizations desabilitado para a Punctum).
- **Limite declarado:** prova local/isolada com Clerk Development via ticket de QA; **não** substitui login interativo com senha/MFA, homologação na origem Hostinger remota nem validação de Clerk Production.

## 4. Readback read-only de provedores (23/11/2026)

### 4.1 Hostinger Unlimited (via MCP autenticado, somente leitura)
- `hosting_websites_list`: `punctumpicture.com` (`order_id=1008583103`, `username=u775492464`, `client_id=1018395836`, `website_type=nodejs`, `is_enabled=true`).
- `hosting_websites_get-settings`: **`ssl.status = "active"`** (`provider = "hssl"`, `is_lifetime = true`, `is_https_redirect_enabled = true`, `expires_at = "2027-02-21T00:37:56Z"`, `last_error = null`) — avanço frente ao checkpoint de 22/11 (`waiting_for_retry`), porém sem homologação HTTP direta da origem nem cutover. `cdn.is_enabled = true`, `cache.is_enabled = false`.
- `hosting_websites_list-domains`: `parked = []`, `subdomains = []` (ainda sem hostname/subdomínio isolado para QA).
- `hosting_nodejs_list-environment-variables`: `[]` (nenhuma variável de ambiente configurada no Node gerenciado).
- `hosting_get-deployment`: continua no artefato anterior `punctum-r4-synthetic-a136f721.zip` (`uuid = 01a1faf6-edef-7175-9761-aa69a3125f40`, `state = completed`, Node 24, `entry_file = app.mjs`, `updated_at = 2026-11-22T22:08:01Z`) — não comprovado equivalente ao SHA atual.
- `hosting_nodejs_list-vulnerabilities`: apenas o advisory retirado `esbuild@0.25.12` (`GHSA-gv7w-rqvm-qjhr`, pacote Deno).
- `billing_subscriptions_list`: `Unlimited Web Hosting` (`16BiLaV8Ndbda62TL`, BRL 779,88/ano, vigente até `2027-11-20T19:37:21Z`, já pago; custo incremental R$ 0,00).

### 4.2 Clerk Platform API (somente leitura)
- App `app_3M14L9JyjaJ9ySitVTsQFf6xJ2A`:
  - Development (`ins_3M14L5pOMO7DQ8ZX4CW5bZ3w3eB`): `mau.total_usage = 3`, `total_billable_usage = 0`, `mao = 0`, `sms = 0`, `enterprise = 0`.
  - Production (`ins_3M6H9ktM3jO84RvEu5BmKFokCfr`, domínio `punctumpicture.com`): `mau.total_usage = 1`, `total_billable_usage = 0`, `custom_domains = 1`.
- **Limite G17:** a Platform API não retorna plano/limites/alertas de faturamento do workspace (visíveis somente no Clerk Dashboard) e não há telemetria de carga/upload no runtime Hostinger gerenciado. **G17 permanece `FAIL`**.

## 5. Bateria de validação executada na árvore final

| Verificação | Resultado | Observação |
| --- | --- | --- |
| `npm audit --audit-level=low` | PASS (`0 vulnerabilities`) | — |
| `npm run typecheck` | PASS (`0 errors`) | — |
| `npm run lint` | PASS (`0 errors`, 22 warnings pré-existentes) | 0 warnings novos nos arquivos alterados |
| `npm test` (Vitest Worker/Unit) | PASS (`68/68` arquivos, `378/378` testes) | Inclui templates, contratos, recovery, responses, CSP e matriz Clerk |
| `npx vitest run --config vitest.collage.config.ts` | PASS (`1/1`, `7/7` testes) | Não regressão da Colagem Autoral |
| Builds (`build`, `build:hostinger:qa`, `build:hostinger:candidate` × 2 + `hostinger-candidate-build-equivalence.mjs`, `build:hostinger:scheduled`) | PASS | Equivalência determinística confirmada em build limpo |
| Testes Node (`scripts/*.test.mjs`, `scripts/*/*.test.mjs`, `services/punctum-hostinger-production/*.test.mjs`, `services/punctum-password-bridge/*.test.mjs`, `services/punctum-hostinger-qa/*.test.mjs`) | PASS (`298 passed, 0 failed, 1 skipped`) | Inclui novos testes `hostinger-managed-export.test.mjs` e `clerk-dev-r4-templates-proof.test.mjs` |
| Testes Node Hostinger + navegador (`PUNCTUM_QA_BROWSER=1 node --test services/punctum-hostinger-node/*.test.mjs`) | PASS (`40/40`) | — |
| Testes Python (`python3 -m unittest discover -s scripts -p '*test*.py'`) | PASS (`45/45`) | — |
| `npm run qa:r4:local` | PASS (`2/2`) | `PUBLIC_RELEASE_R4_OFF_LOCAL_SYNTHETIC_PASS` + `PASS_LOCAL_SYNTHETIC_NODE` (26.214.400 bytes / 25 MiB) |
| `node scripts/e2e/private-album-templates-qa.mjs` | PASS (`PASS_LOCAL_SYNTHETIC_TEMPLATES_QA`) | 5 templates, 3 temas, 0/1/24 fotos, WCAG 2.1 AA, 320–1440px |
| `node scripts/e2e/clerk-dev-r4-templates-proof.mjs` | PASS (`PASS_LOCAL_CLERK_DEVELOPMENT_BROWSER_PROOF`) | Admin + cliente Clerk Dev em Chromium real, limpeza verificada |
| `npm run test:e2e` (CI `verify` no SHA final do PR #48) | Verificado via GitHub Actions CI no HEAD final | Na VM local 2-vCPU houve contenção de CPU na fila `env.IMAGES` do `workerd`; validação canônica executada no runner limpo da CI no SHA exato |

## 6. Estado canônico preservado (G01–G24 e H01–H06)

- **G01–G24 (inalterado no ledger `execution-state.json`):** `17 PASS` históricos (`G01–G04`, `G06–G14`, `G16`, `G18`, `G21`, `G24`), **`2 FAIL`** (`G05` upload 25 MiB no runtime autorizado; `G17` capacidade/CPU/custos reais incluindo Clerk), **`5 BLOCKED_EXTERNAL`** (`G15` acessibilidade física; `G19` auditoria independente de segurança; `G20` aceite LGPD; `G22` autorização específica de release; `G23` rollback integral).
- **Hostinger `H01–H06`:** permanecem `NOT_VERIFIED` até prova direta em origem gerenciada isolada com build equivalente ao SHA final.
- **Release A (site público, R4 OFF):** `PRODUCTION_NO_GO` até equivalência build/SHA no runtime gerenciado, prova HTTP direta da origem TLS, plano de rollback e autorização específica G22.
- **Release B (álbuns privados com Clerk + 5 templates):** `PRODUCTION_NO_GO` até fechamento de `G05`, `G15`, `G17`, `G19`, `G20`, `G22`, `G23`, `H01–H06` e confirmação de `force_organization_selection = false` em Clerk Production.

## 7. Pacotes curtos de desbloqueio externo (ações humanas/operacionais)

1. **G15 — Acessibilidade física (Maria / QA físico em celular real):** testar `/admin/clientes` (vínculo Clerk), `/admin/albuns-privados` (seletor dos 5 cartões), `/albuns/entrar` e `/albuns/[id]` nos 5 layouts em **Android com TalkBack** e **iOS com VoiceOver** (leitura de `aria-pressed`, botão de favoritar, lightbox, foco após `Escape` e zoom 200%), registrando evidência assinada.
2. **G19 — Auditoria independente de segurança (revisor externo):** revisar o diff completo do PR #45 + PR #48 no SHA final com CI verde, incluindo `shouldAllowClerkCsp`, `responses.ts`, `private-recovery.ts`, `hostinger-managed-export.mjs` e `client-admin.ts`, e emitir parecer formal (não autoaprovado pelo agente).
3. **G20 — Aprovação LGPD (Maria Helena / controladora do estúdio):** formalizar aceite do tratamento de dados de clientes, vínculo Clerk/D1, exportação `lgpd-export`, retenção e revogação de acesso.
4. **G05 remoto + G17 + G23 + H01–H06 — Origem isolada Hostinger & Clerk Dashboard (operador):**
   - Provisionar subdomínio/alias isolado de QA na Hostinger Unlimited (sem alterar DNS/proxy de `punctumpicture.com` nem usar VPS `2135319`), implantar pacote correspondente ao SHA aprovado e configurar variáveis de QA.
   - Executar no ambiente isolado os scripts existentes: `hostinger-managed-acceptance-http.mjs` (G05 25 MiB remoto), `hostinger-managed-functional.mjs`, `hostinger-managed-recovery-download.mjs` (G18/G23) e validação de rollback integral.
   - Confirmar no Clerk Dashboard (Production `ins_3M6H9ktM3jO84RvEu5BmKFokCfr`): plano/teto de cobrança R$ 0,00 (G17), `force_organization_selection = false` e tempo máximo de sessão ≤ 14 dias.
5. **G22 — Autorização explícita e separada por release (proprietário):** emitir autorização escrita distinta para **Release A** (público com `PRIVATE_GALLERIES_ENABLED=false`) e, posteriormente após todos os gates, para **Release B** (álbuns privados).

## 8. Nota pronta para atualização de checkpoint no Drive (somente se autorizada escrita)

> **23/11/2026 — Incremento R4 Álbuns Privados com Clerk + 5 Templates (PR #48):** implementadas correções TDD de segurança/persistência (`private-recovery.ts` validando `layout_preset`, `hostinger-managed-export.mjs` incluindo migração `0016`, `responses.ts` aceitando `authMode: "clerk"` + allowlist `layoutPreset`, `shouldAllowClerkCsp` corrigindo CSP em `/admin/*` para `ClerkProvider`, UI de vínculo Clerk em `/admin/clientes`, polimento acessível/visual dos 5 templates). Executado QA real em Chromium dos 5 templates em 0/1/24 fotos (`PASS_LOCAL_SYNTHETIC_TEMPLATES_QA`, 0 violações WCAG 2.1 AA) e prova E2E real com Clerk Development (`PASS_LOCAL_CLERK_DEVELOPMENT_BROWSER_PROOF`, limpeza integral confirmada; achado crítico: confirmar `force_organization_selection=false` em Clerk Production antes do Release B). Readback Hostinger confirmou `ssl.status=active`, mas `ENV_VARS=[]`, `subdomains=[]` e artefato ainda em `punctum-r4-synthetic-a136f721.zip`. Estado preservado: **PARTIAL_VERIFIED / PRODUCTION_NO_GO** (`17 PASS`, `2 FAIL` [G05, G17], `5 BLOCKED_EXTERNAL` [G15, G19, G20, G22, G23], `H01–H06 NOT_VERIFIED`). Custo incremental: R$ 0,00.
