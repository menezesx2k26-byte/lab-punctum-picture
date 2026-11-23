# PUNCTUM R4 — ciclo I | compatibilidade estrita de backup G18 após CI RED

**Data:** 08/11/2026 (America/New_York). **Decisão de produção:** `NO_GO_PRODUCTION`. PR #32 draft, sem merge/deploy, custo incremental autorizado R$ 0,00.
**Fonte de requisitos:** SPEC R4 original §23 (não disponível no checkout), reconciliação canônica 16, GOAL 36, relatório 45 e ledger v3. Nenhuma alteração de configurações remotas, fotos reais, QA histórico, D1/R2 remoto ou billing.

## CI H: FALHOU — não foi promovida a PASS

- SHA remoto H `cbd8972d18a7a5a2baf5d7c25d8028c32d0c9137`, árvore `8fc04be7255230ea4205d4aa2992fd9b5bb7976a`, parent remoto G `a869725ec4a3d7cb39b625d6be6dfbadad5975cf`. Publicação H foi um fast-forward protegido na PR draft.
- GitHub Actions [#42538018351](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42538018351) **completed/failure**. Job `verify` #128906539468 falhou no passo `node --test scripts/r4-scoped-local.test.mjs`, após o bundle/Workers Vitest: `POST /qa/recover` respondeu HTTP 400 `QA_RECOVERY_FAILED` quando o harness esperava HTTP 200. **Não declarar CI H verde.**
- Causa reproduzida localmente: `node --test scripts/r4-scoped-local.test.mjs` retornou **0/1** com o mesmo HTTP400 e nenhuma restauração homologada. O QA G18 sintético original usa o formato histórico imutável `client-galleries/<gallery>/<image>/original.png` para 10 PNGs 79 bytes. A validação nova do ciclo H aceitava apenas `client-galleries/<gallery>/<image>.png`, embora ambos vinculem exatamente galeria e imagem. Isso é uma quebra de compatibilidade da recuperação, não prova de acesso cruzado.

## TDD RED → GREEN, sem enfraquecer o produto

1. **RED novo:** integração com fotografia sintética ready, D1 `storage_key` histórico `client-galleries/G/I/original.png`, R2 privado com conteúdo/metadata coerentes e nenhuma linha preexistente no destino. `captureClientRecovery()` rejeitava `Recovery scope mismatch`, impedindo backup/restauração legítimos. Teste também recusa chave adulterada `client-galleries/G/other-I/original.png` sem tocar R2.
2. **GREEN:** `isRecoverableOriginalKey(row)`, exclusivamente no módulo do operador `scripts/lib/private-recovery.ts`, admite **somente**:
   - chave canônica atual de `privateGalleryStorageKey(galleryId,imageId,mime)`;
   - para `image/png`, o layout histórico exato `client-galleries/<galleryId>/<imageId>/original.png`.
3. A verificação das duas identidades continua estrita, sem `startsWith`, sem wildcard/subpath livre, sem usar o R2 como fonte de autoridade. MIME, tamanho, vínculos intent/imagem e SHA256 de originais atestados continuam conferidos. Chaves de outro cliente, outra imagem, extensão divergente ou metadados inconsistentes continuam recusadas **antes** de `R2.get/put`.
4. O caminho do produto (upload, prévias, GET/HEAD/download, validação de mídia) **não** recebe exceção legada e exige a chave canônica corrente; nenhuma foto privada se torna pública nem é anunciada como pronta para download após essa recuperação histórica. Contas restauradas continuam desabilitadas/quarentenadas, com sessão rotacionável e reabertura condicionada.

## Evidências focadas e testes completos

- Novo RED Vitest de layout conhecido: falha `Recovery scope mismatch`; GREEN após ajuste: `client-recovery.spec.ts` **13/13**, foco completo recovery+maintenance+snapshot+cache **27/27**.
- `node --test scripts/r4-scoped-local.test.mjs` GREEN **1/1**: duas contas sintéticas, 10 originais PNG de 79 bytes, 26 linhas D1, histórico legado preservado por hashes, recuperação, anti-replay, destino quarentenado e nenhum recurso Cloudflare real alterado.
- Regressão integral local final: **Workers Vitest 255/255 em 57 arquivos**; Colagem **7/7**; Node G18 legado **1/1**; Node selecionados **14/14**; SSR **1/1**; TypeScript/ESLint/build Vinext cinco etapas PASS; `npm audit --audit-level=low` **0 vulnerabilidades**; Chromium E2E real local PASS (A/B sintéticos, upload admin, Colagem/Studio, oito larguras, restart, rollback local, logout e zero bytes privados). A CI do **SHA corretivo** e o checkpoint externo ainda dependem de comprovação separada.

## Matriz de gates canônicos G01–G24 (não Argon)

O status é do mapeamento original; `PASS` significa **histórico com escopo/SHA indicado nos relatórios 16, 44 e 45**, não aprovação de produção para o SHA ainda sem CI. `H` = `cbd8972d...` com CI **FAIL**; `I` = correção local deste relatório aguardando publicação.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | G/H | sha/tree/PR | GitHub/local | relatório 45 | SPEC original ausente | Recuperar SPEC |
| G02 | PASS | Eng./Reviewer | G | CI/Chromium/diff | CI histórica | #42536082570 | CI H falhou; I pendente | CI exact-SHA I |
| G03 | PASS | Admin | G | cadastro/D1 | Chromium local | matriz 16 | sem QA I | Review release |
| G04 | PASS | Admin | G | publicação/galeria | Chromium local | matriz 16 | sem deploy | Preservar Studio |
| G05 | FAIL | Produto/Images QA | G/I | upload/cleanup/byte/hash | sintético | relatórios 44–46 | 25MiB contra 20MB Images, D1/R2 sem transação atômica | Pipeline 25MiB e QA integrado |
| G06 | PASS | Segurança | G | JWT/JWKS | QA histórico | matriz 16 | revisão externa | G19 |
| G07 | PASS | Access QA | G | OTP real | QA histórico | matriz 16 | testes físicos | G15 |
| G08 | PASS | Segurança | G | sessão/revogação | local/QA | matriz 16 | reabertura remota não testada | Testes QA autorizados |
| G09 | PASS | Segurança | G/H/I | IDOR/chaves | Miniflare | relatórios 44–46 | G19 | Revisão independente |
| G10 | PASS | Segurança | G/H/I | GET/HEAD sem bytes | Miniflare | relatório 44 | sem release | Revalidar flag OFF |
| G11 | PASS | Produto | G | favoritos | Chromium | #42536082570 | físico | G15 |
| G12 | PASS | Produto | G | download/hash | Chromium | #42536082570 | físico/QA real | Matriz física |
| G13 | PASS | UI cliente | G | foco/lightbox | Chromium | #42536082570 | emulação | G15 |
| G14 | PASS | UI admin | G | upload/viewport | Chromium | #42536082570 | QA integrado | Revisão |
| G15 | BLOCKED_EXTERNAL | Testadores físicos | G | TalkBack/VoiceOver | dispositivos | GOAL 36 | NOT_RUN | Ensaios Android/iOS |
| G16 | PASS | UI/Studio | G/H | Colagem/home/portfólio | CI/Chromium histórico | relatório 45 | CI I pendente | Revalidar I |
| G17 | FAIL | Cloudflare/Infra | H/I | snapshot/cache/CPU | local/QA histórico | relatório 45 | sem amostras cold/MISS atuais | Medir CPU real Workers Free |
| G18 | PASS | Operador backup | G/H/I local | captura/restore/hash/anti-replay | Miniflare/QA histórico | RED H/I, Node G18 | UI antiga não é produto; QA remoto I não homologado | Quarentena e readback QA isolado |
| G19 | BLOCKED_EXTERNAL | Revisor independente | G/H/I | segurança auditável | externo | relatório 45 | sem parecer formal | Parecer sem P0/P1 |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | G | LGPD | humano | GOAL 36 | não aprovado | Aceite formal |
| G21 | PASS | CI/Reviewer | G | CI G 250/250 | Actions | #42536082570; H #42538018351 FAIL | nova CI I | Confirmação exact-SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | G | autorização | humano | GOAL 36 | sem aprovação | Release específico após gates |
| G23 | BLOCKED_EXTERNAL | Operador QA | G/H/I | preflight read-only / restore local | Cloudflare/Miniflare | HTTP D1 401, Billing 403, relatório 43 | sem ambiente/escopo/autorizações | QA segregado, controle de manutenção, ensaio autorizado |
| G24 | PASS | Documentação | G | PR/Drive readback | GitHub/Drive | checkpoint G | I readback pendente | Persistir/checkpoint com SHA I |

**Bloqueios irredutíveis:** G05 26.214.400 bytes da SPEC vs `IMAGES.input()` 20MB, decodificação/derivados e quotas sem prova Free; G17 CPU cold/MISS real sem amostras; G23 rollback remoto sem autorização, D1 HTTP401 e subscription HTTP403; G15/G19/G20/G22 exigem pessoas e aceite formal. O caso H demonstra por que CI só é PASS após execução inteira no SHA exato.

**Decisão:** `NO_GO_PRODUCTION`, flag privada OFF em configuração versionada; produção e QA histórico intocados, sem merge/deploy, sem fotos reais, nenhuma contratação ou gasto incremental, sem mudança de D1/schema ou serviços compartilhados.
