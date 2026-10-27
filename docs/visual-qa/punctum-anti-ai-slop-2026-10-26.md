# Punctum Picture — revisão Anti AI-Slop da Colagem Autoral

**Escopo:** acabamento da home do preset `colagem-autoral`, após ativação pública em 26/10/2026. O acervo, as fotos originais, a configuração editorial já publicada, o Studio, D1/R2, segurança e PR #13 ficam fora de escopo.

## Problema observado

A colagem já possuía linguagem editorial, mas havia **ornamentação sem função**: estrelas repetidas no manifesto, no heading de ensaios e no masthead; carimbo idêntico `arquivo autoral ✳` em todas as fotografias; mesma fita em todos os cartões; títulos inventados `ESTUDOS DO OLHAR`, `CADERNO VISUAL // 01`, `RETRATO / EM PROCESSO`, `FOTOGRAFIA EM CAMADAS`, `P / P`; e localização fixa de Joinville/Curitiba em um cartão de ensaio no modo Grade, independentemente dos metadados. A tipografia no heading de ensaios fragmentava palavras em 320 px.

## Critério editorial aplicado

- **Menos adjetivos, mais autoria:** masthead identifica Punctum Picture e Maria Helena; número de ensaios deriva do array real. Não criar narrativas fictícias para fotografias.
- **Fotografias primeiro:** eliminar selos repetitivos sobre imagens; manter uma fita pontual na primeira fotografia e numeração funcional dos cartões.
- **Metadados reais:** indicar cidade/região apenas se `album.location` tiver valor. Não mostrar legendas vazias quando faltarem categorias.
- **Assimetria com intenção:** manter grade móvel 1/2/12 colunas, pequenas rotações, textura leve e acento vermelho, sem salpicar estrelas em cada superfície.
- **Retrato da autora:** manter o original em cores e uma ampliação decorativa com `alt=""`; trocar rótulo impessoal pelo nome da fotógrafa e remover a cartela “FOTOGRAFIA EM CAMADAS”.
- **Texto do Studio não é texto genérico a reescrever à força:** não modificar depoimentos, títulos de ensaios ou textos editoriais cadastrados pela fotógrafa. Alterar apenas microcopy fixa comprovadamente genérica/inventada.
- **Tamanho pequeno exige palavras inteiras:** reduzir só o título de trabalhos no mobile estreito, sem quebrar “ALGUNS” ou “ENSAIOS” no meio.

## Validação

Os testes de componente SSR verificam links e fotografias reais, localização condicional, ausência de ornamentos repetidos, numeração e seletores alternativos; contratos CSS asseguram preservação dos originais, superfícies de contraste e tipografia mobile.

**QA executado:** 114/114 testes gerais, 7/7 SSR colagem, 9/9 contratos CSS, TypeScript, lint e build PASS. Chrome Playwright local em 320, 360, 390, 430, 768, 1024 e 1440 px: HTTP 200; `scrollWidth` igual ao viewport; zero clipping, imagens quebradas ou sobreposição de etiquetas com legendas. A alternância Grade/Composição e entrada no Studio também passaram na execução isolada. Uma corrida inicial do navegador junto ao build acusou falha transitória do seletor Grade; a execução isolada com o build encerrado confirmou o fluxo, sem mudanças de JavaScript necessárias.

**Capturas de evidência (Chrome local após correção):**

- `screenshots/2026-10-26-anti-ai-slop/ensaios-320.webp`
- `screenshots/2026-10-26-anti-ai-slop/ensaios-390.webp`
- `screenshots/2026-10-26-anti-ai-slop/ensaios-1440.webp`
- `screenshots/2026-10-26-anti-ai-slop/sobre-390.webp`

O teste local usou fotos de álbuns públicos. Não houve acesso a dados de álbuns privados ou modificação do banco.

## Guardrails de release

Somente alteração de código/estilo da home, por PR e CI. Não disparar `publish-colagem-production.yml` (isso criaria uma nova publicação desnecessária da configuração do Studio); o deploy automático da `main` entrega o refinamento visual mantendo o preset já ativo e o rascunho da Maria intacto.
