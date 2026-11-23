# Cloudflare — custos e limites, 27/10/2026

Nenhum plano foi alterado ou contratado nesta execução. Uma consulta de assinatura recebeu HTTP 403 (OAuth sem Billing Read); uso efetivo, franquia restante e custo incremental real são **não verificáveis**. O inventário de infraestrutura foi somente leitura.

Referências oficiais consultadas:

- [Workers Free](https://developers.cloudflare.com/workers/platform/limits/): 100.000 requisições/dia por conta e 10 ms de CPU por invocação; avaliar modo de falha da rota, especialmente em conteúdo privado. As medições locais não demonstram CPU no edge.
- [D1](https://developers.cloudflare.com/d1/platform/pricing/): no Free, 5 milhões de linhas lidas/dia, 100 mil linhas escritas/dia e 5 GB totais. Leituras de scans e índices contam, não apenas respostas.
- [R2 Standard](https://developers.cloudflare.com/r2/pricing/): franquia mensal de 10 GB-mês, 1 milhão de operações A e 10 milhões B; IA tem regras e custos diferentes. Uploads/cópias e restauração adicionam armazenamento e operações; franquia é compartilhada. Não inferir R$ 0 com base apenas no limite publicado.
- [Assentos Access](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/): identidades autenticadas podem consumir assentos; uso e disponibilidade efetivos da conta não foram verificados.

A estimativa de impacto depende de tamanho e número de fotos, acessos, volume de leituras/escritas e consumo atual por outros sistemas. Antes de rodar piloto remoto, confirmar franquias e titularidade dos dados de QA; não contratar ou aumentar plano. G17 permanece BLOCKED_EXTERNAL.

## Evidência atual substitui o bloqueio histórico de leitura — 28/10/2026

O relatório 23 e o artefato `r4-edge-current-40762650132.json` registram acesso real às subscriptions e uso agregado: Workers 4.313 requests/dia; D1 384.010 linhas lidas/1.877 escritas; R2 limite superior observado 404.091.927 bytes e 1.554 operações, contadas conservadoramente nas duas classes. Janela do mês/dia e fontes estão no JSON. Isso substitui a afirmação histórica de que nenhuma métrica podia ser lida, mas não é garantia futura nem fatura. Access configurado em Teams Free; ocupação de assentos ainda não homologada.

**G17 FAIL**, e não apenas bloqueado: candidato real `da23806` teve CPU p50/p95/p99=57/111/204 ms em 48 eventos e 17 HTTP503/64 requests. O pipeline de coleta terminou verde, o produto não passou o gate. Nenhum upgrade, plano pago adicional, contratação ou offload de senha/fotografia foi executado. A correção de CPU requer evidência adicional dentro da arquitetura autorizada; não há justificativa para ativar Password Bridge como workaround.


## Atualização final — 28/10/2026

Current measured run40768574085/d02e774: CPU candidate30/62/114ms,63events,HTTP0/64; G17 FAIL. Newer HEAD not remotely CPU-measured. Images transform allowance/plan and Access occupancy unverified; no paid activation. Quotas and units in evidence/r4-edge-current-40768574085.json.
