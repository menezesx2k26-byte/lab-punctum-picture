# Punctum Picture — revisão editorial guiada pelas nove referências — 26/10/2026

**Branch:** `design/punctum-collage-mobile-20261024` (PR #14, draft). **Ambiente:** clone isolado, D1 local. **Produção:** intocada.

## Diagnóstico visual

A primeira versão de `colagem-autoral` já tinha roxo/amarelo, fita e cartões, mas funcionava sobretudo como uma galeria de polaroids. As nove referências enviadas apontam para outra direção: páginas de fanzine/poster editorial em que letras, fotografias e recortes **constróem uma composição única**, com contraste forte, recortes fragmentados, ritmo assimétrico, registros de impressão, números de edição e frases em escalas muito diferentes.

## Decisões implementadas

- **Masthead editorial verdadeiro:** `ESTUDOS DO OLHAR`, com placa vermelho-sinal e preto/papel, numeração dinâmica da quantidade de ensaios; não usa imagens de referência de terceiros.
- **Contato fotográfico vivo:** grid assimétrico (uma coluna até 359 px, duas a partir de 360 px, 12 colunas a partir de 768 px), cartões deslocados por ritmo editorial, carimbos de acervo e fitas contidas; os ensaios continuam links reais, com suas fotografias originais **sem corte forçado**.
- **Manifesto impresso:** escalas tipográficas mais radicais, linha editorial e assinatura gráfica em cor vermelha; copy vem do Studio, não de texto externo sem confirmação da autora.
- **Retrato em camadas:** fotografia integral da Maria permanece intacta, com recorte decorativo separado preto-e-branco em papel e pequena marca tipográfica. O recorte tem `alt=""` e `aria-hidden`, evitando duplicidade na leitura assistiva.
- **Materialidade:** grão CSS leve, textura impressa, pequenas rotações e contraste de cores em **overlays não clicáveis**; nenhum pacote de imagens externas, fontes extras, biblioteca de efeitos ou foto inventada.
- **Brand guardrails:** roxo `#422079`, amarelo `#ffe43b`, preto e papel seguem presentes; vermelho-sinal `#bd2531` é um acento editorial no preset, não uma mudança global em todos os estilos.
- **Preservação:** LensHero, SpatialCarousel, autenticação, D1/R2, originais, outras opções de Studio, metadados editoriais e aplicações administrativas continuam fora do escopo visual.

## Verificação

Durante o desenvolvimento foram adicionadas verificações SSR para contagem real dos ensaios e marcadores de página, além de verificações CSS para layout, texturas não interativas, preservação do formato da fotografia e posicionamento seguro das etiquetas. A correção de uma etiqueta que cobria o título foi testada pelo ciclo RED/GREEN.

Na primeira inspeção com Chrome local, após scroll para carregar imagens lazy, a home respondeu HTTP 200 com `colagem-autoral`, seis ensaios e sem overflow global em 320, 390, 768 e 1440 px. No viewport de 390 px, o detalhe decorativo de retrato ultrapassava 6 px da borda da tela; o CSS foi ajustado especificamente para `max-width:767px`.

**Pendências não implícitas no PASS:** aprovação estética/curadoria da Maria; aparelhos físicos e leitores de tela; zoom nativo; preview real das PRs #13 e #14 integradas, OTP de Access e publicação. A implementação segue **NO-GO para deploy**.
