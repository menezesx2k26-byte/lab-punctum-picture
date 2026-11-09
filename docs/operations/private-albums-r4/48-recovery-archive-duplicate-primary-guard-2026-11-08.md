# PUNCTUM R4 — ciclo K | identidade primária única no arquivo de recuperação

**Data:** 08/11/2026 (America/New_York). **Decisão:** `NO_GO_PRODUCTION`. Escopo de engenharia: operador de backup/restore local G18/G23, sem alteração no fluxo de cliente, upload, mídia privada, Studio, Colagem, QA remoto ou produção.

## Baseline verificável

- Ciclo J publicado na PR #32 open/draft/unmerged: SHA `fca54a3d280750eb828ee9d083914cebe92f309d`; tree `4fc8647f29c562c97b3a5c7426c3819378569934`; parent I `f409b954166a042bd2db9de280a945ab64b37666`.
- CI J [#42541669237](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42541669237) **completed/success**, verify 31/31. Artifact `r4-browser-evidence` #13641048301, SHA-256 do provedor `bb4e304c069d79a59e41353168d527ae442dde08c9f920a97959d612d7323396` (ZIP não revisado de forma independente).
- PR checkpoint J [#6729567101](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32#issuecomment-6729567101) lido de volta; Drive `PUNCTUM_R4_HANDOFF_RASTER_ROLLBACK_2026-11-08` atualizado com `requiredRevisionId` e readback SHA/CI/NO_GO. Relatório 47 preservado.

## RED G23 — backup adulterado com duas imagens de ID idêntico

O ciclo J validou chaves R2 únicas e e-mails únicos antes dos `PUT`, mas uma cópia de backup adulterada ainda podia trazer **duas imagens diferentes com o mesmo `id` primário** e `gallery_id` distintos; cada linha apresentava uma chave R2 canônica diferente. `assertRowScope()` usava um `Map` indexado pelo ID e não recusava a duplicação no próprio snapshot. A operação podia gravar objetos R2 e descobrir `UNIQUE client_gallery_images.id` somente ao tentar `db.batch`.

**Reprodução RED executada:** duas galerias sintéticas de um cliente, cada uma com uma imagem `ready`, bytes e MIME coerentes. Após captura legítima, uma cópia de snapshot troca apenas o segundo `id` pelo primeiro e atualiza a chave R2 para continuar canônica para a segunda galeria. O teste arma um R2 que aborta se `put` for chamado. Antes do patch a asserção falhou com `R2 write attempted before snapshot primary-key check`. Nenhuma fotografia real ou fixture histórica foi alterada.

## GREEN — fail-closed antes de R2

- `assertRowScope()` agora confere presença/tipo e unicidade de identidades primárias em **todas as cinco tabelas** permitidas no recovery. Para favoritos utiliza a PK composta `(client_id,gallery_id,image_id)`; nas demais tabelas, `id`.
- `JSON.stringify` dos vetores de campos de PK preserva a delimitação entre componentes, evitando colisões por concatenação ambígua.
- Essa checagem ocorre tanto antes de `R2.get` da captura quanto antes de `R2.put` da restauração e precede os `Map` de vínculo. O teste comprova **zero PUT**, zero objeto destino e ausência da conta restaurada com snapshot adulterado.
- Não muda a compatibilidade histórica PNG exata de G18, os guards de chaves do produto ou as regras de exclusão. Mantém quarentena, SHA-256 e anti-replay. Nenhum `UPSERT` nem mutação Cloudflare remota.

**Limite remanescente:** o teste protege duplicidades já presentes no arquivo, mas não impede mutações concorrentes externas no D1 após o preflight. D1/R2 sem atomicidade transacional única permanecem risco residual; G23 remoto requer QA segregado e operador autorizado.

## Validação

- RED isolado confirmado: **1 teste falhou pelo motivo esperado**.
- GREEN focado: `client-recovery.spec.ts` **16/16** + `client-maintenance.spec.ts` **5/5** = **21/21 PASS**, G18 Node histórico **1/1 PASS**, TypeScript e `git diff --check` PASS.
- Regressão integral local K encerrada com `==K_COMPLETE_PASS==`, exit code 0: **Workers Vitest 258/258 em 57 arquivos**, **Colagem 7/7**, **G18 histórico Node 1/1**, **Node R4 14/14**, **SSR 1/1**, **TypeScript PASS**, **ESLint PASS**, **Vinext build 5/5 PASS**, **npm audit 0 vulnerabilidades**, **Chromium E2E completo PASS**, JSON e `git diff --check` PASS. O Chromium exercitou clientes A/B sintéticos, downloads e negação cruzada, Studio, Colagem, oito larguras, restart, rollback local, logout/revogação.
- O SHA remoto e a CI exact-SHA de K continuam **pendentes de publicação e readback** nesta versão do arquivo; regressão local não equivale a homologação remota.

## Matriz G01–G24 canônica — SHA e ambiente separados

`PASS` reflete evidência histórica e delimitada; não significa liberação de produção. `J` é SHA remoto exato com CI completa; `K` é patch local deste relatório, ainda sem CI. SPEC original §23 não estava disponível no checkout, portanto não se inventa texto faltante.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS | Engenharia | J | branch/PR/tree | GitHub | relatório 47 | SPEC original ausente | Recuperar SPEC |
| G02 | PASS | Eng./Reviewer | J | CI exact-SHA | Actions | #42541669237 | auditoria independente | Confrontar SPEC |
| G03 | PASS | Admin | G/J | cadastro/D1 | Chromium local | matriz 16 | QA novo não homologado | Revalidar QA |
| G04 | PASS | Admin | G/J | publicação/galeria | Chromium local | relatório 47 | sem deploy | Preservar Studio |
| G05 | FAIL | Produto/Images QA | J/K | upload/hash/cleanup | Miniflare | relatórios 44–48 | 25MiB versus 20MB; corrida D1/R2 | Pipeline completo 25MiB |
| G06 | PASS | Segurança | G | JWT/JWKS | QA histórico | matriz 16 | sem parecer externo | G19 |
| G07 | PASS | Access QA | G | OTP | QA histórico | matriz 16 | ensaios físicos | G15 |
| G08 | PASS | Segurança | G/J | sessão/revogação | local/QA | relatório 47 | sem reabertura remota | QA autorizado |
| G09 | PASS | Segurança | G/J/K | A/B e chaves | Miniflare | 44–48 | G19 | Revisão independente |
| G10 | PASS | Segurança | G/J | GET/HEAD negados | Miniflare | relatório 44 | release bloqueado | Flag OFF |
| G11 | PASS | Produto | G/J | favoritos | Chromium | CI J | físico | G15 |
| G12 | PASS | Produto | G/J | download/hash | Chromium | CI J | QA real | Ensaio autorizado |
| G13 | PASS | UI cliente | G/J | foco/lightbox | Chromium | CI J | emulação | G15 |
| G14 | PASS | UI admin | G/J | upload/viewport | Chromium | CI J | QA real | Revisão |
| G15 | BLOCKED_EXTERNAL | Testadores físicos | — | TalkBack/VoiceOver | aparelhos reais | GOAL 36 | NOT_RUN | Testes físicos |
| G16 | PASS | UI/Studio | G/J | Colagem/SEO | CI/Chromium | #42541669237 | release | Preservar identidade |
| G17 | FAIL | Cloudflare/Infra | J/K | snapshot/cache/CPU | local/QA antigo | relatório 45 | CPU real cold/MISS não medida | Medição remota |
| G18 | PASS | Operador backup | J/K local | recovery/G18 Node | Miniflare | RED→GREEN K | QA remoto não homologado | Ensaios isolados |
| G19 | BLOCKED_EXTERNAL | Revisor independente | — | auditoria segurança | externo | GOAL 36 | sem parecer | Auditoria formal |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD | humano | GOAL 36 | não aprovado | Aceite |
| G21 | PASS | CI/Reviewer | J | CI 31/31 | Actions | #42541669237 | K sem CI | Confirmar SHA K |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização release | humano | GOAL 36 | sem aceite | Release específico após gates |
| G23 | BLOCKED_EXTERNAL | Operador QA | J/K local | restore/preflight | Miniflare/Cloudflare GET | 47/48 e D1 401/Billing 403 | sem janela exclusiva, QA ou permissão | Protocolo coordenado e QA |
| G24 | PASS | Documentação | J | PR/Drive readback | GitHub/Drive | checkpoint J | K ainda sem versão/remoto | Versionar K/checkpoint |

**NO_GO_PRODUCTION:** G05/G17 FAIL; G23 e gates humanos bloqueados. `PRIVATE_GALLERIES_ENABLED=false` na configuração versionada; runtime de produção não homologado nesta rodada. Sem merge, deploy, D1/R2 remoto, fotos reais, billing, permissões, secrets, alteração da identidade visual ou custo incremental (autorizado R$ 0,00).
