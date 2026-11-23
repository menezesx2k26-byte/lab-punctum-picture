# HST-001 — SSH autenticado, testes limitados e impedimento do endpoint

28/10/2026. **HOSTINGER_BRIDGE_QA_BLOCKED / PRODUCTION_NO_GO.** Continuação dos relatórios 18–20 após o proprietário autorizar uma chave SSH exclusiva no hPanel. O acesso SSH está resolvido; não é mais correto atribuir todo o bloqueio ao job GitHub que não iniciou.

## Escopo e preservação

A chave de host conferiu com `known_hosts`, usando `StrictHostKeyChecking=yes`. A autenticação por chave exclusiva foi bem-sucedida. A chave privada permanece no computador do operador, fora do Git; nenhum valor de credencial foi lido ou copiado para evidências. O proprietário cadastrou a chave pública sob o nome **CODEX**.

O SSH abre uma conta compartilhada **CloudLinux/CageFS**, sem root. Seu único domínio visível é `olivedrab-weasel-504267.hostingersite.com`, com o sandbox PHP do PersistFlow. A aplicação Node em `darkslategrey-raccoon-448222.hostingersite.com` não aparece nessa área SSH; não foi procurado acesso a outras contas.

Não foram alterados arquivos, configuração, logs ou processos existentes do PersistFlow. O manifesto público do sandbox informa SHA `decb89a031fdbe4cca464c50676fed8ea1073e61`. Nenhum runtime secret, `.env`, banco ou fotografia foi lido. Os testes criaram apenas arquivos sintéticos em diretórios privados novos, removidos ao final.

## Runtimes e limites observados

| Verificação | Resultado real |
|---|---|
| `node` / `npm` no PATH do SSH | ausentes |
| `/opt/alt/alt-nodejs22/root/usr/bin/node --version` | **v22.23.4**, exit 0 |
| `/opt/alt/alt-nodejs24/root/usr/bin/node --version` | **v24.22.1**, exit 0 |
| PM2 / Passenger no PATH | ausentes |
| Processo da aplicação existente visível | `lsphp`; nenhum Node permanente observado |
| Ferramentas de quota/LVE no PATH | ausentes |
| Limites CPU/RAM/PIDs no cgroup próprio | caminhos não expostos ao usuário SSH |
| Plano, slots Node e cotas efetivas | não comprovados |

O `df` refere-se ao filesystem compartilhado do servidor; seus terabytes livres **não são a quota da conta**. Os `ulimit` da sessão também não comprovam limites contratuais. Não usar esses números para prometer capacidade ou custo zero.

O proprietário informou não conhecer o plano e pediu um teste limitado. Isso autorizou o diagnóstico abaixo; não houve contratação, upgrade, provisionamento pago ou alteração de faturamento.

## Gerenciador de aplicações

`/usr/sbin/cloudlinux-selector --help` está disponível. Foram executadas somente as consultas `get --json --interpreter nodejs`, com o usuário SSH atual e cada uma das opções:

- `--get-selector-status`
- `--get-supported-versions`
- `--get-current-version`

As três retornaram **exit 1** com a mesma mensagem:

```text
Something is wrong with integration script:
[Errno 2] No such file or directory: '/etc/cl.cpapi/domains.py'
```

Isso comprova falha da integração do gerenciador consultado nessa área. Não comprova que todos os produtos Hostinger sejam incapazes de Node. Não foram executados `create`, `set`, `start`, `restart`, instalação de ferramentas ou reparo de arquivos do provedor.

## Testes limitados realmente executados

Os processos de diagnóstico usaram diretório temporário privado fora das aplicações, prioridade `nice 19`, orçamento de CPU de cinco segundos por processo, timeout externo de 15–20 segundos e Node com `--max-old-space-size=32 --max-semi-space-size=1`. Nenhum listener público foi aberto; nenhum processo foi deixado em background.

### Servidor HTTP Node em loopback — FAIL

O socket entrou em escuta em `127.0.0.1`, numa porta temporária atribuída pelo sistema. A requisição do próprio processo falhou com:

