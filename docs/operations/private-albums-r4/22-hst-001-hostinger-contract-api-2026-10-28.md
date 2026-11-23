# Hostinger — contrato identificado e bridge fora do caminho crítico

28/10/2026, coleta encerrada às **16h32 de Brasília** (19:32 UTC). Esta continuação substitui a incerteza anterior sobre o nome do plano; não repete os probes SSH, loopback ou gerenciador do relatório 21. Evidência: [inventário sanitizado da API](evidence/hst-001-hostinger-contract-api-2026-10-28.json).

## Verificação executada

A integração Hostinger já autenticada no Composio expôs consultas de websites, pedidos, assinaturas e VPS. A conta correta foi identificada pela correspondência exata do domínio fornecido pelo proprietário; a aplicação Node histórica foi identificada por correspondência exata na segunda conexão autorizada. Não foram lidos tokens, variáveis de aplicação, logs de execução, dados de clientes ou fotografias.

| Área existente | Resultado real da API |
|---|---|
| Domínio SSH `olivedrab-weasel-504267.hostingersite.com` | Website habilitado, tipo `other`; sandbox PHP existente do PersistFlow |
| Plano correspondente ao domínio SSH | Pedido `active`, código `hostinger_premium_v3`; assinatura **Premium Web Hosting**, `non_renewing`, vigente até 22/01/2027 |
| Websites no mesmo pedido | Dois: sandbox existente e um site do Website Builder |
| Domínio histórico `darkslategrey-raccoon-448222.hostingersite.com` | Outra conta autorizada; website habilitado, tipo **`nodejs`**, já utilizado pelo PersistFlow |
| Plano correspondente ao Node existente | Pedido `active`, código `hostinger_premium_v3`; assinatura **Premium Web Hosting**, `non_renewing`, vigente até 15/03/2030 |
| Websites no pedido Node | Dois: PersistFlow Node e um site do Website Builder |
| VPS existente | Nenhum nas duas contas consultadas |

As duas listagens de pedidos e websites foram completas: uma página, um pedido e dois websites por conta. Foram **13 chamadas GET**, **12 sucessos** e **uma falha HTTP 422** de serialização do filtro `order_ids` pelo conector. A consulta de pedidos sem esse filtro resolveu a identificação; isso não é falha da aplicação nem evidência de falta de suporte a Node. Nenhuma chamada modificou recursos.

## Suporte oficial e limites da conclusão

A [documentação de criação de aplicações](https://docs.hostinger.com/node.js/creating-an-app) indica suporte gerenciado a Node nos planos Business e Cloud. A [tabela oficial de parâmetros](https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/) indica indisponibilidade de Node no Premium atual. Como referência publicada, Premium possui 1 núcleo, 2 GB RAM, 20 GB de disco e três websites; **esses valores não comprovam a quota efetiva dos contratos legados `premium_v3` observados**.

Há uma diferença relevante entre a tabela atual e a conta: a API classifica expressamente a aplicação existente do PersistFlow como `nodejs` em um pedido Premium. Pode haver condição legada, mas sua causa e a disponibilidade de uma aplicação adicional não foram comprovadas. Portanto não é correto afirmar que a Hostinger inteira, ou ambas as contas, sejam incapazes de executar Node. Também não é correto tratar o domínio existente como vaga livre.

Os [limites oficiais de Node](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/) indicam cinco aplicações no Business/Unlimited e dez nos planos Cloud, com limites de memória e processos compartilhados pelo plano e timeout de requisição de 120 segundos. A [visão geral oficial](https://docs.hostinger.com/node.js/overview) informa reinício após falha e parada automática após inatividade. Isso descreve um serviço HTTP gerenciado sob demanda; não garante um processo continuamente ativo nem isolamento físico de recursos em relação ao PersistFlow.

O [catálogo oficial da API Node](https://docs.hostinger.com/api-reference/endpoints/hosting/nodejs.md) possui consultas de builds e configuração. O conjunto de ferramentas conectado nesta sessão não expôs essas operações, mesmo após busca dirigida. O controle do navegador também não estava disponível. Não foram extraídos tokens para contornar a capacidade do conector e não foram lidos ambientes ou logs da aplicação existente. O nome do plano está comprovado; slots adicionais, consumo corrente e cotas efetivas permanecem sem comprovação.

## Decisão aplicada à entrega

**A ativação do bridge Hostinger é opcional e sai do caminho crítico dos álbuns privados.** O modo principal continua Cloudflare Access; D1 mantém autorização/estados e R2 mantém as fotografias. O Password Bridge permanece desligado e não é uma solução demonstrada para o consumo de CPU histórico da home.

Não houve contratação, upgrade, alteração de cobrança, novo endpoint, reinício, publicação ou mudança em qualquer PersistFlow. Não há custo incremental de provisionamento nesta investigação; o inventário não comprova as franquias agregadas de Cloudflare nem autoriza prometer custo total da solução. Nenhum contorno com PM2, `nohup`, túnel, porta própria ou modificação do sandbox foi tentado.

Nenhuma ação externa Hostinger é necessária para prosseguir com implementação e homologação dos álbuns em QA isolado. Se uma medição futura demonstrar necessidade do bridge, sua ativação exigirá comprovar uma vaga gerenciada QA separada, incluída sem upgrade, com cotas e folga de recursos verificadas. Esta investigação não promove G17 por si só: o gate depende de CPU/franquias da solução efetivamente utilizada, e não da presença de um intermediário opcional.
