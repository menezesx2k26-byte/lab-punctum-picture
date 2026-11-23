# Punctum: templates clicáveis do site e dos álbuns
**Data:** 2026-11-23. **Escopo:** melhoria isolada em PR draft sobre o candidato R4, não uma ativação.

## Motivação e estado reutilizado
Maria deve escolher layouts prontos sem editor livre. O Studio **já** possui sete presets allowlisted em `shared/config/preset-registry.ts`, com seleção no `StudioStylePanel`, preview e preservação de mídia/ordem. Não duplicar esse mecanismo. A experiência R4 de cliente tinha apenas tema de cores, e a visualização de fotos era uma grade fixa de colunas.

## Abordagens avaliadas
1. Duplicar a infraestrutura do Studio e criar um page builder por álbum: descartado, aumenta risco, custo e escopo.
2. Gerar HTML/CSS arbitrário por álbum: descartado, amplia superfície de ataque e dificulta QA.
3. **Escolhida:** cinco presets estáticos de composição, persistidos por um ID allowlisted em D1; só CSS e ordem visual de exibição. A configuração de tema continua independente.

## Contrato
- Site: conservar os sete presets, dar clareza a "Templates do site" e usar o preview já existente; nenhuma alteração em publicação/Studio/editorial.
- Álbum privado: cinco escolhas, **Clássico** (legado/default), **Editorial**, **Colagem**, **Mosaico** e **Cinema**, com miniaturas CSS; selecionáveis tanto ao criar quanto ao editar.
- `layoutPreset` é um ID permitido validado no servidor, nunca HTML/CSS fornecido pelo usuário.
- Trocar template não toca fotos, originais, chaves R2, favoritismo, capa, sequência D1, download, `clientId`, publicação, status, cookies, JWT ou sessão. A autorização continua em `requireAdmin` e `requireClient`; revogação existente não muda.
- Migração aditiva `0016_private_gallery_layout_presets.sql`, default `classico`; cliente antigo mantém aparência existente.
- Em `PrivateGallery`, CSS só afeta disposição dos `figure` após GET autorizado. URLs de fotos continuam restritas; imagens nunca passam pelo otimizador público.
- A miniatura do admin é sintética, não utiliza fotos privadas nem carrega mídia externa. Teclado com `button`, `aria-pressed`, grupo rotulado, contraste/foco e redução de movimento.
- Mobile responsivo: 320–1440 px, sem recorte dos originais. Leitor de tela e testes reais continuam sujeitos ao gate G15.

## Não objetivos
Editor livre, novos dados de clientes, modelos por pagamento, alteração de infraestrutura, seleção de arquivos/reordenação física, publicação do site, merge, deploy, DNS, ativação R4 e aprovação retroativa de gates.

## Aceite técnico
- Testes verificam IDs exatos, fallback seguro, validação, persistência GET/PATCH, ausência de mutação de permissões/status, regressões.
- Typecheck, lint, tests, build e CI no SHA final.
- QA visual de cartões e dos cinco layouts em navegador e dispositivos, incluindo estados vazios/favoritos/download e acessibilidade; isso não equivale à homologação física G15.
- Sem migração remota, autorização ou promessas de produção; DoD principal G01–G24 e estado NO_GO permanecem intocados.