```text
Error: connect ECONNREFUSED 127.0.0.1:<porta temporária>
errno: -111
```

O primeiro probe não preservou o detalhe do stderr, portanto foi repetido para coletar o erro sanitizado. O processo encerrou e o diretório temporário foi removido em ambas as tentativas. Não interpretar uma falha de captura de diagnóstico como evidência adicional da infraestrutura.

### Controle independente com socket Python — FAIL

Para separar um problema do HTTP Node de uma falha do caminho TCP, um socket Python próprio foi colocado em escuta no mesmo endereço de loopback, também em porta atribuída pelo sistema. `SO_ACCEPTCONN` confirmou `listening=true`; o cliente do mesmo processo recebeu **ConnectionRefusedError, errno 111**.

A falha TCP foi reproduzida fora do Node. A causa exata — política/rede do provedor, isolamento ou outra configuração do ambiente — não foi comprovada. Não foram testadas outras interfaces, túneis ou portas de serviços existentes como contorno.

### Replay em dois processos Node independentes — PASS

Foi usado o módulo **existente** `replay-store.mjs`, sem alteração, SHA-256:

```text
f65eb7d27337934180e82adba62b2435bef134f2c468e605e71a3c4ebbcc30d0
```

O primeiro processo reservou um nonce sintético e encerrou. Um segundo processo novo, usando o mesmo diretório privado, rejeitou o mesmo nonce dentro da janela válida.

| Processo | Exit | Resultado | CPU observada | Duração da operação | Max RSS do processo |
|---|---:|---|---:|---:|---:|
| Primeiro | 0 | nonce aceito | 1,979 ms | 1 ms | 54.784 KiB |
| Novo processo | 0 | replay rejeitado | 1,920 ms | 1 ms | 54.784 KiB |

Coleta concluída em **28/10/2026 18:49:00 UTC**. O RSS equivale a aproximadamente **53,5 MiB** por processo nesse teste mínimo. Não mede a memória de um serviço sob carga, a quota da conta ou o ganho de CPU do Worker. Os valores de CPU pertencem à operação sintética de nonce, não à home pública nem a PBKDF2.

Esse teste comprova persistência entre dois processos sob SSH. **Não** comprova restart do gerenciador, sobrevivência a reboot/redeploy Hostinger, réplicas compartilhadas ou disponibilidade permanente.

## Integridade e decisão

Após os testes, em **28/10 18:51:07 UTC**, os endpoints existentes continuaram respondendo:

- PersistFlow Node: **HTTPS 200**, `service=persistflow`, `authority=file`, `durable=true`.
- Sandbox PHP: **HTTPS 200**, `status=ok`, `database=ok`.

Nenhum serviço Punctum ficou implantado. Não há endpoint HTTPS dedicado, integração Worker, teste remoto de HMAC entre serviços, rollback ou medição de CPU do HEAD com/sem offload. A rota pesada histórica continua sendo a home pública; o teste de nonce não justifica ativar o Password Bridge em modo Access.

**Conclusão do escopo disponível:** Node executa e o replay entre processos funciona, mas o gerenciador consultado falha e o listener de diagnóstico não é acessível nem pelo próprio loopback. Não foi demonstrado um caminho funcional de publicação HTTPS persistente por essa área SSH. Não usar `nohup`, PM2 improvisado, túnel ou rota dentro do PersistFlow para disfarçar essa lacuna.

**G17 continua BLOCKED_EXTERNAL; G23 continua PARTIAL.** Para avançar, falta um gerenciador Hostinger funcional ou uma aplicação QA dedicada, com endpoint HTTPS e recursos incluídos no contrato comprovados. Isso deve ser resolvido no plano de gerenciamento do provedor, sem modificar o PersistFlow. As alternativas sem contratação do [runbook 19](19-hst-001-deploy-rollback.md) permanecem válidas.

Evidências sanitizadas: [inventário SSH e probes](evidence/hst-001-hostinger-ssh-inventory-2026-10-28.json). Os resultados desta continuação são adicionais aos 203 Workers/7 Colagem/26 Node e à CI já registrada; não aumentam essas contagens nem promovem homologação remota.
