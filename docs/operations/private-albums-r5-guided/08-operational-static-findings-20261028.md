# R5 — continuação operacional: evidência estática nova e bloqueios reais

**Inspeção:** 28/10/2026 America/Sao_Paulo (consulta GitHub na sessão de continuação). **Tipo de prova:** leitura de blobs e verificação literal de contratos em código R4 da branch R5, a partir do HEAD documental `98a76262cfe1e6b794287e5e18e29822ebeb300e`. Nenhuma alteração de produto, testes de runtime, fotos reais, D1/R2/Images remotos, revisão formal ou medição de custos foi feita. A branch documental foi reconciliada com este SHA (comparação `identical`, 0 ahead/behind) antes da nova escrita.

## 1. Estado operacional reconfirmado sem nova auditoria de aprovação

| Recurso | Leitura atual antes da inspeção | Consequência |
|---|---|---|
| main | `aac2d448d9f54e9215c278892ab3a4a7f26237a4` | Mantém divergência histórica com R4; não fazer rebase automático |
| PR #24 R4 | `open/draft`, head `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd` | Independente; G05/G17 FAIL; G15/G19/G20/G22/G23 BLOCKED_EXTERNAL |
| PR #25 SPEC/plano/GOAL | `open/draft`, head `f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f` | Não houve mudança do HEAD; aprovação humana continua **não comprovada** conforme checkpoint anterior |
| branch R5 preparação | `98a76262cfe1e6b794287e5e18e29822ebeb300e` antes dos novos commits | Documentação versionada; nenhuma worktree local comprovada |
| árvore Git desta base | 1.226 entradas, `truncated=false`, seis módulos R4 essenciais presentes | Nenhum dos novos caminhos esperados `0010_guided_selection_delivery`, `client-workflow`, `proof-derivatives`, `SelectionJourney`, `DeliveryExperience`, `RevisionReview`, `AlbumBlockComposer`, `RequestInbox`, `notifications`, `batch-download` foi encontrado |
| CI da branch preparação | `0 workflow_runs` na consulta de Actions por branch | `.github/workflows/ci.yml` contém gatilhos `pull_request` e `push main` somente; nenhum teste novo executou automaticamente na branch documental |

Nenhuma revisão documental de aprovação foi repetida. A inexistência de comentário/review na PR #25 no checkpoint anterior não prova a inexistência de autorização fora dela.

## 2. Evidências positivas existentes e limites do que demonstram

| Evidência estática | Arquivo + região relevante | Conclusão exata |
|---|---|---|
| Gate do módulo privado | `worker/client/router.ts:18–19,55–63` | `PRIVATE_GALLERIES_ENABLED` precisa ser `true`; a configuração versionada está OFF. Estado do runtime vivo não consultado |
| Repositório vincula galeria ao titular | `worker/client/repository.ts:55–65` | `getOwnedGallery` filtra `client_id`, publicado e conta ativa, protegendo a semântica R4 |
| Autenticação cliente valida sessão | `worker/client/auth.ts:55–116` | HMAC, expiração, `sessionVersion`, conta ativa; R5 deve reutilizar, sem regressão/OTP antigo |
| Mídia verifica titular e prefixo R2 | `worker/media/private-gallery.ts:25–44` | `getOwnedGallery`, `getReadyGalleryImage`, prefixo privado; nega fotos de outros álbuns sob contratos atuais |
| GET/HEAD e cabeçalhos privados | `worker/media/private-gallery.ts:50–83`; `worker/client/response.ts:1–15` | `HEAD` no mesmo path de autorização, no-store/noindex; R5 deve expandir para expiração, snapshot e candidatos |
| Anti-CSRF de origem em mutações | `worker/utils/auth.ts:...assertAllowedOrigin`, `worker/api/client-galleries.ts:20–26`, `worker/api/client-admin.ts:32–36` | Origin validada nas mutações existentes; os endpoints novos devem herdar |
| Suite de negações R4 | `tests/integration/client-security-matrix.spec.ts` | Casos de `GET/HEAD`, B acessando A, download bloqueado e otimizador `/_vinext/image` com `byteLength===0` já estão definidos; **não executados nesta rodada** |
| Base UI reutilizável | `app/albuns/components/PhotoViewer.tsx:28–52` | `showModal`, devolução de foco, Escape, setas e contador `aria-live` já existem no código; QA física permanece pendente |
| Images indisponível fecha fluxo | `worker/api/client-gallery-upload.ts:254–256`, `worker/media/private-gallery.ts:50–56,82–87` | Upload final e preview falham em vez de fingir sucesso; R4 G05 ainda FAIL em homologação real |

## 3. Lacunas concretas R5, com ponto de integração e teste RED

Estas lacunas descrevem **funcionalidade R5 ausente**, não vulnerabilidade R4 explorada. Nenhum parecer independente de segurança foi obtido.

