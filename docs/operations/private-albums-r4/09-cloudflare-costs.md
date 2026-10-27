# Cloudflare — custos e limites, 27/10/2026

Nenhum plano foi alterado ou contratado nesta execução. Uma consulta de assinatura recebeu HTTP 403 (OAuth sem Billing Read); uso efetivo, franquia restante e custo incremental real são **não verificáveis**. O inventário de infraestrutura foi somente leitura.

Referências oficiais consultadas:

- [Workers Free](https://developers.cloudflare.com/workers/platform/limits/): 100.000 requisições/dia por conta e 10 ms de CPU por invocação; avaliar modo de falha da rota, especialmente em conteúdo privado. As medições locais não demonstram CPU no edge.
- [D1](https://developers.cloudflare.com/d1/platform/pricing/): no Free, 5 milhões de linhas lidas/dia, 100 mil linhas escritas/dia e 5 GB totais. Leituras de scans e índices contam, não apenas respostas.
- [R2 Standard](https://developers.cloudflare.com/r2/pricing/): franquia mensal de 10 GB-mês, 1 milhão de operações A e 10 milhões B; IA tem regras e custos diferentes. Uploads/cópias e restauração adicionam armazenamento e operações; franquia é compartilhada. Não inferir R$ 0 com base apenas no limite publicado.
- [Assentos Access](https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/): identidades autenticadas podem consumir assentos; uso e disponibilidade efetivos da conta não foram verificados.

A estimativa de impacto depende de tamanho e número de fotos, acessos, volume de leituras/escritas e consumo atual por outros sistemas. Antes de rodar piloto remoto, confirmar franquias e titularidade dos dados de QA; não contratar ou aumentar plano. G17 permanece BLOCKED_EXTERNAL.
