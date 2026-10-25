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
- **Revisão independente:** foi realizada por segundo agente em modo leitura. Três achados importantes corrigidos, mas não foi executada segunda revisão completa após correções; cobertura por regressão e CI documentada.

**NO-GO continua:** validação visual da Maria, navegação em 320–430 px, browser screenshots, zoom 200%, acesso por teclado/leitor de tela, performance e prévia/restore no Studio devem ser verificados antes de merge e deploy. A PR deve permanecer draft.
