# Punctum Picture — QA final de navegador da colagem — 26/10/2026

**Escopo:** PR #14, `design/punctum-collage-mobile-20261024`; checkout isolado, baseline `aee566d8c2a626df187b7b4f3f2ab2c835e753b9`. Sem merge, deploy, dados privados ou alteração de produção. Testado com Chrome local via Playwright e Vite+Cloudflare D1 **local**.

## Evidência da inspeção final

O navegador carregou `colagem-autoral` com o masthead `ESTUDOS DO OLHAR` e `06 ENSAIOS / ACERVO VIVO` em todos os sete viewports. O script visitou/rolou a página antes das capturas para permitir lazy-loading, conferiu as seis fotografias do acervo, links e modo de apresentação.

| CSS px | HTTP | ScrollWidth | Clipping de elementos editoriais | Fotos quebradas | Etiquetas sobre legendas |
| --- | --- | --- | --- | --- | --- |
| 320 | 200 | 320 | 0 | 0/6 | 0 |
| 360 | 200 | 360 | 0 | 0/6 | 0 |
| 390 | 200 | 390 | 0 | 0/6 | 0 |
| 430 | 200 | 430 | 0 | 0/6 | 0 |
| 768 | 200 | 768 | 0 | 0/6 | 0 |
| 1024 | 200 | 1024 | 0 | 0/6 | 0 |
| 1440 | 200 | 1440 | 0 | 0/6 | 0 |

**Interação no Chrome:** skip-link `#conteudo` recebe o primeiro Tab; seis cartões apontam para os links reais dos ensaios; modo `Grade` ativa `aria-pressed=true` e retorno para `Composição` restaura `aria-pressed=true`; `/admin/studio` HTTP 200 e preset `Colagem autoral` selecionado; formulário de contato presente. Não foram encontrados `pageerror`, `console.error` ou requisições falhadas na rodada final.

## NC-VIS-002 — regressão reproduzida e corrigida

O recorte complementar do retrato de Maria ainda extrapolava a borda esquerda em 360, 390 e 430 px (até ~10px) na execução inicial, embora a página tivesse `scrollWidth == viewport`. A regra de media query já determinava `left: 1.25rem`, mas perdia para a regra base de maior especificidade `.manifesto-editorial-image .collage-portrait-detail`. A correção foi elevar a especificidade da regra mobile para **a mesma cadeia de classes**, mantendo o recorte dentro da tela.

O contrato `scripts/collage-css.test.mjs` foi atualizado em RED/GREEN para exigir essa cadeia. A nova rodada Chrome confirmou **0 ocorrências de clipping** nos sete viewports, não apenas ausência de overflow horizontal global. Aprendizado: testes estáticos de CSS não comprovam estilo computado; usar navegador real e geometria dos elementos para QA.

## Suite executada após a correção

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | PASS — 27 arquivos e **113/113 testes** |
| `npx vitest run --config vitest.collage.config.ts` | PASS — **5/5 testes SSR** |
| `node --test scripts/collage-css.test.mjs` | PASS — **8/8 contratos CSS** |
| `npm run build` | PASS — Vinext/Vite, cinco etapas |
| `git diff --check` | PASS |

O build exibiu avisos não bloqueantes do toolchain Vinext/RSC sobre mapas de origem (`SOURCEMAP_BROKEN`) e detecção estática das rotas. Não confundir esses avisos com erros de compilação.

## Capturas pós-correção

Screenshots selecionados e comprimidos em WebP, capturados pelo Chrome local:

- `screenshots/2026-10-26-v2/stories-mobile-390.webp` — masthead + seis ensaios mobile
- `screenshots/2026-10-26-v2/about-mobile-390.webp` — retrato em camadas sem corte lateral
- `screenshots/2026-10-26-v2/thesis-mobile-390.webp` — manifesto tipográfico
- `screenshots/2026-10-26-v2/stories-desktop-1440.webp` — composição em 12 colunas
- `screenshots/2026-10-26-v2/about-desktop-1440.webp` — composição editorial desktop
- `screenshots/2026-10-26-v2/studio-mobile-390.webp` — preset ativo no Studio

As imagens são provas técnicas do estado local da branch; não contêm dados de álbuns privados. Recursos de produção **não** foram modificados.

Para evitar um artefato de captura do Playwright que reprojetava o skip-link fixo (já deslocado para fora da tela) dentro do recorte de screenshot de uma seção, o **harness de screenshots** aplicou `.skip-link:not(:focus){visibility:hidden!important}` somente no navegador de QA. O CSS de produção **não** foi modificado por essa estabilização; o teste separado do teclado confirma que o link continua recebendo o primeiro foco normalmente.

## Limites explícitos de homologação

- Não equivale a inspeção em aparelhos físicos, Safari iOS, TalkBack/VoiceOver ou zoom nativo.
- Não substitui verificação curatorial pela Maria nem testes de contraste de todos os estados, performance Web Vitals de campo e fluxos completos de versão/histórico do Studio.
- Não cobre a integração com PR #13 nem testes OTP/JWT reais do Cloudflare Access.
- A conclusão deste QA é **PASS para a amostra local Chrome da colagem**, mas **NO-GO para merge/deploy e DoD-A global** até concluir os gates restantes.
