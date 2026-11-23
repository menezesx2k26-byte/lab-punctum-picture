# Punctum Hostinger QA — timeout do arquivo (2026-11-12)

**Estado: PARTIAL_VERIFIED / NO_GO_QA / NO_GO_PRODUCTION / NO_GO_R4.**

Escopo: somente a aplicação QA existente `aliceblue-locust-999458.hostingersite.com`; sem cutover, DNS, merge ou mutações na produção Cloudflare. Branch `agent/hostinger-node-migration-20261112`, PR #33 (draft/unmerged). Recuperação sempre validada antes das mudanças e automaticamente reexecutada em falhas.

## Recibos de execução

| Run | SHA | Constatação | Recuperação |
|---|---|---|---|
| [43317011989](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43317011989) | `7f72221a` | Exercício funcional e captura mobile passaram; `page.goto('/')` desktop expirou aos 30 s. | VERIFIED |
| [43324500842](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43324500842) | `8a860491` | `exercise` expirou em HTTP nativo aos 30 s, antes do navegador. O rótulo `stage=setup` ainda não apontava a rota. | VERIFIED; build `01a1d1ff-94f7-70f8-ac74-342b54e77e35` |
| [43326287469](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43326287469) | `33861c08` | Timeout reproduzido e isolado: `GET /arquivo`, 30.002 ms. Antes dele, `POST /admin/api/session` 200/319 ms, `GET /` 200/297 ms, `GET /portfolio` 200/305 ms. | VERIFIED; build `01a1d209-9c17-7206-a677-5d2f8d0e4d3b` |

A leitura de runtime da Hostinger precisa de `?period=1h&limit=1000`; a ausência de `period` causava HTTP 422. Corrigido em `aa162f44`, com regressão `451e28a0`.

O antigo indicador `outOfMemory: true` incluía `SIGKILL` no recibo **de teste bem-sucedido de recuperação de transação**; não era evidência de OOM real. Correção em `34b20264`, com regressões introduzidas em `3c640f58` distinguindo sinal real de recibo. No run `43326287469`, `runtimeSignals.beforeRollback.outOfMemory: false` e `errorKinds: []`.

Os testes gerenciados de `RETURNING/CAS`, dois escritores / 80 commits / espera de lock e `SIGKILL` com rollback/integridade/chaves estrangeiras passaram no diretório SQLite privado da Hostinger. O manifest marcou `integrity: ok`, zero violações de chave estrangeira e zero originais ausentes; isso **não prova** paridade integral de mídia real (referências empacotadas ainda `bundledBytesVerified: false`).

A [CI do SHA `33861c08`](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43326296162) aprovou os jobs `verify` e `hostinger-node-qa`. Não confundir CI verde com aprovação funcional no provedor.

## Investigação técnica restrita

A rota `app/arquivo/page.tsx` aguarda `loadPublicExperience()` e `loadPublishedArchive()` e passa todas as imagens para `ArchiveGrid` (client component). A rota `/portfolio` é menor e respondeu 305 ms no mesmo ensaio; a falha pode estar na consulta/renderização SSR, no processo Node ou ser intermitente. **Ainda não há causa-raiz comprovada.**

Teste isolado local com Node 24, banco SQLite sintético criado pelo `seed.mjs`, e a consulta de arquivo equivalente: 112 imagens publicadas, ~29.180 bytes de JSON e dez consultas entre **0,706 ms e 2,241 ms**. Esse teste mede apenas a consulta SQLite local, não SSR/Vinext nem latência na Hostinger; não demonstra que a consulta no provedor tem o mesmo desempenho. É evidência contra um custo SQL intrínseco de 30 s no dataset sintético.

O ensaio `33861c08` adicionou `requestTrace` com rota/método/status/duração (sem cookies ou credenciais) e manteve a navegação mobile+desktop, sem relaxar o timeout. Nenhum novo deploy deve ser disparado antes de reconciliar o UUID de build atual e o estado da instância.

## Próximo gate seguro

1. Isolar tempo de `loadPublishedArchive` vs. renderização SSR de `ArchiveGrid` com benchmark do candidato Node/Vinext e, se necessário, instrumentação estritamente QA.
2. Repetir o QA na **mesma aplicação existente**, com nonce/build esperado e rollback/backup verificados, apenas após evidência local de correção. Não aumentar simplesmente timeout nem ignorar a página `/arquivo`.
3. Exigir todas as etapas: SSR e Studio, autenticação, upload/capa/publicação/Sharp, navegação mobile+desktop, persistência após restart e novo build, arquivo, rollback, noindex e isolamento de produção.
4. Manter `NO_GO` para R4 e produção enquanto a homologação gerenciada falhar. Não tratar QA sintético como validação do acervo real.

Arquivos alterados nesta rodada: `scripts/hostinger_managed_qa_test.py`, `scripts/hostinger_candidate_qa.py`, `scripts/hostinger-managed-functional.mjs`, `requests/hostinger-managed-qa.json`; todos na branch da PR #33. Nenhuma alteração em `main`.
