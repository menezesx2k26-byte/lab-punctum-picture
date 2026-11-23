# Punctum Picture R4 — execução integrada G05, G17 e G23 (08/11/2026)

## Identidade e proveniência

- Repositório privado `menezesx2k26-byte/lab-punctum-picture`, branch `fix/punctum-albums-r4-completion-20261107`, PR #32 **draft e não merged**.
- Baseline remoto lido antes das alterações: SHA `28d7a893ecc5d79598d88c1c4c09be1a274e78d2`; árvore `a5860da3340438e0e3f7fcd4736efa640b2f1a23`; CI [#42519018954](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42519018954) **completed/success** nesse SHA, não no próximo commit.
- Checkout Linux isolado `/home/desktop/Documents/punctum-r4-exec-20261108`, inicial `2599afcb4888115531b8e28459b38924caf70020`, mesmo tree SHA do remoto anterior, commits irmãos intencionalmente preservados. Alterações locais preexistentes de cache, teste de SSR e suas provas foram **incorporadas** sem descartar estado.
- Fontes: handoff 35, GOAL 36, reconciliação 16, ledger `execution-state.json`, relatórios 25–34 e 37. A SPEC original `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt`, hash histórico `2989e0ba18982658570dc699842393b3f980c9a5312237af33ab02292d10ecfb`, não está na árvore Git nem foi recuperada em bytes nesta sessão; seu conteúdo §23 foi usado conforme transcrição e reconciliação previamente verificadas. O texto materialmente relevante dos gates é o **G01–G24 da SPEC original**, jamais a matriz Argon.
- Como o SHA do commit final só existe após versionar esta documentação, leia o *commit efetivo* e a CI desse SHA na PR #32; este arquivo não inventa confirmação autorreferencial.

## G05: transições autenticadas e integridade do original

TDD: os testes de digest e bloqueio de R2 adulterado inicialmente falharam por colunas inexistentes e entrega de 200; o ensaio de HEAD adulterado também retornou 200 no RED. A mudança integra:

1. Migração **aditiva** `0011_private_gallery_byte_integrity.sql`: `client_gallery_upload_intents.sha256` e `client_gallery_images.original_sha256`, 64 caracteres hexadecimais, **nullable** para registros históricos sem evidência verificável. Nenhum backfill fictício.
2. Após PUT autenticado, calcular SHA-256 dos **bytes exatos**, gravar objeto R2 imutável com digest em `customMetadata`, e persistir digest no intent D1 por CAS. Retry idêntico confirma os mesmos bytes e digest; conteúdo divergente rejeita com 409. Se PUT concluiu em R2 antes da transição D1, novo PUT idêntico reconcilia sem sobrescrever o objeto.
3. Em `complete`, confrontar tamanho/MIME/R2, digest calculado sobre o objeto real e digest do intent/metadados quando presentes. Só depois executar a validação raster pelo mesmo helper do produto/sonda Images e CAS D1 de `pending → ready` / `uploaded → completed`. O estado `ready` carrega o digest atestado; corrupção não é promovida. Conclusão repetida retorna foto já pronta; disputa com decodificação falha não rebaixa foto concluída.
4. No GET de download ou prévia, após autenticação e posse no D1, checar bytes R2 versus SHA atestado; material adulterado é negado com HTTP 503 e **nenhum byte da foto**. HEAD faz conferência dos metadados e, para objetos antigos sem digest em R2, relê os bytes antes de responder; nenhum HEAD emite corpo. Linhas legadas com digest nulo mantêm comportamento anterior até auditoria/backfill autenticado por ferramenta futura.
5. Cloudflare Images pode falhar por indisponibilidade, limite Free ou quota de transformações. HTTP 403/429/5xx e erro 9422 preservam `uploaded`, `pending` e o original R2 para tentativa posterior com HTTP 503; rejeição confirmada de raster inválido mantém caminho de falha definitiva. Nenhum erro de serviço promove dados corrompidos.

**Limitação importante:** para fontes já confirmadas sem `original_sha256` (histórico), esta alteração não fabrica certificação de integridade. A verificação SHA por requisição também precisa ser medida contra Workers Free antes de autorizar carga real. Ensaios locais Miniflare/Vitest usam D1/R2 sintéticos, não fotos de clientes nem acesso remoto de produção.

### Contrato de 25 MiB — incompatibilidade ainda não resolvida

O requisito original permite **26.214.400 bytes (25 MiB)**. Cloudflare documenta no seu `Images Binding .input()` apenas **20 MB** de entrada. A rota atual bloqueia com antecedência arquivos maiores que **20.000.000 bytes**, preservando D1/R2. São duas condições distintas, e **G05 permanece FAIL**.

Alternativas de custo incremental zero a avaliar com a responsável antes de mudar a confiança nos arquivos:

- **Original 25 MiB em R2 + derivado <=20 MB na mesma intenção:** o navegador autorizado decodificaria, geraria um derivado e atestaria SHA-256 de ambos; o Worker conferiria os bytes e o binding Images validaria apenas o derivado. **Ainda falta provar validação independente da codificação do original e vínculo semântico entre os pixels do original/derivado**, além de impedir imagens enganadoras. A confiança em decodificação feita no cliente modifica a barreira de segurança atual, exigindo decisão expressa e prova com imagens sintéticas adversariais. Não implementada como produto pronto.
- **Transformação de imagem remota (limite distinto):** a API de transformação por URL admite até 100 MB fora do Images Storage em sua documentação, mas a foto privada R2 teria que estar disponível apenas ao mecanismo interno de transformação, sem URL reutilizável publicamente, vazamento via cache/CDN/logs ou bypass do Access. A arquitetura, custos, autorização e origem segura ainda precisam de ensaio específico. **Não foi liberado proxy público** nem endpoint que entrega original sem autenticação.
- **Decodificador 25 MiB no próprio Worker:** exigiria parser de formatos completo e prova de custo/memória/CPU no Free; um verificador de cabeçalho ou de CRC isolado não equivale à decodificação real de JPEG/PNG/WebP, portanto não é substituto homologado.
- **Alterar a SPEC para 20 MB:** só mediante aprovação explícita da responsável, nunca inferida do código, e não satisfaz o requisito atual.

Fontes oficiais: https://developers.cloudflare.com/images/get-started/limits/ e https://developers.cloudflare.com/images/optimization/binding/ (input 20 MB; limites por URL/Hosted são distintos). A aprovação da alternativa, sua autenticação e a prova remota Admin→R2→Images→D1→galeria→download continuam pré-condições obrigatórias. A conta possuía **10/10 D1** no inventário histórico; **nenhum banco foi criado/removido ou resetado**.

## G17: snapshot e proteção no cache MISS

Foram preservados `public_home_snapshot` (migração 0010), verificação SHA-256, build ID, epoch/CAS, allowlist `GET /` anônimo e separação do SSR real. O teste de integração `scripts/ssr-route-imports.test.mjs` agora exerce o **bundle Vinext em Miniflare**: home SSR original, HTML anônimo com digest válido salvo em D1, leitura em cache MISS, recusa de publicação com Origin externo sem invalidar, invalidação após tentativa de publicação autorizada local e fallback para SSR sem reutilizar snapshot antigo; a rota Studio mantém seu carregamento independente. `/admin/api/site-media/:id/complete` foi incluída na allowlist de mutações editoriais que invalidam a home.

O snapshot é **opcional e desabilitado em produção**. Não existe nesta rodada um produtor editorial remoto homologado que capture o HTML completo do build correto após publicação, nem telemetria CPU real de um primeiro acesso/MISS/invalidação nesse novo caminho. O fallback continua SSR dinâmico e pode exceder 10 ms de CPU em Workers Free. A prova anterior do cache quente HIT/MISS/purge era do SHA histórico e não qualifica o novo. **G17 FAIL**, sem trocar CPU efetiva por latência HTTP. Fonte de limites: https://developers.cloudflare.com/workers/platform/limits/ (Workers Free 10ms/request, 128 MB RAM).

## G23: preflight remoto sem escrita

Novo `.github/workflows/r4-rollback-readonly.yml` executa `scripts/r4-rollback-readonly.test.mjs` e `scripts/r4-rollback-preflight-readonly.mjs` em GitHub Actions, usando token conectado existente somente para **GET** de assinatura, inventário Worker/D1/R2, settings e deployments. O módulo `scripts/lib/r4-rollback-readonly.mjs` exige IDs exatos dos dois bancos históricos, três buckets e Worker R4 esperado, além de flag, bindings, assinatura Free e versões; respostas com segredos não são serializadas. O artefato sanitizado registra `rollbackExecuted=false`, `writes=0`, `productionSafeToRelease=false` independentemente do resultado. Se a API negar dados ou o token faltar, o relatório indica bloqueio específico; **workflow verde não significa G23 PASS**.

O preflight não contém função de PUT/POST/DELETE nem automação para sobrescrever versões, bancos, objetos, Access, fotos ou fixtures de QA. Para efetivamente homologar G23 ainda faltam: ambiente QA segregado *com capacidade disponível e autorização*; identificação imutável do Worker anterior e assets; backup com prova do hash/relacionamentos D1/R2; bloqueio da mídia e cookies antigos; restore sem tocar dados históricos; reversão de flags/bindings; comparação Studio/Colagem e rascunhos; reabertura controlada; readback e limpeza. G18 remoto histórico não substitui essa matriz. **G23 BLOCKED_EXTERNAL**.

## G15 / G19 / LGPD / release

G15 depende de dois relatórios físicos distintos: **Android Chrome + TalkBack** e **iOS Safari + VoiceOver**, identificando aparelho/versão, teclado/foco, leitura de botões e rótulos, ordem de galeria, lightbox/Escape/fechar, favoritos persistidos, autorização e download, zoom 200%/400%, responsividade, erros, contraste e ausência de rolagem horizontal. Registrar somente evidências sanitizadas, sem rostos, cookies ou credenciais. Teste emulador não é prova física.

G19 requer revisor humano independente/identificado sobre build/PR final e parecer sem P0/P1, cobrindo JWT/JWKS/OTP, expiração/revogação, IDOR entre clientes, R2 e cache, uploads e falhas, XSS/CSRF, segurança da nova migração e privilégios de rollback. Autor da implementação não aprova a própria revisão. G20 continua dependendo da aprovação formal da responsável pelo estúdio sobre bases legais, consentimento/finalidade, retenção/eliminação, prestadores e backups. G22 exige autorização de release **específica** após gates técnicos, sem merge/deploy/ativação implícita.

## Matriz canônica — baseline e progresso sem promoção automática

`SHA BASE` é `28d7a893`, correspondente à árvore original e CI #42519018954. `NOVO` indica alterações desta rodada a validar no SHA publicado, não um SHA inventado. `PASS histórico` limita-se à evidência e ao escopo anterior; nenhum deles recebe aprovação universal no código final por herança. Todas as 24 entradas usam a numeração G01–G24 da SPEC §23.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS histórico | Engenharia | BASE + NOVO | inventário/ref Git | clone + GitHub | PR32, tree idêntico, 35–37 | SPEC fonte não recuperada em bytes | validar hash fonte e HEAD final |
| G02 | PASS histórico / revalidar | Engenharia | BASE + NOVO | CI + regressões | local/CI | #42519018954, testes deste relatório | CI do novo SHA | conferir build, lint, typecheck e diff |
| G03 | PASS histórico | Engenharia | BASE | cadastro | local D1/Chromium | relatório 25 | sem mudança funcional de cadastro | revalidar se houver regressão |
| G04 | PASS histórico | Engenharia | BASE | galeria/publicação | local D1/Chromium | 25, PR32 | QA remoto do novo conjunto | revalidar fluxo admin |
| G05 | **FAIL** | Engenharia + estúdio | BASE + NOVO | SHA, retry, quotas, corrupção, idempotência | local R2/D1/Images fake | migrations 0011, Vitest, Node | 25 MiB/20 MB, Images QA produto remoto, custo | selecionar alternativa segura e ensaio completo remoto |
| G06 | PASS histórico | Segurança | BASE | assinatura JWT | QA histórico | 25, 16 | nova revisão do HEAD final | revalidar limites auth |
| G07 | PASS histórico | Responsável OTP | BASE | OTP real | QA humano anterior | 25 | não valida TalkBack/iOS | revalidar acesso no QA apto |
| G08 | PASS histórico | Segurança | BASE | logout, rotação | QA anterior | 25 | comprovação novos testes remotos | revalidar revogação |
| G09 | PASS histórico / revalidar | Engenharia | BASE + NOVO | matriz A/B | local/QA anterior | 25, media tests | nova SHA ainda não homologada remotamente | provar 404/0 bytes em dois usuários |
| G10 | PASS histórico / revalidar | Engenharia | BASE + NOVO | GET/HEAD flag OFF | local/QA anterior | 25, media tests | novo checksum não implantado | revalidar negações |
| G11 | PASS histórico | Engenharia | BASE | favoritos persistidos | local/browser | 25 | novo SHA sem alteração funcional | preservar prova |
| G12 | PASS histórico / revalidar | Engenharia | BASE + NOVO | download e SHA | local/browser | 25, testes de integridade | QA novo ausente | conferir byte/hash em A/B |
| G13 | PASS histórico | Frontend | BASE | lightbox/teclado | Chromium local | 25, CI | teste físico separado | conferir E2E atual |
| G14 | PASS histórico | Frontend | BASE | editor upload | Chromium local | 25, CI | QA real pendente | conferir estado de upload final |
| G15 | **BLOCKED_EXTERNAL** | QA assistivo | BASE | TalkBack/VoiceOver NOT_RUN | físico | roteiro nesta nota | Android/iOS legítimos | executar sessões físicas e registrar |
| G16 | PASS histórico / revalidar | Frontend/estúdio | BASE + NOVO | SSR/Studio/Colagem | local | scripts SSR, 33 | CI final pendente | revalidar regressão visual |
| G17 | **FAIL** | Infra CPU Free | BASE + NOVO | snapshot/MISS local, CPU real NOT_RUN | local/QA histórico | 29–31, SSR integration | produtor real + CPU <10ms não comprovados | implementar produtor QA, medir cold/MISS/invalidação |
| G18 | PASS histórico | Engenharia QA | BASE | backup/restore hashes | QA anterior | #40786688338 | novo checksum não presente no QA remoto | manter evidência, revalidar se necessário |
| G19 | **BLOCKED_EXTERNAL** | Revisor independente | BASE + NOVO | parecer NOT_RUN | humano | checklist nesta nota | parecer sem P0/P1 | obter auditoria identificada no SHA final |
| G20 | **BLOCKED_EXTERNAL** | Responsável estúdio | BASE | aprovação NOT_RUN | governança | decisões 11 LGPD | assinatura/decisão ausente | obter consentimento formal |
| G21 | PASS no BASE / pendente NOVO | Maintainer | BASE + NOVO | CI 30/30 BASE | GitHub Actions | #42519018954 | CI exata e revisão do novo SHA | conferir checks no HEAD final |
| G22 | **BLOCKED_EXTERNAL** | Proprietário | BASE | autorização NOT_RUN | produção | GOAL 36 | autorização específica ausente | solicitar somente após os gates |
| G23 | **BLOCKED_EXTERNAL** | QA rollback | BASE + NOVO | testes guard + preflight GET | local/Actions read-only | scripts G23, 33, 25 | rollback real remoto não realizado | validar QA segregado + executar prova reversível |
| G24 | PASS histórico / checkpoint NOVO pendente | Engenharia | BASE + NOVO | repo/Drive readback | repo/Drive | 35–37, este relatório | readback de CI/Drive/checkpoints final | conferir persistência sem inventar Engram |

## Testes e decisão

### Reconciliação da regressão completa após migração 0011

O primeiro `npm test` completo após acrescentar `original_sha256` revelou **cinco falhas em oito cenários** de `tests/integration/client-recovery.spec.ts`: restore selecionado, conflito R2, recuperação QA autenticada, retry após falha parcial e isolamento A/B após recuperação. O stack trace comum foi `Invalid recovery column` em `scripts/lib/private-recovery-format.mjs`, porque o validador de identificadores SQL permitia somente letras e underscores, rejeitando dígitos em `original_sha256`.

Correção: regex segura `^[a-z_][a-z0-9_]*$` (sem aspas, pontuação ou prefixo numérico), preservando a allowlist de tabelas. A biblioteca `scripts/lib/private-recovery.ts` agora compara o SHA-256 real dos objetos com os hashes de D1 e metadados R2 quando presentes, tanto na captura quanto antes de qualquer escrita do restore. Linhas históricas sem digest continuam válidas; não se inventa hash. Testes adicionados exercitam digest persistido após restore e rejeição de atestações forjadas sem criar linhas/objetos no destino. RED 5/8 na primeira suíte; GREEN final **9/9** de recuperação.

Um novo teste adversarial de mídia verificou que, mesmo com bytes R2 adulterados, `HEAD` respondia **200** quando os metadados R2 guardavam o hash correto do conteúdo anterior. RED reproduzido. O handler passou a ler o objeto e verificar SHA-256 dos bytes também em HEAD com registro atestado, além de tamanho, MIME e metadados, retornando **503 com corpo vazio** em corrupção. Isso gera I/O extra em HEAD; **não há medida real de CPU ou custo para homologar**. GET já bloqueava essa adulteração.

Validação local na árvore de trabalho desta rodada, antes da publicação final: **Vitest 240/240 em 57/57 arquivos**, incluindo `client-media.spec.ts` **12/12** e `client-recovery.spec.ts` **9/9**; testes Node raster/preflight/snapshot **8/8**; `npm run typecheck`, `npm run lint`, `npm run build`, `git diff --check` **PASS**; `npm audit --audit-level=low`: **0 vulnerabilidades**. O build Vinext informa avisos de classificação de rotas; isso não é evidência de quebra. **Chromium E2E local 14/14 PASS**, report em `outputs/browser-e2e/report.json`, incluindo dois clientes sintéticos, A/B 404, upload do editor, download, persistência após restart, isolamento e rollback local; não substitui aparelho físico nem CPU remota. CI do SHA final deve ser atualizada somente após readback do próprio workflow.

**G05 segue FAIL; G17 segue FAIL; G23 segue BLOCKED_EXTERNAL; G18 retém PASS histórico restrito ao SHA/QA anteriormente homologado, com regressão local novamente verde.** Nenhuma escrita QA remota, merge, produção ou custo adicional é atribuída a esta rodada.

Os números finais de CI serão registrados no comentário da PR **somente após a execução no SHA definitivo**; a edição deste arquivo não declara antecipadamente esse resultado. Browser Chromium e testes do novo checksum são locais até prova específica remota. O workflow G23 é inventário **somente leitura**, e não homologação de rollback. Nenhuma fotografia real, banco QA histórico, D1 adicional, produção, billing, domínio ou Access foi alterado nesta rodada.

**Decisão: `NO_GO_PRODUCTION`**, `PRIVATE_GALLERIES_ENABLED=false`, PR draft, custo incremental R$ 0 autorizado. A última decisão de G05/17/23 e aprovações G15/19/20/22 não foram removidas por uma CI verde.
