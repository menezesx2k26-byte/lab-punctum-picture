# PUNCTUM R4 — ciclo J | preflight de conflitos UNIQUE antes de R2 no restore

**Data:** 08/11/2026 (America/New_York). **Decisão:** `NO_GO_PRODUCTION`. PR #32 segue draft/unmerged. **Custo incremental autorizado:** R$ 0,00. Nenhuma escrita em produção ou QA remoto; testes usam D1/R2 locais e dados sintéticos.

## Linha de base comprovada

- Ciclo I remoto: SHA `f409b954166a042bd2db9de280a945ab64b37666`, árvore `d5cd098deaa9e4ba9fb007858b37d067149827e3`, parent `cbd8972d18a7a5a2baf5d7c25d8028c32d0c9137`.
- CI I [#42540296525](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42540296525): **completed/success**, job verify **31/31**. Artefato `r4-browser-evidence` id `13641022585`, SHA-256 de provedor `d85654da2d77b39f51bb819e18d35b4fa18e5df58e9479dad91263949cd10f51`; ZIP não revisado independentemente.
- Checkpoint I PR [#6729393109](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32#issuecomment-6729393109) lido de volta; documento Drive `PUNCTUM_R4_HANDOFF_RASTER_ROLLBACK_2026-11-08` atualizado sob `requiredRevisionId` e lido de volta com SHA/CI/NO_GO.

## Defeito G23/G18 reproduzido — RED

`restoreClientRecovery()` recusava IDs primários existentes e R2 com bytes conflitantes, mas não verificava **outras restrições UNIQUE** do esquema D1 antes de `R2.put`. Um cliente diferente no destino podia possuir o mesmo e-mail; a restauração então copiava objetos R2 e só falhava na escrita final do lote D1. Resultado: objetos órfãos novos, operação parcialmente realizada e sem possibilidade de alegar rollback atômico.

Contraprova real local, sem alterar fixture histórica: cliente A sintético e imagem PNG; banco RESTORE_DB contém conta B com **e-mail idêntico** e ID distinto, sem objeto R2 correspondente. O teste injeta falha se `R2.put` for chamado. **RED:** a implementação anterior tentou escrever no R2 antes de detectar a colisão de e-mail. Teste executado isoladamente: **1 falha esperada** (`R2 write attempted before destination email conflict check`).

## Implementação fail-closed e GREEN

- Antes de gerar os INSERTs e tocar R2, o operador verifica, nas tabelas fixas e colunas fixas do schema, `client_accounts.email`, `client_gallery_images.storage_key` e `client_gallery_upload_intents.storage_key`.
- Valores ausentes, vazios ou duplicados no snapshot são recusados. Qualquer valor já reivindicado no D1 de destino gera `Recovery destination unique conflict`.
- Nova contraprova: outra imagem do D1 destino reivindica a mesma `storage_key` de um original de A. O restore é recusado **antes de qualquer PUT**, preservando a linha B e mantendo a conta de A ausente.
- Não há `UPSERT`, sobrescrita, `delete`, mudança em chaves do produto, permissões, backups históricos ou Cloudflare. O escopo continua somente no operador `scripts/lib/private-recovery.ts`.
- Segurança residual **não resolvida:** uma escrita concorrente no D1 entre esse preflight e a transação de INSERT pode causar conflito após PUT no R2. A atomicidade D1/R2 não existe; exige destino segregado, janela exclusiva/coordenação ou protocolo de quarentena/recuperação auditado. A pré-validação apenas bloqueia conflitos determinísticos presentes no instante de leitura.

## Validação e evidência

- TDD RED e GREEN: `client-recovery.spec.ts` 15/15 PASS após a correção; `client-maintenance.spec.ts` 5/5; G18 histórico `scripts/r4-scoped-local.test.mjs` 1/1; TypeScript PASS; `git diff --check` PASS.
- Regressão completa local encerrada com `==J_COMPLETE_PASS==` e exit code 0: **Workers Vitest 257/257 em 57 arquivos**, **Colagem 7/7**, **G18 histórico Node 1/1**, **Node R4 selecionado 14/14**, **SSR 1/1**, **TypeScript PASS**, **ESLint PASS**, **Vinext build 5/5 PASS**, **npm audit 0 vulnerabilidades**, **Chromium E2E PASS**, **JSON e git diff --check PASS**. Chromium exercitou clientes A/B sintéticos, originais e downloads, revogação, teclado/foco, oito larguras, Studio, Colagem, restart e rollback local. Não confundir com homologação de rollback remoto.
- CI J e SHA remoto J **ainda pendentes de publicação e readback**; resultados locais não são creditados à CI futura.
- Testes físicos, token de QA, D1 remoto, Billing, CPU fria/MISS e recuperação remota não foram executados neste ciclo.

## Matriz canônica G01–G24 — não substituir pela Argon

`PASS` indica evidência histórica delimitada pelo SHA/ambiente descrito na reconciliação 16 e nos relatórios 44–46; não significa prontidão de produção. `I` é o SHA remoto com CI verde, `J` é o incremento local ainda sem CI.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | I | branch/PR/tree | GitHub | relatório 46 | SPEC original não recuperada | Recuperar SPEC |
| G02 | PASS | Eng./Reviewer | I | CI exact-SHA | Actions | #42540296525 | review independente | Confrontar SPEC |
| G03 | PASS | Admin | G/I | cadastro/D1 | Chromium local | reconciliação 16 | QA atual não homologado | Revalidar QA |
| G04 | PASS | Admin | G/I | publicação/galeria | Chromium local | relatório 46 | sem deploy | Preservar Studio |
| G05 | FAIL | Produto/Images QA | G/I/J | upload/cleanup/hash | local sintético | relatórios 44–47 | contrato 25MiB, teto 20MB e atomicidade D1/R2 | Arquitetura 25MiB e integração |
| G06 | PASS | Segurança | G | JWT/JWKS | QA histórico | reconciliação 16 | auditor externo | G19 |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | ensaios físicos | G15 |
| G08 | PASS | Segurança | G/I | sessão/revogação | local/QA histórico | relatório 46 | sem reabertura remota | Testar QA autorizado |
| G09 | PASS | Segurança | G/I/J | A/B e chaves | Miniflare | 44–47 | G19 | Auditoria independente |
| G10 | PASS | Segurança | G/I | GET/HEAD negados | Miniflare | relatório 44 | release bloqueado | Revalidar flag OFF |
| G11 | PASS | Produto | G/I | favoritos | Chromium | CI I | físico | G15 |
| G12 | PASS | Produto | G/I | download/hash | Chromium | CI I | QA/físico | Ensaios reais autorizados |
| G13 | PASS | UI cliente | G/I | foco/lightbox | Chromium | CI I | emulação não é dispositivo | G15 |
| G14 | PASS | UI admin | G/I | viewport/upload | Chromium | CI I | QA real | Revisão |
| G15 | BLOCKED_EXTERNAL | Testadores físicos | — | TalkBack/VoiceOver | Android/iOS físicos | GOAL 36 | NOT_RUN | Testes de acessibilidade |
| G16 | PASS | UI/Studio | G/I | Colagem/SEO | CI/Chromium | #42540296525 | release bloqueado | Preservar identidade |
| G17 | FAIL | Cloudflare/Infra | I/J | snapshot/cache/CPU | local/QA histórico | relatório 45 | CPU Workers Free cold/MISS real não medida no SHA atual | Medir CPU remota |
| G18 | PASS | Operador backup | I/J local | G18 Node/recovery | Miniflare | 46/47 | não é rollback remoto | Quarentena e QA segregado |
| G19 | BLOCKED_EXTERNAL | Revisor independente | — | auditoria segurança | externo | GOAL 36 | sem parecer | Revisão independente |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD | humano | GOAL 36 | sem aprovação | Aceite formal |
| G21 | PASS | CI/Reviewer | I | CI 31/31 | Actions | #42540296525 | J ainda sem CI | Verificar J exact-SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização release | humano | GOAL 36 | sem aceite | Aprovar somente após gates |
| G23 | BLOCKED_EXTERNAL | Operador QA | I/J local | preflight/restore | Miniflare/Cloudflare GET | RED→GREEN J, D1 401/Billing 403 | restore remoto sem QA/autorizações e corrida D1/R2 residual | Janela exclusiva e ensaio QA |
| G24 | PASS | Documentação | I | PR/Drive readback | GitHub/Drive | checkpoint I verificado | J ainda pendente | Versionar J/checkpoint |

**Decisão operacional:** `NO_GO_PRODUCTION`. `PRIVATE_GALLERIES_ENABLED=false` em configuração versionada (runtime remoto não verificado nesta rodada); sem merge, deploy, alteração em serviços compartilhados, D1/R2 remoto, fotos reais, credenciais, faturamento ou assinatura. Permanecem G05/G17 FAIL; G23, G15/G19/G20/G22 bloqueados. A SPEC original §23 continua não disponível e não foi inferida.
