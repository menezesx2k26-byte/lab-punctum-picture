# Punctum Picture R4 — novo ciclo de engenharia, integridade, cache e QA read-only

**Data:** 08/11/2026. **Branch:** `fix/punctum-albums-r4-completion-20261107` / PR #32 draft. **Produção:** `NO_GO_PRODUCTION`.

## 1. Autoridade, escopo e genealogia

- Fonte canônica: SPEC original R4 §23, reconciliada em `16-original-g01-g24-reconciliation.md`, handoff 35 e GOAL 36. **Não** usar numeração Argon. O texto integral da SPEC não está no checkout; a reconciliação e seus limites continuam obrigatórios, não uma revisão informal da SPEC.
- Baseline remoto lido neste ciclo: `a7e4166e25812a74c9fae84cd37bb3b1665ddcbe`, CI #42524411443 completed/success, árvore `73add2b379bb97c1bf0138681f10ff0539cb0487`, PR #32 aberta/draft/não merged. Checkout local irmão `29e7bb0ebabd3a1aef654c83e36ad537db41f9c0` com árvore **idêntica**; worktree inicialmente limpa. Nenhuma limpeza/rebase/force-push.
- Este relatório é criado antes do novo SHA definitivo. O identificador do novo código deve ser obtido de `git rev-parse HEAD`/PR e a CI **do próprio commit**, nunca declarado antecipadamente neste documento. Fontes e proveniências anteriores continuam no relatório 38.

## 2. G05/G18 — integridade do original e restauração

**TDD RED → GREEN executado:** `client-media.spec.ts` demonstrou que um intent **já `uploaded` mas com `sha256=NULL`** (legado pré-0011) era promovido para `ready` com um digest calculado somente a partir do R2 presente no instante de `complete`. Isso inventava evidência da submissão inicial. Agora `complete` responde **409 `UPLOAD_REATTEST_REQUIRED`**, sem marcar imagem `ready` nem apagar R2. O administrador autenticado pode repetir o `PUT` assinado com bytes exatamente iguais, conferindo o conteúdo existente e persistindo o hash D1 antes de tentar `complete`. O objeto R2 original não é substituído. Rejeição de upload truncado/excedente com D1 `pending`, sem criar objeto, e sucesso de upload streaming em chunks foram adicionados a testes com D1/R2 locais.

**TDD RED → GREEN adicional:** backup e restore cruzavam `client_gallery_images.original_sha256`, bytes e metadados R2, porém não correlacionavam `client_gallery_upload_intents.sha256`. Um backup fabricado com intenção de checksum diferente podia entrar no destino. `assertScope` agora exige, se o SHA do intent estiver preenchido, objeto presente, SHA dos bytes correspondente e coerência com a imagem atestada. Valida na **captura** e **antes de qualquer objeto ou linha de restore**. História com digests nulos permanece histórica/null; não fabricar hashes. O cenário testado restaura com sucesso o conjunto coerente e rejeita a adulteração sem alterar D1/R2 destino.

**Memória:** o leitor de uploads mantém um único buffer pré-alocado após o primeiro chunk, copia cada trecho uma vez, aplica limite exato a cada trecho e rejeita truncamento/excesso; não mantém a lista de chunks seguida por segunda cópia integral. Não há telemetria real de memória/CPU da Cloudflare para declarar uma economia em ms ou MiB.

**Incompatibilidade arquitetural P0 permanece:** SPEC R4 até **25 MiB = 26.214.400 bytes**, enquanto `.input()` do Images Binding aceita apenas **20 MB**; o guard do produto continua em 20.000.000 bytes, evitando registros presos. O R2 aceita objetos maiores, mas esse fato **não prova** que o Worker Free com 10ms CPU e 128MB executa decodificação segura nem que Images possa processar o original. Não aumentar a constante sem pipeline verificado.

Alternativas consideradas, **nenhuma homologada**: (a) original de 25 MiB privado em R2 + derivado de até 20 MB gerado por browser autenticado: exige validação independente do conteúdo original e vínculo de pixels real entre original/derivado, além de custo/consumo e resistência a manipulação; hash isolado do original não é decodificação; (b) transformação por URL remota (limite distinto de 100 MB): requer origem interna autenticada que não exponha URLs reutilizáveis, cache/CDN/logs e quota Free, sem bypass por token de URL; (c) parser/decoder no Worker: exigir decodificação integral dos formatos, limites de pixels, CPU real e memória, sem reduzir segurança a magic bytes. **Decisão de produto/segurança e prova real do mesmo código em QA autorizado pendentes.** O incremento acima não muda a SPEC e **G05 é FAIL**.

