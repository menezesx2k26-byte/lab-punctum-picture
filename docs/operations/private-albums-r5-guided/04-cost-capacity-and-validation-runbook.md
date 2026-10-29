# R5 — análise preliminar de custos, capacidade e plano de aferição

**Estado:** planejamento e pesquisa de limites públicos, **não** auditoria da conta Cloudflare nem teste de carga da R5. Nenhum serviço foi contratado, habilitado ou chamado para processamento. **Resultado de custo real R5:** `NOT_MEASURED`; **PP02/PP07/PP08/PP10:** `NOT_RUN` com risco `BLOCKED_COST` se não houver margem aferida. Não confundir risco com gasto ocorrido.

## Limites públicos verificados (28/10/2026)

| Recurso | Limite público | Consequência para R5 | Fonte primária |
|---|---|---|---|
| Workers Free | 100.000 requests/dia, 10 ms CPU por HTTP request, 128 MB de memória, 50 subrequests externos/request | CPU de autenticação, transformação e ZIP deve ser aferida no runtime; sem margem, não publicar | https://developers.cloudflare.com/workers/platform/limits/ |
| R2 Standard | franquia de 10 GB-mês, 1 milhão de ops Classe A, 10 milhões Classe B por mês, egress gratuito; faturamento acima da franquia, arredondamentos e outros planos exigem cautela | bytes acumulam para originais, derivadas e versões finais; snapshot lógico sem cópia | https://developers.cloudflare.com/r2/pricing/ |
| Images Free | até 5.000 transformações **únicas/mês**, combinação imagem + parâmetros; acima, novas transformações dão erro 9422 e o Free não cobra excesso | tratamento de erro deve negar prova sem marca; avaliar presets e binding/entitlement | https://developers.cloudflare.com/images/pricing/ |
| Cloudflare Email Service | envio a destinatários arbitrários exige Workers Paid; destinos previamente verificados podem ser gratuitos, mas não equivalem a clientes reais | recurso de email R5 não pode ser declarado funcional com Cloudflare Free sem alternativa existente homologada | https://developers.cloudflare.com/email-service/platform/pricing/ |
| Hostinger | plano, CPU, quotas/SMTP aplicáveis à conta do projeto não aferidos nesta rodada | não presumir que probe Node R4 é Punctum SSR ou transporte de e-mail | revisão contratual futura |

**Notas:** Limites públicos não garantem autorização de uso, disponibilidade de binding, capacidade da conta, nem custo incremental nulo. R2 cobra além da franquia Standard; Images Free falha em vez de cobrar por nova transformação. Cloudflare Free CPU é limite por request, não média mensal. Não habilitar fail-open de rota privada para contornar quota; resultado seguro deve negar conteúdo.

## Modelo paramétrico por álbum (estimativa, não medição)

Variáveis: `P` provas, `F` finais publicáveis, `V` versões adicionais imutáveis, `O` tamanho médio do original, `W` tamanho médio da prova derivada, `E` tamanho médio do final, `S` tamanhos extras de previews/backups, em MB decimais. Armazenamento aproximado `bytes = P*(O+W)+F*E+V*E+S`; não incluir cópia por bloco editorial ou snapshot. Objetos `≈ 2P+F+V` se cada original + derivada + final for armazenado uma vez, fora de backups e arquivos auxiliares. Transformações únicas `≈ imagens transformadas * presets distintos`; formato/qualidade não entram na unicidade segundo doc Cloudflare. Requisições privadas `≈ carregamentos da biblioteca + requests de API + acessos GET/HEAD de fotos + downloads + polling de avisos`.

**Cenário ilustrativo inventado (não é dado de produção):** `P=30`, `F=25`, `V=0`, `O=5 MB`, `W=0,25 MB`, `E=5 MB`, `S=0`. Um álbum utiliza aproximadamente `30*(5+0,25)+25*5 = 282,5 MB`, incluindo originais existentes, novas derivadas e finais. Dez álbuns retidos integralmente ≈ **2,825 GB**; cem álbuns ≈ **28,25 GB**, acima da franquia de 10 GB-mês se retidos por mês inteiro. Adicionar novas versões, backups, outras galerias e dados do site aumenta consumo. A estimativa não mostra gasto ocorrido: para custo é indispensável ler plano, período faturável e armazenamento R2 real.

Em uma hipótese de duas transformações distintas por prova de 30 fotos, **60 únicas/álbum**; 100 álbuns diferentes implicam 6.000 transformações e a cota Images Free de 5.000 seria insuficiente para todas as novas transformações do mês, causando bloqueio 9422. Este cenário **não** diz que R5 terá exatamente dois presets nem que cada derivada produzida offline conte no Images; confirmar chamadas efetivas por categoria.

Batch de 25 finais a 5 MB = **125 MB** de conteúdo bruto, já muito próximo dos 128 MB totais de memória do Worker, antes de compressão/buffers, runtime e respostas. Não criar ZIP inteiro em RAM do Worker; medir streaming/cancelamento no navegador, pacote pré-montado pela Maria ou alternativa segura. Um único download de 25 finais não prova consumo agregativo mensal. `GET`/HEAD e R2 Class B devem ser contados separadamente.

