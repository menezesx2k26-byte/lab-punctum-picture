# Punctum Picture — Relatório de QA: Colagem Autoral

**Data:** 2026-10-25 (UTC). **PR:** #14 (draft). **Base:** `main@af55e1526b731be099e804335eb143d2b5cfa95e`. **Head verificado antes deste relatório:** `44905c1fbdfd14652a73471fca0b2d36532f8529`.

## Mudança de produto

Nova direção visual de colagem editorial mobile-first, aprovada para **implementar** por Gab após pedido da Maria, paleta roxo #422079, amarelo #FFE43B, branco-papel #F7F4EF e tinta #18131E. Um preset selecionável no Studio ativa um CSS escopado à **home**; páginas internas mantêm apresentação mais sóbria. Nenhuma das dez imagens referenciais foi copiada, nenhuma foto privada foi incorporada. `featured-work:collage` reutiliza a variante já existente.

## Infraestrutura e isolamento

- Branch isolada `design/punctum-collage-mobile-20261024`, comparada com `main`. PR #13 de autenticação não foi alterada; nenhum deploy, merge ou schema D1/R2 foi realizado.
- Worktree Windows criada na base `main`; `npm ci --no-audit --no-fund` executou com exit 0 e 534 pacotes instalados. Houve avisos `allow-scripts` sobre postinstalls pendentes; não foram silenciosamente aprovados.
- Commits e diffs consultáveis na PR #14. Até este relatório, 12 arquivos foram alterados/adicionados: preset, CSS home, miniatura Studio, fallback para capa ausente, três testes, atualização de teste existente e documentação.

## Evidência de CI

**RED intencional:** [run 40151558020](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40151558020), `1c5ff34`: 3 testes novos reprovaram como esperado: ID `colagem-autoral` inexistente, acesso ao preset indefinido e `heroMedia` perdido ao alternar presets.

**GREEN após correção:** [run 40152059118](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40152059118) em `e44cbe7b`: `npm ci`, typecheck, lint, 27 arquivos de teste / **113 testes PASS**, build PASS. [Run 40152148270](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40152148270), `44905c1f`: **sucesso** em `npm ci`, typecheck, lint, `npm test` e build; 27 arquivos / 113 testes PASS. CI verde significa **validação automatizada**, não validação de layout em dispositivo real.

**Área sem regressão de código:** comparativo de commits da PR #14 inclui apenas `app/admin/admin.css`, `app/collage-home.css`, `HomeExperience.tsx`, `FeaturedStories.tsx`, dois arquivos de preset, um teste existente, três testes novos e documentação. `LensHero.tsx`, `SpatialCarousel.tsx`, `immersive-policy.ts`, APIs, migrations, autenticação e rotas D1/R2 não sofreram diff.

## Avaliação dos riscos

- **Corrigido por teste:** troca de preset não apaga `heroMedia`, `photoIds`, `itemCount`, copy ou IDs.
- **Mitigado:** conteúdo visual decorativo baseado em CSS, uso de fotografias públicas reais, fallback para ensaio sem capa; nenhum asset referencial de terceiros.
- **Risco residual:** o preset usa cores de colagem fixas na home mesmo se o operador personalizar a paleta global; verificar expectativa de funcionamento do seletor `Cores` do Studio. Os visuais não foram aprovados em tela física pela Maria.
- **Risco residual:** 320 px com zoom 200%, proporções/scroll/gestos em iOS e Android, foco e navegação acessível demandam teste visual e assistivo real.
- **Risco residual:** performance LCP/CLS/INP em aparelhos reais e redes lentas não foi medida. Animações da lente/carrossel existentes requerem regressão manual.
- **Independente:** autenticação Access Free e OTP real na PR #13 continua fora deste escopo; CI de design não homologa login.

## DoD verificável

