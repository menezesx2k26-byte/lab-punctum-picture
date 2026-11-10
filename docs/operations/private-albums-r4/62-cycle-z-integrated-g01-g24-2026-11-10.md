# Punctum Picture R4 — ciclo Z: matriz canônica e dependências verificáveis

**Data de referência:** 10/11/2026 (UTC). **Decisão global:** `NO_GO_PRODUCTION`. **Orçamento incremental:** `R$ 0,00`. **Produto:** álbuns privados individuais R4, sem mudança de Studio, Colagem, rascunhos ou identidade pública.

## Proveniência e alcance

Repositório `menezesx2k26-byte/lab-punctum-picture`, PR #32 (aberta, draft, não integrada), branch `fix/punctum-albums-r4-completion-20261107`, HEAD remoto de entrada `07a2d15b816b340d62d21792c410139fa2562608`, tree `5aa3ac91407cd5b6620701e37516cfae0d8b3739`, CI de entrada [#42728502231](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42728502231) `success` **somente para aquele commit**. O worktree Z estava detached/limpo antes dos patches e o V com edições concorrentes foi preservado.

Fontes normativas disponíveis: `16-original-g01-g24-reconciliation.md`, `35-handoff-completo-2026-11-08.md`, `36-goal-definition-of-done-2026-11-08.md`, ledger `execution-state.json`, relatório 60 (ciclo Y), GOAL Google Doc `1gra_ZCRIB-fEhrUpnGu1vWE04wQz4airAC7Y8qcUs7A` e handoff Google Doc `1RZHMwFNJnRK8-xG5gf6ZF2JSFdHLfzKIhpYsaoumuSY`. O arquivo **`PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` não foi recuperado autonomamente**; as reproduções documentadas não devem ser declaradas como posse do original.

## Incrementos técnicos com testes reprodutíveis

1. **G17 — snapshot público:** teste RED mostrou que uma URL HTML privada com `&Tab;` no meio de `/api/client/galleries` era admitida no snapshot. A defesa passou a remover tab/LF/CR literais ou surgidos após entidades HTML, percent-encoding e escapes JavaScript, inclusive aninhados, somente na cópia de inspeção. GREEN: `tests/unit/public-home-snapshot.spec.ts` **5/5**. A proteção não mede CPU Free, não ativa snapshot, não publica HTML e não altera páginas/editoriais.
2. **G05 — falha de cancelamento no upload:** teste RED demonstrou que `reader.cancel()` rejeitando em um stream fragmentado invalidava a classificação `UPLOAD_STREAM` e propagava erro genérico. A correção `cancelInvalidUpload` ignora **apenas a falha secundária de cancelamento**, lança o erro original 400 e mantém a intent `pending`, R2 ausente e retry autenticado idêntico. GREEN focal: 1/1. A guarda 20 MB permanece inalterada.
3. **G23 — flags ambíguas:** teste RED demonstrou que duas bindings `PRIVATE_GALLERIES_ENABLED` podiam qualificar indevidamente o inventário quando a primeira era `false`. O preflight read-only agora exige **exatamente uma** binding plain_text com valor `false`; duplicação, conflito ou tipo secreto falham fechado. GREEN: `scripts/r4-rollback-readonly.test.mjs`; não executa rollback nem altera Cloudflare.
4. **E2E Chromium (harness):** o ensaio anterior (8 checks PASS) falhou com timeout de screenshot da home, não com HTTP/console/isolamento. `screenshot-evidence.mjs` tenta página completa, depois DevTools Chromium limitado a viewport e depois viewport Playwright, registrando o modo do screenshot e falhando se nenhuma captura for possível. Testes Node do utilitário: **4/4 PASS**. Antes da home são fechadas as páginas privadas de teste já concluídas. **Captura de viewport não equivale a uma captura integral.** O teste de negação A1/A2/B1 passou 1/1 isolado com execução de ~32–35 s; timeout explícito de 60 s preserva suas asserções.

## ADR G05 — preservação do contrato 25 MiB

