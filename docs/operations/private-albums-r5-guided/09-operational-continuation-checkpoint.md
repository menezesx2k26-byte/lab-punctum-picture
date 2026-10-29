# R5 — checkpoint de continuação operacional, 28/10/2026

**Estado: NO_GO.** Este registro complementa o handoff `06-durable-handoff-checkpoint.md`, sem substituir a SPEC, o plano, GOAL ou documentação previamente concluída. A ausência de aprovação humana formal de **ambos** impede qualquer implementação de produto. Nenhum merge, deploy, migração produtiva, billing, serviços novos ou ativação de cliente foi realizado.

## Fonte e delta desta rodada

- Começou da branch `agent/punctum-r5-preparation-20261028` no SHA `98a76262cfe1e6b794287e5e18e29822ebeb300e`; GitHub `compare` com a própria branch retornou `identical`, ahead/behind `0/0` antes de novas escritas.
- `main` permanece `aac2d448d9f54e9215c278892ab3a4a7f26237a4`. PR24 `open/draft` HEAD `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`; PR25 `open/draft` HEAD `f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f`. Nenhuma evidência nova de aprovação foi encontrada ou procurada de novo em reviews já reconciliadas.
- A árvore do checkpoint base tinha **1.226 entradas**, `truncated=false`, e **0** caminhos dos novos módulos R5 esperados. Não significa ausência de extensões R4: Worker/router, mídia, autenticação, Studio, biblioteca e migration 0009 são presentes.
- CI da branch de preparação no início: `0 workflow_runs`; workflow GitHub só inclui PR e push main. CI PR25 `40799815353` anterior é sucesso documental no SHA `f4163b0...`, não testes de runtime R5.
- **Novas evidências** nesta rodada (antes deste checkpoint): `verify-r4-static-contracts.mjs`, commit `61b7f894fa8111b724bc46cc843569e86d8a8135`, blob Git `ac4064fc5f1e3ce456bf3870522d8af93c477ddf`; `08-operational-static-findings-20261028.md`, commit `c7494ee0c357875ce067fd40cfc2f71ba5662853`, blob `7db732b8a0828e70216d1ed2fe9ae5d6afe60e6f`; `execution-state.json` atualizado, commit `c26a9a2625fa0b62c469a0e3e412eb306be75f8b`, blob `95dc9126af432e85bf0002d6183daa356f9b4f62`. Os três arquivos foram lidos de volta. Este arquivo recebe commit/sha próprios **após** criação; verificá-los no GitHub antes de citar.
- Na nova escrita, o diff deve permanecer **exclusivamente** `docs/operations/private-albums-r5-guided/`, acrescido deste checkpoint, sem reclassificar R4 ou mudar o código R5.

## Resultado técnico e evidência verdadeira

A inspeção leu blobs `worker/client/router.ts`, `worker/media/private-gallery.ts`, `worker/client/repository.ts`, `worker/api/client-galleries.ts`, `worker/api/client-admin.ts`, `worker/api/client-gallery-upload.ts`, `worker/client/auth.ts`, `worker/utils/auth.ts`, `worker/client/response.ts`, `shared/client-galleries.ts`, `app/albuns/components/PrivateGallery.tsx`, `PhotoViewer.tsx`, `responses.ts`, `migrations/0009_private_client_galleries.sql`, `tests/integration/client-security-matrix.spec.ts` e outros testes R4.

Foi executado em memória, sobre essas fontes retornadas pelo GitHub, um conjunto de **18 afirmações textuais**, com **18 padrões encontrados e zero divergências**. Critérios cobrem guardas R4, presença de testes de negação de bytes e lacunas R5. `MATCH` não significa PASS de teste de segurança/QA. O script Node equivalente versionado ainda **não foi executado** e não há CI nova da branch.