| Gate | Estado | Evidência / bloqueio |
| --- | --- | --- |
| Isolamento fora de main/PR #13 | PASS | branch de design e PR #14 draft |
| Preset e seleção do Studio | PASS | teste e código de allowlist |
| Preservar mídia ao trocar estilos | PASS | RED→GREEN confirmado em CI |
| Reutilização de colagem com links de ensaio | PASS | novos testes unitários e CI |
| Typecheck, lint, suite e build | PASS | run 40152148270 |
| Sem diff em autenticação, D1/R2, LensHero/SpatialCarousel | PASS | comparativo GitHub |
| Teste navegador 320/360/390/430/768/1440 | BLOCKED | screenshots e interações ainda não evidenciados |
| Zoom 200%, foco, TalkBack/VoiceOver | BLOCKED | dispositivo/QA acessível real pendente |
| QA físico Android/iPhone | BLOCKED | nenhuma sessão física reportada |
| Web Vitals em aparelho/rede reais | BLOCKED | medição pendente |
| Curadoria visual da Maria | BLOCKED | fotos finais/layout ainda não aprovados |
| Merge/deploy produção | BLOCKED por restrição | não autorizado, não realizado |

## Rollback editorial

No Studio, selecionar `Punctum original` (ou último preset aprovado), conferir rascunho, imagens e prévia e descartar ou publicar somente com autorização. Para rollback de código, **não** efetuar merge da PR #14 ou reverter só os commits de design. Não tocar sessões, D1/R2, domínio e chaves.

## Custo

Nenhum Workers Paid, Hostinger novo, serviço pago, deploy ou armazenamento persistente introduzido. Apenas arquivos CSS/teste/preset e CI existente; custo incremental de infraestrutura **alvo R$0**, sujeito às cotas GitHub Actions e métricas de produção não verificadas.

## Decisão de liberação

**NO-GO para merge e produção até aprovação visual da Maria, browser QA e requisitos de autorização.** A revisão independente deve registrar quaisquer achados antes da entrega final.

## Adendo — revisão independente e regressões corrigidas

A revisão read-only encontrou três defeitos verificáveis: (1) link Sobre oculto pelo CSS mobile legado, (2) corte forçado 4:5 nas fotos dos ensaios, (3) texto de tinta escura em superfície dark configurável pelo Studio. A correção foi implementada em `app/collage-home.css`, mantendo os componentes da lente e do carrossel intactos.

O teste inicialmente executado no pool Vitest/Workers tentou ler CSS por `node:fs` e depois por import `?raw`, ambos incompatíveis naquele runtime — o conteúdo chegava ausente/vazio. Esse teste foi substituído por `scripts/collage-css.test.mjs` usando `node:test`, `node:fs` e importação relativa explícita. `.github/workflows/ci.yml` o executa obrigatoriamente após `npm test`, antes do build. Não houve exclusão ou enfraquecimento de asserções: valida link Sobre, `object-fit: contain` sem `aspect-ratio: 4/5`, e seletores de superfícies dark/light.

- **RED verificável:** [run 40152485327](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40152485327) com duas falhas CSS (link Sobre e recorte). A falha do teste anterior por arquivo ausente foi registrada em run 40152377728 e não é evidência de defeito visual.
- **GREEN local:** `node scripts/collage-css.test.mjs` no worktree sincronizado com `a71b33f`: 3 testes, 3 PASS, 0 FAIL, exit 0.
- **GREEN CI:** [run 40152897912](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40152897912) em `a71b33fbdd2eb11af3d1b29c8daf2cb1b6e3dadf`: `npm ci`, typecheck, lint, `npm test`, `node --test scripts/collage-css.test.mjs` e build **todos SUCCESS**. O resultado não substitui navegador real nem QA humano.
- **Revisão independente:** a leitura inicial identificou os defeitos descritos abaixo. Após as correções, o mesmo revisor fez nova inspeção somente leitura do diff; não encontrou novo defeito confirmado. A medição em navegador continua pendente.

**NO-GO continua:** validação visual da Maria, navegação em 320–430 px, browser screenshots, zoom 200%, acesso por teclado/leitor de tela, performance e prévia/restore no Studio devem ser verificados antes de merge e deploy. A PR deve permanecer draft.

## Reexecução local e CAPA P2 — 2026-10-25 UTC

