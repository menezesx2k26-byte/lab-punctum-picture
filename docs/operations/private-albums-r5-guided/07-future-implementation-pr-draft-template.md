# TEMPLATE — PR draft futura de implementação R5 (NÃO ABERTA)

**Uso condicionado:** esta é somente a descrição proposta para copiar **após** existir aprovação humana comprovada da SPEC e do plano, worktree isolada, código autorizado, commits e testes reproduzíveis. A branch `agent/punctum-r5-preparation-20261028` contém preparação **documental**; não é uma implementação. Não abrir PR como concluída ou autorizada sem cumprir as condições.

## Título sugerido
`draft: R5 guided proof selection and private editorial delivery (gated)`

## Base e head
- Repo `menezesx2k26-byte/lab-punctum-picture`.
- Recomenda-se partir do SHA documental `f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f` **apenas como ancestral histórico**, revalidando PR24/PR25/main, merge-base e código R4 vigente. Não inferir integração automática da divergência atual da main.
- `head`: branch de **implementação isolada** a registrar quando criada, com ownership confirmado. `base`: branch integrada revisada escolhida no momento, sem alterar PR24 e sem assumir que `main` absorveu R4. Nunca `push --force` para alinhar.
- Se PR documental #25 for atualizada/retargeted, revalidar blob SHA de SPEC/plano e aprovação para a **versão final**.

## Corpo preenchível — deixar campos em branco até ter evidência

```md
### Comportamento entregue
Maria administra seleções e confirmações, upload de provas com watermark real, finais versionadas e publicação explícita de entregas parciais/completas; o cliente seleciona, confirma, revisa alterações por foto, acompanha mensagens e baixa somente arquivos autorizados. [Substituir esta proposta por escopo realmente implementado/testado.]

### Aceite humano documental
- SPEC aprovada: [identidade, data, comentário/assinatura, blob SHA, URL]
- Plano aprovado: [identidade, data, comentário/assinatura, blob SHA, URL]
- Aprovação para implementação: [escopo], separada da liberação de produção.

### Base e ownership
- main SHA: [...]
- R4 PR24 head: [...]
- PR25 docs head: [...]
- branch/worktree R5: [...]
- tested HEAD: [...]
- worktree status/owners: [...]
- AGENTS consultados: [...]

### Gates PP00–PP10
| Gate | Status | Critério verificado | Testes com assert/exit | SHA | Artifacts |
|---|---|---|---|---|---|
| PP00 | [...] | [...] | [...] | [...] | [...] |
| PP01 | [...] | [...] | [...] | [...] | [...] |
| PP02 | [...] | [...] | [...] | [...] | [...] |
| PP03 | [...] | [...] | [...] | [...] | [...] |
| PP04 | [...] | [...] | [...] | [...] | [...] |
| PP05 | [...] | [...] | [...] | [...] | [...] |
| PP06 | [...] | [...] | [...] | [...] | [...] |
| PP07 | [...] | [...] | [...] | [...] | [...] |
| PP08 | [...] | [...] | [...] | [...] | [...] |
| PP09 | [...] | [...] | [...] | [...] | [...] |
| PP10 | [...] | [...] | [...] | [...] | [...] |

### TDD, testes e evidência
- RED: [comando/exit/log/artifact/sha de testes que falharam primeiro]
- GREEN/REFACTOR: [commits e regressão]
- node/npm/npm ci/typecheck/lint/unit/integration/build/e2e: [comandos+exit+SHA]
- 2 usuários A/B e Maria: [fixture, tests, assertCount, browser e screenshots]
- R2/Images/CPU/lote: [bytes/hashes/medição real/custo]
- Email: [outbox vs envio real + receipt e quota]
- 320/360/375/390/430/768/1024/1440, zoom 200%, teclado/AT, Android/iOS físico: [evidências ou BLOQUEIO]
- revisão formal independente: [reviewer, SHA, P0/P1 e signoff]
- LGPD/retention: [aprovação responsável]
- rollback: [ensaio QA isolado, flags, D1/R2, critérios/tempo]
- CI: [run URL, conclusion, artifact sha e tested sha]

### Bloqueios e custos
- R4 G05/G17: FAIL até resolução própria
- R4 G15/G19/G20/G22/G23: BLOCKED_EXTERNAL até homologação própria
- R5 BLOCKED_EXTERNAL/BLOCKED_COST: [preencher sem ocultar]
- Cloudflare / Hostinger real quota: [plano, período, consumo, margem, cobrança observada]
- Riscos e rollback: [resultado documentado]

### Decisão
readiness: NO_GO | READY_FOR_HUMAN_APPROVAL
Produção: NÃO AUTORIZADA. Sem merge, deploy, billing, D1 remoto, dados reais nem ativação até autorização específica.
```

## Condições para criar a PR draft
1. Aprovação dos dois documentos comprovada e ligada aos SHAs, incluindo decisões D28 quando revisadas. Anotar qualquer mudança humana de escopo.
2. Branch e worktree exclusivas, diff product code + testes TDD e commits reais; nenhum writer sobreposto.
3. Descrição aponta o escopo real, status verificado dos gates e falhas; **Draft** e sem auto-merge.
4. Revisões independentes podem ser solicitadas por mecanismo apropriado com consentimento; nenhuma publicação nem notificação de terceiros a partir deste template.
5. Para `READY_FOR_HUMAN_APPROVAL`, evidência técnica suficientemente revisável; ainda exige aprovação separada de deploy/produção e tratamento independente da R4. `GO_PRODUCTION` não é um estado permitido.