**Achados bloqueantes para R5:** R4 oferece download original e preview transformado sem watermark incorporada; publicação R4 depende de capa/título/cliente ativo, não de seleção confirmada; migration 0009 contém favoritos mas não seleção/revisões; não existem handlers R5; validador frontend de rotas desconhecidas cai em `return true`; upload R4 remonta até 25 MiB em memória; alertas, renovação, batch e snapshot editorial ainda não existem. Há controles já existentes úteis: auth titular, Origin, GET/HEAD, no-store/noindex, isolamento A/B na suite, errors de Images que fecham acesso, foco/Escape em PhotoViewer. Detalhes e pontos de código em `08-operational-static-findings-20261028.md`.

**Terminal/infra:** Desktop Windows listou PowerShell antigos sem identidade/ownership comprovados. `launch_app(cmd.exe)` retornou `null` e não apareceu janela nova utilizável. Chamada de terminal CoS/Codex exigia capability `turn_token` ausente desta invocação; não foi forçada. Ambiente Linux auxiliar do modelo rodou `git 2.47.3`, `node v22.16.0`, `npm 10.9.2`; `git ls-remote` no GitHub falhou exit **128** com `Could not resolve host: github.com`. Sem checkout local Punctum, `npm ci`, Vitest, Playwright e testes reais **NOT_RUN**. Nenhum PowerShell antigo foi manipulado e nenhuma worktree foi criada.

**Revisão independente:** segurança, UI/acessibilidade e custos **NOT_RUN**, sem parecer assinado/worker validado. Nenhum CPU/R2/Images/Email de R5 medido, screenshots capturados ou dispositivo físico testado. Não reportar `BLOCKED_COST` como falha real: há risco a aferir, sem consumo observado.

## Estado canônico e próximo passo seguro

```text
readiness = NO_GO
PP00 = BLOCKED_EXTERNAL  (aprovação formal + workspace ownership/worktree/baseline)
PP01..PP08 = NOT_RUN     (código de produto não autorizado)
PP09 = BLOCKED_EXTERNAL  (revisão formal, LGPD, restore/rollback)
PP10 = BLOCKED_EXTERNAL  (QA integrada/física, custo, R4, aprovação)
R4 G05,G17 = FAIL
R4 G15,G19,G20,G22,G23 = BLOCKED_EXTERNAL
testedSha = null; gate acceptance commits = null
```

1. Sem nova aprovação humana da SPEC + plano ligada aos blob SHAs `db25502f...` e `41e06e5...`, executar apenas inspeções/revisões read-only, sem mudar produto.
2. Quando o terminal Windows oferecer janela/sessão própria confiável, cumprir o preflight em `05-local-worktree-and-review-handoff.md`: descobrir root/origin, HEAD, worktrees, status não commitado, owners, AGENTS, locks; somente depois criar **nova worktree em destino inexistente**, registrar SHA e manter as demais intocadas. Executar então o script estático, Node/npm, testes existentes e build com exit counts.
3. Solicitar revisores independentes se conexão de workers disponível: segurança (Worker/mídia A/B e CAS), UI/acessibilidade (jornadas/teclado/físico) e custos (CPU/Images/R2/batch/email) todos read-only com identidade, SHA e findings.
4. Após aprovação comprovada e PP00 real, executar Tasks 01–12 na ordem da matriz `01-executable-matrix.md`, com `RED → GREEN → REFACTOR → REVIEW → COMMIT → CHECKPOINT`. Priorizar negação da prova sem watermark, final sem seleção, candidato não aprovado, revogação/expiração, IDOR e CAS antes do compositor/entrega.
5. O template `07-future-implementation-pr-draft-template.md` é apenas material futuro. PR de implementação não foi criada nem pode ser aberta como autorizada nesta fase.

**Regra de verificação da próxima sessão:** ler primeiro o HEAD remoto e `execution-state.json`, comparar com este checkpoint, avançar apenas a partir de novos fatos, não repetir auditorias documentais encerradas. Sem aprovação de produção separada, nunca declarar GO.
