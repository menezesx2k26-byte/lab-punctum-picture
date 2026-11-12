# PUNCTUM R4 — ciclo Z (continuação): acessibilidade automatizada e E2E Chromium

**Data:** 10/11/2026 UTC

**Estado:** `LOCAL_VALIDATION_PASS / GLOBAL_DOD_OPEN / NO_GO_PRODUCTION`

**PR:** [#32](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32), aberta, draft, não mergeada
**Branch remota:** `fix/punctum-albums-r4-completion-20261107`
**Base da PR:** `agent/hst-001-hostinger-qa-20261028` (`50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`)

## 1. Baseline e integridade do checkout

- HEAD remoto lido antes deste incremento: `afc88ea0193dcf2fe4758629eaa8f12441c06e0f`.
- Parent remoto: `07a2d15b816b340d62d21792c410139fa2562608`.
- Tree remoto: `167a28442c4e78975ad9e762486ed7db36f6e5ba`.
- HEAD local de validação: `7b91a3cb0c4b99c496db16197c66deafae921b1c`, commit irmão do remoto, mesmo parent e **tree idêntica** `167a28442c4e78975ad9e762486ed7db36f6e5ba`.
- CI do baseline remoto: run `42748530463`, `completed/success`, apenas baseline `afc88ea`; não é CI do novo incremento.
- PR #32 continua `open/draft/unmerged`; sem merge, deploy, migration remota ou publicação.
- O checkout `punctum-r4-cycle-z-20261110` permanece detached e preservado. Não houve `reset`, `rebase`, force-push ou alteração dos outros worktrees.

## 2. Incremento entregue localmente

1. Adicionado `axe-core@4.11.4` somente como `devDependency`; nenhuma dependência runtime nova.
2. O browser E2E injeta axe-core e audita biblioteca privada, detalhe da galeria, lightbox, home pública, Studio, home com Colagem Autoral e editor administrativo privado, usando tags WCAG 2.1 A/AA.
3. O relatório guarda todos os nós de cada `incomplete` sem truncamento, com impacto, HTML, XPath/ancestry, `any/all/none`, `data`, nós relacionados, metadados da regra e erro serializado (`name/message/stack/ruleId/method/cause`). Contagens de regras e nós ficam explícitas; incompletos continuam separados de violações.
4. A cobertura de overflow passou a incluir 640 CSS px. O relatório declara explicitamente que 640 px é proxy de layout responsivo, **não** teste de zoom real a 200%.
5. Testes unitários do relatório axe e do screenshot helper foram incluídos na CI (`node --test scripts/e2e/accessibility-evidence.test.mjs scripts/e2e/screenshot-evidence.test.mjs`). A captura distingue `fullPage`, fallback CDP e fallback de viewport; não declara página inteira quando só há viewport.
6. Os timeouts de quatro testes foram ajustados após a suíte integral revelar limites do runner Linux compartilhado. Nenhuma assertion, limite funcional, payload ou regra de produto foi removida ou afrouxada.
7. O limite do job CI passou de 20 para 60 minutos: o Vitest integral mediu 26m53,81s isoladamente e o E2E Chromium 13m07,89s, antes dos demais passos. O limite anterior encerraria a CI antes de completar o primeiro passo longo.

## 3. Validação local

| Verificação | Resultado observado |
|---|---:|
| Vitest integral | **59/59 arquivos; 292/292 testes PASS**, exit 0; 1.613,81 s |
| Rerun serial dos quatro arquivos anteriormente afetados por timeout | **4/4 arquivos; 8/8 testes PASS**, 273,51 s |
| Node R4 read-only / screenshot / recovery | **58/58 PASS** |
| Vitest Colagem Autoral | **1/1 arquivo; 7/7 PASS** |
| SSR route imports | **1/1 PASS** |
| Access cookie navigation | **1/1 PASS** com `CHROMIUM_EXECUTABLE=/home/desktop/.local/bin/google-chrome` |
| Axe diagnostics + screenshot fallback unit tests | **5/5 PASS** |
| TypeScript | PASS (`tsc --noEmit`) |
| ESLint | PASS (`eslint .`) |
| npm audit | **0 vulnerabilities** (`--audit-level=low`) |
| Build Vinext | PASS, cinco ambientes/estágios concluídos |
| `git diff --check` | PASS |

Os quatro testes rerodados mediram aproximadamente 27,3 s (admin audit), 63,1 s (client pilot), 27,9 s (site-media fixture) e 76,4 s (fallback PBKDF2 de 310.000 iterações). Os limites foram elevados para 60/180/90/180 s conforme cada caso; o caminho de rejeição de 25 MiB em `site-media` também recebeu 60 s. O primeiro `access-cookie-navigation` sem variável de executável falhou porque o cache Playwright não tinha `chromium_headless_shell`; repetido com o Chrome 157 instalado, passou 1/1. A falha inicial de ambiente não foi ocultada.

O Vitest integral imprimiu exceções `workerd ... disconnected: pump canceled` durante o encerramento de alguns pools, mas terminou com exit 0 e 292/292 PASS. O build também emitiu avisos já conhecidos de `configLoader: native`, sourcemaps dos plugins RSC e classificação estática de rotas dinâmicas; não foram erros de build.

## 4. Browser E2E e acessibilidade

**Resultado:** `PASS_LOCAL` em Chromium `157.0.8103.38`, contra o bundle de produção em `workerd` local e D1/R2 recém-criados com dados sintéticos. Execução: `2026-11-10T17:20:03.799Z`–`2026-11-10T17:33:11.684Z` (**13m07,89s**). Foram executados 21 checks. O cenário criou dois clientes fictícios, dois álbuns e dez PNGs gerados; validou isolamento A/B, negação de acesso anônimo, favoritos, navegação por teclado, Escape, restauração do foco, bytes do download, nove larguras responsivas, upload administrativo, restart, rollback local e revogação de sessão.

| Superfície auditada | Regras axe aprovadas | Regras incomplete | Nós incomplete | Violações |
|---|---:|---:|---:|---:|
| Biblioteca privada | 17 | 0 | 0 | 0 |
| Detalhe da galeria privada | 17 | 1 | 10 | 0 |
| Lightbox | 12 | 0 | 0 | 0 |
| Home pública | 26 | 1 | 50 | 0 |
| Studio | 25 | 0 | 0 | 0 |
| Home pública com Colagem Autoral | 26 | 1 | 57 | 0 |
| Editor administrativo privado | 22 | 0 | 0 | 0 |
| **Total** | **145** | **3** | **117** | **0** |

As três regras `incomplete` são do rule `color-contrast`, com 117 nós e 117 mensagens de verificação preservados no relatório; não são violações:

- **Detalhe privado:** o axe não mede botões/links cujo conteúdo é apenas glifo. A inspeção manual confirmou as cores declaradas em `app/albuns/albuns.css`: `#665d59` sobre `#f4efe7` = **5,60:1**; `#242022` sobre `#f4efe7` = **14,06:1**. Ambos superam 4,5:1 para texto e 3:1 para componente/ícone.
- **Home pública:** 50 nós (`imgNode=12`, `bgGradient=37`, `bgOverlap=1`) e 51 elementos de fundo relacionados. O axe não consegue determinar o contraste sobre imagens, gradientes e sobreposições.
- **Home com Colagem Autoral:** 57 nós (`imgNode=11`, `bgGradient=13`, `pseudoContent=32`, `bgOverlap=1`) e 56 elementos relacionados. Conteúdo pseudo gerado, gradientes e imagens continuam como candidatos de revisão manual.

O screenshot local mostra texto claro sobre fotografia escura com scrim, mas isso não substitui revisão manual por imagem editorial/variação de publicação. Os 107 elementos relacionados apontam os fundos que precisam ser considerados nessa revisão.

`pageErrors`, `consoleWarnings`, `consoleErrors` e `serverErrors` ficaram vazios; armazenamento temporário foi removido. `private-gallery-mobile.png`, `colagem-mobile.png` e `private-admin-mobile.png` foram `fullPage`; `public-home.png` foi `viewportFallback` (1280×900) e `studio.png` foi `cdpViewportFallback` (1280×900). Os dois últimos são capturas de viewport, não full-page.

SHA-256 do relatório local `outputs/browser-e2e/report.json`: `2aa7761aeaf4e504409a1a0c9e222197d18aec52fc72d0dec8078539b63d0958`.
SHA-256 dos screenshots:

- `private-gallery-mobile.png`: `7ad5de887068a8d436a0d69bfa8be4f31b74a4bec7a2c5cf4a4ed8bef08bba28`
- `public-home.png`: `9c83eb0140a3786cdf5f9db98559adb547a020b7d7833625c36bf267b661769e`
- `studio.png`: `fba8d9f81c7718012d70e4b79e7e90b20d30cc6e2591816e1d1bca69a7125415`
- `colagem-mobile.png`: `dade0095171626a293ec9f7b72c5ac01f4943e73986605f2cb87bc9836f52612`
- `private-admin-mobile.png`: `cfa1b58be421abb3b5a40e2a57886d68a00ed29dc36f2756d3265e798146d2da`

O relatório foi produzido com árvore local suja e commit irmão (`sourceSha=7b91a3c...`, `checkoutDirtyAtRun=true`); o hash do bundle foi `9b2539e9602f063a06ff5a2e3810b5da90328834d8b59fe03bc2f7f8a3d3b89e`. O E2E usou a versão do helper carregada no início da execução; a serialização recursiva de `RuleError.cause` foi coberta depois pelo teste unitário 5/5. O workflow do novo SHA ainda deve reproduzir o E2E depois do push.

## 5. Limites de evidência e gates canônicos

- **G05 permanece FAIL:** a especificação original exige 25 MiB = 26.214.400 bytes; o Cloudflare Images Binding limita `.input()` a 20 MB. A guarda privada de 20.000.000 bytes permanece fail-closed. A investigação oficial registrada no [relatório 34](./34-images-input-limit-2026-11-08.md) confirmou que `cf.image` remoto aceita 100 MB e o plano Free inclui 5.000 transformações, mas o fluxo de origem autenticada usa `origin-auth=share-publicly` e cache compartilhado, incompatível com privacidade por cliente sem isolamento adicional comprovado. `.info()` é gratuito, mas não prova decodificação raster integral. O plano/uso atual da conta não foi verificado; nenhuma arquitetura segura de 25 MiB com custo incremental zero foi comprovada.
- **Decisão externa de G05:** manter 25 MiB e autorizar experimento em QA segregado com isolamento privado de cache comprovado após confirmar plano/uso da conta; ou aprovar formalmente o limite de produto de 20.000.000 bytes. Até a decisão e homologação, G05 continua FAIL.
- **G17 permanece FAIL:** não houve medição Cloudflare Workers Free do cold cache MISS/purge com `cpuTimeP95 <= 10 ms`. Perfil local/workerd e cache HIT não qualificam o gate.
- **G15 permanece BLOCKED_EXTERNAL:** axe/Chromium local não substituem OTP Cloudflare real, TalkBack/VoiceOver, zoom real a 200% e testes em dispositivos físicos.
- **G19, G20, G22 e G23 permanecem BLOCKED_EXTERNAL**, conforme matriz canônica. Não declarar aprovação independente de segurança, controladora do Studio, release ou rollback remoto.
- Contagens canônicas continuam históricas: 17 PASS, 2 FAIL, 5 BLOCKED_EXTERNAL. Nenhum gate global foi promovido por esta execução local.

## 6. Segurança operacional, custo e próximos passos

- Custo incremental autorizado: **R$ 0,00**.
- `remoteQaTouched=false`, `productionTouched=false`, `cloudflareAccessOtpTested=false`; nenhuma escrita Cloudflare, D1/R2/Images remoto, migration, alteração de flag ou deploy foi executada.
- `PRIVATE_GALLERIES_ENABLED=false` permanece na configuração versionada; produção segue `NO_GO_PRODUCTION`.
- PR #32 continua draft/open/unmerged. O run `42748530463` é somente baseline do SHA `afc88ea`; a CI do novo SHA precisa ser consultada após o push exato.
- O job CI tem agora `timeout-minutes: 60`, dimensionado para os tempos observados do Vitest integral e do E2E; a confirmação final depende da execução remota no novo SHA.
- A cópia do checkpoint Drive ciclo Z será completada com o SHA final, CI e readback após o push. Não há conectores Engram/PersistFlow disponíveis nesta sessão; não afirmar persistência nesses sistemas.
- O arquivo literal `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` não foi encontrado no checkout, Drive ou Library. O design e o plano de implementação de 22/10/2026 preservados na Library corroboram o limite original de 25 MiB e os requisitos de isolamento.

**Decisão:** incremento local de acessibilidade/QA validado e pronto para versionamento. Não é homologação global nem autorização de merge, deploy, rollout ou liberação de álbuns privados.
