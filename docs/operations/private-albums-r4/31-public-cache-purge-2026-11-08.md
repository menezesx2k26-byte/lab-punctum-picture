# R4 — invalidação do cache público após publicação (08/11/2026)

## Motivo e evidência prévia
- [Run #42486168970](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42486168970), SHA `5cd836128c0f571fda3391b72fec5087a7f947c0`: Worker efêmero Free, 36/36 HTML200; `MISS=1`, `HIT=35`, mediana31ms (antes430ms sem cache). Sem amostra utilizável de CPU cold; **G17 permanece FAIL**.
- Worker criado/deletado uma vez, limpeza verificada, estado de D1 sintético 3 clientes/3 galerias/11 imagens/11 intenções/2 favoritos/1 ponteiro antes e depois, sem alterações. Sem dados de clientes, mudanças em produção ou plano pago.
- O cache anterior permitia resposta pública `Cache-Control: public,max-age=60` também no navegador. Um purge do edge não invalida cópia local de até 60s, que poderia atrasar publicações do Studio.

## Implementação
- `worker/public-home-cache.ts` aplica `Cloudflare-CDN-Cache-Control: public,max-age=60` exclusivamente a HTML200 da página `GET /` anônima; navegador recebe `Cache-Control: public,max-age=0,must-revalidate`. O cabeçalho CDN específico é consumido pelo edge e removido antes de enviar ao navegador (Cloudflare docs).
- Resposta pública cacheável recebe tag fixa `Cache-Tag: punctum-public-home-v1`; resposta negada/privada não recebe tag e mantém `private,no-store`.
- `PublicHome.purgeCache()` chama `this.ctx.cache.purge({tags:[...tag]})` no entrypoint dono do cache e verifica `result.success`; outros entrypoints não podem purgar por engano. Após respostas bem-sucedidas de edição pública (`/admin/api/studio/publish`, `publish-visual`, `restore`, settings, albums, categories, image complete), o `default` tenta invalidar a home uma única vez. Rascunhos, contatos, APIs e álbuns privados não disparam purge.
- A limpeza do cache não refaz transações D1, não causa reenvio de publicação e não converte um POST já confirmado em erro (que poderia induzir duplicação). Se falhar, registra aviso sem identidade ou conteúdo privado; queda de TTL60s é contingência, não garantia de atualização imediata.
- O protocolo de teste remoto dispõe de uma ação exclusiva **somente no Worker efêmero**, `POST /probe-purge`, exigindo token aleatório mascarado do mesmo run. Sem token ou em rota arbitrária retorna 404. Não há esta rota em produção. O QA exige `HIT` no aquecimento, purge aceito, depois `MISS`/`EXPIRED`, depois `HIT` novamente, com HTML válido. O fluxo usa somente DB sintético preservado e sem R2/Images/admin reais.
- TDD RED/GREEN: teste de rotas que podem purgar; autenticação e execução do purge efêmero; browser-vs-edge Cache-Control. Regressões verificam bloqueio de sessões/admin/client e não confundem cache HIT com aprovação de CPU Free.
- Verificações locais após as alterações: **230/230 Workers em 55 arquivos**, **7/7 Node do harness QA**, **npm run typecheck**, **npm run lint**, **npm run build**, **npm audit --audit-level=low 0** e **Wrangler deploy --dry-run** do Worker efêmero concluídos. Nenhuma publicação de produção. O ensaio remoto do cache purge e a CI exata aguardam verificação.

## Requisitos ainda não superados
- **G17 FAIL** enquanto renderizações em MISS/cold excederem 10ms Workers Free ou custo/quotas permanecerem sem aprovação. Cache atenua, mas não elimina MISS. A prova de CPU do cenário final exige telemetry real em volume suficiente.
- **G05 FAIL** upload real autenticado pelo produto ainda não homologado num QA segregado com binding IMAGES e D1/R2; D1 da conta já possui 10/10 bancos ocupados, portanto não alocar ou reusar banco histórico de modo destrutivo.
- **G15, G19, G20, G23** dependem de homologações e signoffs específicos (dispositivos, revisão independente, LGPD responsável, rollback) não substituíveis por CI. G22 **NO_GO**.
- `PUBLIC_HOME_CACHE_ENABLED` não está ativado em produção; `PRIVATE_GALLERIES_ENABLED=false` continua. Sem merge/deploy/alteração dos dados/compra. CI e QA do commit desta rodada requerem readback exato antes de declarar sucesso.

Documentação oficial consultada: https://developers.cloudflare.com/workers/cache/configuration/ e https://developers.cloudflare.com/workers/cache/purge/
