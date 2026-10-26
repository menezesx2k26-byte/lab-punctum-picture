# Punctum Picture — Colagem Autoral Mobile-First

Status: **APROVADO para implementação** por Gab em 2026-10-24; **NÃO autorizado para merge ou deploy**. A curadoria final de Maria e a homologação mobile permanecem pendentes.

## Direção visual

Referências: dez pôsteres editoriais/colagens enviados no chat (papel rasgado, foto em recortes, tipografia expressiva, fita e halftone); mockup de homepage aprovado como direção, **não** como fonte de textos, imagens ou layout literal. Pedido específico de Maria: roxo, amarelo e branco. As referências de terceiros nunca entram no bundle.

Escolha: **camada original de colagem mobile-first apenas na home**, mantendo páginas de ensaios, portfólio e álbuns privados mais sóbrias. O trabalho não é redesign de autenticação.

Paleta gráfica isolada: roxo `#422079`, amarelo `#FFE43B`, papel `#F7F4EF`, tinta `#18131E`. Fotografia autoral sem filtros. Destaques podem receber moldura recortada, fita e papel, porém continuam sendo imagens reais de Maria e links verdadeiros para os ensaios. Nenhuma imagem ou pessoa das referências é reutilizada.

## Arquitetura

- `app/page.tsx` continua servindo os dados existentes e SEO.
- `app/components/HomeExperience.tsx` importa `app/collage-home.css` depois da camada imersiva e é a única superfície visual estilizada; seletor estrito `.site-shell.immersive-home[data-theme-preset="colagem-autoral"]`.
- `shared/config/preset-ids.ts` + `preset-registry.ts`: preset allowlisted `colagem-autoral`. O Studio continua o editor de textos, imagens e ordem.
- `featured-work:collage` já estava no catálogo; não criar page builder nem outra biblioteca.
- `shared/config/immersive-policy.ts` preserva hero `cinematic` e reel `horizontal` (3D).
- Troca de presets deve preservar `heroMedia`, `photoIds`, `itemCount`, ordem, IDs, copy, seções desativadas e contratos de configuração. Retornar ao preset antigo não pode perder o acervo.
- D1, R2, Workers, APIs, sessões e álbuns privados permanecem sem alterações.

## Mobile first

Primeiro 320–430 px: header compacto em duas linhas, links visíveis e controles de pelo menos 48 px; colagens em coluna única, grandes títulos com quebra segura, fotografias com proporção e cor preservadas. Em >=768 px, duas colunas e navegação horizontal; em >=1120 px, até três colunas.

Critérios: sem overflow horizontal, safe areas, zoom 200%, teclado e leitor de tela operáveis, `prefers-reduced-motion` respeitado. Contraste AA para os pares de texto/fundo e CTA. Nenhum elemento ornamental intercepta pointer events ou gestos da lente/carrossel.

Metas de performance a verificar em preview e dispositivo real: LCP p75 <=2,5 s; CLS <=0,1; INP <=200 ms. Não declarar os alvos atingidos por CI.

## Limites de segurança e publicação

Este design é separado da [PR #13 de autenticação](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/13), em [PR de design #14](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/14). Não mergear, publicar, comprar planos, alterar D1/R2 ou ativar identidade privada nesta atividade. OTP real e QA dos álbuns continuam bloqueios independentes.

## Escolha e alternativas rejeitadas

Escolhida: camada editorial modular em preset existente, reversível no Studio. Rejeitadas: rebuild completo do site (risco à lente/3D/Studio), imagem raster única (SEO, responsividade e acessibilidade), referência de terceiros como asset (direitos e identidade). Foco em fotografia e conversão, não em um site genérico de designer.