Fontes oficiais consultadas: https://developers.cloudflare.com/images/get-started/limits/ ; https://developers.cloudflare.com/images/optimization/binding/ ; https://developers.cloudflare.com/r2/objects/upload-objects/ ; https://developers.cloudflare.com/workers/platform/limits/ .

## 3. G17 — SSR, snapshots, variações de cache e CPU Free

Snapshot público só aceita `GET /` anônimo com HTML completo, checksum, build-id e epoch coincidentes. Novo teste RED mostrou que um snapshot contendo uma referência a caminho privado (`client-galleries/`, `/api/client/galleries/`, `/admin/api/albuns-privados/`, `/qa/recover`) podia ser armazenado; agora o produtor/consumidor rejeita esse material. Essa é barreira de defesa em profundidade, não prova de ausência de qualquer dado privado em HTML gerado por fonte não confiável. A publicação e invalidação editoriais mantêm CAS, guarda Origin, fallback SSR e separação Studio/Colagem.

Teste RED adicional mostrou que uma resposta HTML com `Vary: Origin`, `Accept-Language`, `User-Agent` ou variante desconhecida recebia a política de cache público. Agora `publicHomeCacheResponse` admite apenas as variantes Vinext públicas conhecidas (`RSC`, `Accept`, `Next-Router-State-Tree`, `Next-Router-Prefetch`) e `Accept-Encoding` e **não promove qualquer outra `Vary` a cache compartilhado**. Os testes dos headers Vinext existentes foram preservados.

Novo script + workflow `r4-cpu-historical-readonly` consultam via GraphQL **somente agregados de CPU** do Worker QA historicamente existente, sem criar/deletar Worker, sem D1/R2, Access, deploy ou fotos. Resposta sanitizada em `outputs/r4-cpu-historical-readonly.json`; falhas de token/GraphQL e ausência de amostras são bloqueios, nunca métricas inventadas. Mesmo p99 histórico baixo não homologa CPU `cold/MISS` do SHA atual, e p99 histórico alto é apenas alerta. `cpuGatePassed=false` e `sourceCodeShaVerified=false` são invariantes da ferramenta; não confundir latência HTTP ou cache HIT com CPU efetiva. Conta Free publica 10ms de CPU/requisição e 128MB de memória; exigir futura prova remota no SHA do produto com conteúdo certo, CPU cold/MISS separada e custos/quota comprovados. **G17 FAIL**.

## 4. G23 — QA histórico e classificação de autorização

