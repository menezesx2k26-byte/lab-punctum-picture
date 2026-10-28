# HST-001 — resultado técnico e bloqueio de ativação QA

28/10/2026. **HOSTINGER_BRIDGE_QA_BLOCKED / PRODUCTION_NO_GO.** Nenhum serviço Punctum foi implantado na Hostinger; nenhum Worker foi publicado. Esta rodada implementou e testou hardening do adaptador existente, coletou evidência Cloudflare por API e preservou o PersistFlow. Não confundir essas entregas com homologação remota do bridge.

PR de implementação: [#24](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/24), draft sobre #20. A CI do SHA final e o handoff Drive são registrados no corpo da PR após verificação.

## Baseline e rastreabilidade

- Checkout inicial `/workspace/lab-punctum-picture`: `aac2d448d9f54e9215c278892ab3a4a7f26237a4`, branch `work`, limpo, sem alterações não commitadas.
- PR #17: `a242b6eed8b829e51980ee8e61d20bef82c2e938`; PR #20: `71ddde6bc8188b655597fb5f2ab38a868b374ebf`. Ambas abertas/draft, sem merge.
- PR #20 acrescenta 34 commits e altera 29 arquivos sobre #17: autorização admin fail-closed, revogação de sessões, exportação LGPD/snapshot e atribuição de auditoria, entre outros hardenings. Essas correções estão preservadas.
- Branch HST: `agent/hst-001-hostinger-qa-20261028`, criada exatamente sobre #20 em worktree separado `/workspace/hst-001`. Nenhuma alteração foi aplicada ao checkout inicial.
- Baseline executada antes de editar: **199 testes / 47 arquivos PASS**. Código final de runtime: `ee7b6d65e96fdcbc5490edcac58970f0779d412e`; alterações posteriores são diagnóstico/documentação.

## P0 — Hostinger e preservação do PersistFlow

HTTPS `GET /healthz` no domínio histórico `darkslategrey-raccoon-448222.hostingersite.com` retornou **200**, `service=persistflow`, `authority=file`, `durable=true`. Nova sequência em 28/10 às 17:39:24 UTC confirmou **6/6 HTTP 200**. Latências observadas no terminal local, com conexão reutilizada: **233,822; 10,626; 26,462; 15,046; 14,163; 15,230 ms**. São probes do **PersistFlow existente**, não desempenho de um bridge Punctum.

O domínio está ocupado e foi excluído de implantação. Não houve restart, alteração de arquivo/secret, deploy, processo novo ou mudança de domínio dessa aplicação. O health declara durabilidade; esta missão **não** executou restart/redeploy para comprová-la.

O terminal local conectado possui SSH e autenticação GitHub. Não foi encontrado alias/chave Hostinger na configuração SSH inspecionada. A documentação histórica descreve Node 22–24 e diretório durável fora do deployment, além de um sandbox PHP separado em outro domínio; isso **não comprova** plano, recursos ou disponibilidade atuais. Não há ferramenta hPanel/browser de controle disponível nesta sessão.

O secret `HOSTINGER_API_TOKEN` existe no repositório de infraestrutura `menezes-platform/ops-codex-os`; apenas seu nome foi lido. Para consultar a API sem copiar esse secret, foi criada a branch auxiliar **não integrada** `agent/hst-001-readonly-20261028`, commit `7a0897474d989471483d983a3c6eaad5a05951a8`, contendo somente um workflow de inventário por GET. Nenhum arquivo da aplicação foi modificado.

O [run 40735613050](https://github.com/menezes-platform/ops-codex-os/actions/runs/40735613050) falhou **antes de iniciar qualquer step**. Annotation do check `122983194700`:

> The job was not started because your account is locked due to a billing issue.

Logo, **nenhuma consulta desse job chegou à API Hostinger**. Não houve tentativa de pagar, desbloquear faturamento ou ampliar plano. Inventário de CPU/RAM/disco/processos, slots Node, origem/versionamento atual, permissões, isolamento e custo incremental permanece **BLOCKED**. A existência do secret não comprova acesso atual nem capacidade disponível.

## P0 — Cloudflare verificada e versão efetiva

O OAuth padrão local apontava para outra conta e não foi usado para modificar infraestrutura. Um perfil existente foi atualizado pelo fluxo normal do Wrangler e permitiu ler a conta correta; não houve login interativo nem exposição de token. Esse perfil tinha acesso insuficiente a observabilidade/D1. A investigação prosseguiu com os secrets já existentes do próprio repositório, em workflow restrito à branch HST.

Evidência remota final: [run 40738766054, success](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40738766054), SHA `64023a9d6a36eaeba5bd82854f0520eacc92ca60`, e [JSON sanitizado](evidence/hst-001-cloudflare-40738766054.json). O workflow usa endpoints fixos, GETs e POSTs de consultas GraphQL/telemetry com `dry:true`; não faz mutations, deploy, escrita D1/R2 ou alteração de billing/Access.

- Workers Punctum observados: `punctum-picture-albums-qa`, `punctum-picture-migration` e `punctum-picture-miranda`.
- QA: deployment `224e43a5-7c5e-4521-9d1d-901dd29ad8a0`, criado **24/10/2026 19:17:42 UTC**, versão `446943ce-1ea5-4f7e-94ae-351c7b016424`, tráfego 100%. Não foi atualizado por esta missão.
- Não há tag Git na versão lida. O checkout local histórico `dd8831f` é contexto, não prova criptográfica do artefato implantado. **Não atribuir o deploy ao HEAD de #20 ou da HST.**
- Flags efetivas: `CLIENT_AUTH_MODE=access`, `PRIVATE_GALLERIES_ENABLED=true` no QA histórico; backend de senhas externo não aparece configurado. Produção não foi ativada.
- Observabilidade de invocação habilitada. A API account-settings informa `default_usage_model=standard`; esse campo não é comprovante de assinatura Workers nem de orçamento disponível.
- R2 listou buckets QA originals/backups/restored e os buckets públicos existentes. Nenhum objeto foi lido/transferido. D1 list retornou 401 no perfil OAuth usado: **não** foi repetida contagem nem escrita. A evidência anterior de **cinco contas em cada D1 histórico** permanece registrada no relatório 17 e impede uso destrutivo desses bancos.
- Billing: o OAuth e os candidatos 1/3 tiveram 403. O **candidato 2** guardado no repositório obteve **200**. Retornou três assinaturas `Cloudflare Free Plan`, `Teams Free Base` e `R2 Paid`, todas com preço-base 0 e estado textual `Paid`. Isso supera o bloqueio de leitura anterior para subscriptions, **mas não comprova consumo variável zero nem a franquia Workers disponível**. Não houve alteração de assinatura.

## CPU: o que foi medido e o que produz os picos

Consulta `workersInvocationsAdaptive`, de **2026-10-24T00:00:00Z a 2026-10-28T13:30:00Z**, reproduzida nesta missão:

| Métrica | QA antigo, sem bridge | QA com bridge / HEAD atual |
|---|---:|---|
| Requisições | 142 | NOT_RUN |
| Erros agregados | 0 | NOT_RUN |
| CPU p50 | 4,259 ms | NOT_RUN |
| CPU p95 | 12,667 ms | NOT_RUN |
| CPU p99 | 134,2 ms | NOT_RUN |
| Worker wall time p50/p95/p99 | 307,4 / 925,893 / 1052,753 ms | NOT_RUN |

Wall time do Worker **não** mede navegador → Worker → Hostinger. Nenhum resultado depois de offload ou ganho percentual foi produzido. A referência publicada Workers Free de 10 ms é comparação de risco; o contrato/limites efetivos e uso agregado ainda precisam de confirmação.

Uma consulta independente de **eventos**, de 24/10 até **28/10 17:45:47 UTC**, foi filtrada pelo serviço QA. Retornou uma janela limitada de **200 eventos**, dos quais **126 têm CPU numérica**. Não são 200 requisições. As três credenciais consultaram os mesmos eventos: **não triplicar amostras**. Percentis abaixo são calculados sobre essa amostra limitada, em milissegundos inteiros dos logs, e não substituem os percentis GraphQL ponderados.

| Família de rota | Eventos com CPU | p50 / p95 / p99 (ms) |
|---|---:|---:|
| Home pública `/` | 3 | 134 / 166 / 166 |
| Admin | 65 | 4 / 12 / 13 |
| API de clientes | 48 | 3 / 7 / 10 |
| `/api/client/session` | 4 | 0 / 2 / 2 |
| Otimização de imagem | 2 | 0 / 0 / 0 |
| Mídia pública | 2 | 2 / 2 / 2 |
| `/api/client/password` | 1 | 0 / 0 / 0 |
| Outras | 1 | 1 / 1 / 1 |

As três invocações da **home pública** consumiram **129, 134 e 166 ms**, em três versões QA antigas distintas. A versão atualmente ativa aparece em uma delas com **134 ms CPU / 973 ms wall time**. O JSON contém timestamp e version ID de cada amostra. Não houve campo `coldStart` nessas respostas; **não afirmar que a causa está comprovada como cold start**.

O caminho da home passa pelo renderer vinext/React e carregamento de conteúdo público; ele não chama o Password Bridge. Renderização/inicialização é candidata à investigação, mas os logs não decompõem seu custo interno. As amostras de sessão em modo Access também **não medem o custo de PBKDF2**. Há indício concreto por rota para continuar a análise; não há fundamento para atribuir o pico histórico à senha nem para alegar causa exclusiva a partir de três eventos.

## P1 — implementação efetiva

Reutilizado o serviço existente, sem nova operação de imagem ou envio de fotografias:

- Node rejeita campos extras em requests/credenciais assinados.
- Worker exige envelope de resposta exato; identidade/tokens adicionais não são aceitos.
- Worker projeta somente hash, salt e iterações da linha D1 antes de enviar ao serviço, sem nome, e-mail, ID ou revisão de sessão.
- Deadline de cinco segundos cobre fetch e body, cancela stream excedente/travado e libera respostas tardias. Backend selecionado indisponível continua retornando 503, sem fallback local silencioso.
- Circuit breaker: três falhas, pausa de 30 segundos e uma probe exclusiva, por isolate/objeto de bindings. Sucessos antigos em voo não fecham um circuito de geração posterior. Não é proteção distribuída global.
- Logs do processo Node: allowlist de evento/status/duração; startup estruturado, sem bodies, paths, headers, tokens ou erros brutos.
- PBKDF2-SHA256 permanece em **310000 iterações**, sem enfraquecimento. HMAC, nonce persistente, limites de tamanho/taxa/concorrência e HTTPS do adaptador permanecem.

**Operações transferidas: nenhuma.** O serviço de senha não atende o caminho pesado observado. Mover renderer público inteiro para Hostinger seria outra arquitetura e não uma operação pesada isolada homologada. Nenhum objeto privado foi transferido. Imagens permanecem na Cloudflare; não foi medido benefício que justifique enviá-las à Hostinger.

## P2/P4 — bloqueios de implantação e desempenho

A implantação de QA foi autorizada condicionalmente a isolamento, ausência de custo adicional e dados sintéticos. Essas condições **não puderam ser demonstradas**: site Node conhecido ocupado, inventário atual indisponível e nenhum slot/processo seguro comprovado. Por isso não foi criado secret de bridge remoto, app, processo, endpoint ou integração Worker. Não se afirma que o plano seja incapaz de Node; apenas que **capacidade adicional segura não foi provada**.

CPU/latência de tratamento, RSS Hostinger, reinicializações, quotas/tráfego agregado, custo efetivo e rollback remoto ficam **NOT_RUN/BLOCKED**. Foram feitos somente probes HTTPS do PersistFlow e consultas de metadados/telemetria Cloudflare. Nenhuma compra ou recurso pago foi criado; sem inventário e medição de consumo, **zero custo incremental de uma futura implantação não está comprovado**.

Procedimentos de implantação/rollback e alternativas sem contratação: [runbook 19](19-hst-001-deploy-rollback.md). G17 continua bloqueado; G23 continua parcial.

## P3 — testes realmente executados

| Execução | Resultado |
|---|---|
| Baseline antes das mudanças | 199/199 Workers, 47 arquivos |
| RED `8ab7f7c` | 3 testes provider falharam: envelope aceito, circuito ausente, body sem deadline; 1 Node falhou por campos extras |
| GREEN `5a584b9` | 10/10 provider; 12/12 Node bridge |
| RED `98a201e` / GREEN `c3fae76` | logger ausente reproduzido; 14/14 bridge após correção |
| Revisão / RED `780a123` / GREEN `ee7b6d6` | regressão de conta D1 completa reproduzida e corrigida por projeção; 11/11 provider |
| Suíte completa após a última mudança de runtime | **203/203 Workers, 48 arquivos**, 71,34 s |
| Colagem | **7/7** |
| Node CSS + publicação Colagem + bridge | **26/26**, incluindo **14 bridge** |
| Typecheck / lint / build | **PASS** |
| `npm audit --audit-level=low --json` | **0 vulnerabilidades** no lockfile desta branch |
| `git diff --check` | **PASS** |

Bridge Node foi testado em HTTP **loopback**, não HTTPS remoto. Cobertura: credencial válida, assinatura inválida/ausente, timestamp vencido/futuro, nonce repetido, corpo adulterado, payload excessivo, saturação, rate limit, credenciais A/B, schemas, logs sanitizados e replay compartilhado após nova instância/processo. O Worker cobre falha/reposta inválida, timeout do body, circuito/probe exclusiva e cancelamento. A suíte completa cobre isolamento D1/R2, sessões, site/Studio e Colagem em emulação/código.

Não executados: restart/redeploy Hostinger, handshake Worker→Hostinger real, rollback remoto, CPU do HEAD no edge, dispositivos físicos, OTP real e validação visual atual. Os avisos do builder e o log legado de imagem inválida em teste negativo são registrados como avisos; não foram apresentados como testes falhos. Os dez alertas Dependabot na **main** continuam distintos do audit limpo desta branch.

Um subagente revisou o código e o workflow somente em leitura; os dois achados foram corrigidos. Isso não equivale ao sign-off independente formal G19.

## Definition of Done HST-001

| Item | Estado / evidência |
|---|---|
| Hostinger inventariada e PersistFlow preservado | **BLOCKED** para inventário; HTTPS/identidade vivos e ausência de mutações comprovados |
| Node isolado implantado por HTTPS | **BLOCKED**, nenhum alvo seguro demonstrado |
| Autenticação/proteções do serviço remoto | **BLOCKED**; hardening e testes locais PASS |
| Worker QA integrado reversivelmente | **BLOCKED**, sem configuração/deploy remoto |
| Operação pesada processada pelo intermediário | **BLOCKED**; home antiga identificada por rota, offload não justificado |
| CPU e latência antes/depois | **BLOCKED**; somente baseline antigo e eventos históricos |
| Testes completos e CI | testes locais PASS; CI da nova PR deve ser confirmada no SHA final e registrada na PR |
| Custo incremental | **BLOCKED** para implantação futura; nenhuma contratação/novo recurso nesta missão |
| Rollback remoto testado | **BLOCKED / NOT_RUN** |
| Commits, PR, matriz, estado e handoff | commits e documentos produzidos; referências finais de PR/CI/Drive no encerramento da PR |

**Decisão:** não emitir `HOSTINGER_BRIDGE_QA_PASS`. Não executar merge, deploy de produção, migração, troca de Access para senha nem publicação de álbuns privados. OTP real, LGPD, segurança, recuperação e dispositivos mantêm seus gates independentes.
