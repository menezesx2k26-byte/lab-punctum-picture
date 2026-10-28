# Browser e acessibilidade — estado em 27/10/2026

A matriz de 320, 360, 375, 390, 430, 768, 1024 e 1440 px ainda não foi executada na integração atual. Não há capturas atuais, validação de foco no navegador nem testes em TalkBack/VoiceOver reais. Testes de componentes/contratos CSS não substituem esses ensaios.

Tentativa de viabilizar navegador local gratuito: Playwright CLI 1.64.1 respondeu à versão; instalação do Chromium Headless Shell falhou porque o URL do ZIP retornou conteúdo que não era ZIP. HEAD diagnóstico retornou HTTP 200, Content-Type text/html e Content-Length 195. A tentativa foi interrompida; nenhum browser foi instalado ou sessão visual executada. Nenhum navegador cobrado por minutos foi contratado. Não houve tentativa de obter OTP por e-mail/API ou pelo chat.

Próxima ação segura: disponibilizar binário Chromium verificável ou navegador local conectado sem custo adicional, iniciar QA local com fixtures sintéticas e executar a matriz responsiva, teclado, foco/retorno, erros JS/rede, 200% de zoom e reduced motion. Dispositivos reais seguem um gate separado. Estado G13–G15: BLOCKED_EXTERNAL.
