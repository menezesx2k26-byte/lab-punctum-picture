# PUNCTUM R4 — ciclo U | inventário offline de quarentena R2/D1, ownership e integridade

**Data:** 09/11/2026. **Decisão:** `NO_GO_PRODUCTION`. Incremento G23/G05 independente e estritamente **read-only/offline**, sem tocar em Cloudflare, dados históricos G18, produção, Studio, Colagem, rascunhos da Maria, fotos reais, billing/permissões ou feature flag. Trabalho separado na worktree U sobre HEAD remoto T `4668a5707d232bc534d5f2b8209c15b0b42f2f46`.

## Baseline readback T e checkpoint preservado

- T filho de S `491174d0f645aad02b155820b5d790b2a6625710`; tree T `01059d5cd8a5dcabb37a2ab53caed620dd3998ee`, local irmão `32591f6a1eda0bfecd8958989494f513fcd90eef`, 7 blobs SHA comparados, `update_ref(force=false, expected_sha=S)`, ref/parent/tree/PR readback. PR #32 open/draft/unmerged.
- CI T [#42708515935](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42708515935) `completed/success`, verify 31/31, artifact Chromium ID `13714064089` 5.884.254 bytes, digest `sha256:b448098569d7d7ac331aaccda0015f4518e53e2a5e8c690c3cfeeaf9f1db540d`. ZIP interno não auditado.
- Checkpoint T PR [#6752842665](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32#issuecomment-6752842665) readback. Google Doc Sgtmenezes `12oLVbThH1KUncV7XiYzRQ4L4MMprwoDJg0LZmyHBsSA` revisão T `AHj4eMSqf_sHKkCQu_5oXgeI9h7R4nHf3gzqEBwFpRcNEZ-Y43Ho0dX_F02v0Aowq6JLReIiVnoZ-Nm6WJfca57X81i27qd8SAw1ivpoU8U`, requiredRevisionId/readback confirmado. Não duplicados P/Q/R/S/T.

## TDD U — classificação de originais sem exclusão

**Problema:** os ciclos R/S/T eliminaram deleções R2 não protegidas, porém inexistia um inventário reproduzível que correlacionasse com segurança as relações D1 e objetos R2 para distinguir ativo, quarentena, colisão, ausência, chaves legadas e candidatos órfãos sem apagar fotos ou promover falsas garantias de SHA.

**RED inicial 8/8 FAIL:** controlador stub incompatível com propriedades de isolamento/read-only: retornava autorização de purge e nenhuma classificação. Após primeiro GREEN 8/8, acrescentados dois adversários RED (8 PASS/2 FAIL) para metadados SHA ausentes tratados como ativo e listagem R2 duplicada que deixava uma entrada live. **GREEN por etapas: 8/8 após stub; 10/10 após SHA e duplicidade; RED 1/2 para manifesto malformado e GREEN 12/12; RED 2/2 para intenção ausente/duplicada e GREEN 14/14; testes CLI adicionados, total final 16/16 PASS** com:

- `scripts/lib/r4-originals-inventory-readonly.mjs`: função pura, sem fetch, SQL, R2 put/delete, credenciais ou operações em contas. Entrada estritamente por três manifests fornecidos (`images`, `intents`, `objects`) e flags de completude declarada e checagem de estrutura dos objetos, mesmo se declarados completos. Ordenação determinística, contagens/bytes observados, ETags e hashes somente como metadados alegados, sem afirmar leitura ou digest real de bytes.
- Ownership exato por domínio, owner, imagem, MIME, tamanho e chave canônica `originals/{album}/{image}.{jpg|png|webp}` ou `client-galleries/{gallery}/{image}.{jpg|png|webp}`; nunca usar prefixo como prova. Detectar forged intent que aponta chave de outro álbum, múltiplos claims, D1 image identity duplicada, intent ausente ou duplicada, duplicatas R2 e mismatch de tamanho/hash; `active` exige exatamente uma intenção `completed` coerente com imagem `ready` e metadados de SHA concordantes (não prova digest real).
- Classificações conservadoras: `active`, `quarantine`, `orphan_candidate`, `legacy_recovery_only`, `integrity_unverified`, `integrity_conflict`, `ownership_conflict`, `missing_object`, `unverified`, `out_of_scope`. Incompletude D1/R2 implica `BLOCKED_INCOMPLETE_INVENTORY`; nenhum objeto vira orfão confirmado, e nenhuma classe autoriza delete.
- Chaves legadas são identificadas como `legacy_recovery_only`, sem adicionar suporte em serviços públicos/privados. O operador histórico G18 não foi alterado. Todos os resultados retornam `deletionAuthorized=false`, `rollbackAuthorized=false`, `productionSafeToRelease=false`, `writes=0`, `byteDigestVerified=false`.
- `scripts/r4-originals-inventory-readonly.test.mjs` 16 casos sintéticos; CI Linux `.github/workflows/ci.yml` inclui execução explícita desse teste para que o SHA U seja verificado automaticamente, não apenas por testes locais.

**CLI operacional seguro:** `node scripts/r4-originals-inventory-cli.mjs --input /caminho/local/manifest.json` lê exclusivamente JSON fornecido pelo operador, até 8 MiB, sem rede ou writes; mostra contagens, bytes declarados e bloqueios. Não emite chaves R2, IDs, ETags, hashes ou caminhos de entrada. JSON inválido retorna exit 2 e erro genérico; manifest parcial retorna exit 2 com status bloqueado. Dois testes CLI sintéticos RED preventivos/GREEN comprovam restrição de saída, ausência de vazamento, invalidez e falha fechada. O programa NÃO descobre nem coleta recursos reais da Cloudflare.

**Limitações:** o reconciliador não recupera manifests remotos nem comprova que flags declaradas correspondam a um snapshot consistente; não mede quotas, custo real, bytes SHA-256 ou ETags de R2, não confirma predecessor Worker/config/backup, não executa rollback, não cria exclusividade/fencing entre atores e não autoriza purge. Sem QA segregada autorizada, G23 permanece `BLOCKED_EXTERNAL`. Mesmo `active` significa só consistência de metadados declarados, **nunca prova criptográfica ou autorização de release**.

## Regressões e gates restantes

- Node U 16/16 PASS; execução conjunta U inventory + rollback/cpu históricos 26/26 PASS. TypeScript PASS, ESLint PASS, G18 histórico 1/1 PASS, npm audit 0 vulnerabilidades, JSON e git diff --check PASS, Vinext build PASS, SSR imports 1/1 PASS. Chromium/exact-SHA CI U pendentes. `git diff --check` e JSON devem ser confirmados antes de versionar. Nenhum teste foi removido e nenhum timeout aumentado.
- G05 **FAIL**: SPEC 25 MiB = 26.214.400 B, guarda privada atual 20.000.000 B; validação completa e derivados privados com Images Binding além de 20 MB, CPU/quotas/QA e custo zero ainda não demonstrados. U não altera bytes e não eleva guarda.
- G17 **FAIL**: cache endurecido até T, mas CPU Workers Free cold/primeiro MISS/pós-invalidação não medida em QA real do SHA corrente. CI, Miniflare, Chrome e latência não a substituem.
- G23 **BLOCKED_EXTERNAL**: falta inventário D1/R2 autoritativo e segregado, hashes SHA reais, backup/restore/rollback de Worker predecessor, configuração, flags, sessões, revogação e exclusividade de descarte. Sem Cloudflare write remoto ou billing/permissões.
- G15 TalkBack/VoiceOver dispositivos reais, G19 auditor independente, G20 LGPD formal e G22 autorização de release seguem gates humanos não simulados. SPEC literal `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` §23 não localizada; GOAL36/reconciliação16/handoff35/reports50–57 preservados, não inventar seção ausente.
- `PRIVATE_GALLERIES_ENABLED=false` no config versionado; runtime produtivo não lido nesta execução. Autorização custo incremental **R$ 0,00**; faturamento real desconhecido. Sem deploy/merge/release, alteração D1/R2 remoto, provisionamento/billing ou publicação editorial.

## Evidências futuras U

**Ainda pendentes:** commit U local/remoto, SHA/tree/parent/ref verificados, CI Linux exact-SHA de U (novo passo Node U), artifact Chromium, checkpoint único PR/Drive com requiredRevisionId + readback. Não contar T 31/31 como sucesso de U. Após U, investigar melhorias independentes de fencing, cost read-only, workflow de CPU QA autorizado e pipeline original 25MiB, preservando `NO_GO_PRODUCTION`.

## Matriz canônica G01–G24

Colunas: `GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO`.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS HISTÓRICO_ESCOPADO | Engenharia | S | PR/ref/parent/tree/24 gates | GitHub readback | CI S #42703301463 31/31 | SPEC literal §23 ausente; produção não homologada | Localizar SPEC e manter matriz atualizada |
| G02 | PASS histórico | Eng./Reviewer | T | CI/Linux | GitHub Actions | #42708515935 31/31 | CI U pendente | Confirmar exact SHA U |
| G03 | PASS | Admin | L | D1/cadastro | Chromium local | relatórios prévios | sem QA M | Revalidar QA seguro |
| G04 | PASS | Admin | L | publish/capa/galeria | Chromium | histórico e2e L | release não autorizado | Preservar Studio |
| G05 | FAIL | Eng./QA Images | T | public/private signed upload + recovery | CI T/Linux + local | T CI #42708515935 31/31 | 25MiB vs Images20MB, derivados/QA remota/custo não comprovados | Investigar pipeline privado 25MiB sem subir guarda |
| G06 | PASS | Segurança | G/L | JWT/JWKS | QA histórico | reconciliação 16 | G19 | Auditoria independente |
| G07 | PASS | Access QA | G | OTP | QA histórico | reconciliação 16 | físico | G15 |
| G08 | PASS | Segurança | L/M | sessão/revogação | local | 46–50 | sem QA remoto M | Revogação QA autorizada |
| G09 | PASS | Segurança | L/M | isolamento A/B | Miniflare | 44–50 | auditor externo | G19 |
| G10 | PASS | Segurança | L/M | private GET/HEAD negados | Miniflare | 44–50 | flag produção não verificada | Revalidar runtime |
| G11 | PASS | Produto | L | favoritos | Chromium | CI L | físico | G15 |
| G12 | PASS | Produto | L | download/hash | Chromium | CI L | QA real | Homologação segura |
| G13 | PASS | UI cliente | L | lightbox/teclado | Chromium | CI L | TalkBack/VoiceOver | G15 |
| G14 | PASS HISTÓRICO_ESCOPADO | UI/Admin | T | Chromium 8 larguras/admin | CI Linux T | CI T #42708515935 31/31 artifact 13714064089 | QA remoto segregado/físico não executado | QA apenas com autorização |
| G15 | BLOCKED_EXTERNAL | Testadores | — | TalkBack/VoiceOver | físico | GOAL36 | NOT_RUN | Homologar Android e iOS reais |
| G16 | PASS HISTÓRICO | Studio/Editorial | T | Colagem7/7/CI Chromium | local+CI Linux | T CI #42708515935; Colagem7/7 | U não altera Studio, QA produção não efetuada | Preservar editor e rascunhos |
| G17 | FAIL | Cloudflare/Infra | T | G17 HTML negotiation/cold-MISS | CI T/Linux | T CI #42708515935, local cache12/12 | CPU Workers Free real do SHA U não medida em QA segregada | Instrumentar QA apenas com autorização |
| G18 | PASS HISTÓRICO_ESCOPADO | Operador | T | fixture histórica imutável | Node/CI Linux | T G18 1/1 + CI T 31/31 | rollback remoto não homologado | Preservar fixture, operador histórico apenas |
| G19 | BLOCKED_EXTERNAL | Auditor independente | — | parecer formal | humano | GOAL36 | sem aprovação | Auditoria independente |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | — | LGPD formal | humano | GOAL36 | sem aceite | Aprovação formal |
| G21 | PASS HISTÓRICO_ESCOPADO | CI Reviewer | T | CI verify 31/31 | GitHub Actions | #42708515935 exact T SHA 31/31 | CI U pendente | Comprovar U exact-SHA |
| G22 | BLOCKED_EXTERNAL | Proprietário | — | autorização de release | humano | GOAL36 | ausente | Autorizar especificamente após gates |
| G23 | BLOCKED_EXTERNAL | Operador/QA | U local | reconciliação offline D1/R2/quarentena/órfãos | Node 10/10 sintético | U RED10→GREEN10; T CI #42708515935 | sem inventário real/backup/rollback, SHA bytes, fencing, custo R2 e permissão QA | Aplicar inventory read-only só em QA segregada autorizada |
| G24 | PASS HISTÓRICO_ESCOPADO | Documentação | T | PR/Drive readback | GitHub/Google Docs | PR #6752842665, Drive T requiredRevisionId/readback | checkpoint U pendente | Persistir U pós-CI exact-SHA |

**NO_GO_PRODUCTION**.
