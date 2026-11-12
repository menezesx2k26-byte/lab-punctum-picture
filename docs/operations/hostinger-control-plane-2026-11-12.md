# Hostinger — evidência autenticada de 12/11/2026

**PARTIAL_VERIFIED / NO_GO_MANAGED_DEPLOY / NO_GO_PRODUCTION / NO_GO_R4**

A autenticação no hPanel foi concluída e o domínio exato do probe foi localizado. A falta de login deixou de ser o impedimento. Esta é uma leitura do serviço real, complementar à CI e ao inventário REST do SHA 8c111a5910443f37b32d72f5ad7bd0ae237941e7.

## Cotas efetivas exibidas pela conta

| Recurso | Valor no hPanel |
|---|---:|
| Disco | 20 GB |
| RAM | 2048 MB |
| CPU | 1 núcleo |
| Inodes | 400.000 |
| Sites | 3 |
| Processos | 80 |
| PHP workers | 40 |
| Banda | Ilimitado |

Esses valores foram lidos na página de detalhes do plano da própria aplicação, não inferidos da oferta comercial atual. A lista de sites mostrou o probe Node e o site existente do criador visual. O uso agregado exibido foi 9%; isso não é teste de carga nem comprovação de folga do candidato.

## Bloqueio real da recuperação isolada

O fluxo **Criar site → App web em Node.js**, dentro do plano existente, foi aberto para verificar um destino segregado de recuperação, sem substituir a instância ativa. O provedor respondeu:

> Você atingiu o limite de aplicações web em Node.js

O texto informa limite de **1 aplicação Node**, já ocupado. A mensagem chama o plano de Business, embora a conta e os detalhes estejam identificados como Premium. Essa divergência foi preservada no JSON; não se inferiu upgrade, mudança contratual nem capacidade adicional.

O modal foi cancelado. Nenhuma aplicação nova foi criada, nenhuma existente removida e nenhum upgrade iniciado.

## Arquivos e acesso administrativo

Os dois acessos oferecidos pelo hPanel ao gerenciador de arquivos foram abertos. A raiz da conta foi listada e o usuário correspondia ao do probe. A abertura da pasta domains respondeu **“You don't have permissions to access this.”**. Nenhum arquivo de credenciais foi aberto; nenhum arquivo/pasta foi criado, alterado ou apagado.

O painel SSH informou **INACTIVE**. Não foi ativado, nenhuma chave foi adicionada e nenhuma senha foi modificada. Logo, ainda não há acesso utilizável comprovado ao diretório privado externo necessário. A existência da raiz na UI não prova permissão para operar os arquivos ativos nem persistência entre deploys.

## Implantação existente

O histórico mantém dois deployments. Os detalhes do build ativo 01a1847b-73bf-71a9-8bd4-59a2836a1b1a exibiram os mesmos 47 registros já inventariados, com origem punctum-hostinger-qa-probe-v2.zip.

A página **Configurações e reimplantação** foi inspecionada e oferece **Usar arquivos anteriores**. Selecionar essa opção preservou o nome do ZIP, mas não forneceu os bytes nem comprovou uma restauração. O botão **Salvar e reimplantar não foi acionado**. A tupla segue Node 24, npm run build, server.mjs, raiz ./, sem output personalizado e sem variáveis na UI.

A opção visual não transforma o 404 anterior da autodetecção REST em recuperação aprovada. A cópia de recuperação do Drive permanece íntegra, porém sem ensaio gerenciado autorizado e segregado.

## Decisão e continuidade

| Gate | Resultado após acesso ao hPanel |
|---|---|
| A | PASS — conta e serviço corretos reconciliados |
| B | BLOCKED_EXTERNAL — o plano recusou o segundo destino Node; restauração gerenciada segue sem prova |
| C | BLOCKED_EXTERNAL — arquivo privado/deploy não acessível pelo gerenciador; SSH inativo; restart/rebuild não homologados |
| D | PARTIAL_VERIFIED — CPU/RAM/disco/processos agora conhecidos; limite de 1 Node comprovado; candidato nativo ainda não homologado |
| E | NOT_TESTED — nenhum deploy do candidato no provedor |
| F/G | PARTIAL_VERIFIED — provas sintéticas e matriz R4 preservadas |
| H | BLOCKED_EXTERNAL — sem cutover e sem autorização específica |

O acesso foi desbloqueado até o limite que a própria conta permite. O passo dependente é disponibilizar um **destino de recuperação isolado suportado pelo provedor dentro do custo zero** e acesso utilizável ao filesystem privado da mesma conta. A ação de substituir o único probe antes dessa prova contrariaria o gate herdado; foi preservada a instância ativa.

Custo incremental R$ 0. Nenhum deploy/restart, alteração de settings/env/DNS, escrita de produção, contratação, upgrade ou merge. Código Node/SSR/SQLite/Sharp/Studio/R4 e os artefatos da CI anterior permanecem intactos.

Evidência estruturada: [hostinger-control-plane-2026-11-12.json](hostinger-control-plane-2026-11-12.json). Não contém credenciais, URLs de sessão, dados de login ou conteúdo de arquivos privados.
