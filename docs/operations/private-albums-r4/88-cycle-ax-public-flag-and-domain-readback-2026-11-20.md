# Ciclo AX — flag pública, paridade e retorno do domínio

RESULT `PARTIAL_VERIFIED` · PRODUCTION `NO_GO` · PR de execução [#45](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/45), empilhada sobre o plano [#43](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/43). Continuação do ciclo AW, sem substituir os 24 gates canônicos.

## Task 3 — controle de ativação corrigido; qualificação remota incompleta

Código `b745e7f9fa39cc5fadeac7a733016eb1577054af`. `candidateConfig()` agora deriva `privateGalleriesEnabled` exclusivamente de `PUNCTUM_CANDIDATE_PRIVATE_GALLERIES_ENABLED === "true"`; ausência ou outro valor desliga R4. HTTP e cron consomem o mesmo controle. A configuração do release público deve declarar `PUNCTUM_CANDIDATE_PRIVATE_GALLERIES_ENABLED=false`, que fornece `PRIVATE_GALLERIES_ENABLED=false` ao Worker adaptado. O roteiro sintético ativa a flag explicitamente para testar R4. Nenhuma configuração remota foi alterada.

Provas em Node 24.21.0, Linux/WSL, cópia isolada `/home/pichau/.cache/punctum-aw-release.LSFbnH`. Dependências reutilizadas somente após igualdade byte a byte do lockfile com a instalação anterior. Não houve novo `npm ci` nesta cópia. A CI completa anterior [44845286639](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44845286639) passou nos jobs `verify` e `hostinger-node-qa` no SHA `0e8c9678310cd2c3b6e5905464b150ab27fa0266`; ela não comprova a mudança posterior.

| Comando / cenário | Resultado observado |
| --- | --- |
| `node --test services/punctum-hostinger-production/candidate-runtime.test.mjs` | RED: ausência da propriedade, `undefined !== false`. GREEN: 2 PASS, 0 skips, incluindo padrão OFF em produção e ativação explícita. |
| `node scripts/hostinger-r4-25mib-local-proof.mjs --public-release-check` sobre bundle anterior | RED: `/albuns` retornou 303, esperado 404. |
| `npm run build:hostinger:candidate` sobre fontes alteradas | Exit 0. Aviso conhecido Vinext `INEFFECTIVE_DYNAMIC_IMPORT`; nenhuma alegação de build sem avisos. |
| Mesmo roteiro `--public-release-check` sobre novo bundle | 8 PASS: login administrativo legado sintético, home 200, entradas/APIs privadas 404, mídia GET/HEAD 404 sem corpo e cache privado/no-store. |
| `node scripts/hostinger-r4-25mib-local-proof.mjs` com opt-in explícito | 49 PASS locais sintéticos; original 26.214.400 bytes, SHA-256 `c16e100efa8b3233461abdf30df0be13c291ed17c5cd4f6c4dbc40c562aab4ce`. Novo SHA e novo requisito justificam a regressão. Não é repetição da prova remota anterior nem OTP Clerk. |
| `git diff --check` | PASS antes do commit. |

A CI Node 24 foi estendida para compilar candidato/cron e executar os dois modos do roteiro. O readback dessa nova CI ainda é necessário. `npm run build:hostinger:managed-runtime`, nova equivalência de dois builds, restore remoto, limites livres, p95/p99 e demais critérios de Task 3 continuam sem prova neste ciclo. Não confundir o build candidato local com importação e configuração verificadas do destino.

### Paridade pública atual por HTTPS

Roteiro existente `scripts/live-parity-audit.mjs`, `DEST_ORIGIN=https://magic-lime-guanaco-79.hostingersite.com`, 2026-11-21T00:45:19.056Z. GETs públicos somente; comparação administrativa autenticada **não realizada**. Relatório completo temporário no workspace SDD `public-parity.json`.

Todas as quatro APIs públicas comparadas retornaram 200 em produção e staging. `/api/public/site` mostrou 10 diferenças, stats 3, álbuns 45 e arquivo atingiu o teto de 300 diferenças do roteiro. HTML da home, sitemap e robots são diferentes; staging deve conservar noindex. Igualdade de status/título nas rotas administrativas sem autenticação não comprova Studio/Colagem ou edição. O destino continua sendo QA sintético, sem paridade de conteúdo suficiente para cutover.

## Task 1 — atualização após ação do proprietário

O proprietário apresentou a tela do registro ativo com vencimento 2027-07-20 e declarou **“Concluída na conta Unlimited”**. Isso é evidência humana da movimentação, separada da autorização da API e do mapeamento ao Node. Não solicitar novamente a mesma movimentação.

| Readback em `0e8c967` | Resultado |
| --- | --- |
| [Hostinger 44848073497](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44848073497) | 2026-11-21T01:06:02.329128Z, conta/pedido/site temporário exatos confirmados. Verificação do domínio HTTP 200, `is_accessible=false`, TXT vazio. Correlation ID `a3464be9-2dbd-42d4-8d5b-4adda203d6b0`, CF ray `a5dbca339a81ad05-MSP`. |
| Artifact Hostinger `14683926619` | ZIP baixado e SHA-256 `0277205f17d4feae708e3a9dba51c57885f74d5fa704f4bf687896952e09bf13` conferido. |
| [DNS 44848076084](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44848076084) | Fingerprint `4eaec7ca0018c0b77ba668f1829338631399fb91d65686e5282859e6af9cce19`, idêntico ao ciclo AW. Apex e www continuam no Worker Cloudflare de produção; zero mutações pelo agente. |
| Artifact DNS `14684111608` | ZIP baixado e SHA-256 `00591bbb5d207e7cc5342f0e0c611928721f6a3543701e972b25732166d086b7` conferido. |

Hipótese a distinguir: registro movido, mas visibilidade/permissão/sincronização da API ainda insuficiente, ou associação a site ainda retida. A consulta isolada não identifica qual delas é a causa. O conector legado retornou `[Domains:2006]` / HTTP 404 para o portfólio; esse erro da credencial não invalida o registro mostrado pelo proprietário.

Em `6679dba4c051e9f8c9117b1ce6b2e9d6643a80ab`, o mesmo preflight ganhou dois GETs sanitizados: portfólio do domínio e movimentação recebida com `force_sync=true`, antes da verificação de associação. O [SDK oficial](https://github.com/hostinger/api-python-sdk/blob/main/docs/DomainsMoveApi.md) documenta a consulta e o refresh de uma movimentação `activating`; o [portfólio](https://github.com/hostinger/api-python-sdk/blob/main/docs/DomainsPortfolioApi.md) documenta o GET de detalhes. Nenhum aceite, mudança de contato, DNS, vínculo ou transferência foi iniciado pelo código. Só domínio/status/HTTP e IDs de correlação são retidos; contatos e e-mails não são impressos.

TDD: teste primeiro falhou por ausência de `domainPortfolio`; depois a suíte combinada passou 12/12. Uma movimentação `completed` não promove a associação recusada nem expõe contatos no relatório. A consulta real com essa instrumentação será produzida pelo próximo push, com artefato e SHA próprios. [Issue #44](https://github.com/menezesx2k26-byte/lab-punctum-picture/issues/44) permanece aberta até o readback resolver a discrepância. Não há ticket Hostinger informado.

## Task 5 e checkpoint de continuidade

`e082701dbc2680f12dea5ed9a80fd81ce8c3bd8b` habilita dispatch/push do workflow existente `punctum-source-delta-preflight.yml` nesta branch. Ele exporta D1/R2 em runner privado temporário, usa o exportador existente com bundle cifrado e publica apenas hashes/contagens no artefato. Não altera a origem nem importa no Node. A exportação cifrada temporária não equivale a backup retido: persistência de backup, destino de restauração, RPO/RTO e freeze/delta seguem pendentes. A execução real ainda precisa de readback antes de qualquer conclusão sobre o estado atual dos dados.

Fila de retomada:

1. Ler o preflight instrumentado da Unlimited, distinguindo portfólio, movimentação e `is_accessible`. Não repetir login, mudança manual ou TXT sem novo fato. Se a recusa persistir após registro visível e movimentação concluída, atualizar a issue #44 com o erro e correlation ID para o provedor.
2. Ler CI no novo HEAD e artefato do delta atual. Corrigir falhas concretas com TDD. Task 2 só avança com associação comprovada, estratégia TLS/origem validada e sem roteamento precoce.
3. Tasks 3/5: conteúdo atual protegido, paridade completa, restore/reabertura remotos descartáveis, cron/backup persistente, final delta, capacidade/custos e rollback.
4. Tasks 4/6: Clerk QA real e identidades autorizadas, jornadas físicas, revisão independente do SHA de entrega e decisões Maria/LGPD. A revisão auxiliar de leitura não fecha G19.
5. Tasks 7/8: pacotes e autorizações de release distintos. Sem merge, deploy, DNS ou ativação por inferência. Task 9 ainda requer os readbacks de Drive/Engram/PersistFlow previstos no plano; não foram executados neste ciclo.

Quota consultada: primary 77%, secondary 58%. O guard exige ROLLOVER, checkpoint e nenhum novo agente pesado. Este documento e o ledger preservam a execução para retomada. Não é pausa do GOAL nem declaração de conclusão. A revisão independente final permanece pendente.
