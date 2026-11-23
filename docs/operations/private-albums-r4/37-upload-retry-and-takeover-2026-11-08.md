# R4 — Continuação técnica e reconciliação G01–G24 — 08/11/2026

## Contexto verificável

- Repositório: `menezesx2k26-byte/lab-punctum-picture`; PR #32 `fix/punctum-albums-r4-completion-20261107`, aberta e draft no readback de 08/11, sem merge.
- HEAD remoto **antes** da mudança: `eb99c11120e48baab0a4723860e27df251a2df52`; CI do mesmo SHA: [#42516199632](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42516199632), `completed/success`. O novo commit deverá ser reconciliado separadamente, com CI própria.
- Checkout novo e isolado: `/home/desktop/Documents/punctum-r4-exec-20261108` no Linux. A worktree Windows `D:\Repos\punctum-r4-completion-20261107` não foi acessada nem modificada.
- Comparação no clone inicial: `origin/main...HEAD` = 19 commits só em main, 195 só na branch. Nenhuma reconciliação automática de main/stack foi tentada.
- Fontes lidas: `35-handoff-completo-2026-11-08.md`, `36-goal-definition-of-done-2026-11-08.md`, `16-original-g01-g24-reconciliation.md`, estado JSON, código e ensaios relevantes. `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` não consta da árvore Git deste SHA; os documentos de reconciliação preservam a precedência da SPEC e seus gates originais. A SPEC original deve ser recuperada e seu hash SHA-256 `2989e0ba18982658570dc699842393b3f980c9a5312237af33ab02292d10ecfb` revalidado antes do fechamento.

## Correção G05: indisponibilidade transitória de Images durante finalização

**Defeito:** após concluir upload binário no R2 e marcar a intenção `uploaded`, uma falha temporária de `IMAGES.info()`/transformação era capturada como se a imagem estivesse definitivamente corrompida. Isso encerrava o intent e marcava a imagem `failed`, embora o original persistido estivesse íntegro. O operador precisava reenviar a fotografia.

**Mudança:** `validateGalleryRaster()` distingue erros explicitamente atribuíveis à codificação de raster inválida (falha definitiva) dos erros transitórios de infraestrutura/transformação (repetíveis). `handleClientGalleryUploadApi()` devolve HTTP 503 e mantém a intenção `uploaded`, imagem `pending` e objeto R2 original intacto para reexecução autenticada da etapa `complete`. PNG realmente corrompido permanece HTTP 400 e `failed`. Erros internos da infraestrutura não são expostos em mensagens de cliente.

**TDD e escopo:** regressão adicionada em `scripts/r4-product-raster-validation.test.mjs` e `tests/integration/client-upload-config.spec.ts`; o RED inicial demonstrou ausência de classificação de erro transitório. O ensaio de integração usa D1 e R2 locais sintéticos e binding Images simulado para induzir 503, verifica estados e bytes, e depois repete `complete` com Images disponível, confirmando `completed`/`ready`. O teste de raster corrompido já existente permanece parte da regressão. Isto é uma correção local de recuperação; **não é homologação do fluxo integrado remoto**.

**Limites:** contrato comercial original de **25 MiB (26.214.400 bytes)** permanece divergente do limite de **20 MB** do `IMAGES.input()` e do preflight conservador. Não foi feita migração redutora, nem alteração silenciosa da SPEC. O G05 permanece **FAIL** até solução arquitetural testada para 25 MiB e prova remota autenticada ponta a ponta em QA verdadeiramente segregado. A última ocupação D1 de 10/10 é histórica e requer inventário atual antes de qualquer tentativa de alocação.

## G17 — incremento opcional para reduzir CPU em cache MISS

Uma preparação isolada, ainda **desabilitada**, introduz `public_home_snapshot` em migração aditiva 0010, `readPublicHomeSnapshot()`/`stagePublicHomeSnapshot()` e uma leitura opcional antes do render SSR quando `PUBLIC_HOME_SNAPSHOT_ENABLED=true` e o `PUBLIC_HOME_SNAPSHOT_BUILD_ID` corresponde à versão publicada. O registro inclui SHA-256 do HTML, epoch da publicação e CAS para não reaproveitar snapshot antigo; a leitura valida o HTML antes de servi-lo. Uma mutação editorial pública autenticada invalida a geração anterior previamente ao write. Rotas privadas, admin, RSC e requisições autenticadas não podem usar o snapshot da home. Os testes locais usam exclusivamente HTML e D1 sintéticos.

**Não houve geração/homologação de snapshot editorial real nem telemetria Cloudflare CPU em MISS.** O fallback atual continua SSR e pode ultrapassar 10 ms; portanto **G17 permanece FAIL**. Antes de ativar a flag, é necessário implementar/validar o produtor confiável de HTML de publicação com consistência Studio/Colagem, demonstrar a compatibilidade do HTML gerado com o runtime Vinext e medir CPU real por invocação em QA segregado. A migração não deve ser aplicada em produção sem o gate de release específico.

## Matriz canônica — estado conservador de takeover

As menções `PASS histórico` qualificam evidência anterior e **não** afirmam revalidação no commit desta rodada. A coluna SHA refere ao baseline `eb99c111…`; a CI, os testes e o hash do commit da correção devem ser adicionados em readback após push. Nenhuma aprovação humana é inferida.

| GATE | STATUS | OWNER | SHA | TESTES / AMBIENTE | EVIDÊNCIA | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|
| G01 | PASS histórico | Engenharia | eb99c111 | GitHub/checkout local | PR #32, remote SHA, git divergence | Inventário Cloudflare atual incompleto | Reconciliar infra read-only e commit final |
| G02 | PASS histórico | Engenharia | eb99c111 | CI/QA anterior | CI #42516199632 | Testes finais do novo SHA | Conferir CI e diff |
| G03 | PASS histórico | Engenharia | eb99c111 | D1/E2E anterior | reconciliação 16 | QA remoto atual | Revalidar cadastro admin |
| G04 | PASS histórico | Engenharia | eb99c111 | D1/E2E anterior | reconciliação 16 | QA remoto atual | Revalidar publicação/capa |
| G05 | FAIL | Engenharia | eb99c111 + alteração pendente | TDD local e Images sintético | esta correção + CI histórica Images #42497461077 | 25 MiB/20 MB, D1 remoto QA segregado, Access→R2→Images | Resolver arquitetura e homologar end-to-end |
| G06 | PASS histórico | Segurança | eb99c111 | testes criptográficos prévios | reconciliação 16 | readback em SHA final | Revalidar JWT/JWKS |
| G07 | PASS histórico | QA humano | eb99c111 | OTP real desktop anterior | handoff 35 | necessidade de confirmação do ambiente | Revalidar OTP sem expor segredo |
| G08 | PASS histórico | Engenharia | eb99c111 | auth/revogação prévios | reconciliação 16 | QA atual | Testar reentrada/rotação |
| G09 | PASS histórico | Engenharia | eb99c111 | matriz A/B anterior | reconciliação 16 | E2E remoto atual | Revalidar IDOR |
| G10 | PASS histórico | Engenharia | eb99c111 | GET/HEAD/flag OFF anteriores | reconciliação 16 | E2E remoto atual | Confirmar negação 404/0 bytes |
| G11 | PASS histórico | Engenharia | eb99c111 | favoritos D1 anteriores | reconciliação 16 | E2E remoto atual | Revalidar persistência |
| G12 | PASS histórico | Engenharia | eb99c111 | download/hash anteriores | reconciliação 16 | E2E remoto atual | Revalidar byte/hash |
| G13 | PASS histórico | Frontend | eb99c111 | browser anterior | CI #42516199632 | revisão visual no SHA final | Revalidar UI cliente |
| G14 | PASS histórico | Frontend | eb99c111 | browser anterior | CI #42516199632 | revisão visual no SHA final | Revalidar UI admin |
| G15 | BLOCKED_EXTERNAL | QA físico | eb99c111 | TalkBack/VoiceOver NOT_RUN nesta rodada | handoff 35 | aparelhos reais e relatório assistivo | Testar Android/iOS, zoom, foco, contraste |
| G16 | PASS histórico | Engenharia | eb99c111 | Studio/Colagem/SEO anteriores | rollback local #60259da | comparar código final a main | Regressão pública e draft |
| G17 | FAIL | Engenharia/Cloudflare | eb99c111 + alteração pendente | Snapshot D1 local opcional, CPU cold remoto NOT_RUN | QA CPU #42441525618; cache #42487556524; migração 0010 | produtor real ausente, >10 ms CPU no MISS sem snapshot, custo/uso atual não confirmado | Validar produtor e CPU em Worker Free real |
| G18 | PASS histórico | QA recuperação | eb99c111 | D1/R2 QA anterior | workflow #40786688338 | não substitui G23 | Preservar SHA/relacionamentos |
| G19 | BLOCKED_EXTERNAL | Revisor independente | eb99c111 | auditoria independente NOT_RUN | handoff 35 | parecer de revisor distinto | Revisão IDOR/auth/cache/upload sem P0/P1 |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | eb99c111 | decisão formal NOT_RUN | 11-lgpd-decisions + handoff 35 | aprovação legítima LGPD | Colher decisão datada e identificada |
| G21 | PASS histórico | Maintainer PR | eb99c111 | CI desse SHA success | #42516199632 | CI/revisão após alteração | Validar SHA e PR #32 |
| G22 | BLOCKED_EXTERNAL | Proprietário | eb99c111 | release não executado | GOAL 36 | autorização R1/R2/R3 específica | Solicitar só após gates técnicos |
| G23 | BLOCKED_EXTERNAL | QA recuperação | eb99c111 | rollback Studio/Colagem local | tests/integration/r4-public-rollback.spec.ts | Worker/config/D1/R2/sessões remotos não homologados | QA isolado com version ID e hashes pré/pós |
| G24 | PASS histórico / atualização pendente | Engenharia | eb99c111 | handoffs 35/36, Drive verificado historicamente | 35/36 + este documento | readback final repo/Drive/Engram/PersistFlow | Publicar e conferir checkpoint final |

## Governança e operações remotas

- `PRIVATE_GALLERIES_ENABLED=false` em produção, PR draft, nenhum merge/deploy produtivo, nenhuma alteração de billing, Access ou fotos reais nesta rodada.
- Não executar rollback G23 em D1/R2 históricos. A homologação requer ambiente QA segregado, preflight read-only, versão do Worker anterior efetivamente comprovada, invariantes de Studio/Colagem/rascunhos, hashes de objetos e registros, verificação das sessões e reabertura; o teste local não satisfaz este gate.
- G15, G19, G20 e G22 permanecem reservados a responsáveis legitimamente distintos/identificados. G17 requer CPU real de MISS e não poderá ser aprovado por latência HTTP ou cache HIT.
- Veredito até todos os 24 gates comprovadamente aprovados: **NO_GO_PRODUCTION**.