**Baseline real:** branch `design/punctum-collage-mobile-20261024`, SHA `10e672a0ddd7b3b7ce4263a05baa9a49a0661970`; Node `v24.19.0`, npm `11.9.0`, lockfile do SHA. `npm ci --no-audit --no-fund`, `npm run typecheck`, `npm run lint`, `npm test` (27 arquivos / 113 testes), `node --test scripts/collage-css.test.mjs` (3/3) e `npm run build` passaram. O build foi executado antes das correções abaixo; a CI final deve repetir o conjunto no novo HEAD.

### NC-001 — Nível de heading saltado (P2, corrigida)

- **Requisito:** A11Y-001/A11Y-003; heading de seção `h2` deve preceder títulos de cartão `h3`.
- **Esperado/obtido:** leitor de headings deve percorrer `h2 → h3`; a renderização anterior produzia `h2 → h4` em cada cartão de colagem.
- **Causa-raiz:** `FeaturedStories` reutilizou o nível `h4` de uma composição antiga sob uma seção cujo título é `h2`.
- **Correção/prevenção:** cartão passou a `h3`; seletores de estilo correspondentes foram atualizados. `collage-frontend.spec.tsx` exige o markup `<h3>`. O teste observou RED no HTML SSR com `<h4>` e GREEN após a correção; o workflow executa esse arquivo em configuração Vitest Node isolada do pool Workers.
- **Evidência:** `npx vitest run --config vitest.collage.config.ts` — 4/4 PASS; revisão independente em SHA base reportou o salto.
- **Risco residual:** árvore de acessibilidade e leitor de tela ainda precisam de verificação em navegador real.

### NC-002 — Alvos de navegação estreitos em zoom/reflow (P2, correção de código aplicada)

- **Requisito:** MOB-003/MOB-005 e A11Y-002; menu refluído sem overflow e alvo de toque interno ≥48×48 CSS px quando viável.
- **Esperado/obtido:** navegação pode quebrar em mais de uma linha e cada link tem dimensões mínimas declaradas de 48 px; antes, links mantinham largura intrínseca e o menu não podia quebrar.
- **Causa-raiz:** regra mobile definia altura mínima, mas não wrap nem largura mínima para os itens flex.
- **Correção/prevenção:** `flex-wrap: wrap`, links flexíveis centralizados e `min-width:48px`; teste de contrato Node verifica wrap, largura e altura. Teste observado RED antes do patch e GREEN depois.
- **Evidência:** `node --test scripts/collage-css.test.mjs` — 4/4 PASS.
- **Risco residual:** dimensões reais, zoom 200%, 320 px e overflow de texto seguem BLOCKED por ausência de Chrome DevTools MCP/controle de navegador conectado nesta sessão; o binário Chromium local, sozinho, não foi usado como substituto do fluxo de browser autorizado.

### NC-003 — Teste SSR de colagem ausente da CI (P2, corrigida)

- **Requisito:** OPS-001/OPS-003; testes listados devem ser executados no HEAD avaliado.
- **Esperado/obtido:** `tests/unit/collage-frontend.spec.tsx` deve executar; a configuração original incluía somente `tests/**/*.spec.ts`, e `npx vitest run tests/unit/collage-frontend.spec.tsx` retornou “No test files found”. Adicionar o arquivo diretamente ao pool Workers também falhou ao carregar `next/image` (`TypeError ... image-component.js`).
- **Causa-raiz:** extensão `.tsx` estava fora do include e o componente depende de SSR Next que não é compatível com o pool Miniflare configurado.
- **Correção/prevenção:** adicionada `vitest.collage.config.ts` com ambiente Node e passo explícito de CI `npx vitest run --config vitest.collage.config.ts`; os 4 testes SSR passam sem enfraquecer assertions.
- **Risco residual:** aguardando CI remota no SHA final.

### Limites de evidência desta reexecução

