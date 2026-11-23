# Punctum Picture Client Authentication Visual Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar a identidade visual da entrada de álbuns privados com a identidade fotográfica publicada do Punctum, eliminando a tela bege extensa e o jargão Clerk sem alterar a autenticação.

**Architecture:** Aplicar na entrada do cliente a configuração **pública publicada** já resolvida por `loadPublicSiteConfig` e `SiteThemeRoot`, com CSS estritamente escopado às duas telas de autenticação. Preservar o componente Clerk e o fluxo de troca de sessão; reutilizar fotografia pública/local existente e testes de integração R4.

**Tech Stack:** TypeScript 5.9, React 19, Next.js 16/vinext, CSS existente, `@clerk/react` 6.18.6, Vitest, Playwright, Workers/D1 somente para leitura pública já existente.

**Spec:** `docs/superpowers/specs/2026-11-23-punctum-auth-visual-design.md`

## Global Constraints

- Base de planejamento: `main` em 2026-11-23; **antes de implementar**, reconciliar alterações das PRs draft [#45](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/45) e [#48](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/48); nunca substituir código mais recente.
- Não mudar `CLIENT_AUTH_MODE`, `ADMIN_AUTH_MODE`, `CLERK_AUTH_ENABLED`, `PRIVATE_GALLERIES_ENABLED` e defaults; nenhum segredo, Clerk Production ou D1/R2 remotos.
- Não editar `worker/auth/clerk-auth.ts`, `worker/client/*`, endpoints de sessão ou políticas de autorização em uma alteração somente visual.
- `/albuns/entrar` e `/albuns/trocar-senha` continuam `noindex`; não levar mídia privada ao HTML público.
- Usar tema publicado pelo Studio; fallback `PUNCTUM_DEFAULT_SITE_CONFIG`, `nocturne-plum`, Instrument Serif/Manrope. Respeitar mudanças autorais do Studio, não recriar registro de temas.
- Preservar CSS e todos os temas de galeria `noir|ivory|warm` e templates `classico|editorial|colagem|mosaico|cinema`.
- Copy proposto sem jargão Clerk; sem prometer recuperação automática inexistente. A aprovação editorial final permanece externa.
- Nenhum merge, deploy, migração, DNS, alteração da Hostinger/Cloudflare, publicação, vínculo real de clientes ou aumento de custo sem autorização específica. Estado R4 `PRODUCTION_NO_GO`.

## Review Focus

1. **Mobile 320 px + teclado/zoom 200%:** foto não empurra o CTA para fora de uma navegação razoável, sem overflow; prova na Task 3/5.
2. **Conta Clerk assinada e troca de conta:** `DELETE /api/client/session` precede `signOut`, `POST /api/client/clerk-session` continua necessário; prova na Task 4.
3. **Modos Clerk-only / password / híbrido + troca de senha:** os campos corretos aparecem e o backend permanece idêntico; Tasks 2/4.
4. **Tema publicado customizado ou falha de assets:** não forçar cor fixa ou mostrar foto privada; fallback e `alt=""` decorativo; Tasks 1/2/5.
5. **Foco, modal e estados de erro:** CTA, retorno do foco, contraste, erro acessível e movimento reduzido; Tasks 3/4/5.

## File Responsibility Map

- **Create** `app/albuns/components/ClientAuthShell.tsx`: integra o tema já publicado à apresentação **somente** do login e da troca de senha, sem importar APIs de cliente.
- **Create** `app/albuns/auth.css`: layout fotográfico isolado, responsivo e estados de foco; não alterar a base `.pa-themed`.
- **Modify** `app/albuns/entrar/page.tsx` e `app/albuns/trocar-senha/page.tsx`: fornecer a configuração pública e envolver o login no shell.
- **Modify** `app/albuns/components/ClientLogin.tsx`: markup/semântica, foto pública e copy; manter submit e os modos.
- **Modify** `app/albuns/components/ClerkClientLogin.tsx`: copy de usuário e aparência suportada sem alterar sessão.
- **Test** `tests/unit/client-auth-presentation.spec.tsx` (novo): apresentação, modos, tokens e semântica SSR; mocks apenas na fronteira Clerk.
- **Test** `tests/integration/clerk-r4-security-matrix.spec.ts` (existente): preservar trocas e regras de sessão sem alterar endpoints; ampliar só onde o fluxo visual revelar falta comprovada.
- **Create** `scripts/e2e/client-auth-visual-qa.mjs`: QA browser read-only em origem local com dados sintéticos, reutilizando os helpers E2E existentes.
- **Create** `docs/visual-qa/punctum-auth-visual-2026-11-23.md`: evidência de capturas, SHA, matriz, divergências e gates; nunca declarar prova não executada.
- **Inspect** `app/acesso/page.tsx`, `app/admin/admin.css`: auditoria de consistência, sem alterar fluxo do admin nesta entrega.

---

### Task 1: Tema público na superfície de autenticação

**Files:**
- Create: `app/albuns/components/ClientAuthShell.tsx`
- Modify: `app/albuns/entrar/page.tsx`, `app/albuns/trocar-senha/page.tsx`
- Test: `tests/unit/client-auth-presentation.spec.tsx`

**Interfaces:**
- Consumes: `loadPublicSiteConfig(): Promise<SiteConfig>` de `app/lib/server-content.ts`, `SiteThemeRoot({config, ambientCursor, children})`, `PUNCTUM_DEFAULT_SITE_CONFIG`.
- Produces: `ClientAuthShell({config, children}: {config: SiteConfig; children: React.ReactNode}): React.JSX.Element` com `SiteThemeRoot config={config} ambientCursor={false}` e class de autenticação.

- [ ] **Step 1: RED.** Testar no arquivo novo que o shell passa a configuração recebida ao tema, exibe `data-theme-palette` apropriado para `nocturne-plum`, aceita tema público alternativo sem fixar bege e não injeta `GalleryCursor`. Teste do contrato de rota exige shell nas duas entradas.
- [ ] **Step 2: Executar RED.** `npm test -- tests/unit/client-auth-presentation.spec.tsx`. Esperado: FAIL por ausência de `ClientAuthShell` / contrato não atendido.
- [ ] **Step 3: Implementar.** Importar `SiteThemeRoot` e seu CSS público no shell; importar `loadPublicSiteConfig` nos dois Server Components e resolver `await`; envolver apenas `ClientLogin`. Se o servidor de teste não oferecer DB, testar shell com `PUNCTUM_DEFAULT_SITE_CONFIG` sem criar um banco novo. Não introduzir tema nos álbuns propriamente ditos.
- [ ] **Step 4: Executar GREEN.** `npm test -- tests/unit/client-auth-presentation.spec.tsx` e `npm run typecheck`. Esperado: PASS, sem mudança de API nem erro de importação server/client.
- [ ] **Step 5: Commit.** `git add app/albuns/components/ClientAuthShell.tsx app/albuns/entrar/page.tsx app/albuns/trocar-senha/page.tsx tests/unit/client-auth-presentation.spec.tsx && git commit -m "feat(punctum): reuse published theme on client auth"`.

### Task 2: Estrutura fotográfica, identidade e texto claro

**Files:**
- Modify: `app/albuns/components/ClientLogin.tsx`
- Modify: `tests/unit/client-auth-presentation.spec.tsx`

**Interfaces:**
- Consumes: `ClientLogin({changePassword=false, clerkEnabled=false, clerkOnly=false, publishableKey?})` existente, `getPublicVisualAsset("logo")` da apresentação pública caso seguro no cliente, foto estática pública `/photos/p002.jpg`.
- Produces: mesmo contrato `ClientLogin`, sem alteração em props, estado, destino de login ou regras de autenticação.

- [ ] **Step 1: RED.** Renderizar a variante password com `renderToStaticMarkup`: um `h1`; a marca existente com link `/`; CTA "Abrir meus álbuns"; descrição simples; nenhuma lista `01–03`, nenhuma assinatura ornamental, foto com `alt=""`; variante `changePassword` conserva input de senha/confirmar, `minLength=12` e labels.
- [ ] **Step 2: Executar RED.** `npm test -- tests/unit/client-auth-presentation.spec.tsx`. Esperado: FAIL em cópia e estrutura atuais.
- [ ] **Step 3: Implementar.** Compor um `<main>` com região de marca, cabeçalho/descrição, região de autenticação e fotografia pública decorativa. Substituir a cópia anterior por "Suas fotografias, só suas." / "Entre para acessar seus álbuns privados."; manter inputs, `submit`, `privateApi`, `window.location.replace`, mensagens de erro e as condições `clerkOnly`/senha. Usar mídia do acervo público existente, sem import remoto nem imagem de cliente.
- [ ] **Step 4: Executar GREEN.** Mesmo comando e `npm run typecheck`; confirmar que a estrutura não altera a lógica.
- [ ] **Step 5: Commit.** `git add app/albuns/components/ClientLogin.tsx tests/unit/client-auth-presentation.spec.tsx && git commit -m "feat(punctum): simplify client login presentation"`.

### Task 3: Layout responsive, tipografia, estados e acessibilidade

**Files:**
- Create: `app/albuns/auth.css`
- Modify: `app/albuns/components/ClientAuthShell.tsx`
- Test: `tests/unit/client-auth-presentation.spec.tsx`

**Interfaces:**
- Consumes: variáveis públicas do tema `--color-background`, `--color-foreground`, `--color-muted`, `--color-primary`, `--color-border`, `--font-heading`, `--font-body`, já emitidas por `SiteThemeRoot`.
- Produces: seletores escopados `.private-albums .pa-auth-shell` / `.pa-auth-*`, sem reatribuir `--pa-bg`, `--pa-fg` e `.pa-themed` globalmente.

- [ ] **Step 1: RED.** Adicionar assertions para import do CSS de autenticação e classes de shell; preparar E2E na Task 5 para viewport 320/360/390/430/768/1024/1440, CTA visível, zero overflow, foto sem distorção, foco visível, zoom 200% e `prefers-reduced-motion`.
- [ ] **Step 2: Executar RED.** `npm test -- tests/unit/client-auth-presentation.spec.tsx`. Esperado: FAIL por CSS/classe ausente.
- [ ] **Step 3: Implementar.** Desktop duas áreas (login + fotografia); mobile foto compacta, marca e CTA prioritários. Usar `font-family:var(--font-heading)` / `var(--font-body)`, tokens do tema; controles ≥44px, CTA ≥48px; `safe-area-inset`, `object-fit:cover`, `overflow-wrap`, contraste e `:focus-visible`. Preservar comportamento sem movimento; nada de biblioteca, animation loop ou scroll hijack.
- [ ] **Step 4: Executar GREEN.** `npm test -- tests/unit/client-auth-presentation.spec.tsx`, `npm run lint`, `npm run typecheck`. Esperado: PASS. Qualquer alegação visual permanece pendente do E2E.
- [ ] **Step 5: Commit.** `git add app/albuns/auth.css app/albuns/components/ClientAuthShell.tsx tests/unit/client-auth-presentation.spec.tsx && git commit -m "style(punctum): align auth with published photographic theme"`.

### Task 4: Clerk com linguagem de cliente, sem regressão de sessão

**Files:**
- Modify: `app/albuns/components/ClerkClientLogin.tsx`
- Test: `tests/unit/client-auth-presentation.spec.tsx`, `tests/integration/clerk-r4-security-matrix.spec.ts` (apenas extensão comprovadamente necessária)

**Interfaces:**
- Consumes: `ClerkClientLogin({publishableKey:string})` existente, `SignInButton mode="modal"`, `useAuth().getToken`, `useClerk().signOut`.
- Produces: o mesmo componente sem mudança na interface; mensagens de usuário "Entrar nos meus álbuns", "Conta conectada", "Trocar conta"; `POST /api/client/clerk-session` após JWT, `DELETE /api/client/session` antes do `signOut`.

- [ ] **Step 1: RED.** Teste assertando ausência de "Entrar com Clerk" e "Conta Clerk conectada" na saída destinada a clientes; teste de contrato para estados deslogado/logado, loading e erro, `role="alert"`, preservando a sequência de logout e exchange.
- [ ] **Step 2: Executar RED.** `npm test -- tests/unit/client-auth-presentation.spec.tsx tests/integration/clerk-r4-security-matrix.spec.ts`. Esperado: FAIL nas strings atuais; testes de autorização existentes devem continuar aprovados.
- [ ] **Step 3: Implementar.** Trocar apenas textos. Personalizar o modal via `appearance` oficial de `@clerk/react` 6.18.6 **somente depois de confirmar tipagem/runtime real**, sem formulário proprietário e sem tornar cores/classe do modal dependentes de um token não disponível. Se a skin causar falha, manter modal padrão e registrar divergência, não remover auth.
- [ ] **Step 4: Executar GREEN.** Repetir teste e `npm run typecheck`; garantir que o modo `clerkOnly` esconda formulário legado, `password` mantenha formulário, `access` respeite configuração existente e `/albuns/trocar-senha` permaneça funcional.
- [ ] **Step 5: Commit.** `git add app/albuns/components/ClerkClientLogin.tsx tests/unit/client-auth-presentation.spec.tsx tests/integration/clerk-r4-security-matrix.spec.ts && git commit -m "fix(punctum): remove provider jargon from client auth"`.

### Task 5: QA real local, revisão, gates e handoff

**Files:**
- Create: `scripts/e2e/client-auth-visual-qa.mjs`, `docs/visual-qa/punctum-auth-visual-2026-11-23.md`
- Inspect unchanged: `app/acesso/page.tsx`, `app/admin/admin.css`, `app/albuns/albuns.css`, `docs/operations/private-albums-r4/execution-state.json`

**Interfaces:**
- Consumes: helpers já existentes `scripts/e2e/accessibility-evidence.mjs`, `scripts/e2e/screenshot-evidence.mjs`, scripts/fixtures de Hostinger candidato isolado, Playwright `chromium`.
- Produces: script E2E somente em origem local sintética e relatório por SHA/viewport/modo. Não configura, deploya nem altera instâncias remotas.

- [ ] **Step 1: RED.** Testar em browser: 320/360/390/430/768/1024/1440 px, captura do login e comparação com home publicada no mesmo tema, uma `h1`, CTA acessível sem overflow, navegação teclado/modal, leitor de tela com semântica, `prefers-reduced-motion`, perda de imagem, textos a 200%, ausência de leak de clientes. Cenarios `CLIENT_AUTH_MODE=password|clerk`, `CLERK_AUTH_ENABLED` on/off e sessão expirada com fixtures.
- [ ] **Step 2: Executar RED.** `node scripts/e2e/client-auth-visual-qa.mjs` contra candidato **isolado**. Esperado: evidenciar as divergências remanescentes, sem usar sessão/credenciais reais.
- [ ] **Step 3: Corrigir apenas falhas dentro do escopo visual.** Iterar CSS/markup em Tasks 2/3 ou copy Task 4; reexecutar checks afetados. Comparar `/acesso` com o site público, registrando divergências administrativas sem reescrever backend.
- [ ] **Step 4: Executar GREEN.** `npm ci` com Node ≥22.13; `npm run typecheck`; `npm run lint`; `npm test`; `npm run build`; `node scripts/e2e/client-auth-visual-qa.mjs`; `git diff --check`. Registrar saída exata, commit SHA, capturas sanitizadas e a origem do browser. Testes físicos TalkBack/VoiceOver e aprovações externas devem ficar explicitamente `PENDING` se não realizados.
- [ ] **Step 5: Commit + revisão.** `git add scripts/e2e/client-auth-visual-qa.mjs docs/visual-qa/punctum-auth-visual-2026-11-23.md && git commit -m "test(punctum): document auth visual regression proof"`; revisão por agente independente de UI e segurança no SHA final. Não marcar R4 pronto nem alterar `execution-state.json` sem gates comprovados.

## Self-review: coverage

- Tema real do Studio, fallback e escopo: Task 1 + Task 3.
- Estrutura de login, foto, mobile e troca de senha: Task 2 + Task 3.
- Linguagem Clerk e fluxo de sessão: Task 4.
- Browser, acessibilidade, regressões R4, admin e status de produção: Task 5.
- Nenhuma tarefa requer mudanças de dados reais, Worker, DB, CDN, DNS ou release.

## Definition of Done

Plano implementado em branch isolada com code review, evidência RED → GREEN, cobertura de modos de login, capturas mobile e desktop, contraste/teclado e verificação de não regressão R4 associada ao SHA. **Não** equivale a liberação em produção. A promoção exige aprovação editorial, QA físico quando aplicável, segurança/privacidade e autorização explícita independente dos gates R4.

**Handoff:** depois da revisão deste plano, usar `superpowers:subagent-driven-development` (preferido pelas fronteiras entre tema, UX e segurança) ou `superpowers:executing-plans`; preservar a base de branch real reconciliada e abrir PR draft, não fazer merge/deploy automaticamente.
