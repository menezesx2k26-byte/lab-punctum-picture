# Punctum Picture — QA Node Hostinger em 13/11/2026

**Estado: PARTIAL_VERIFIED / NO_GO_QA / NO_GO_PRODUCTION / NO_GO_R4.**

Este checkpoint complementa `hostinger-qa-archive-timeout-2026-11-12.md`. A PR #33 permanece draft, aberta, sem merge. A origem Cloudflare, DNS, dados e R4 não foram modificados. Sem contratação ou aumento de custo.

## Estado restaurado, verificado depois do último ensaio

- Destino exclusivo QA: `aliceblue-locust-999458.hostingersite.com`, conta `u571409090`.
- Build de recuperação **`01a1d463-4f3e-73de-a594-d2131db70b10`**, estado `completed`, confirmado diretamente na API Hostinger.
- Settings confirmados: Node 24; `other`; npm; `build`; `server.mjs`; root/output `null`.
- Variáveis Node: lista vazia, conferida depois de uma falha HTTP 500 transitória na leitura.
- HTTPS `/health`: 200, versão `r4-node-probe-20261028-v2`, identidade e nonce conferidos.
- O ZIP de recuperação continua sendo o pacote de quatro arquivos, 2.384 bytes, SHA-256 `918755f5d4c1ebb1064cafceb4dfbfc20491a309d47147c6fe6e57a2731a75ca`.

## Código e testes publicados na branch da PR #33

1. `6dee1ae336003cca332825f723fe381fe2b60dd1`: instrumentação restrita ao Node QA para diferenciar handler Studio e entrega HTTP, com parser sanitizado de fases e testes sem expor headers, cookies, senhas ou resposta privada. [CI 43402293330](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43402293330), dois jobs PASS.
2. `29a45899ead00fadc7580d6efb080a2c40e8a58d`: rollback idempotente, rechecagem de PUT com HTTP 500 ambíguo, rejeição de configuração/env/deploy desconhecidos e supressão de rebuild quando o probe original continua ativo. [CI 43404598409](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43404598409), dois jobs PASS.
3. `cca32584d71a2138a796626668e7f0a70fe1e3cb`: envio de env sintético passa a aceitar **provisoriamente**, após HTTP 500 transitório, somente leitura posterior das **mesmas chaves esperadas**. Valores mascarados NÃO são considerados comprovados: o teste funcional ainda é gate obrigatório. Conjunto parcial/inesperado e erros não transitórios interrompem o candidato. [CI 43405921255](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43405921255), dois jobs PASS.

Os testes de unidade focados foram exercitados no Pichau, com regressão RED/GREEN. A suíte local integral no checkout Windows/WSL não substitui a CI Linux: a montagem Windows alterou a representação do ZIP de recuperação e a instalação nativa de Sharp é específica de plataforma.

## Recibos gerenciados e bloqueios

| Workflow | Resultado |
| --- | --- |
| [43402881067](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43402881067) | **FAIL**, `candidateEnvironmentWrite` HTTP 500 depois de settings 200; sem build; rollback automático não verificado porque `rollbackEnvironment` também recebeu 500. O estado foi reconciliado manualmente depois via API: settings originais, env vazio, build original. |
| [43405106196](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43405106196) | **FAIL**, `candidateEnvironmentWrite` HTTP 500, mas readback da recuperação encontrou chaves inseridas. Rollback **VERIFIED**, modo `NO_REBUILD_REQUIRED`, build `01a1d263-162b-724e-8366-3755ff11953c`. |
| [43406503705](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43406503705) | **FAIL**, ultrapassado o gate de env: build candidato `01a1d460-7389-70af-871c-457a34efa62a` concluído, `candidateReady` HTTP 200, porém primeiro `POST /admin/api/session` excedeu 30.003 ms no exercício funcional. Recuperação automática **VERIFIED**, modo `REBUILD`, build `01a1d463-4f3e-73de-a594-d2131db70b10`. |

No último run: `functionalFailure.phase=exercise`; `stage=setup`; `errorName=TimeoutError`; `requestTrace=[POST /admin/api/session, 30003 ms]`. Não houve teste de Studio nesse exercício porque a primeira chamada autenticada não respondeu. Não houve indicador de OOM (`outOfMemory=false`); a API de logs do runtime retornou 200 para a coleta, mas não forneceu registros permitidos de rota/fase (`runtimeRouteTrace=[]` e `runtimeWorkerPhase=[]`). Isso **não comprova que o request não chegou ao handler**.

Os erros HTTP 500 da API Hostinger são intermitentes e podem ocorrer **após** uma escrita de env ter sido aplicada; nunca interpretar 500 automaticamente como rollback ou commit. O endpoint de ambiente mostra valores mascarados e não permite verificar secrets. O ambiente QA foi recuperado após a falha; não há evidência de comprometimento da produção.

## Próximos gates — sem autorizar cutover

1. **NO_GO_QA:** Instrumentar/diagnosticar o despacho e a conclusão de `POST /admin/api/session` no Node e no provedor, observando que a latência intermitente também atingiu `/arquivo`, `/admin/api/studio` e navegador em ensaios anteriores. Não aumentar o timeout nem ignorar rotas para obter falso PASS. Verificar se o runtime fornece logs efetivos antes de depender deles; o handler não foi isolado no último run.
2. Repetir o candidato somente após causa comprovada ou instrumentação que discrimine rede/proxy, worker, SQLite e servidor SSR. Manter no máximo uma aplicação QA, exatamente as mesmas guardas de build, backup privado e rollback.
3. Após QA completo: comprovar persistência do candidato por restart/rebuild, ambas viewports Chromium, Studio, login/logout, publicação, mídia Sharp e arquivo. Só então elaborar exportação consistente do D1/R2 e paridade integral dos dados reais, sem seeds sintéticos em produção.
4. **NO_GO_PRODUCTION / NO_GO_R4:** sem alterações em DNS, domínio, Cloudflare, `main` ou flags R4. As pendências de segurança/migração do R4 e as evidências externas permanecem abertas. Não apresentar CI verde nem deploy sintético como migração de acervo concluída.

Última execução foi fail-closed com rollback conferido também via API Hostinger e probe HTTPS independente.
