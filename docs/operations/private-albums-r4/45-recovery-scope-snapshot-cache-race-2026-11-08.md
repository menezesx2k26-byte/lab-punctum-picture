# PUNCTUM PICTURE R4 — ciclo H: recuperação canônica, snapshot e recheck pré-exclusão

**08/11/2026 — continuidade do GOAL/DoD original §23, G01–G24.**
**Decisão:** `NO_GO_PRODUCTION`. Custo incremental autorizado R$ 0,00.
**Escopo:** código e testes sintéticos locais, sem fotos reais, mutações Cloudflare/QA, merge, deploy, billing ou ativação privada.

## Reconciliação comprovada

- PR [#32](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32) aberta/draft/unmerged. Branch `fix/punctum-albums-r4-completion-20261107`, base `agent/hst-001-hostinger-qa-20261028`.
- HEAD remoto anterior deste ciclo `a869725ec4a3d7cb39b625d6be6dfbadad5975cf`; árvore `7173272e5c3f004b9fab35862c0c596b0206da23`, parent `13e8e89af2d842d26aaf240b3c847981b072cb69`.
- Checkout local irmão `3bd0f107917f622c17e24fd2522b304ce151d112`, árvore idêntica e worktree inicialmente limpa. CI anterior exata [#42536082570](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42536082570), success, Vitest 250/250 e Chromium. **Não é CI deste novo ciclo**.
- SPEC original `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` não localizada no checkout; reconciliação 16 e GOAL 36 usados sem reescrever os gates originais. Relatórios C–G e checkpoints remotos preservados.

## RED reproduzidos e correções GREEN

### G18/G23 — backup/restauração não devem confiar em prefixos R2

1. **Captura D1→R2:** linha ready restaurada com `storage_key` da galeria correta, mas de uma identidade de imagem diferente, alcançava `R2.get` antes de falhar; o proxy de R2 lançou `R2 must not be read for noncanonical source` em lugar de `Recovery scope mismatch` (RED).
2. **Restauração archive→R2:** um snapshot adulterado coerentemente em suas chaves D1/R2 falsas tentava `R2.put` antes de rejeitar a identidade da imagem (RED). Nenhuma escrita remota real foi tentada.
3. **GREEN:** `assertRowScope` executa antes de qualquer R2 em `captureClientRecovery` e `restoreClientRecovery`; exige chave exata `privateGalleryStorageKey(gallery_id,id,mime_type)`, vínculo de cliente/galeria, favoritos, intents, MIME e tamanho. A verificação de bytes e SHA-256 permanece separada após a coleta. Captura incompatível falha fechada; restauração não promove/quarentena só dados relacionais coerentes. Sem alteração de schema ou de fotos históricas.

### G17 — snapshot codificado, headers personalizados e variantes de cache

4. **RED:** HTML completo com caminho privado contendo letras ASCII codificadas (`\\u0061`, `\\x61`, `%61`, `%2561`, entidades HTML decimal/hex, escapes Unicode com chaves) podia ser aceito como snapshot publicável. O verificador antigo só normalizava separadores. **GREEN:** normalização limitada a oito passagens, com caracteres ASCII imprimíveis e sem executar o HTML, antes de examinar marcadores privados; entradas ainda ambíguas recusadas.
5. **RED:** headers de identidade alternativos como `CF-Access-Authenticated-User-Email`, `X-Forwarded-User`, `X-Auth-User`, `X-Api-Key`, `Proxy-Authorization` não bloqueavam a entrada cacheada. **GREEN:** denylist adicional, sem relaxar condições GET / HTML anônimo, cookies/sessões/Access/RSC.
6. **RED:** `CDN-Cache-Control`, `Surrogate-Control` e `Expires` mantinham instruções cacheáveis até em respostas negadas `private, no-store`, ou poderiam exceder a janela pública de 60s. **GREEN:** limpeza explícita desses headers e de `Age` tanto na resposta pública elegível como nas recusadas. Resposta segura preserva `Cloudflare-CDN-Cache-Control: public,max-age=60` somente quando anônima/HTML/200; demais respostas sem cache CDN.

### G05/G18 — corrida após a transição D1

7. **RED:** uma restauração concorrente promovia a imagem a ready imediatamente após o `UPDATE ... status='failed'` (que retornou `changes=1`); o código seguia para `R2.delete`, apagava o original ready. **GREEN:** antes de atravessar D1→R2, novo `SELECT` exige intent ainda `expired`, sem `completed_at`, chave/MIME/tamanho/galeria/id iguais e imagem ainda `failed`, não deletada e com `updated_at` do claim. Se não corresponder, não toca R2 e não marca cleanup concluído. Retentabilidade da falha de R2 e os cenários cross-tenant anteriores permanecem protegidos.

**Limite residual explícito:** D1 e R2 não oferecem uma transação atômica única. Um operador externo que restaure/altere D1 ou R2 **depois** da última verificação pode concorrer com `R2.delete`; para homologação remota G23, exigir coordenação exclusiva de restore/cleanup ou quarentena não destrutiva. Não vender o recheck como garantia linearizável entre serviços. G05/G23 continuam sem aprovação.

## Validação / provas

- TDD focado antes das correções: dois RED de recovery, um RED snapshot, um RED filtro de identidade e dois RED adicionais (corrida pós-transition, CDN alternativo); todos reproduzidos em Vitest sintético. Testes de captura/restauração verificam *zero operações R2* antes de rejeitar, e zero novas linhas no destino.
- GREEN focado após correções e complementos: **26/26**, em quatro arquivos `client-recovery`, `client-maintenance`, `public-home-snapshot` e `public-home-cache`; TypeScript PASS no mesmo checkout.
- Regressão completa local final: **Vitest 254/254 em 57/57 arquivos**; Colagem Autoral **7/7**; Node R4 selecionados **14/14**; SSR Miniflare **1/1**; TypeScript e ESLint PASS; build Vinext **5/5 etapas** PASS; `npm audit --audit-level=low` **zero vulnerabilidades**; Chromium E2E real local PASS para dados sintéticos A/B, upload/admin, Studio/Colagem, oito larguras, restart, rollback local, revogação/logout e hashes de downloads. JSON/whitespace checks PASS. Avisos Vinext sourcemap/classificação e `workerd` pump canceled observados sem quebra dos testes.
- CI do **novo SHA**: ainda depende de publicação e readback GitHub Actions; não usar CI G anterior como validação de H nem interpretar E2E local como QA remoto/cpu físico.
- Contato externo/nova medição: **não houve**. QA G23 histórico somente leitura: token de conta HTTP 200 active, D1 HTTP 401, subscription HTTP 403; nenhum rollback nem novo consentimento. CPU cold/MISS Workers Free continua sem amostras válidas deste SHA.

## Restrição técnica G05/G17 confirmada

- SPEC: original privado **25 MiB = 26.214.400 bytes**. Guarda operacional: **20.000.000 bytes**, sem mudança de contrato neste ciclo.
- Documentação Cloudflare [Images limits](https://developers.cloudflare.com/images/get-started/limits/): `IMAGES.input()` aceita no máximo 20 MB. [Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/): limite **10ms CPU por request** e memória **128MB/isolate**. Remote Images URL de até 100 MB não prova solução privada: exige avaliação de autorização, cache, identidade, cotas e cobrança das transformações. [Images binding](https://developers.cloudflare.com/images/optimization/binding/) documenta transformações contabilizadas/billing. Não há arquitetura 25 MiB segura e gratuita comprovada end-to-end para este produto.
- Sem QA segregado/autorizado e amostras reais, não inferir CPU de latência HTTP ou Miniflare; G17 permanece FAIL. Sem acesso D1/Billing Read e aprovação para rollback, G23 permanece BLOCKED_EXTERNAL.

## Matriz do DoD canônico original — status por escopo e SHAs históricos

**SHAs:** `G` = `a869725ec4a3d7cb39b625d6be6dfbadad5975cf` (CI aprovada); `H local` = alterações deste relatório antes de publicação; `H remoto` deve ser comprovado fora do próprio commit. `PASS histórico` não é autorização de release nem garantia de repetição remota.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | G | Git/tree/PR | GitHub + local | PR #32, relatório 44 | SPEC original ausente | Recuperar fonte e renovar inventário |
| G02 | PASS | Engenharia/Reviewer | G | CI/Chromium/diff | Actions | #42536082570 | CI H pendente | Verificar CI H exact-SHA |
| G03 | PASS | Admin | G | E2E cadastro/D1 | Browser sintético | matriz 16/GOAL 36 | sem QA H novo | Revisar no pacote final |
| G04 | PASS | Admin | G | galerias/publicação | Browser sintético | relatórios C–G | sem deploy | Preservar Studio |
| G05 | FAIL | Engenharia/Images/Produto | G + H local | RED/GREEN cleanup, uploads | Miniflare sintético | relatório 44 e H | 25 MiB, CPU/Images QA integrado, corrida residual externa | Solução 25 MiB privada + coordenação restore/cleanup |
| G06 | PASS | Segurança Access | G | JWT/JWKS | QA anterior | reconciliação 16 | G19 externo | Pentest independente |
| G07 | PASS | QA Access | G | OTP real | QA anterior | reconciliação 16 | validação física nova | Exercitar dispositivos físicos |
| G08 | PASS | Segurança | G | sessão/revogação | local/QA histórico | reconciliação 16 | release pendente | Confirmar sessão após restore QA |
| G09 | PASS | Segurança | G + H local | IDOR A/B, chaves | Miniflare | relatório 44 e H | revisão independente | E2E cross-tenant autorizado |
| G10 | PASS | Segurança | G + H local | 404/zero bytes HEAD/GET | Miniflare | relatório 44 e H | não homologado pós-release | Verificar após flag-off |
| G11 | PASS | Produto | G | favoritos | Chromium | #42536082570 | sem físico | G15 |
| G12 | PASS | Produto | G | download/hash | Chromium | #42536082570 | sem produção | Revisar entrega |
| G13 | PASS | Frontend cliente | G | teclado/foco/lightbox | Chromium | #42536082570 | emulação ≠ físico | G15 |
| G14 | PASS | Frontend admin | G | upload/viewport | Chromium | #42536082570 | sem QA produção | Revalidar pacote |
| G15 | BLOCKED_EXTERNAL | Testadores Android/iOS | G | TalkBack/VoiceOver | dispositivo real | GOAL 36 | NOT_RUN físico | Executar matriz física |
| G16 | PASS | Studio/Frontend | G | Colagem, home/portfólio | CI/Chromium | #42536082570 | CI H ainda pendente | Testar regressão H |
| G17 | FAIL | Infra/Cloudflare | G + H local | snapshot/cache; CPU | Miniflare local, QA antigo | TDD H; GraphQL histórico 0 amostras atuais | CPU cold/MISS Free não medida | Telemetria real em QA isolado autorizado |
| G18 | PASS | Backup operator | G + H local | backup/restore/hash/canonical | QA histórico + D1/R2 sintético | 40786688338 e TDD H | restore remoto H não feito | QA segregado com retenção de hashes |
| G19 | BLOCKED_EXTERNAL | Revisor independente | G | IDOR/CSRF/backup/cache | equipe externa | pacote para review | signoff não emitido | Parecer formal sem P0/P1 |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | G | LGPD formal | humano | GOAL 36 | não aprovado | Aceite LGPD identificado e datado |
| G21 | PASS | CI/Reviewer | G | 250/250 CI | Actions | #42536082570 | CI H pendente | Readback novo SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | G | autorização release | humano | GOAL 36 | aprovação específica ausente | Aprovar somente após gates |
| G23 | BLOCKED_EXTERNAL | QA/Recovery operador | G + H local | rollback/local, read-only | Miniflare + Cloudflare read-only anterior | relatório 43, TDD H | D1 401, Billing 403, sem rollback remoto | Escopos, recursos QA, autorização ensaio |
| G24 | PASS | Documentação | G | PR/Drive/readback | repositório/Drive | checkpoint G | checkpoint H pendente | Persistir/readback H |

## Decisão e continuação

`NO_GO_PRODUCTION`. PR draft/unmerged, nenhum deploy, sem fotos reais, sem D1/R2 externo, sem serviços pagos; `PRIVATE_GALLERIES_ENABLED=false` em configuração versionada, sem alegação de runtime revalidado. G05 e G17 permanecem FAIL; G15/G19/G20/G22/G23 permanecem BLOCKED_EXTERNAL. G18 PASS é histórico e endurecido localmente, **não** equivalente a rollback remoto integral. A versão H exige CI e checkpoint externos readback.
