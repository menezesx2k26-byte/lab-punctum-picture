# Browser e acessibilidade — estado em 27/10/2026

A matriz de 320, 360, 375, 390, 430, 768, 1024 e 1440 px ainda não foi executada na integração atual. Não há capturas atuais, validação de foco no navegador nem testes em TalkBack/VoiceOver reais. Testes de componentes/contratos CSS não substituem esses ensaios.

Tentativa de viabilizar navegador local gratuito: Playwright CLI 1.64.1 respondeu à versão; instalação do Chromium Headless Shell falhou porque o URL do ZIP retornou conteúdo que não era ZIP. HEAD diagnóstico retornou HTTP 200, Content-Type text/html e Content-Length 195. A tentativa foi interrompida; nenhum browser foi instalado ou sessão visual executada. Nenhum navegador cobrado por minutos foi contratado. Não houve tentativa de obter OTP por e-mail/API ou pelo chat.

Próxima ação segura: disponibilizar binário Chromium verificável ou navegador local conectado sem custo adicional, iniciar QA local com fixtures sintéticas e executar a matriz responsiva, teclado, foco/retorno, erros JS/rede, 200% de zoom e reduced motion. Dispositivos reais seguem um gate separado. Estado G13–G15: BLOCKED_EXTERNAL.

## Atualização incremental Argon R4 — Execução Real em Headless Chromium (2026-10-27)

- **Ambiente real executado**: Chromium headless local via `playwright-cli` contra o servidor real (`PRIVATE_GALLERIES_ENABLED=true CLIENT_AUTH_MODE=password npm run dev` em `http://localhost:3000` com D1 local migrado `0001`–`0009`).
- **Viewports testados (`8/8`)**: `320`, `360`, `375`, `390`, `430`, `768`, `1024`, `1440` px.
- **Telas auditadas (`9/9`)**: `admin-clientes`, `admin-albuns-privados`, `admin-album-privado-editor`, `client-login`, `client-trocar-senha`, `client-library-empty`, `client-library-populated`, `client-private-gallery`, `client-photo-viewer-modal`.
- **Correções CSS/acessibilidade aplicadas (RED → GREEN)**:
  - `app/albuns/albuns.css`: ajuste de `h1` fluido (`clamp(38px, 8vw, 112px)` + `overflow-wrap: break-word`), `flex-wrap: wrap` em `.pa-header`, `.pa-header nav`, `.pa-entry-footer`, `.pa-section-heading` e `.pa-viewer-toolbar`, e alvos de toque mínimos `>= 44x44 px` em `.pa-wordmark`, `.pa-entry-footer a`, `.pa-header nav a/button` e `.pa-viewer button/a`.
  - `app/admin/components/private-gallery-admin.css`: `min-height: 44px` em `input`, `select`, `textarea`, `.pga-checkbox` e `min-width: 44px; min-height: 44px` em `.pga button, .pga .button, .pga a`.
- **Resultado medido no DOM/Chromium**:
  - `overflowFailures`: `[]` (`0` falhas em todos os 8 viewports e 9 telas; `scrollWidth <= clientWidth`).
  - `touchTargetFailures`: `[]` (`0` falhas; todos os controles interativos `>= 44 px`).
  - `unlabeledInputFailures`: `[]` (`0` inputs sem `<label>` ou `aria-label`).
  - Navegação por teclado no `PhotoViewer`: `ArrowRight` (`retrato-01.png` → `retrato-02.png`), `ArrowLeft` (`retrato-02.png` → `retrato-01.png`), toggle de favorita (`aria-pressed: "false"` → `"true"`), `Escape` fecha o modal (`dialog.pa-viewer[open]` count `0`).
  - `prefers-reduced-motion: reduce`: ativo e respeitado.
- **Limite residual honesto**: `G13: PASS` (browser Chromium real local); `G14: PARTIAL` (`PASS` em emulação real Chromium nos viewports `320`–`1440` px; pendente validação em dispositivo físico iOS Safari / Android Chrome).
