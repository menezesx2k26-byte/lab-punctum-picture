# PUNCTUM PICTURE R4 — ciclo D, integridade de originais legados sem digest

**Data:** 08/11/2026. **GOAL:** SPEC R4 original §23, G01–G24. **Decisão:** `NO_GO_PRODUCTION`. Esta execução só altera código, testes sintéticos e documentação; não altera dados reais, produção, Access, D1/R2 remotos, billing, merge ou deploy.

## Reconciliação obrigatória do ciclo C

PR [#32](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32) permanece aberta, draft e sem merge. A árvore local de C `89e09839414209601db1b03accaf3a97e1eabafd` foi publicada remotamente por commit `006511cc6221fd202696481ec1de0f25fc0da9c6`, com parent `8966178c01ea4a461054fcf34e6afca113647873`, sem reset/rebase/force. A [CI #42529437093](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42529437093) está `completed/success` no SHA exato, job `verify` com todas as etapas concluídas sem falhas. Artefato `r4-browser-evidence` ID `13636404608`, digest `sha256:c24c7be9d363fa864927ec409cdf4789b1fd2a513ffa60a7af73317c4b6d8d7b`; ZIP não inspecionado internamente. Checkpoint de PR [#6727939323](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32#issuecomment-6727939323) e documento já existente [Drive Sgtmenezes](https://docs.google.com/document/d/12oLVbThH1KUncV7XiYzRQ4L4MMprwoDJg0LZmyHBsSA/edit) têm readbacks confirmados, preservando checkpoints anteriores.

## Risco material reproduzido por RED — originais sem SHA (G05/G12)

Registros de imagem `ready` anteriores à migração `0011` podem ter `original_sha256=NULL`. A rota privada de mídia só comparava `R2.size` e `R2.httpMetadata.contentType` com os campos originais D1 **quando existia** um SHA persistido. Assim, um objeto R2 com bytes truncados ou MIME alterado podia responder **HTTP 200** na rota autenticada de download, e HEAD não detectava divergência. O novo teste sintético reproduziu `download GET image/png/78: expected 200 to be 503`.

**Correção fail-closed:** para todo `ready` autenticado, GET e HEAD agora comparam **incondicionalmente** comprimento do objeto R2 e tipo de mídia com D1 antes de entregar bytes, headers de sucesso ou passar um original para transformação. Divergência retorna `503 ORIGINAL_INTEGRITY`, sem bytes privados. Em registros com SHA original, a verificação criptográfica byte a byte e de metadados continua; em registros legados sem SHA, essa mudança **não inventa um hash histórico** nem prova autenticidade ou conteúdo real. Downloads de originais coerentes continuam disponíveis, sujeitos à autorização por requisição.

**Contraprovas:** novo teste cobre originais truncados com MIME preservado e mesmo tamanho com MIME alterado, nos presets `download`, `thumb` e `gallery`, métodos GET e HEAD. A fixture isolada de autorização `uses R2 metadata only for authorized HEAD requests` declarava `size_bytes=1` mas armazenava PNG real maior; o próprio teste agora corrige esse **registro sintético de preparação** para comprimento efetivo antes de testar autorização, em vez de exigir sucesso para um par D1/R2 sabidamente contraditório. A primeira regressão completa também revelou uma fixture semelhante em `client-access-flow.spec.ts`: JWT/Access, R2 e isolamento eram válidos, porém D1 ainda declarava 1 byte; esse caso foi corrigido **somente na montagem do teste**. Não houve alteração em fixtures históricas persistidas, banco QA ou fotos reais.

### Evidência da rodada D

- **RED:** `client-media.spec.ts` retornou 200 em download GET apesar de divergência R2/D1 e falhou conforme esperado.
- **GREEN focado:** `client-media.spec.ts` **16/16 PASS**, após corrigir os checks e coerência da fixture do próprio teste; sem exclusão de teste.
- **Primeira regressão ampla:** 245/246 PASS; único FAIL em `client-access-flow.spec.ts`, pelo mesmo D1 sintético incompatível (1 byte versus PNG real). Corrigida a montagem do teste, `client-media.spec.ts` + `client-access-flow.spec.ts` **17/17 PASS**. A regressão completa foi repetida posteriormente sobre a árvore corrigida.
- **Regressão completa final:** `npm test` **246/246 PASS em 57/57 arquivos** na árvore corrigida; saída 0, duração ~105 s, incluindo Access real/JWT em mock controlado, integridade R2/D1, revogação, SSR e Studio.
- **Node selecionados:** 11/11 PASS (raster real do produto, G17 observador histórico e G23 preflight).
- **SSR do bundle:** 1/1 PASS em Miniflare, home e Studio independentes.
- **TypeScript, lint, build Vinext:** PASS; build preservou warnings conhecidos de Vite/Vinext.
- **Auditoria de dependências:** `npm audit --audit-level=low` = **0 vulnerabilities**.
- **Chromium E2E local real:** **14/14 PASS**, código de saída 0, cobrindo clientes sintéticos A/B, JWT/Access, favoritos, downloads byte a byte, 8 viewports, Studio/Colagem, upload admin com progresso, restart workerd, rollback local de armazenamento e revogação sem afetar cliente B. Relatório: `outputs/browser-e2e/report.json`. Não substitui dispositivos físicos nem QA remoto Workers Free.
- **Commit remoto/CI do ciclo D:** pendentes no momento de redigir esta seção; exigem nova árvore, parent do SHA remoto C, readback e CI no SHA D exato.

## Requisitos e limitações que permanecem

- **G05 FAIL:** a SPEC mantém **25 MiB = 26.214.400 bytes** por foto, mas o Images Binding `.input()` admite até **20 MB**. Os guards operacionais não constituem solução integral. Não habilitar upload de 25 MiB nem imagem via URL pública/bearer só por hipótese arquitetural. Falta derivação segura, SHA de ponta a ponta, transformação no Workers Free com CPU/memória/quota reais e QA remoto integrado e autorizado.
- **G17 FAIL:** [coleta histórica #42527198252](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42527198252) obteve GraphQL HTTP 200, porém zero amostras de CPU; não mediu cold/MISS do SHA final. Cache HIT, simulação e latência HTTP não suprem a prova.
- **G23 BLOCKED_EXTERNAL:** [preflight #42527198228](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42527198228) registrou Cloudflare subscriptions HTTP 403, D1 HTTP 401, nenhum write/rollback. Sem QA segregado e autorizado não executar rollback remoto.
- **G15, G19, G20, G22 BLOCKED_EXTERNAL:** testes físicos TalkBack/VoiceOver, parecer independente, LGPD do estúdio e autorização específica de release não foram obtidos.
- **Financeiro/governança:** custo incremental R$ 0,00; `PRIVATE_GALLERIES_ENABLED=false` em configuração versionada; PR draft/unmerged; produção não alterada; `NO_GO_PRODUCTION`.

## Matriz original G01–G24 — estado conservador nesta rodada

Colunas: `GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO`. `C` = SHA remoto `006511c` com CI aprovada; `D` = mudanças incrementais deste relatório com novo SHA/CI ainda pendentes. Os 17 PASS permanecem **históricos**, limitados aos SHAs/ambientes citados nos relatórios 16, 25, 38–40; não são reaprovações automáticas.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS histórico | Engenharia | C/D | Git/PR | local/GitHub | tree C, PR #32 | readback D | conferir parent/árvore D |
| G02 | PASS histórico/revalidar | Engenharia | C/D | Vitest/Node | local/CI | CI C #42529437093 | CI D | reexecutar suite e Actions D |
| G03 | PASS histórico | Engenharia | C | cadastro | QA anterior | 16/25 | QA D não rodada | preservar prova |
| G04 | PASS histórico | Engenharia | C | galeria/publicação | browser anterior | 25/40 | G05 | manter E2E |
| G05 | **FAIL** | Engenharia/Estúdio | C/D | integridade/tamanho | local | media test, 40/41 | 25 MiB Free não homologado | arquitetura e QA seguro |
| G06 | PASS histórico | Segurança | C | JWT Access | QA anterior | 16/25 | signoff G19 | revalidar SHA final |
| G07 | PASS histórico | Responsável OTP | C | OTP humano | QA anterior | 25 | QA D não rodada | preservar prova |
| G08 | PASS histórico | Engenharia | C | revogação | QA/local anterior | 25/40 | QA D não rodada | manter regressão |
| G09 | PASS histórico/revisar | Segurança | C/D | A/B, 404 | local/Chromium | 39/40 | QA D não homologado | revalidar isolamento |
| G10 | PASS histórico | Segurança | C | mídia off 404 | local/QA anterior | 39/40 | runtime produtivo não alterado | manter flag OFF |
| G11 | PASS histórico | Frontend | C | favoritos | Chromium | CI C | CI D | manter E2E |
| G12 | PASS histórico/revisar | Engenharia | C/D | SHA/original/HEAD | testes locais | media 16/16 | legado sem digest histórico | preservar checks, QA |
| G13 | PASS histórico | Frontend | C | viewer/teclado | Chromium | CI C | G15 físico | manter E2E |
| G14 | PASS histórico | Frontend | C | upload admin | Chromium | CI C | 25 MiB bloqueado | QA completo |
| G15 | **BLOCKED_EXTERNAL** | QA assistivo | C/D | físico NOT_RUN | aparelhos | GOAL36 | TalkBack/VoiceOver | execução real |
| G16 | PASS histórico/revisar | Engenharia | C/D | SSR/Studio/Colagem | CI/local | CI C, 40 | CI D | preservar não regressão |
| G17 | **FAIL** | Infra CPU | C/D | GraphQL 0 amostras | QA read-only | #42527198252 | CPU cold/MISS | medir SHA final no Free |
| G18 | PASS histórico/revisar | Engenharia QA | C | recovery D1/R2 | QA/local anterior | 38–40 | novo QA não autorizado | preservar hashes e restauração |
| G19 | **BLOCKED_EXTERNAL** | Revisor independente | C/D | parecer NOT_RUN | externo | 39–41 | signoff formal | revisão independente |
| G20 | **BLOCKED_EXTERNAL** | Responsável LGPD | C | aprovação NOT_RUN | estúdio | GOAL36 | titular não aprovou | aprovação formal |
| G21 | PASS em C / D pendente | Maintainer | C/D | Actions | GitHub | CI C | CI D | conferir SHA e artefato |
| G22 | **BLOCKED_EXTERNAL** | Proprietário | C/D | release NOT_RUN | governança | GOAL36 | gates FAIL | só após DoD |
| G23 | **BLOCKED_EXTERNAL** | Infra QA | C/D | preflight | Cloudflare read-only | #42527198228 | 401/403; QA não segregado | permissão/rollback real |
| G24 | PASS histórico/checkpoint D pendente | Engenharia | C/D | repo/Drive | GitHub/Drive | comentário C, Drive | SHA/CI D | acrescentar checkpoint com readback |

**Conclusão local:** a negativa de objetos legados inconsistentes é um ganho de integridade verificável, não uma homologação de G05. Regressão local completa e E2E verdes, mas nenhuma aprovação externa foi inferida. Concluir versionamento remoto e CI próprios de D antes de considerar o ciclo entregue.
