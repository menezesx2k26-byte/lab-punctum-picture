# PUNCTUM R4 — ciclo M | revalidação tardia de intenção/estado antes do PUT R2

**Data:** 08/11/2026 (America/New_York). **Decisão:** `NO_GO_PRODUCTION`. Escopo de engenharia sintética G05 e segurança D1/R2; sem merge, deploy, ativação, foto real, cobrança ou escrita Cloudflare remota.

## Baseline reconciliado

- Ciclo L remoto `b0175cb95979a04555512453a5955e7697de3975`, tree `6a1030c738a78f68fb24e2740a584669ea465280`, parent K `fc76443475cecebc82fe96654a8c21af62c3f3d4`. GitHub Actions [#42544637971](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42544637971) **completed/success 31/31**, browser artifact `13643355384`, digest SHA-256 de provedor `cd7be19f32f4d7726b9eadcb405be575a766074fbf31ce4b4c8a9a272884185c`. PR #32 open/draft/unmerged.
- Checkpoint L na [PR #32](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32#issuecomment-6729984510) conferido; Drive `PUNCTUM_R4_HANDOFF_RASTER_ROLLBACK_2026-11-08` atualizado sob `requiredRevisionId` e verificado por leitura SHA/CI/NO_GO. Os relatórios/ledgers C–L são mantidos.
- Fonte de requisitos: GOAL 36, reconciliação 16, handoff 35, relatórios 44–49. SPEC original §23 não localizada nos locais consultados; **não inventar seu texto**.

## G05 — RED: estado promovido após o primeiro SELECT da imagem

`handleClientGalleryUploadApi()` validava no começo do PUT o vínculo da intenção com uma imagem `pending`, a identidade canônica, MIME e tamanho; em seguida lia o corpo e calculava SHA-256 antes de gravar o R2. Durante essa leitura, um restore externo ou outra transição poderia promover a imagem a `ready`. Sem um segundo preflight, uma requisição assinada para um estado antigo alcançava `R2.put` mesmo quando a linha D1 já não era candidata a upload.

**RED executado:** nova integração `client-upload-config.spec.ts` cria cliente, galeria, imagem e intenção com PNG sintético e token assinado. O D1 fake faz `UPDATE client_gallery_images SET status='ready'` *depois* de devolver a primeira leitura de ownership, simulando restauração concorrente. O R2 fake falha se o PUT for invocado. Implementação anterior atingiu `R2 PUT reached after restore promoted image ready` antes de retornar o conflito esperado. Nenhuma fixture histórica foi modificada.

## GREEN: vínculo assinado e ambos os estados rechecados

- Após ler/validar a carga e calcular seu digest, **antes do primeiro R2**, a rota reconsulta `client_gallery_upload_intents` em JOIN com `client_gallery_images`. Exige intenção não concluída, não expirada, expiracão imutável igual à assinada, identidade da galeria/imagem/chave canônica/MIME/tamanho, imagem `pending` e não excluída, e status da intenção `pending` ou `uploaded`.
- Caso o D1 tenha promovido `ready`, excluído a imagem, encerrado/revogando a intenção ou modificado os campos vinculados, retorna erro de conflito **antes do R2.put**. O teste causal passa e verifica zero tentativas de PUT, status D1 preservados e bucket sem o novo objeto.
- Se um PUT paralelo idêntico avançou `pending→uploaded`, a reconsulta **não sobrescreve** seu objeto: a rotina passa para a verificação de bytes, metadata e digest existentes no R2, preservando a idempotência. A suíte de concorrência/retry e o piloto com dez imagens sintéticas continuam aplicáveis.
- Restrições de tamanho, assinatura HMAC, Origin/admin, MIME real, decodificação Images, D1 SHA e cleanup/recheck anteriores não foram enfraquecidos. Não se altera o layout histórico exclusivo do operador G18.

**Limite importante:** recheck é redução da janela, não um commit atômico entre D1 e R2. Um restore externo não coordenado pode ocorrer depois do SELECT tardio e antes do `put`; exclusão R2 sem coordenação, rollback remoto, 25 MiB real e CPU Free continuam bloqueados. Não confundir o teste sintético com homologação de Cloudflare QA remota.

## G05/G17/G23 — decisões e fontes

- Contrato R4 **25 MiB = 26.214.400 bytes**, guarda operacional **20.000.000 bytes**. A Cloudflare continua limitando `Images Binding.input()` a 20 MB; nenhum suporte integral de 25 MiB foi implementado ou aprovado: https://developers.cloudflare.com/images/get-started/limits/ . **G05 FAIL**.
- Workers Free continua com limite **10 ms CPU por HTTP request e 128 MB/isolate**: https://developers.cloudflare.com/workers/platform/limits/ . Nenhuma amostra remota de CPU cold/MISS no HEAD atual foi executada; **G17 FAIL** apesar de testes e cache locais aprovados.
- Rollback remoto requer QA D1/R2/Worker comprovadamente segregado, autenticação, inventário e versões anteriores; token histórico D1 HTTP401 e subscriptions HTTP403 não autorizam escrita. D1/R2 não compartilham transação; **G23 BLOCKED_EXTERNAL**. Backup/restore locais e quarentena não equivalem a rollback Worker remoto.
- G15 físico TalkBack/VoiceOver, G19 segurança independente, G20 LGPD da responsável e G22 release específico exigem validações humanas; continuam **BLOCKED_EXTERNAL**.

## Evidências

- TDD RED `client-upload-config.spec.ts`: tentativa proibida de R2 PUT após a imagem tornar-se `ready`.
- GREEN focado: `client-upload-config.spec.ts` **7/7** e piloto `client-pilot.spec.ts` **1/1**, TypeScript e `git diff --check` PASS.
- Regressão M local: **Workers Vitest 263/263 em 57 arquivos**, **Colagem 7/7**, **G18 histórico Node 1/1**, **Node R4 14/14**, **SSR 1/1**, **TypeScript PASS**, **ESLint PASS**, **Vinext build 5/5 PASS**, **npm audit 0 vulnerabilidades**, **JSON e diff-check PASS**. O comando integrado não teve exit 0: Chromium E2E falhou em captura de screenshot da home após oito checkpoints funcionais aprovados. Duas execuções locais independentes repetiram timeout de screenshot; uma terceira com fallback experimental de captura da viewport avançou até o Studio, mas falhou por timeout do `locator.click` no botão visível `Textos`. O fallback foi revertido **sem alteração permanente no harness**. Host local estava sob carga elevada, com ~1,3 GiB de memória disponível, sem swap e load average acima de 8; não inferir erro do produto nem sucesso E2E completo.
- CI remota M e SHA remoto M: **PENDENTES no momento do commit**. A CI Linux no SHA exato deverá comprovar o E2E completo, não aproveitar CI L ou declarar `M_COMPLETE_PASS` local.

## Matriz canônica G01–G24

Campos: **GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO**. PASS histórico tem escopo/SHA próprios nas reconciliações e relatórios 16/44–49; não indica autorização de produção. `L` = remoto com CI verde, `M` = correção local ainda sem publicação ao criar o relatório.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | L/M | PR/ref/HEAD/tree | GitHub/local | relatório 49 | SPEC ausente | Localizar SPEC e conferir inventário |
| G02 | PASS | Eng./Reviewer | L | CI/diff/E2E | Actions/local | #42544637971 | M sem CI | CI M exact-SHA |
| G03 | PASS | Admin | L | D1/cadastro | Chromium local | relatórios prévios | sem QA M | Revalidar QA seguro |
| G04 | PASS | Admin | L | publish/capa/galeria | Chromium | histórico e2e L | release não autorizado | Preservar Studio |
| G05 | FAIL | Produto/Images QA | L/M | TDD corrida/10 uploads | Miniflare/Chromium local | RED→GREEN M; piloto | 25MiB vs 20MB, D1/R2 sem atomicidade | Engenharia + QA integrado |
| G06 | PASS | Segurança | G/L | JWT/JWKS | QA histórico | reconciliação 16 | G19 | Auditoria independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | físico | G15 |
| G08 | PASS | Segurança | L/M | sessão/revogação | local | 46–50 | sem QA remoto M | Revogação QA autorizada |
| G09 | PASS | Segurança | L/M | isolamento A/B | Miniflare | 44–50 | auditor externo | G19 |
| G10 | PASS | Segurança | L/M | private GET/HEAD negados | Miniflare | 44–50 | flag produção não verificada | Revalidar runtime |
| G11 | PASS | Produto | L | favoritos | Chromium | CI L | físico | G15 |
| G12 | PASS | Produto | L | download/hash | Chromium | CI L | QA real | Homologação segura |
| G13 | PASS | UI cliente | L | lightbox/teclado | Chromium | CI L | TalkBack/VoiceOver | G15 |
| G14 | PASS | UI admin | L/M | upload/viewport | Chromium | CI L/foco M | QA remoto não homologado | E2E M |
| G15 | BLOCKED_EXTERNAL | Testadores físicos | — | TalkBack/VoiceOver | aparelhos reais | GOAL 36 | NOT_RUN | Testes assistivos físicos |
| G16 | PASS | UI/Studio | L | Colagem/SEO | Chromium/CI | #42544637971 | M sem CI | Revalidar M |
| G17 | FAIL | Cloudflare/Infra | L/M | cache/header/CPU | Miniflare/QA histórico | relatório 49 | CPU real cold/MISS não medida | QA autorizado com amostras |
| G18 | PASS | Operador backup | L/M local | G18 histórico | Miniflare | relatório 49 | não é rollback remoto | Quarentena/QA |
| G19 | BLOCKED_EXTERNAL | Auditor independente | — | parecer segurança | humano | GOAL 36 | sem signoff | Parecer formal |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD | humano | GOAL 36 | sem aceite | Aprovação formal |
| G21 | PASS | CI/Reviewer | L | CI 31/31 | Actions | #42544637971 | M pendente | Check exact-SHA M |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização de release | humano | GOAL 36 | sem aceite | Liberação específica após gates |
| G23 | BLOCKED_EXTERNAL | Operador QA | L/M local | D1/R2 recovery/retry | Miniflare | relatórios 47–50 | D1 HTTP401; Billing HTTP403; rollback remoto não executado | QA exclusivo autorizado |
| G24 | PASS | Documentação | L | PR/Drive readback | GitHub/Drive | checkpoint L | M ainda pendente | Persistir M pós-CI |

**NO_GO_PRODUCTION**. `PRIVATE_GALLERIES_ENABLED=false` em configuração versionada (runtime de produção não verificado). Nenhum novo billing, merge, deploy, ação remota destrutiva, fotos reais ou alteração visual/editorial. Custo incremental autorizado R$0. A missão G01–G24 permanece inacabada.