| ID | Observação comprovada | Impacto de integração R5 / RED obrigatório | Prioridade de engenharia |
|---|---|---|---|
| **R5-S01** | `worker/media/private-gallery.ts:71–115` lê o original R2 e transforma tamanho/qualidade para preview sem watermark incorporada; com `preset=download` devolve diretamente o `object.body` original, se `allowDownloads`. `PhotoViewer.tsx` mostra “Baixar original” | R5 precisa categoria **proof-derivative** efetivamente marcada e com download negado; separar `finalVersion` autorizada por snapshot. RED: prova sem watermark/derivada e download de prova devolvem **0 bytes**, nenhum fallback, inclusive HEAD | **P0 para liberação R5** |
| **R5-S02** | `worker/api/client-admin.ts:300–343` publica galeria R4 quando cliente ativo, título e capa pronta; não consulta seleção confirmada nem versões finais | R5 deve distinguir publicação de provas/galeria R4 e **publish delivery revision** por snapshot transacional e seleção confirmada. RED: Y não selecionado e candidato 1/5 não aprovado jamais entram em snapshot | **P0** |
| **R5-S03** | `migrations/0009_private_client_galleries.sql` tem `client_gallery_favorites`, mas não `selection_revisions`, `final_asset_versions`, requests ou delivery snapshots; árvore Git confirma ausência da proposta `0010` | Criar `0010` **somente após aprovação**, chaves compostas, CAS/unique, histórico imutável. RED: cross-gallery FK, 409 concorrência, rollback aditivo em D1 local populado | **P0** |
| **R5-S04** | `worker/client/router.ts:56–91` despacha mídia R4, favoritos, upload e admin. Não há handlers R5; `isPrivateGalleryPath` deve abranger rotas novas | Novos endpoints precisam entrar na fronteira privada antes do fallback; checar dono/role/Origin/rate-limit e negar GET/HEAD/URL antiga, sem permitir `/_vinext/image`. RED: A/B por todas rotas | **P0** |
| **R5-S05** | `app/albuns/components/responses.ts` retorna `true` para endpoints não reconhecidos (última linha), enquanto `api.ts` considera o resultado válido | Criar validadores explícitos para workflow/confirm/delivery/review/manifest, negar envelope malformado. RED: resposta `200` com campo de revisão ausente/ID trocado/mídia indevida deve ser rejeitada, sem UI optimistic success | **P1** |
| **R5-S06** | `app/albuns/components/PrivateGallery.tsx:22–42` tem loading/error e fetch inicial, sem controle explícito de retry; `PhotoViewer.tsx` em erro de imagem orienta fechar/reabrir | Implementar estados de rede/retry, sessão expirada e conflito CAS com ação recuperável; preservar foco e draft local. RED: offline no primeiro carregamento, retorno de rede e mídia 503 exibem retry acessível | **P1** |
| **R5-S07** | `worker/api/client-gallery-upload.ts:73–96` junta chunks e copia para um `Uint8Array(total)`, com máximo de 25 MiB em `shared/client-galleries.ts`; UI de Studio aceita até três uploads simultâneos | Medir memória de pico/CPU por requisição e concorrência ao adicionar watermark/revisões; sem presumir viabilidade Free. RED: arquivo limite, stream interrompido e falta Images sem exposição/publicação | **P1/custo** |
| **R5-S08** | Upload R4 verifica assinatura, MIME, tamanho e decode IMAGES, mas não mantém hash de versão final nem vinculação a seleção confirmada | `proofImageId→finalVersionId` imutável, SHA, estado elegível e autorização de publicação; read-after-write e falha R2 fechada | **P0** |
| **R5-S09** | No HEAD inspecionado não existem outbox, email de entrega editorial, renovação nem batch manifest R5 | PP07 exige evento pós-commit e recebimento real autorizado; PP08 exige hashes/memória Android físico. Sem provedor/quota, deixar recurso bloqueado e não marcar PASS | **externo/custo** |

**Atenção:** o título/cover R4 atual pode legitimamente publicar seu álbum conforme o contrato R4. O risco está em reutilizar o mesmo botão/endpoint para afirmar a semântica R5 de fotografias confirmadas sem novos controles.

## 4. Verificação estática executada (não é suíte de testes)

Usando os blobs retornados pelo conector GitHub do SHA `98a76262...`, foram executadas **18 verificações literais de código** em JavaScript, avaliando presença de guardas R4, cabeçalhos, autorização, casos de testes existentes e lacunas previstas R5. Resultado observado: **18 MATCH / 0 MISMATCH**. A lógica foi versionada em `verify-r4-static-contracts.mjs`, script **read-only** para futura execução no clone. Este script em si ainda **não foi executado em Node no workspace**; o resultado 18/18 refere-se ao verificador equivalente executado diretamente sobre os blobs do GitHub.

```powershell
# FUTURO, depois de identificar o clone correto e verificar ownership:
node docs/operations/private-albums-r5-guided/verify-r4-static-contracts.mjs
```

