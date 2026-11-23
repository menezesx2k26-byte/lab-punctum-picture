# Cliente — cobertura atual e lacunas

As suites `client-galleries`, `client-media` e `client-pilot` exercitam biblioteca própria, publicação, favoritos idempotentes/persistidos, downloads condicionais e revogação no D1 local. `client-gallery-ui` e `client-viewer` verificam contratos de interface. Sessões dos pilotos são sintéticas; o teste legado de senha é somente compatibilidade, sem ativar PBKDF2 como entrada principal.

Não houve navegador atual para comprovar navegação, foto inteira, teclado, Escape, foco/retorno, erros recuperáveis ou responsividade. O OTP real e o ciclo Access → sessão Punctum ainda estão bloqueados. Não inferir G07/G13 PASS a partir do emulador.
