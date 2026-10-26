# Punctum Picture — inspeção visual Chrome local — 2026-10-26

**Escopo:** PR #14 (colagem autoral mobile-first), branch `design/punctum-collage-mobile-20261024`, baseline `bddeec3a74a341f9002d9e9bb3b3253fdb67c878`.

**Ambiente:** clone limpo e isolado em Windows, Node 24.19.0, Chrome 155 via Playwright 1.64.1, Vinext/Vite e D1 exclusivamente local. `npm ci --no-audit --no-fund` instalou 541 pacotes; `npm run db:migrate:local` aplicou oito migrations locais. Foi gravado o preset `colagem-autoral` somente em `site_config_versions` da base D1 **local**, para produzir uma amostra da implementação antes de publicação. Fotos consultadas pertencem ao acervo público/seed de teste. A amostra **não** reproduz banco, contas, permissões ou versão efetivamente publicados.

## Inspeção

| Requisito / observação | Evidência | Resultado |
| --- | --- | --- |
| Home com preset selecionado | `data-theme-preset=colagem-autoral` e HTTP 200 nos sete viewports | PASS local |
| Viewports 320/360/390/430/768/1024/1440 CSS px | `documentElement.scrollWidth === innerWidth` nos sete | PASS horizontal geral |
| Hierarquia editorial | Um H1; títulos de seção H2 e cartões de ensaio H3 | PASS DOM |
| Navegação principal | Portfólio/Arquivo/Sobre/Conversar presentes; Sobre não oculto | PASS visibilidade |
| Alvos de clique e teclado | Nenhum controle visível abaixo de 48 × 48 CSS px na inspeção programática; primeiro Tab = “Ir para o conteúdo” | PASS amostra |
| Conteúdo editorial | Seis cartões da colagem, com fotos naturais após scroll; LensHero e carrossel horizontal renderizados | PASS renderização local |
| Lazy loading | Captura `fullPage` precoce mostrava fotografias vazias; após percorrer a página, fotos carregaram | FALSO POSITIVO inicial, resolvido |
| Portfolio | Página renderizada; sem overflow horizontal em 390 px | PASS amostra |
| Studio 390 e 1440 px | Sete presets; `Colagem autoral` selecionado; alternância para `Punctum original` e volta; preview iframe com `colagem-autoral` | PASS amostra local |
| 200% zoom | Simulação por CSS `zoom:200%` não apresentou overflow global a 390px | PARCIAL — não equivale a zoom real do browser |
| Rodapé em 320 px | Antes, três links (Arquivo completo, O que fotografo, Contato) ultrapassavam x=320 até x=345; depois, nenhum link do rodapé extravasou | CORRIGIDO / PASS |

**NC-VIS-001 (P2 corrigida):** a navegação do rodapé herdava duas colunas rígidas em 320px e cortava links sem criar scroll horizontal no documento (isto é, um teste de overflow global sozinho não detectava o erro). Foi adicionada regra **somente para `colagem-autoral` e `max-width:380px`** com coluna única e quebra segura dos links. Regressão primeiro RED (4/5 testes de contrato CSS; novo caso reprovado), depois GREEN (5/5). Nova inspeção Chrome confirma ausência de controles de rodapé fora do viewport; os controles lateralmente fora de tela remanescentes são exclusivamente cards do carrossel tridimensional deliberadamente navegável por gesto.

## Achados / limites remanescentes

- **Hydration (triagem P2):** houve aviso de hydration mismatch em sessões de desenvolvimento, com diff envolvendo estilo de cursor/caret de inputs do formulário. A amostra de navegação de `localhost` sem scroll forçado não gerou erros, mas a inspeção do Studio mostrou aviso React. Não se atribui a causa à PR #14 sem isolamento do comportamento na branch base ou preview de produção.
- **CSP/favicon local:** navegador em `127.0.0.1` exibiu bloqueio de recursos `http://localhost:3000/favicon.*` pela política `img-src 'self'` porque origem e hostname eram diferentes. Em `localhost:3000` a execução principal não reproduziu esses erros. **Não tratar como falha de produção sem reprodução no ambiente correto.**
- **Composição:** tipografia de manifesto muito grande cria quebras longas no desktop e múltiplas linhas no mobile. Não é falha de layout mensurável; adequação editorial requer revisão humana da Maria antes de autorização comercial.
- **A11Y:** inspeção automatizada de medidas e skip-link não prova TalkBack, VoiceOver, semântica assistiva completa, contraste de todos os estados, toque em aparelhos físicos, gestos 3D, foco e Escape de modais.
- **Studio:** alternância de preset e iframe funcionaram na cópia local; não foi feita publicação em produção. O registro não homologa toda a matriz save/discard/restore, concorrência multiaba nem sessão OTP real.
- **Performance:** não foram medidas métricas Web Vitals em dispositivo ou campo (LCP, CLS, INP). Renders com screenshots não equivalem a benchmark.
- **Álbuns privados:** esta prova não cobre a PR #13, Cloudflare Access OTP/JWT ou QA integrada das duas PRs.

## Arquivos e rastreabilidade

### Reexecução após correção — 2026-10-26, horário de São Paulo

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, sem enfraquecer regras |
| `npm test` | PASS — 27 arquivos, **113/113 testes** |
| `npx vitest run --config vitest.collage.config.ts` | PASS — **4/4 testes SSR** |
| `node --test scripts/collage-css.test.mjs` | PASS — **5/5 testes CSS**, incluindo o novo caso RED/GREEN |
| `npm run build` | PASS — cinco fases Vinext (avisos não bloqueantes sobre sourcemaps/classificação de rotas) |
| `git diff --check` | PASS |

Na primeira tentativa de lint, uma ferramenta de QA gerou `presets.cjs` e scripts temporários dentro do clone; esse conteúdo, que não pertence ao código do produto, foi inspecionado pelo ESLint e ocasionou erros. Os arquivos temporários foram deslocados para fora do repositório sem alterar as regras de lint. A **segunda execução com o comando oficial no checkout limpo desses auxiliares foi PASS**. Não esconder essa tentativa no histórico.

- Correção: `app/collage-home.css`.
- RED/GREEN de prevenção: `scripts/collage-css.test.mjs`.
- Capturas selecionadas em `docs/visual-qa/screenshots/2026-10-26/`: topo desktop, galeria/carrossel mobile já carregados, cartões editoriais e Studio local.
- Logs completos, artefatos auxiliares e saídas do Playwright ficam fora do Git; não carregar cookies, fotos privadas ou estados de sessão.

**Status DoD-A:** **PARCIAL**, melhorado com inspeção real de Chrome e correção reproduzida, mas ainda **NO-GO para merge/deploy** até completar dispositivos reais, leitor de tela, zoom nativo, QA de interações/Studio e aprovação curatorial. Nenhum deploy, migração remota, plano pago, alteração do domínio ou merge foi realizado por esta inspeção.