A saída futura é JSON com IDs, natureza (`existing-control`, `r5-gap`, `capacity-risk`), `MATCH/MISMATCH`, SHA local e exit code 1 se houver drift. **MATCH não é PASS de produto, pentest, prova de watermark ou teste de endpoint.** Nenhuma afirmação de 18 testes unitários passou. Source/code drift exige inspeção antes de editar.

## 5. Disponibilidade real de terminais, testes e revisores

- **Windows compartilhado:** `Chat On Steroids Desktop.list_windows/list_apps` exibiu apenas sessões PowerShell antigas (incluindo janelas administrativas) e nenhuma sessão nova associada ao Punctum. `launch_app("C:\\Windows\\System32\\cmd.exe")` retornou `null`; em nova listagem, não apareceu uma janela CMD independente. Algumas listagens falharam inicialmente com `The desktop helper returned malformed JSON` e a nova tentativa apenas listou janelas antigas. Não digitar comandos nessas sessões nem supor ownership.
- **Terminal de código CoS/Codex:** as funções expostas para `codex_exec` exigem `turn_token` válido da sessão externa que não está disponível nesta invocação; não foi usado token fabricado. Sem acesso auditável à CLI Windows, `git status`, `git worktree list`, `AGENTS.md` local, arquivos modificados e `npm ci/test` **NOT_RUN**.
- **Linux auxiliar do assistente (ambiente separado do Windows do usuário):** `git --version` = `2.47.3`, `node --version` = `v22.16.0`, `npm --version` = `10.9.2`. Tentativa única de `git ls-remote https://github.com/menezesx2k26-byte/lab-punctum-picture.git refs/heads/agent/punctum-r5-preparation-20261028` falhou **exit 128**, `Could not resolve host: github.com`. O ambiente não tem cópia da fonte Punctum; não executar `npm test` contra diretório incorreto. Isto **não é falha dos testes do produto**.
- **Revisões independentes:** nenhum worker de segurança, frontend/acessibilidade ou custos foi iniciado/atribuído. O canal disponível permite leitura GitHub e inspeção interna, porém não foi demonstrada capacidade de agentes independentes nesta execução. Revisão formal R4 G19 e R5 PP09 continuam externas. Não usar comentário automático CodeRabbit como signoff.
- **CI:** `.github/workflows/ci.yml:3–5` só dispara por `pull_request` ou `push main`. Branch documental R5 sem PR própria, logo `0 runs` consultados. CI da PR25 `40799815353` é evidência histórica no SHA `f4163b0...`, não dos novos commits de preparação nem uma homologação R5.
- **Screenshots/aparelhos:** nenhuma captura nova, simulação de dispositivo ou acesso ao Android/iOS realizados nesta rodada.

## 6. Consequências práticas para a execução futura

1. Aprovação formal humana da SPEC **e** do plano, com blob SHA, identidade, data e URL; só então liberar qualquer mudança de produto. Não reabrir auditoria documental enquanto não houver evidência nova.
2. Assim que houver terminal Windows identificado: executar preflight de `05-local-worktree-and-review-handoff.md`, reconciliar worktrees/arquivos/AGENTS e criar worktree somente em path inexistente; registrar HEAD, status, comandos e exit codes. PP00 permanece `BLOCKED_EXTERNAL` até cumprir ownership e baseline.
3. Na worktree autorizada, rodar script estático versionado, `npm ci`, audit, typecheck, lint, Vitest, build, Playwright após dependências e browser instalados; distinguir CI de local e QA física.
4. Tasks 01–12 segundo `01-executable-matrix.md`, **RED → GREEN → REFACTOR → REVIEW → COMMIT → CHECKPOINT**; primeiro testes de seleção, mídia marcada, snapshot atômico, A/B, CAS/replay e versão final R2. Não estender o `publish` R4 como entrega sem gate.
5. Gate de segurança: GET/HEAD proprietário vs outro cliente vs expirado vs candidato vs prova, tentativa via otimizador público, download de original negado quando classificado como prova. Auditoria independente por revisor distinto em SHA final antes de PP09.
6. Para custo, medir IMAGES/Workers CPU/R2/batch e emails com franquia **real** aferida da conta, sem contratação; risco de CPU/memória do `readBounded` e do ZIP permanece estimativa, não medição. Se recurso pago necessário, `BLOCKED_COST`; sem provedor real/email, `BLOCKED_EXTERNAL`.
7. Manter R4 G05/G17 `FAIL`, G15/G19/G20/G22/G23 `BLOCKED_EXTERNAL`; PP01–PP08 `NOT_RUN`, PP00/PP09/PP10 `BLOCKED_EXTERNAL`; `readiness=NO_GO`. Nada de PR de implementação antes da aprovação formal.

**Resultado:** achados de integração rastreáveis em código, plano de RED dirigido por lacunas e limitações operacionais verificados. Não foram criados recursos, dados, arquivos de produto ou despesas.
