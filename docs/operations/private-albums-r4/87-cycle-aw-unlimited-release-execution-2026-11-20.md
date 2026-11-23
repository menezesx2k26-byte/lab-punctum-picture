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

## Task 1 — diagnóstico comprovado, associação bloqueada pelo provedor

Task 0 foi registrada em `e3e1472664fea59c0e889ffdaadcaa8be2f6072b`. O preflight foi adaptado em `ec485b53b17a223ae8b91329b82616da9b71df17`, com perfil Unlimited fixo, seleção exclusiva do secret correto, parada antes de endpoints específicos em caso de conta/pedido incorretos e diagnóstico de titularidade sem DNS. Os dez testes Python passaram após RED por ausência do novo perfil. O cenário DNS falhou com `None == None` antes da implementação e passou após o fingerprint completo em `9633a36bb79ad5fd04f7eac9447348a28cafddab`. Suíte Python combinada: 11 PASS. Compilação Python e `git diff --check` aprovados. Nenhuma dependência foi adicionada.

| Evidência | Readback | Resultado / limite |
| --- | --- | --- |
| [Unlimited 44844352259](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44844352259) | SHA `ec485b5`; artifact `14682491522`, ZIP SHA-256 `88852f53292d6ece7ea651ae90d9e82e0a9173bfe46eebd2b08de25495a19a82`, bytes baixados e digest conferido | 2026-11-21T00:31:22.696611Z; site exato e pedido ativo confirmados; configurações/histórico Node HTTP 200, Node 24, `app.mjs`; ambiente sem variáveis cadastradas. Não é deploy nem prova de limites livres. |
| Verificação de titularidade | HTTP 200; `is_accessible=false`, TXT com 0 caracteres | `BLOCKED_PROVIDER_NO_CHALLENGE`; correlation ID `a3463f87-659c-410b-8ad8-5e5e6b4289a5`, CF ray `a5db977c4b332034-IAD`. Nenhum desafio inventado ou publicado. |
| Conta antiga, API do conector | HTTP 200, site Node `punctumpicture.com`, usuário `u571409090`, pedido `1008628483`, habilitado | Confirma vínculo antigo. A regra interna que omite o TXT depende do provedor; não foi inferida a titularidade registral dessa conta. |
| RDAP Verisign + DNS público | 2026-11-21T00:32:38.833688Z; RDAP HTTP 200, registrar `HOSTINGER operations, UAB` | NS `nia.ns.cloudflare.com` / `pedro.ns.cloudflare.com`; bloqueio de transferência de registro presente, sem alteração. Consultas recursivas MX/CAA sem resposta, `_dmarc` NXDOMAIN. Não são prova de publicação de TXT novo. |
| [DNS 44844658022](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44844658022) | SHA `9633a36`; artifact `14682930650`, ZIP SHA-256 `9bf0722554208f4282bb409c720ce42a0c860e7ebd302c4b16865fbd30096591`, bytes/digest conferidos | Zona exata ativa, 5 CNAME + 2 TXT + 3 AAAA; fingerprint lógico completo `4eaec7ca0018c0b77ba668f1829338631399fb91d65686e5282859e6af9cce19`. TXT/MX/CAA têm metadados e hashes, valores de titularidade fora dos logs. |

Cloudflare continua com apex e `www` no Worker de produção, D1 `22697f13-7484-41e3-9441-f7b902c6577a` e buckets de originais/backups. DNS token recebeu 403 em settings; o fallback autorizado Worker token leu settings com 200. Zero escritas de DNS, binding, deploy ou dados nesta execução.

A [issue única #44](https://github.com/menezesx2k26-byte/lab-punctum-picture/issues/44) contém resposta, correlation ID, ação do responsável e texto preparado para suporte. Leitura independente da issue confirmou estado aberto, identificador e instrução. Ticket Hostinger **ainda não fornecido**, suporte não contatado pelo agente.

Próxima ação externa única: responsável pela conta antiga libera o vínculo de `punctumpicture.com` por **Sites → Opções → Alterar domínio → Usar domínio temporário**, preservando dados. Se indisponível para o Node, suporte fornece liberação ou desafio genuíno. Conforme a [orientação Hostinger](https://www.hostinger.com/support/8947528-how-to-fix-the-domain-already-used-at-hostinger-error/), a troca de NS não libera esse vínculo. O [procedimento TXT](https://www.hostinger.com/support/4771440-how-to-verify-domain-ownership-at-hostinger/) depende do valor emitido pelo provedor.

O catálogo API oferece troca do domínio primário para **Agency Plan** com `website_uid`; não houve UID Agency aplicável comprovado para esses sites Shared/Cloud. `hosting_websites_add-domain` exige domínio acessível. Nenhum endpoint mutante foi tentado para contornar o bloqueio.

## Fila independente e espera solicitada

O proprietário respondeu **“Aguarde a resposta”** à solicitação externa. A etapa de associação fica aguardando essa resposta. Task 2 depende da associação liberada e de estratégia TLS do domínio canônico; o certificado do hostname temporário não a substitui.

As duas pesquisas CoS foram recebidas, sem alterações ou testes atribuídos aos workers. A leitura local confirmou `PRIVATE_GALLERIES_ENABLED` fixo em `true` tanto em `candidate-bindings.ts` quanto em `candidate-cron.mjs`. A próxima implementação independente de Task 3 deve criar o controle OFF por padrão para o release público, ajustar fixtures QA explicitamente e provar RED→GREEN antes de qualquer deploy. A alegação sobre `MAX_UPLOAD_BYTES` requer rastrear os consumidores: o upload privado de 25 MiB já tem prova própria e não deve ser refeito ou alterado por inferência.

Task 5 deve reutilizar `managed-restore-check.mjs`, `managed-recovery-export.mjs`, `candidate-backups.mjs` e o ensaio G18 existente. O workflow antigo usa destino Premium e restore D1 local; não deve ser executado como prova de restore remoto Unlimited. Faltam snapshot atual, destino descartável validado, restauração/reabertura remota e final delta. Tasks 4/6 mantêm Clerk QA, matriz física, revisão independente e decisões da controladora sem aprovação inventada.

Task 1: diagnóstico e evidências concluídos; desbloqueio externo pendente na issue #44. Tasks 2–8 continuam sem conclusão/release. Produção `NO_GO`, dois releases separados.
