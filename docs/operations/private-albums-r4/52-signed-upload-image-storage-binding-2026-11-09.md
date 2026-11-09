# PUNCTUM R4 — ciclo O | vínculo HMAC da intenção à imagem e chave R2

**Data:** 09/11/2026 (America/New_York). **Decisão:** `NO_GO_PRODUCTION`. Engenharia apenas na branch draft PR #32 via GitHub API, sem merge, deploy produtivo, foto real, Cloudflare D1/R2 remoto, billing ou alteração de infraestrutura compartilhada.

## Estado inicial e preservação

- Ciclo N final `17bc1c9eececfbf6271e1d04fee9bb162a599941`, tree `c41069af57f99e98f25b02478485740817678aa4`, parent GREEN N `72b557f019cdb4d571ec1120973e7d82199e5ec0`; CI exact-SHA [#42666226679](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42666226679) **completed/success, 31/31** incluindo E2E Chromium. Artefato navegador id `13695958418`, digest GitHub `sha256:913027d4f8738b96bfa31fd9205b5548a49f1441ec86f36ce982e2f0881ccd82` (ZIP interno não auditado).
- PR #32 previamente `open/draft/unmerged`; checkpoint PR N `6747088613`, Google Drive sob `requiredRevisionId` com readback. Sem evidência de SPEC literal §23.
- O computador Desktop/Core permaneceu indisponível (`Tunnel-client has not been seen`); não se alegam inspeção da worktree ou testes locais do host no ciclo O. Commits feitos preservando a genealogia remota, `update_ref(force=false, expected_sha)`.

## Defeito G05 — token antigo reproduzido contra nova imagem

A assinatura HMAC dos uploads diretos era calculada a partir de `intent.id`, `galleryId`, MIME, tamanho e expiração. `imageId` e `storageKey` eram reconciliados com D1, mas **não eram autenticados no token**. Após uma restauração/tampering coerente de D1 que alterasse conjuntamente `client_gallery_upload_intents.image_id` e `storage_key` para outra imagem da mesma galeria, o token já emitido mantinha sua assinatura. Isso quebrava a vinculação criptográfica entre intenção, imagem e chave R2. O defeito não demonstra por si só acesso não autorizado ao D1; é uma defesa contra rebind/replay após mutações externas ou restaurações.

### RED executado

- Commit apenas com teste `ed01c6d6dcf713bf1beb990908cd062507413112` (filho de N) em `tests/integration/client-upload-config.spec.ts`.
- GitHub Actions [#42667505687](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42667505687) **completed/failure**, **265/266 tests pass, 1 fail causal** em 57 arquivos.
- A integração criou intenção assinada sintética para imagem A, criou imagem B, moveu a intenção para o par canônico B/chave B mantendo demais campos e tentou PUT com o token de A. O R2 instrumentado rejeitou a tentativa: `R2 PUT reached with replayed token bound to another image`, quando se esperava HTTP 403 `UPLOAD_SIGNATURE`. Nenhuma escrita real em Cloudflare/produção. O teste verifica zero PUT após a correção.

### GREEN

- Código `f91e868709e85d591f835c29951d30d838b98bbd` (filho do RED) em `worker/api/client-gallery-upload.ts`.
- O HMAC passou a assinar o contexto de domínio `private-gallery-direct-v2`, `intent.id`, `galleryId`, `imageId`, `storageKey`, MIME, tamanho e expiração. Um rebind de imagem ou chave invalida o token anterior *antes do R2*; o contrato de ownership canônico, late D1 recheck, SHA-256, tamanho, Images e idempotência permanece.
- Os tokens v1 emitidos anteriormente são incompatíveis com v2, mas expiram em 15 minutos e não houve release/ativação produtiva do novo código. Qualquer decisão futura de rollout requer avaliação explícita de migração, disponibilidade e revogação.
- CI exata do GREEN e do commit documental: **pendentes ao escrever este relatório**. Não contar como PASS antecipadamente.

## Estado canônico e próximos testes

- **G05 FAIL**: embora o token agora ligue os campos imutáveis, continua faltando suporte integral a 25 MiB (Images `.input()` guardado em 20.000.000 bytes), transação/coordenação D1/R2 e upload remoto integrado autorizado.
- **G17 FAIL**: correções cache/snapshot N e CI verde não provam CPU cold/MISS real no Workers Free.
- **G23 BLOCKED_EXTERNAL**: rollback remoto Worker/D1/R2 e sessão não homologado; D1 401 e billing 403 históricos.
- **G15/G19/G20/G22 BLOCKED_EXTERNAL**: aparelhos físicos, parecer independente de segurança, aprovação LGPD formal e autorização específica do proprietário.
- `PRIVATE_GALLERIES_ENABLED=false` versionado; runtime de produção não revalidado. R$0 incremental autorizado, custo faturado não inferido.

## Matriz canônica G01–G24

PASS histórico é condicionado ao SHA/ambiente documentado; o ciclo O não conclui o DoD.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | L/M | PR/ref/HEAD/tree | GitHub/local | relatório 49 | SPEC ausente | Localizar SPEC e conferir inventário |
| G02 | PASS histórico | Eng./Reviewer | N | CI 31/31 | GitHub Actions | #42666226679 exact-SHA | ciclo O pendente | CI O exact-SHA |
| G03 | PASS | Admin | L | D1/cadastro | Chromium local | relatórios prévios | sem QA M | Revalidar QA seguro |
| G04 | PASS | Admin | L | publish/capa/galeria | Chromium | histórico e2e L | release não autorizado | Preservar Studio |
| G05 | FAIL | Segurança/Images | O | TDD token rebind e R2 zero PUT | GitHub Actions | RED #42667505687; GREEN O pendente | 25 MiB vs 20 MB, atomicidade D1/R2 | QA integrado, 25 MiB e coordenação |
| G06 | PASS | Segurança | G/L | JWT/JWKS | QA histórico | reconciliação 16 | G19 | Auditoria independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | físico | G15 |
| G08 | PASS | Segurança | L/M | sessão/revogação | local | 46–50 | sem QA remoto M | Revogação QA autorizada |
| G09 | PASS | Segurança | L/M | isolamento A/B | Miniflare | 44–50 | auditor externo | G19 |
| G10 | PASS | Segurança | L/M | private GET/HEAD negados | Miniflare | 44–50 | flag produção não verificada | Revalidar runtime |
| G11 | PASS | Produto | L | favoritos | Chromium | CI L | físico | G15 |
| G12 | PASS | Produto | L | download/hash | Chromium | CI L | QA real | Homologação segura |
| G13 | PASS | UI cliente | L | lightbox/teclado | Chromium | CI L | TalkBack/VoiceOver | G15 |
| G14 | PASS | UI admin | L/M | upload/viewport | Chromium | CI L/foco M | QA remoto não homologado | E2E M |
| G15 | BLOCKED_EXTERNAL | Testadores | — | TalkBack/VoiceOver | físico | GOAL36 | NOT_RUN | Homologar Android e iOS reais |
| G16 | PASS | UI/Studio | L | Colagem/SEO | Chromium/CI | #42544637971 | M sem CI | Revalidar M |
| G17 | FAIL | Cloudflare/Infra | N | cache/snapshot testado | Actions/QA histórica | #42666226679 PASS | CPU cold/MISS Workers Free não medida | QA com amostras |
| G18 | PASS | Operador backup | L/M local | G18 histórico | Miniflare | relatório 49 | não é rollback remoto | Quarentena/QA |
| G19 | BLOCKED_EXTERNAL | Auditor independente | — | parecer formal | humano | GOAL36 | sem aprovação | Auditoria independente |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD formal | humano | GOAL36 | sem aceite | Aprovação formal |
| G21 | PASS histórico | CI/Reviewer | N | 31/31 | GitHub Actions | #42666226679 | CI O pendente | Validar O exact-SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização de release | humano | GOAL36 | ausente | Autorizar especificamente após gates |
| G23 | BLOCKED_EXTERNAL | Operador QA | M | D1/R2 recovery/retry local | Miniflare | relatórios 47–50 | D1 HTTP 401; billing HTTP 403; rollback remoto não feito | QA segregado autorizado |
| G24 | PASS histórico | Documentação | N | PR/Drive readback | GitHub/Drive | checkpoint #6747088613 | checkpoint O pendente | Publicar O pós-CI |

**NO_GO_PRODUCTION.** Continuar validação exata da CI O, PR/Drive com readback e gates técnicos/humanos. Não declarar G05 PASS porque o replay foi corrigido.
