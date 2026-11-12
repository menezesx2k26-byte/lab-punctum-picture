# R4 — correção da política de cache do HTML público (08/11/2026)

## Observação real, imutável
- HEAD `6074b88aeca89814133f1c661d053f03bba91e71`, CI `42485514892` completed/success.
- Ensaio QA efêmero `42485511651`, job completed/success **somente quanto à execução e limpeza**, artefato `13619585997` ZIP SHA256 `40311ff8982a5b830efbabc96354554a83ae95ff21b0246b58d776c0ba0f8964`.
- Respostas página inicial: 34/36 HTML200; 2 falhas; `CF-Cache-Status: BYPASS` em 35, ausente em 1. **Nenhum HIT comprovado**. Telemetria GraphQL CPU amostrada n=1 p50/p95/p99 450 µs; não qualifica CPU da home porque a cache não funcionou e amostra pequena.
- Uma criação e deleção do Worker isolado; `cleanupVerified=true`, inventário 17 antes/depois. D1 sintético ficou 3 clientes, 3 galerias, 11 imagens, 11 intenções, 2 favoritos, 1 ponteiro, sem alteração. Não houve deploy Punctum, imagens reais ou contratação.

## Diagnóstico e correção
- A consulta real do HTML SSR no Miniflare confirmou `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-store, must-revalidate` do Vinext, sem Set-Cookie e com Vary de RSC/Next. Isto é compatível com a causa do BYPASS.
- Um teste `tests/unit/public-home-cache.spec.ts` RED confirmou que a política nova recusava até esse HTML público anônimo; GREEN habilitou substituição **somente** da diretiva exata `no-store, must-revalidate` pela política `public,max-age=60`, com allowlist **GET /** anônimo. `private`, `no-cache`, `no-store` isolado, cookies, JWT, rotas privadas e RSC continuam no-store/negados.
- O harness do ensaio remoto agora registra distribuição de códigos e estados do cache e impede alegar aprovação G17 somente porque houver HIT; novas regressões RED/GREEN em `scripts/r4-cpu-readonly.test.mjs`.

## Restrições
Mesmo com HIT validado, um MISS ainda pode gastar mais de 10 ms Workers Free. Também falta homologar uma publicação do Studio com invalidação e confirmar tolerância de até 60 segundos de defasagem editorial. Este commit prepara nova medição, **não** promove G17, G05 ou release. `PRIVATE_GALLERIES_ENABLED=false` na produção; PR #32 continua draft.
