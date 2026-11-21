# Ciclo AW — execução do plano Unlimited e dois releases

RESULT `PARTIAL_VERIFIED` · PRODUCTION `NO_GO` · custo incremental autorizado R$ 0,00.

## Task 0 — baseline reconciliada

Leitura em 2026-11-21 UTC (20/11 no Brasil). Worktree isolada `codex/punctum-unlimited-release-20261120`, entrada `a44397d79dcc0b9835f7253dfc8cb20c0681f4ea`, limpa na criação. O plano integral da [PR #43](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/43) deriva da [PR #42](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/42), ambas abertas, draft, sem merge.

| Fonte | SHA / evidência | Limite |
| --- | --- | --- |
| PR #42 | head `c15e548eababf37e567a84377223f55bbbe6c609`, base `f0f951d9f30225d717c1f82df7661889e287ec34` | O corpo da PR ainda descreve o antigo `18193a9`; não é estado atual. |
| CI do head #42 | [44838542291](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44838542291), jobs `verify` e `hostinger-node-qa` completed/success, API HTTP 200 | Não prova release nem OTP real. |
| Delta desde checkout anterior | `ab4a618..c15e548`, apenas `.github/workflows/punctum-domain-ownership.yml` | Passou a registrar o bloqueio sem desafio e sair 0. Workflow verde continua sem provar associação. |
| Plano #43 | `a44397d79dcc0b9835f7253dfc8cb20c0681f4ea` | Um arquivo documental, nenhum deploy. |
| Unlimited staging | ciclo AV, aplicação `a136f721e004ac9cba48ffe77c7ffc625a57850d`, ZIP SHA-256 `3b65aab8d50b84eefa115c68622e5b57c2dea954ed8cbfd2332b2d8c160043f7` | 48 checks sintéticos e persistência após redeploy são evidência reaproveitada. Restore remoto e Clerk real continuam sem prova. |

### Fronteiras de operação

| Recurso | Identidade esperada | Acesso / decisão |
| --- | --- | --- |
| Produção | Cloudflare Worker `punctum-picture-migration`, conta `257bca437616da74ece1ce4bbaf0bd89`, zona `561d9796dd104b8563c9ab77fa4fae1d` | D1/R2 vivos preservados. Tokens DNS e Worker separados. |
| Legado Premium | pedido `1008628483`, usuário `u571409090`, site `punctumpicture.com` | `HOSTINGER_API` / conector Conthabil. Não usar para provisionar Unlimited. |
| Destino Unlimited | pedido `1008583103`, usuário `u775492464`, `magic-lime-guanaco-79.hostingersite.com` | Exclusivamente `HOSTINGER_UNLIMITED_API`, exigir correspondência exata antes de chamadas específicas. |
| Clerk conhecido | `ins_3M6H9ktM3jO84RvEu5BmKFokCfr`, produção | Metadados históricos não autorizam mudanças no Clerk vivo ou uso como QA. Instância/identidades QA ainda pendentes. |
| DNS e releases | proprietário Gabriel Menezes | Intenção de migração registrada. Pacote de release e autorização específica ainda exigidos pelo plano. |
| G19 / G20 / G15 | revisor independente / Maria controladora / operadores com dispositivos físicos | Sem aprovação ou ensaio físico inventado. |

O runbook de rollback seção 7 substitui a baseline de setembro para planejamento atual. Seus deployment/version de 20/11 são históricos até novo readback. O próprio runbook identifica `site_media` ausente do backup antigo; restauração sobre o D1 ocupado é proibida.

Ruling: usar o preflight de conta existente com perfil Unlimited fixo e modo diagnóstico sem DNS. O workflow de domínio existente pode escrever TXT e valida apenas conta diferente da antiga; não serve como diagnóstico estritamente sem escrita nem como validação exata da nova conta. Manter os 24 nomes canônicos e os históricos do ledger.

Pre-flight: Task 0 produz SHA/ambientes para 1–9; Task 1 produz associação para 2; Tasks 2+3+5+6 produzem pacote para 7; Tasks 4+6 produzem provas para 8; Task 9 consolida todos. Nenhum conflito permite promover staging sintético a produção.

### Delegação e continuidade

Gemini Bridge passou `health`, mas os dois workers retornaram código 3 antes de produzir análise. Nenhuma execução lhes é atribuída. CoS passou health com actions habilitadas e recebeu duas pesquisas de leitura de código público, owner `066f22a7-1265-419a-8ddf-f7afcfba2d10`, run `8adddc99-71cb-44e3-8f31-96d6498e92c6`, workers 1/2. Resultados só serão usados após recebimento e verificação local.

Task 0: validação documental `git diff --check`; produção, DNS e dados sem mutação. Próxima ação: testar e executar o preflight Unlimited fixado no novo SHA, coletar resposta Hostinger e pedido de recuperação suportado. Browser fica fora do caminho crítico.
