# PUNCTUM PICTURE R4 — ciclo E: vínculo de upload, snapshot público e elegibilidade G23

**Data:** 08/11/2026. **DoD:** G01–G24 da SPEC R4 original, §23, conforme reconciliação 16 e GOAL 36; **não** matriz Argon. **Status:** `NO_GO_PRODUCTION`. A SPEC original não estava presente no checkout; referências preservadas em 16/35/36 não foram extrapoladas.

## Baseline e preservação de histórico

- PR [#32](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32) em `open/draft/unmerged`, branch `fix/punctum-albums-r4-completion-20261107`, base da PR #24; histórico e commits irmãos preservados.
- HEAD remoto inicial ciclo E: `9a28a035dc1f9218e4290cae5aca6d3493be40c4`, árvore `2c029aca923fda7080d3964ee004c4ea2cb75ab7`. Checkout local limpo em commit irmão `90a3f586a6f99ae2046286651b8b4ac68c460b54` com mesma árvore. CI exata D [#42530988559](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42530988559): `completed/success`, artefato Chromium ID 13637027636, digest `sha256:b0f8c3c10c000d1fdffc75ab47aef988f8e7f855d259019bb1fb0a555b59958e`. Os resultados C [#42529437093](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42529437093) também estão preservados, sem republicação.
- Commit local do ciclo E e novo commit remoto têm genealogias distintas: publicar somente a nova **árvore idêntica** sobre parent remoto D, fast-forward sem force; confirmar PR/ref/tree/parent/CI exatos. Não substituir o histórico já aceito.

## G05 — TDD de intenção/objeto persistidos após restauração

**RED reproduzido:** registros legados/restaurados em `client_gallery_upload_intents` podem referenciar uma chave R2 de outra galeria, chave diferente da imagem associada ou tamanho/MIME conflitantes. Chaves são únicas por tabela, mas não há FK para forçar igualdade entre os campos de intenção e imagem. Antes da correção, a rota `PUT /direct` chegava à assinatura (`UPLOAD_SIGNATURE` 403) em vez de negar a inconsistência antes de acessar o corpo/R2; `POST /complete` também podia seguir em direção ao bucket. Teste sintético prova o contrato de rejeição **antes** de `put/get/head/delete` ou Images.

**GREEN implementado:** após carregar a intenção D1 e o guard de limite de bytes, a API reconcilia `image_id`, `gallery_id`, `storage_key`, `expected_mime`, `expected_size`, `deleted_at` e status esperado com a linha da imagem. A chave deve ser exatamente `client-galleries/<gallery-id>/<image-id>.<extensão>`; divergências falham em `409 UPLOAD_INTENT_MISMATCH` antes de assinatura, stream, leitura/escrita R2 ou validação Images. Intenções válidas já concluídas ainda são idempotentes, e falhas não mutam linhas. Quatro cenários adversos, cada um com D1 sintético independente, cobrindo `PUT` e `POST`.

**Limite:** esta defesa de consistência não garante que arquivo real maior que 20 MB foi decodificado nem supre a validação independente/quotas do contrato 25 MiB.

## G17 — caminhos privados com escape aninhado

**RED reproduzido:** snapshot publicável era aceito quando uma rota privada surgia como `%252Fapi%252Fclient...`, escape duplo/triplo de `/admin/api/albuns-privados`, entidade HTML de `&` aninhada, `client&#45;galleries` ou `punctum&#95;client&#95;session`.

**GREEN:** o validador de HTML SSR público normaliza, *somente para inspeção*, separadores `/`, hífens e sublinhados escapados via JS, URL ou entidades HTML. Até oito passagens, sem avaliar scripts, executá-los ou modificar o HTML entregue; cadeias que exigiriam mais passagens falham fechadas. O detector existente de rotas, cookies, Access, sessões e termos privados é aplicado ao texto normalizado tanto no staging quanto na leitura, junto com build ID, epoch e SHA-256.

**Limite G17:** um filtro de marcadores não é um auditor universal de PII. O snapshot continua opcional e depende de produtor de HTML comprovadamente confiável. Leituras `HIT`, Miniflare e CPU local não demonstram 10 ms CPU reais em first/cold/MISS. O workflow histórico [#42527198252](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42527198252) recebeu HTTP 200 com **zero** amostras; não houve qualificação do SHA atual. Preservar Studio, Colagem, SEO, rascunhos e nenhuma publicação de conteúdo privado.

## G23 — identificar lacunas de versão e autenticação, ainda somente leitura

**RED reproduzido:** um único ID de versão Worker era suficiente para `inventoryVerified=true`, embora não houvesse predecessor sequer enumerado. O preflight agora exige **duas versões distintas** no inventário somente leitura e identifica quando o predecessor está ausente; mesmo com duas, `rollbackAuthorized=false` e a comparação/execução da versão anterior **não está comprovada**.

**Diagnóstico adicional:** o coletor foi preparado para chamar `GET /user/tokens/verify`, endpoint oficial Cloudflare de validação de token, sem registrar ID, cabeçalhos de autenticação, respostas brutas ou expiração. Apenas `http`, `status` permitido (`active/disabled/expired/unverified`) e booleano `verifiedActive` entram no relatório. Quando a credencial é reconhecida como ativa, `D1 401` continua significando **escopo/conta/recurso não verificado**, e `subscriptions 403` identifica a necessidade possível de `Billing Read`/papel de conta, não uma autorização inventada. Retornos não autenticados ou rede bloqueada permanecem inconclusivos.

**Fontes técnicas verificadas:** [Cloudflare API token verification](https://developers.cloudflare.com/api/typescript/resources/user/subresources/tokens/methods/verify/), [D1 Read](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/get/), [Billing Read](https://developers.cloudflare.com/billing/understand/billing-permissions/). Novos GETs não implicam mutações, upgrade ou acesso a dados pessoais; qualquer Workflow novo deve ser lido antes de afirmar resultado remoto. O último inventário histórico [#42527198228](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42527198228) registrou D1 **401**, assinatura **403**, sem writes/rollback. Continua **G23 BLOCKED_EXTERNAL**; falta QA existente, segregado e expressamente autorizado para rollback integral.

## Incompatibilidade G05: 25 MiB versus 20 MB do Images Binding

O limite da SPEC é **26.214.400 bytes**. [Images Binding `.input()` ainda limita entradas a 20 MB](https://developers.cloudflare.com/images/get-started/limits/), e [Workers Free impõe 10 ms CPU/128 MB de memória por isolate](https://developers.cloudflare.com/workers/platform/limits/).

| Opção | Lacuna factual não resolvida | Decisão |
|---|---|---|
| Originais privados até 25 MiB no R2, derivados criados por Images Binding do próprio original | `.input()` não aceita >20 MB | **Não ativar** |
| Original privado 25 MiB + derivado gerado no browser do admin | Derivado controlável pelo remetente; validação independente do original 25 MiB e vinculação derivado/original ainda não comprovadas | **Não ativar** |
| Transformação Images por URL remota | Limite remoto distinto não torna segura URL privada/bearer; risco de logs, caches, quota, custo, expiração/revogação e acesso cross-client | **Não ativar** |
| Decoder completo/WASM no Worker Free | CPU de decodificação e memória/quotas reais ainda não homologadas; formato animado/zip/pixel bombs | **Não ativar** |
| Permanecer com limite operacional de 20.000.000 bytes | Preflight e continuação protegidos; **desvio da SPEC não aprovado** | **Manter guarda e G05 FAIL** |

Não alterar silenciosamente a SPEC nem declarar suporte 25 MiB sem produto E2E remoto com Admin→R2→validação completa→D1→ready→galeria/download, SHA e provas de CPU/quotas/custo, dentro das autorizações. R2 original e Images derivado ainda exigem arquitetura verificada, não apenas plausível.

## Matriz canônica G01–G24 — status conservadores

`D` refere ao SHA remoto `9a28a035` com CI aprovada; `E` às mudanças deste relatório até que SHA/CI próprios estejam comprovados. `PASS histórico` nunca significa aprovação automática da nova árvore. Colunas vinculantes: `GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO`.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS histórico/revalidar | Engenharia | D/E | Git tree, PR, base | local/GitHub | PR #32, 41/42 | genealogia E | readback SHA final |
| G02 | PASS histórico/revalidar | Engenharia | D/E | Vitest/Node/build | local/CI | #42530988559 | CI E | conferir CI exata |
| G03 | PASS histórico | Engenharia | D | cadastro admin | Chromium | 16/25/41 | QA atual não executado | preservar E2E |
| G04 | PASS histórico | Engenharia | D | galeria/publicação | Chromium | 25/41 | 25MiB pendente | QA integrado |
| G05 | **FAIL** | Engenharia/Estúdio | D/E | intenção↔imagem↔R2, SHA | D1/R2 sintético | testes upload/42 | 25 MiB Free sem solução/QA | validar pipeline seguro |
| G06 | PASS histórico | Segurança | D | Access JWT | QA anterior | 16/25 | revisão independente | revalidar SHA final |
| G07 | PASS histórico | Responsável OTP | D | OTP real | QA anterior | 25 | prova física futura | preservar prova |
| G08 | PASS histórico | Engenharia | D | sessão/revogação | QA/local anterior | 25/41 | revisão externa | revalidar |
| G09 | PASS histórico/revisar | Segurança | D/E | A/B/404 | sintético/local | 39–42 | QA E não homologado | isolamento remoto |
| G10 | PASS histórico | Segurança | D | mídia negada, flag off | QA/local | 41 | runtime produção não alterado | manter off |
| G11 | PASS histórico | Frontend | D | favoritos | Chromium | CI D | CI E | revalidar |
| G12 | PASS histórico/revisar | Engenharia | D/E | hash/download/HEAD | local | testes media/41 | QA E não homologado | preservar SHA original |
| G13 | PASS histórico | Frontend | D | viewer/teclado | Chromium | CI D | G15 físico | revalidar |
| G14 | PASS histórico | Frontend | D | upload admin | Chromium | CI D | tamanho 25 MiB | QA E2E |
| G15 | **BLOCKED_EXTERNAL** | QA assistivo | D/E | TalkBack/VoiceOver NOT_RUN | físico | 35/36/42 | aparelhos/roteiro humano | executar em dispositivos |
| G16 | PASS histórico/revisar | Engenharia | D/E | Studio/Colagem/SSR | CI/local | #42530988559 | CI E e cold/MISS | não regressão |
| G17 | **FAIL** | Infra Workers Free | D/E | snapshots/CPU histórica | local/QA read-only | #42527198252 | zero samples SHA final | medir cold/MISS real |
| G18 | PASS histórico/revisar | Engenharia QA | D/E | backup/restore | QA/local anterior | 38/41 | integridade QA atual | auditar depois |
| G19 | **BLOCKED_EXTERNAL** | Auditor independente | D/E | parecer NOT_RUN | externo | 36/42 | revisão formal independente | corrigir P0/P1 e assinar |
| G20 | **BLOCKED_EXTERNAL** | Maria/Controladora | D | aprovação LGPD NOT_RUN | estúdio | 36 | aceite identificado | obter decisão |
| G21 | PASS D / E pendente | Maintainer | D/E | CI SHA exato | GitHub | #42530988559 | CI E | inspecionar jobs/artifacts |
| G22 | **BLOCKED_EXTERNAL** | Proprietário | D/E | autorização release NOT_RUN | governança | GOAL36 | gates FAIL | só após DoD |
| G23 | **BLOCKED_EXTERNAL** | Infra QA | D/E | GET version/token/permissions | Node/Actions read-only | #42527198228 | 401 D1/403 assinatura/rollback não feito | permissões QA e ensaio real |
| G24 | PASS histórico / E pendente | Engenharia | D/E | PR/Drive readback | GitHub/Drive | 41 e checkpoint D | comentário/Drive E | persistir sem overwrite |

**Validação local E comprovada:** TDD com falhas RED de G05/G17/G23; após GREEN, `npm test` **247/247 PASS em 57 arquivos**; Node selecionados **13/13 PASS** (G05 raster, G17 CPU read-only, G23 token/rollback), SSR Vinext Miniflare **1/1 PASS**, typecheck/lint/build PASS, `npm audit --audit-level=low` **0 vulnerabilities**, validação JSON/diff PASS. Chromium real local **14/14 PASS**, código de saída 0: A/B, login, downloads e hashes, oito viewports, Studio/Colagem, upload/admin, persistência após restart, rollback local e revogação sem afetar cliente B. Relatório em `outputs/browser-e2e/report.json`; não equivale a QA remoto Cloudflare ou dispositivo físico. CI do commit remoto E deve ser comprovada depois de publicar, nunca inferida da execução local. Este relatório não substitui parecer G19 ou aprovação humana. Engram e PersistFlow só podem ser usados se existir integração conectada com readback.

**Política final:** PR draft, `PRIVATE_GALLERIES_ENABLED=false` em configuração versionada, custo incremental **R$ 0,00**, nenhum merge/deploy/billing/D1 adicional/foto real/fixture histórica, **NO_GO_PRODUCTION**.
