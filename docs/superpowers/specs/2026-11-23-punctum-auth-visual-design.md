# Punctum Picture | Redesign da autenticação do cliente

**Data:** 2026-11-23
**Goal:** \`PUNCTUM-AUTH-VISUAL-001\`
**Status:** Proposta de design, aguardando revisão editorial; nenhuma implementação ou autorização de produção.
**Evidência da solicitação:** captura Android da rota de entrada de álbuns enviada pelo responsável em 23/11: página creme com bloco "O que fica, é seu", instruções 01–03 e botão "Entrar com Clerk".
**Referências de implementação:** \`docs/visual-qa/ESPECIFICACAO-FINAL.md\`, \`docs/superpowers/specs/2026-10-22-punctum-client-albums-design.md\` e \`docs/superpowers/plans/2026-11-23-punctum-album-templates.md\`.

## Intenção, prioridade e problema

A rota \`/albuns/entrar\` deve parecer parte do mesmo site fotográfico público, e não um produto editorial separado. A especificação visual atual define roxo profundo, tipografia Instrument Serif / Manrope, fotografia real e tema \`nocturne-plum\`; a superfície \`.private-albums\` usa \`--pa-bg:#f4efe7\` e um layout extenso e bege. O login é o ponto de entrada para clientes: deve indicar com clareza como abrir os álbuns e conservar privacidade.

A captura de 23/11 substitui a aceitação estética implícita da página creme para **a tela de autenticação**. Não constitui autorização para mudar temas personalizados das galerias \`noir/ivory/warm\`, os cinco layouts, o site público ou os modos de autenticação.

## Objetivos e não objetivos

**Objetivos:** paridade visual com o tema público efetivamente publicado no Studio; foco mobile, acesso rápido ao botão principal; identidade fotográfica com mídia pública já presente no repositório; cópia sem jargão Clerk para clientes; estados acessíveis para senha e Clerk; sem regressão funcional ou de privacidade.

**Não objetivos:** alterar autenticação/autorização, cookies, JWT, sessões, vínculos Clerk/D1, roteamento de retorno ou APIs; redesenhar templates de álbuns; criar novo sistema de tema; publicar mudanças; criar imagens, contratos, provedores ou dependências novas; expor mídia privada na página pública de entrada.

## Abordagens avaliadas

1. **Somente sobrescrever CSS com cores fixas:** baixo custo, mas continua divergindo do Studio caso a identidade publicada mude.
2. **Reutilizar os tokens de \`SiteThemeRoot\` e o \`loadPublicSiteConfig\` na página de entrada (proposta escolhida):** preserva paridade com a identidade pública, mantém o backend intacto e permite fallback para \`PUNCTUM_DEFAULT_SITE_CONFIG\` em teste isolado; exige cuidado com efeitos de \`.site-shell\` e escopo de CSS.
3. **Substituir por formulário de login proprietário ou hospedado:** descartada; reimplementaria segurança desnecessariamente e quebraria a integração Clerk.

## Contrato de apresentação proposto

- **Layout desktop ≥900 px:** dois painéis. Área funcional à esquerda, imagem fotográfica pública do acervo à direita, sem parallax obrigatório. A imagem default autorizada como fallback visual é \`/photos/p002.jpg\` conforme especificação da home; não utilizar fotografia privada nem escolher foto "real" via rota autenticada.
- **Mobile 320–430 px:** cabeçalho discreto com marca existente, foto em faixa compacta ou composição lateral recortada; título, ação de entrar e mensagem de ajuda aparecem próximos do topo, sem exigir percorrer passos enumerados e assinatura ornamental. Preservar \`safe-area-inset\` e teclado.
- **Tokens e tipos:** derivar CSS variables de \`siteThemeRootProps(config)\`, resolvidas da configuração pública publicada pelo Studio. Fallback \`nocturne-plum\` (fundo \`#120a17\`, foreground \`#f6eef8\`, primary \`#e0c8eb\`, muted \`#baa4c2\`) e títulos Instrument Serif/corpo Manrope. Não substituir identidade customizada salva no Studio com defaults.
- **Escopo:** composição só para \`/albuns/entrar\` e \`/albuns/trocar-senha\`; preservar \`.pa-themed\`, galeria, visualizador, downloads, templates e CSS das demais rotas. Não adicionar \`GalleryCursor\` ou efeitos da home na autenticação.
- **Texto proposto:** título "Suas fotografias, só suas."; descrição "Entre para acessar seus álbuns privados."; CTA deslogado "Entrar nos meus álbuns"; CTA logado "Abrir meus álbuns"; status "Conta conectada"; ação "Trocar conta". Não usar a palavra Clerk na interface para o cliente, nem prometer recuperação por e-mail indisponível.
- **Autenticação:** manter \`SignInButton mode="modal"\`, \`ClerkProvider\`, troca \`POST /api/client/clerk-session\`, logout \`DELETE /api/client/session\` seguido de \`signOut\`, \`CLIENT_AUTH_MODE\`, \`CLERK_AUTH_ENABLED\`, troca de senha e variantes legadas. Skin do modal Clerk só via API de aparência compatível com a versão instalada; se houver incompatibilidade, manter modal padrão com fluxo funcional.
- **Admin \`/acesso\`:** auditar coerência visual e nomenclatura, mas não reestruturar o painel administrativo neste incremento. Ajustes pequenos de texto podem ser separados e jamais devem misturar identidades de cliente e administrador.

## Acessibilidade e privacidade

Um único \`h1\`; foco visível e retorno de foco do modal; controles com alvo ≥44×44 px, altura do CTA ≥48 px; leitura 200%, zoom 200%, TalkBack/VoiceOver em aprovação externa; contraste mínimo WCAG AA; foto decorativa com \`alt=""\`; respeitar \`prefers-reduced-motion\`; sem rolagem horizontal em 320, 360, 390, 430, 768, 1024, 1440 px. \`noindex\` de login e \`Cache-Control: private, no-store\` de conteúdos privados permanecem inalterados. Nunca mover media privadas para \`public/\`.

## Critérios de aceite e operações

1. Capturas de login mobile/desktop e comparação lado a lado com home publicada no mesmo preset, incluindo tema escuro, textos e foto.
2. Cenários sem Clerk, somente Clerk, híbrido e troca obrigatória de senha funcionam com URLs/retornos originais; mensagens de erro não expõem detalhes internos.
3. Modal não corta campos com teclado aberto nem impede foco; botões e legenda legíveis; modo reduzido sem animações excessivas.
4. Templates/temas de galeria intactos; não ampliar permissões nem alterar flags, contratos e endpoints.
5. QA local, E2E sintético, build e revisão independentes registrados com SHA. Gate R4 \`PRODUCTION_NO_GO\` permanece vigente. Sem deploy, merge, alteração DNS, Hostinger, Clerk Production, D1/R2 remoto ou migração.

**Decisão editorial pendente:** a composição e os textos acima são propostas de implementação, não aprovação da fotógrafa ou autorização de produção.