- **PASS no SHA base:** baseline automatizada listada acima. O build deve ser repetido após os patches.
- **Ainda BLOCKED:** screenshots de navegador; matriz 320, 360, 375, 390, 430, 768, 1024 e 1440 px; zoom 200%; inspeção de Studio/preview/discard/save; Android/iOS físicos; TalkBack/VoiceOver; contrastes observados em browser; LCP/CLS/INP de laboratório e p75 real.
- **Risco P2 aberto para decisão editorial:** o preset define `--collage-*` fixos; não há prova visual de que o controle global “Cores” deva sobrescrevê-los durante a seleção do preset. A paleta aprovada permanece correta no CSS, mas a expectativa operacional do Studio precisa de QA.
- **Custo observado:** nenhum serviço remoto foi alterado nesta auditoria da #14; CI local e build não publicaram a aplicação.

## Validação final de código e runtime local — 2026-10-25 04:05 UTC

**Identidade:** branch `design/punctum-collage-mobile-20261024`; correções de código em `ac41ea340cec7d199c50b51d7d1572487196d234`. Os comandos abaixo foram executados com o mesmo conteúdo rastreado, antes de gravar esse commit. Ambiente: Linux x64, Node `v24.19.0`, npm `11.9.0`, Vitest `4.1.11`, Vite `8.1.5`, Vinext `0.0.50`, Wrangler `4.131.1`; `package-lock.json` presente.

- `npm run typecheck` — PASS.
- `npm run lint` — PASS.
- `npm test` — PASS, 27 arquivos / 113 testes.
- `npx vitest run --config vitest.collage.config.ts` — PASS, 1 arquivo / 4 testes SSR.
- `node --test scripts/collage-css.test.mjs` — PASS, 4/4.
- `npm run build` — PASS. Vinext classificou algumas rotas como dinâmicas/indeterminadas; build completo.
- `git diff --check` — PASS.
- **Revisão após patch:** leitura independente somente leitura não encontrou outro defeito no diff. A CI no SHA final ainda precisa confirmar o novo job SSR.

### Diagnóstico do preview Vinext