O preflight anterior [Actions #42524406723](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42524406723) teve status de workflow success, mas inventário **incompleto**: assinatura HTTP **403**, listagem D1 HTTP **401**, Workers/R2/settings/deployments HTTP **200**. Isso sugere acesso parcial por recurso, **não prova** token inteiramente inválido nem permissão suficiente para rollback. `summarizeQaReadOnlyProbes` agora registra as seções exatas e classes de falha sem imprimir erros brutos/credenciais. Um 401 é `AUTH_OR_RESOURCE_PERMISSION_UNVERIFIED`, 403 `SCOPE_OR_ACCOUNT_ACCESS_REQUIRED`; nenhum deles leva a privilégio adicional automático.

O preflight remoto só aceita binding `DB` **exatamente** no D1 fonte histórico esperado e flag `PRIVATE_GALLERIES_ENABLED=false`, não basta um D1 qualquer da lista ou flag conhecida `true`. Banco destino, buckets e worker devem bater nomes/UUIDs e versões identificadas. Se qualquer seção de inventário não foi lida, abortar preflight como incompleto; **não executar rollback nem alterar fixtures existentes**. Ainda faltam ambiente isolado e versão anterior verificável, snapshot D1/R2 por SHA, versão/config/Access, revogação, 404 e zero bytes, Studio/Colagem/rascunhos, reabertura e readback. **G23 BLOCKED_EXTERNAL**.

## 5. G15/G19, contratos e decisões externas

`PhotoViewer` usa `<dialog>` nativo, foco anterior no fechamento, `onCancel/Escape`, rótulos de botões, favorito `aria-pressed`, alertas de falha e download autenticado. Testes Chromium cobrem teclado, lightbox, foco e larguras; isso **não** é TalkBack/VoiceOver físico. Roteiro a executar em aparelhos reais: login com Access, ordem de leitura/títulos, contraste/reduced-motion, foco e retorno do diálogo, setas e anúncio do índice, favorito/desfavorito/estado anunciado, erro na mídia, download liberado/negado, rotação, zoom 200/400% e logout/revogação. Anotar modelo, SO, navegador/AT, data, cada resultado e artefato sanitizado; nenhum dispositivo foi homologado nesta rodada.

G19: encaminhar diff do SHA final para **revisor técnico independente**, com prova de IDOR A/B, cookies Access, Origin/CSRF, HMAC e prazo de intent, nulidade histórica, R2 imutável, cross-check dos hashes, snapshot/cabeçalhos/Vary, QA read-only, XSS, segregação de ambientes e P0/P1 remanescentes. O implementador não assina parecer independente. G20 depende de aprovação LGPD formal da responsável, G22 de autorização de release **específica após gates aprovados**. Nenhuma delas foi obtida.

## 6. Matriz canônica G01–G24 — sem promotion automática de status

`BASE` = SHA remoto `a7e4166e` com CI #42524411443. `NOVO` = alterações deste ciclo ainda a conferir no SHA remoto final. `PASS histórico` é restrito ao escopo do baseline e não revalida automaticamente o código novo. Todos os 24 IDs seguem a SPEC original §23.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS histórico/revalidado checkout | Engenharia | BASE+NOVO | `git status`, tree, PR, CI | checkout/GitHub | PR32, 35/36/38, este relatório | SPEC completa ausente na árvore | confirmar nova árvore/HEAD/branch após publicação |
| G02 | PASS histórico/revalidar | Engenharia | BASE+NOVO | Vitest/build/lint/typecheck | local/CI | #42524411443 + nova CI pendente | CI SHA novo | obter CI exata |
| G03 | PASS histórico | Engenharia | BASE | cadastro e validação | QA/local | 16/25 | sem mudança de cadastro | preservar/reavaliar no CI |
| G04 | PASS histórico | Engenharia | BASE | criação/publicação | local/Chromium | 25, CI | sem QA real novo | comprovar novo upload remoto autorizado |
| G05 | **FAIL** | Engenharia/estúdio | BASE+NOVO | 20MB guard, SHA/reattest/retry/corrupção | D1/R2/Images local | `client-media.spec.ts`, migração 0011 | SPEC 25MiB, Images 20MB, CPU/custos e QA produto | solução autorizada e prova remota integral |
| G06 | PASS histórico/revisar | Segurança | BASE | Access JWT/JWKS | QA anterior | 16/25 | nova revisão independente | revalidar com G19 |
| G07 | PASS histórico | Owner OTP | BASE | OTP real anterior | QA anterior | 25 | nova homologação futura | acesso no QA aprovado |
| G08 | PASS histórico/revisar | Segurança | BASE | revogação de sessão | local/QA | 16/25 | revisão atual de token/session | regressão pertinente |
| G09 | PASS histórico/revisar | Engenharia | BASE+NOVO | isolamento A/B/404 | local/QA | `client-security-matrix` e Browser | novo SHA sem QA | validar 2 clientes em QA segregado |
| G10 | PASS histórico/revisar | Engenharia | BASE+NOVO | flag OFF/404/0 bytes | local/QA | testes de roteamento | deploy novo proibido | manter flag OFF e readback futuro |
| G11 | PASS histórico | Engenharia | BASE | favoritos | Chromium/local | 25/Browser | novo SHA | confirmar regressão E2E |
| G12 | PASS histórico/revisar | Engenharia | BASE+NOVO | download original+SHA | D1/R2 local | `client-media.spec.ts` | checksum real novo não publicado em QA | conferir bytes/hash em QA autorizado |
| G13 | PASS histórico | Frontend | BASE | lightbox/teclado | Chromium | 25/CI | teste físico separado | manter foco e rotação no E2E |
| G14 | PASS histórico | Frontend | BASE | editor upload | Chromium | 25/CI | 25 MiB ainda bloqueado | ensaio real de upload seguro |
| G15 | **BLOCKED_EXTERNAL** | QA assistivo | BASE+NOVO | TalkBack/VoiceOver físico NOT_RUN | aparelhos reais | roteiro §5 | dispositivo/revisor humanos | colher provas físicas distintas |
| G16 | PASS histórico/revisar | Frontend/estúdio | BASE+NOVO | SSR/Studio/Colagem | local/CI | snapshot tests, browser | CPU novo não qualificada | confirmar regressão visual/SSR |
| G17 | **FAIL** | Infra QA Free | BASE+NOVO | snapshot/cache tests + GraphQL read-only | local/QA histórico | script CPU read-only | nenhum cold/MISS CPU do SHA novo | instrumentar QA remoto isolado autorizado |
| G18 | PASS histórico/revisar | Engenharia QA | BASE+NOVO | restore bytes+intent SHA | Miniflare/QA prévio | client-recovery, #40786688338 | não prova rollback integral G23 | QA readback do código atual |
| G19 | **BLOCKED_EXTERNAL** | Revisor independente | BASE+NOVO | parecer técnico NOT_RUN | terceiro | roteiro §5 | assinatura independente/P0/P1 | realizar auditoria no SHA final |
| G20 | **BLOCKED_EXTERNAL** | Responsável LGPD | BASE | decisão formal NOT_RUN | estúdio | GOAL 36, políticas | aceite identificado/assinado | validar decisão da responsável |
| G21 | PASS no BASE / pendente NOVO | Maintainer | BASE+NOVO | CI exact SHA | Actions | #42524411443 | CI nova | conferir jobs/artifacts/SHA |
| G22 | **BLOCKED_EXTERNAL** | Proprietário | BASE | autorização de release NOT_RUN | governança | GOAL 36 | gates ainda FAIL | solicitar somente após readiness demonstrada |
| G23 | **BLOCKED_EXTERNAL** | Engenharia QA/Owner | BASE+NOVO | preflight GET/read-only | Actions/local | #42524406723 + testes G23 | 403 assinatura/401 D1/QA isolado | permissões autorizadas, rollback reversível real |
| G24 | PASS histórico/checkpoint novo pendente | Engenharia | BASE+NOVO | readback GitHub/Drive | repositório/Drive | 35–38 e novo relatório | readback SHA/CI/Drive/Engram/PersistFlow | persistir e ler artefatos novos |

## 7. Resultado verificável e riscos de release

**Regressão integral local após corrigir duas fixtures de teste com `uploaded`/SHA nulo:** RED inicial **241 PASS / 2 FAIL**, porque `client-upload-config.spec.ts` simulava uploads antigos sem SHA e esperava resposta 503 de Images; nova política respondia 409 antes. A fixture foi atualizada **sem remover as asserções de falha transitória**, atribuindo SHA correto ao intent e metadados R2 para representar uploads já atestados. Focado 28/28 PASS e, depois, **Vitest total 243/243 PASS em 57 arquivos**. São testes sintéticos Miniflare/Workers, não um novo QA remoto. Também passaram **18/18 testes Node** selecionados de raster/CPU/G23, `npm run typecheck`, `npm run lint`, `npm run build`, `npm audit --audit-level=low` (**0 vulnerabilidades**) e `git diff --check`. O teste Node do bundle SSR Vinext em Miniflare passou **1/1**, incluindo home, invalidação e Studio independentes. Avisos de Vite/Vinext foram observados, mas build terminou com código 0.

**E2E Chromium real local 14/14 PASS** depois do build final, usando D1/R2 sintéticos isolados: dois clientes A/B, dez PNG originais, negações privadas, lightbox/foco/Escape, favoritos, download original byte a byte, larguras de 320 a 1440px, Studio/Colagem, upload administrativo com progresso e capa, persistência após reinício, rollback local de álbum, revogação de logout. Relatório `outputs/browser-e2e/report.json` no checkout local; **não** equivale a TalkBack/VoiceOver físicos, CPU Cloudflare Free nem QA remoto. SHA e CI definitivo pertencem ao **readback** pós-commit, e serão publicados em comentário da PR e checkpoint do Drive após confirmação. Não afirmar aqui CI de SHA futuro, quota de Cloudflare consumida nem teste físico não executado. Este ciclo não autoriza merge, migrations remotas, alteração de QA ocupado, Worker efêmero pago, foto real ou publicação.

**GOAL ainda aberto.** 17 PASS históricos, G05/G17 FAIL, G15/G19/G20/G22/G23 BLOCKED_EXTERNAL; `PRIVATE_GALLERIES_ENABLED=false` em produção, `NO_GO_PRODUCTION`, R$ 0 incremental autorizado. Uma nova sonda GraphQL histórica não constitui prova do runtime final.