## Evidência R4 existente, limitada por SHA e ambiente

A R4 reporta ensaio Edge `40779241089` do candidato `1d30b97`, CPU p50/p95/p99 **31/57/145ms** (`n=63`), HTTP 0/64; baseline corretamente identificado pela errata como build `16c86d1`, CPU **53/106/160ms** (`n=61`), HTTP 14/64 erros. Esses números não são CPU do SHA final R4 nem de R5, nem fatura. **G17 R4 permanece FAIL.** Há relato de upload R4 em QA real falhando `400 INVALID_IMAGE` por `IMAGES` ausente; não promover G05 com testes locais.

## Protocolo futuro de medição com custo controlado

1. **Antes de tocar na conta:** inventariar apenas leitura do plano efetivo (Workers, Images, R2, D1 e Hostinger SMTP se existente), quotas e consumo atual, fontes da console, billing/rate limits, autorização e ambiente exato. Se APIs retornarem `403`, registrar falta de evidência, **não** consumo zero.
2. **Local:** executar fixtures sintéticas que não usam Cloudflare remoto; medir número de operações D1 locais, objetos/bytes R2 mock e hashing de derivações; CPU Node `process.cpuUsage` e memória V8 com escopo claramente local, não equivalente à CPU Edge.
3. **QA isolado somente após aprovação e margem verificada:** executar smoke com poucas provas sem enviar fotos reais nem adicionar recursos; capturar Worker's `cpuTime`, `wallTime`, versão implantada, requests total e erros 1102/9422/429/503; nenhum retry não idempotente.
4. **D1:** `rowsRead/rowsWritten`, FK violations, CAS conflicts, query timings em lote sintético. Comparar SQLite local e D1 remoto QA somente quando autorizado.
5. **R2:** head/get/put por categoria, contagem Classe A/B, tamanho de original/derivada/final/histórico, SHA256 do arquivo antes/depois; observar status de buckets e storage class. Sem listar/deletar buckets reais aqui.
6. **Images:** contar transformações únicas (imagem × presets relevantes), erro 9422, presença real de `IMAGES` e bytes watermark; testar indisponibilidade fail-closed.
7. **Batch:** 25/30 final, memória de pico Worker **e** Chrome Android físico, bytes/SHA por item, tempo CPU p50/p95/p99, cancelamento e internet lenta; comparar opções e selecionar apenas solução viável/permitida.
8. **Email:** encontrar transporte existente legal e gratuito, autorização para endereços de teste, enviar com dedupe a caixa de teste controlada, capturar receipt e recebimento real; sem prova, `PP07=BLOCKED_EXTERNAL`, estado in-app/outbox pode ser testado localmente.
9. **Controle de risco:** reservar margem explícita para outros usos da conta. Parar a frente dependente quando não houver prova de quota, quando CPU exceder ou quando o design exigir custo pago; manter feature OFF.
10. **Revisão independente:** assinar relatório por responsável técnico de custos com SHA, consultas da conta, limites aplicáveis, cálculo de pior caso/concorrência, capacidade residual e decisão de `BLOCKED_COST` quando aplicável.

## Planilha lógica para preenchimento de evidências (nenhum valor medido ainda)

| Campo de evidência | Tipo / unidade | Fonte requisitada |
|---|---|---|
| `accountPlan`, `entitlements`, `budgetOwnerApproval` | texto + data | contrato/dashboard Cloudflare e Hostinger |
| `workerSha`, `workerVersionId`, `cpuP50/P95/P99Ms`, `exceededCpu` | SHA / ms / count | trace da implantação QA exata |
| `requestsPerDay`, `subrequestsPerRequest`, `imagesUniqueUsed` | counts | métricas Cloudflare com período |
| `r2StorageGbMonth`, `r2ClassA/B`, `r2ObjectCount`, `r2RawBytes` | GB-mês/count/bytes | R2 analytics e lista de objetos autorizada |
| `d1RowsReadWritten`, `fkViolations`, `casConflicts` | counts | D1 isolado / fixtures |
| `batchTotalBytes`, `batchPeakMemoryMb`, `androidDeviceModel` | bytes/MB/model | download real sintético |
| `emailProvider`, `emailReceiptId`, `emailInboxObserved` | strings + prova | envio QA ao destinatário autorizado |
| `incrementalChargeObserved`, `incrementalChargeWorstCase` | moeda + período | billing + cálculo auditado |
| `dataRetentionPolicyApproved` | status, responsável, data | decisão da controladora de dados |

`PASS` financeiro requer dados de conta e ambiente associados à mesma versão testada, não somente números dos docs. Sem medição, usar `NOT_RUN` para gate e explicitar dependência `BLOCKED_COST` potencial; sem revisão de entitlement/provedor, `BLOCKED_EXTERNAL` pode ser específico da subetapa. Não contratar serviços nem aplicar upgrades nesta missão.
