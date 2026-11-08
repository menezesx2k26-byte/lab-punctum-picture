# Punctum R4 — cache SSR público isolado (08/11/2026)

## Objetivo e arquitetura
Após medição remota de CPU do SSR do HTML público (run #42441525618, 36/36 HTML 200; amostra adaptativa n=7, p50 46,874 ms, p95 72,527 ms), a implementação oferece um caminho de mitigação gratuito usando **Workers Cache** do Cloudflare, introduzido em 2026. Referência oficial: https://developers.cloudflare.com/workers/cache/ e https://developers.cloudflare.com/workers/cache/configuration/.

* Novo entrypoint nomeado `PublicHome` em `worker/index.ts`. Apenas chamadas **GET /** anônimas com Accept HTML, sem query, cookies, Authorization, Access JWT nem cabeçalhos RSC/prefetch são admitidas. Toda outra chamada à classe devolve 404 no-store.
* Respostas 200 text/html sem Set-Cookie/WWW-Authenticate/cache privado recebem **Cache-Control: public, max-age=60**. Qualquer resposta diferente é `private, no-store`. Isso impede misturar a galeria privada, admin, sessão e APIs com a página cacheada.
* O handler `default` permanece **sem cache**, roteia para `PublicHome` via `ctx.exports` só sob feature flag `PUBLIC_HOME_CACHE_ENABLED=true`; a flag não foi adicionada à configuração de produção. Isso impede alteração de produção por mero merge.
* Configuração do **Worker efêmero QA**, apenas: `exports.default.cache.enabled=false`, `exports.PublicHome.cache.enabled=true`, compat date `2026-11-07`, com R2, Images, cron, rotas públicas e dados reais ausentes. O wrapper QA reexporta a classe nomeada. O Worker é único por GitHub run e removido depois.
* Cache ativo por 60s implica até 60s de defasagem após publicação de alterações no Studio. Não ativar em produção sem homologar invalidação/publicação e aceitabilidade editorial; a primeira renderização após miss ainda precisa de CPU, portanto G17 não é aprovado apenas pela existência do cache.

## Testes
* TDD RED: novo `tests/unit/public-home-cache.spec.ts` não compilava sem helper; GREEN 3 testes, inclusive entradas com autenticação/cookies/headers RSC e respostas com Set-Cookie.
* TDD RED: `scripts/r4-cpu-readonly.test.mjs` exigiu a configuração de cache nomeado que não existia; GREEN 5 testes.
* `npm run typecheck`, `npm run build`, `wrangler deploy --dry-run` para build com entrypoint PublicHome compilados. Nenhuma alteração remota nessas verificações.
* `npm test`: **228/228 em 55 arquivos**, `npm run lint` PASS, `npm audit --audit-level=low` **zero vulnerabilidades**. CI exata e cache remoto requerem readback posterior. **Não inferir HIT de cache ainda**.

## Gates
G17 permanece FAIL até CPU e cache hit comprovados, inclusive cold path. G05 upload integrado com D1/R2 reais continua FAIL; G15 aparelhos físicos/assistivas, G19 segurança independente, G20 LGPD, G23 rollback completo e G22 autorização continuam BLOQUEADOS. Produção mantém `PRIVATE_GALLERIES_ENABLED=false` e PR draft sem merge.