**Contrato original:** 25 MiB = 26.214.400 bytes por foto. **Limite operacional do produto:** 20.000.000 bytes. **Limite externo:** `IMAGES.input(stream)` 20 MB (Cloudflare Images: <https://developers.cloudflare.com/images/get-started/limits/>). **Workers Free:** 10 ms CPU/request e 128 MB/isolate (Cloudflare: <https://developers.cloudflare.com/workers/platform/limits/>); não foi demonstrada a CPU do SHA final. O limite de 100 MB para imagens **remotas** no serviço não transforma uma URL privada em origem homologada, tampouco modifica o limite `.input()`; a API hospedada tem outras quotas. Banco D1 possui CHECK histórico 25 MiB, preservado sem migração redutora.

Opções e condições de decisão:

| Opção | Potencial | Risco que impede habilitar hoje | Prova mínima |
|---|---|---|---|
| R2 privado 25 MiB → `.input()` direto | Conserva bytes originais | **Rejeição documentada acima de 20 MB** | Inviável com entrada atual; não aumentar constante |
| R2 privado 25 MiB + derivado no navegador de administração | Mantém original e potencial preview menor | Cliente controla derivado; original maior não foi decodificado integralmente pelo servidor, sem vínculo verificado de pixels/proveniência | Validação independente do original, hash de original/derivado, isolamento, quotas/CPU, formatos e adversariais |
| Transformação Cloudflare de imagem **remota** protegida | Limite externo distinto (100 MB) | URL/origem e credenciais podem vazar em logs/cache; autenticação interna e restrições do otimizador não homologadas; billing/quota | URL não reutilizável, acesso privado verificável, nenhum bypass de JWT, byte SHA, render/download e CPU real, conta Free/quota |
| Decodificador completo JPEG/PNG/WebP no Worker | Evita dependência de `.input()` >20 MB para validar | Decodificador completo, limites de pixel, RAM/CPU Free e ataques de formatos exigem auditoria e benchmark real; magic header não basta | Corpus adversarial, limites, custo/CPU real, interoperabilidade e identidade de pixels |
| Alteração do requisito para 20 MB | Elimina divergência operacional | **Depende de aprovação expressa do produto/controladora e alteração formal da SPEC**; não satisfaz o mandato atual | Decisão explícita escrita, fora do escopo de engenharia não autorizada |

**Decisão técnica atual:** não anunciar nem aceitar 25 MiB até existir pipeline completo autenticado **Admin→intent→upload→R2→decode→D1 ready→galeria→download** testado no mesmo SHA/ambiente com integridade SHA-256, retries, corridas, rollback, rejeições, original e thumbnail privados, sem despesa adicional. A melhoria pontual de `cancel()` não promove G05. **G05 = FAIL**.

## G17 e G23 — critérios impeditivos

**G17:** as rotas SSR de Studio/Colagem/home têm conteúdo dinâmico. Cache quente e snapshot validado localmente não equivalem ao primeiro acesso, MISS após purge ou mudança editorial; `PUBLIC_HOME_SNAPSHOT_ENABLED` não está ativado em produção por este ciclo. Para PASS, exigem-se snapshot real produzido de uma publicação corrente e build exato, invalidação atômica por epoch, conteúdo público confiável, **CPU real por request ≤10 ms** amostrada em Worker Free, 0 `exceededCpu` e verificações de quotas/billing. Sem QA segregado e autorização, **FAIL**.

**G23:** preflight GET com flag única desligada, histórico de deployment anterior distinto, D1/R2/bindings inventariados e token com escopos corretos é apenas elegibilidade. Para PASS exigem-se backup consistente/objetos SHA256, Worker e assets/config/Access/flags, Studio/Colagem/draft e sessão/segredos, restauração com hashes/FKs, testes browser de reabertura, GET/HEAD não autorizados 404/0 bytes e retorno ao estado de QA; jamais usar dados históricos/produção como fixture. Os históricos `D1 HTTP401` e `Billing HTTP403` não foram superados por esta execução. Sem isso, **BLOCKED_EXTERNAL**.

## G15, G19, G20 e G22 — pacotes para pessoas autorizadas

**G15 — matriz física:** exigir Android real + TalkBack e iOS real + VoiceOver, com modelo/versão, data, leitor/navegador, foco/ordem, nomes/estados anunciados, upload admin, listagem, lightbox, favoritos, download habilitado/desabilitado, saída/revogação, erro/empty states, zoom 200%, contraste, toque e reduced motion; evidência sanitizada sem foto real. Chromium sintético verifica teclado/escape/foco/320–1440 px e reduced motion configurado, não voz/gesto físico.

**G19 — revisão independente:** escopo completo inclui Access JWT/OTP/Admin allowlist, tenant A/B, origem/CSRF, replay, download/HEAD/optimizer, HMAC intents, D1↔R2 race/restore, auditabilidade, LGPD/export, SSR/snapshot/cache, dependências/CI e rollback. Revisor independente deve ter acesso ao SHA/artefatos, assinar parecer datado, registrar achados P0/P1 e evidenciar encerramento. **Este relatório não é parecer.**

**G20 — decisão de Maria:** solicitar aceite expresso, datado e específico para base/finalidade LGPD, dados de crianças se aplicável, consentimento/captura, retenção e backups, direitos de titular/exportação/correção/apagamento, terceiros Cloudflare/Hostinger, acesso interno e compartilhamento, incidentes e prazos, endereço de contato e tratamento de mídia. O pacote técnico não substitui decisão da controladora.

**G22 — três atos separados:** **R1** integração do código após revisão; **R2** merge/deploy + migração estritamente aditiva autorizada com `PRIVATE_GALLERIES_ENABLED=false`; **R3** ativação para clientes apenas após todos os gates e evidências. Ausência de assinatura ou aprovação específica mantém **BLOCKED_EXTERNAL**.

## Matriz canônica G01–G24

`HIST. PASS` representa o estado histórico vinculado às provas e SHAs da matriz 16, não revalidação automática no HEAD Z. `LOCAL` nunca significa Cloudflare Free/Access real. A coluna SHA do novo diff só pode ser fixada após commit e readback.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | HIST. PASS / reconciliação Z | Eng. | entrada `07a2d15` | Git refs/status | GitHub/Linux | matriz16; ledger; 61/62 | SPEC autônoma ausente | Inventário remoto read-only autorizado |
| G02 | HIST. PASS / Z pendente | Eng. | Z pendente | typecheck/lint/integração | Node/Actions | baseline #42728502231; diff Z | CI novo SHA | Reler jobs e artifacts finais |
| G03 | HIST. PASS | Admin | histórico | cadastro/admin | Chromium sintético histórico | matriz16 | QA real atual | Revalidar no QA segregado |
| G04 | HIST. PASS | Produto | histórico | estados/publicação/capa | Browser histórico | matriz16 | runtime atual | E2E completo no SHA final |
| G05 | **FAIL** | Engenharia/Images QA | entrada + Z | upload bytes/retry RED→GREEN | D1/R2 sintético | 61/62; tests upload | 25 MiB vs Images 20 MB; E2E remoto | Decisão/arquitetura e QA end-to-end |
| G06 | HIST. PASS | Segurança | histórico | JWT RS256/JWKS | QA/local | matriz16 | claim/runtime atual | Revalidar Access |
| G07 | HIST. PASS | Acesso QA | histórico | OTP sanitizado | QA real histórico | matriz16 | sessão atual | Repetir OTP no QA habilitado |
| G08 | HIST. PASS | Segurança | histórico | logout/revogação | QA/local | matriz16 | runtime final | Revalidar replay no QA |
| G09 | HIST. PASS | Segurança | histórico | tenant A/B | QA/local | matriz16; E2E sintético | A/B real final | Revalidar matriz |
| G10 | HIST. PASS | Segurança | histórico | GET/HEAD 404/0 B | QA histórico/local | matriz16; security-matrix | negação real final | Revalidar flag off e mídia |
| G11 | HIST. PASS | Produto | histórico | favoritos persistentes | Chromium | matriz16; E2E sintético | SHA final | E2E CI |
| G12 | HIST. PASS | Produto | histórico | download e SHA | Chromium | matriz16 | QA produto real | Revalidar hash final |
| G13 | HIST. PASS | Frontend cliente | histórico | teclado/lightbox/foco | Chromium | matriz16 | dispositivos reais G15 | E2E final e a11y |
| G14 | HIST. PASS | Frontend admin | histórico | cadastro/upload | Chromium | matriz16 | 25 MiB e browser final | E2E final |
| G15 | **BLOCKED_EXTERNAL** | Testadores físicos | — | teclado local; assistiva NOT_RUN | Android/iOS necessários | pacote G15 acima | TalkBack/VoiceOver físicos | Registrar matriz completa real |
| G16 | HIST. PASS | Studio/Maria | histórico | SSR/Colagem | CI/Browser histórico | matriz16; Colagem 7/7 anterior | QA visual final | Comparar sem editar rascunhos |
| G17 | **FAIL** | Infra/Workers | entrada + Z | snapshot 5/5 local | Miniflare; Free QA ausente | 61/62; histórico CPU | CPU cold/MISS e custos Free | Staging seguro + medição remota |
| G18 | HIST. PASS QA limitado | Operador QA | histórico | backup/restore SHA | QA remoto histórico | #40786688338; matriz16 | não substitui G23 | Preservar fixtures/hashes |
| G19 | **BLOCKED_EXTERNAL** | Revisor independente | — | revisão técnica local | externo | security-review.md; 62 | parecer formal e P0/P1 | Revisão integral datada |
| G20 | **BLOCKED_EXTERNAL** | Maria/controladora | — | LGPD técnica | humano | 11-lgpd-decisions.md; 62 | aceite expresso | Aprovar governança por escrito |
| G21 | HIST. PASS / Z pendente | CI/reviewer | entrada + Z | testes e workflow | GitHub Actions | baseline #42728502231 | CI SHA exato Z | Conferir jobs e artifact browser |
| G22 | **BLOCKED_EXTERNAL** | Proprietário | — | decisões R1/R2/R3 | humano | GOAL; 62 | três aprovações específicas | Obter por etapa, sem inferência |
| G23 | **BLOCKED_EXTERNAL** | Operador QA | entrada + Z | preflight RED→GREEN | Node read-only | 61/62; rollback tests | recursos/permissões/rollback real | QA completo, se autorizado |
| G24 | HIST. PASS / Z pendente | Documentação | entrada + Z | ledger/repo/Drive | histórico + repo | 16/60/61/62 | readback remoto Z | Registrar commit, CI e checkpoint |

## Validações e publicação

Evidências já observadas antes da ampliação final: no ciclo Z de entrada, focal **49/49** (4 arquivos), Colagem **7/7**, Node CPU/rollback **20/20**, snapshot após reforço **5/5**, `tsc` e ESLint exit `0`, build Vinext exit `0` com avisos de sourcemap/config conhecidos, audit **0 vulnerabilidades**. O Vitest completo local anterior teve timeout de 20 s em um teste de 13 requests, que depois passou **1/1** com 60 s; a suíte interrompida não é PASS. E2E anterior `FAILED` por screenshot, 8 checks funcionais sem erro de console/HTTP até a interrupção; evidência nova deve ser avaliada antes de mudar o status.

**Após patches finais:** executar regressão integral, build, browser e auditoria; conferir `git diff --check`, publicar apenas fast-forward com readback de HEAD/tree, CI de novo SHA e artefatos; complementar o ledger e checkpoints Google Drive. Sem autorização R1/R2/R3, nenhum merge, deploy, migração remota, flag true, alteração de billing, DB/R2 histórico ou fotografias/dados reais. Os 17 PASS históricos permanecem imutáveis e SHA-scoped.

**Resultado:** `NO_GO_PRODUCTION` enquanto qualquer G05/G17/G15/G19/G20/G22/G23 permanecer aberto.