- **Reprodução:** `npm run preview` encerra com exit 1 ao iniciar `vinext start`. Erro completo: `Error [ERR_UNSUPPORTED_ESM_URL_SCHEME] ... Received protocol 'cloudflare:'`, em `node:internal/modules/esm/load`.
- **Causa-raiz:** [`package.json`](../../package.json#L11) chama `vinext start`, cujo CLI `0.0.50` importa diretamente `vinext/server/prod-server.js` via loader ESM padrão de Node. O bundle Cloudflare usa o módulo virtual `cloudflare:` provido pelo plugin; o loader Node direto não resolve esse esquema. Em contraste, [`vite.config.ts`](../../vite.config.ts#L41) carrega `@cloudflare/vite-plugin` e bindings locais durante `serve`. O build não detecta a falha porque ocorre em outra fase/runtime.
- **Alternativa verificada, sem custo remoto:** `npm run dev` inicia Vite 8.1.5 com `@cloudflare/vite-plugin` e bindings locais. Na primeira tentativa, D1 local estava vazio e `/` e `/portfolio` retornaram 500 (`no such table: site_settings`). `npm run db:migrate:local` informou `Resource location: local`, aplicou as oito migrations somente no estado `.wrangler/state/v3/d1` local; nenhum `--remote` foi usado. Depois, `GET /` e `GET /portfolio` retornaram 200 HTML (103,997 e 81,784 bytes). O servidor foi encerrado e não ficou escutando na porta 3000.
- **Limite:** isso comprova execução local pelo runtime Cloudflare/Vite após inicialização de D1 local. Não corrige `npm run preview`, não é deploy/preview remoto e não substitui screenshot/medida de browser.

### Por que a captura visual não foi executada

A pesquisa de ferramentas encontrou Browser Use gerenciado, porém o contrato da ferramenta descreve o browser como pago com tempo pré-pago; tempo não usado é reembolsado ao parar, sujeito a cobrança mínima de um minuto. A sessão não tem autorização de custo incremental e o plano fixa R$ 0. Portanto não criei sessão gerenciada, não usei Cloudflare Browser Rendering e não tratei Chromium local via shell como substituto do navegador conectado. Viewports, screenshots, medidas de overflow/touch, zoom 200%, Studio, acessibilidade manual e performance permanecem BLOCKED.

**Estado externo desta inspeção:** nenhum recurso Cloudflare/Hostinger foi gravado, nenhuma aplicação foi publicada, e nenhuma alteração de produção foi feita. O job de CI no SHA final e a autenticação Access com OTP real ainda são evidências pendentes de outros gates.

## CAPA de dependências e verificação do lockfile — 2026-10-25 04:22 UTC

**Identidade:** branch `design/punctum-collage-mobile-20261024`; atualização de dependências em `f5fc9968f8f6c9b40232570b2410e832a83a20d9`, após o patch visual `ac41ea340cec7d199c50b51d7d1572487196d234`. A instalação limpa usou esse conteúdo de `package.json`/`package-lock.json`; teste e build foram executados antes de gravar o commit, sem diferenças no conteúdo.

- **Achado inicial:** o push da revisão reportou 20 alertas Dependabot na `main` (`2 critical`, `5 high`, `10 moderate`, `3 low`). O alerta crítico aplicável ao pacote `next@16.3.5` era GHSA-vcvr-r3jv-pc5j, RCE condicional em `next/og`/`ImageResponse`. A busca no repositório não encontrou `next/og`, `ImageResponse`, `"use cache"` nem Server Actions. O pacote, contudo, estava no intervalo afetado.
- **Ação corretiva:** atualizados `next` `16.3.5 → 16.4.3`, `zod` `4.4.3 → 4.6.6`, `vite` `8.1.5 → 8.1.6`, `@cloudflare/vite-plugin` `1.54.8 → 1.65.0`, `vitest` `4.1.11 → 4.1.12`, `wrangler` `4.131.1 → 4.152.0` e `@cloudflare/workers-types` `5.20260911.1 → 5.20261025.1`. `npm audit fix` sem `--force` atualizou dependências transitivas compatíveis. Nenhuma dependência nova foi adicionada.
- **Razão para não usar `--force`:** o dry-run recomendou saltos de major de Vinext/Workers Vitest/Drizzle Kit e em certos casos downgrade de ferramentas. Esses saltos poderiam mudar o runtime, pool de testes ou comportamento de schema além do patch validado. Os alertas remanescentes ficam abertos para uma revisão de toolchain separada.
- **Audit depois da correção:** `npm audit --omit=dev --json` — 0 vulnerabilidades de produção (0 low/moderate/high/critical). `npm audit --json` — 13 alertas somente de desenvolvimento: 8 high e 5 moderate, 0 critical. Isso não é declaração de zero vulnerabilidade em todas as dependências.
- **Reprodutibilidade e regressão:** `npm ci --no-audit --no-fund` instalou 556 pacotes. Depois, `npm run typecheck`, `npm run lint`, `npm test` (27 arquivos/113 testes), `npx vitest run --config vitest.collage.config.ts` (4/4), `node --test scripts/collage-css.test.mjs` (4/4) e `npm run build` passaram.
- **Runtime com as versões atualizadas:** `npm run dev` usando `vite@8.1.6` e `@cloudflare/vite-plugin@1.65.0` respondeu `200 text/html` em `/` e `/portfolio` após migrations D1 locais. A porta foi liberada ao encerrar o processo. `npm run preview` continua reproduzindo `ERR_UNSUPPORTED_ESM_URL_SCHEME` em `vinext@0.0.50`; permanece contido pelo comando local `npm run dev` com bindings locais.
- **Independência da publicação:** o refresh altera somente dependências versionadas. Não houve deploy, migration remota, mudança de flag ou atualização de Worker Cloudflare.

**Risco residual / estado:** a CI remota ainda precisa executar no novo HEAD. O audit geral permanece `NO-GO` para afirmar segurança de todo o toolchain; o audit de dependências de produção é PASS. O DoD-A segue BLOCKED por inspeção visual/browser e Studio; esta correção não fecha esses gates.
