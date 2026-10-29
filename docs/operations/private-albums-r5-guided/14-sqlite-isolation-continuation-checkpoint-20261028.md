# Punctum Picture R5 — checkpoint de continuação: ensaio de integridade 0009

**Estado:** `NO_GO` e isolamento R4 preservado. Complementa checkpoints anteriores (não substitui SPEC, plano, GOAL, matriz ou pareceres). **Origem:** `2b08b3458070ea730fafdc4ca7187cf13a07d42a` na `agent/punctum-r5-preparation-20261028`; `compare` contra HEAD remoto inicial da rodada = `identical`, 0 ahead / 0 behind. Não existia novo trabalho remoto antes da escrita. `main=aac2d448d9f54e9215c278892ab3a4a7f26237a4`, PR #24 `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`, PR #25 `f4163b00b25f96933ab96ab6cf7b1ad1271e3d1f` (ambas draft); nenhuma alterada. Zero runs CI novos da branch no momento da reconciliação. Nenhum `AGENTS.md` no Git tree remoto, mas instruções locais/parent desconhecidas.

## Nova execução efetiva, não confundir com teste funcional

**Evidência original:** `migrations/0009_private_client_galleries.sql` no exato Git blob `5281fc9b99ed85bf6e7751ad7eb11f8b5482df23`/SHA256 `0636a83626db74d30a0fbefa15086c6a251401ca4dc6283e426f7d30265a65e8`. Verificador Python 3.13, SQLite 3.46.1 em `:memory:`, `PRAGMA foreign_keys=ON`, 6 cenários de sintéticos. **Exit code 0**, 6/6 resultados esperados, `foreign_key_check=[]`, sem dados pessoais, APIs ou alterações de produto. Logs, source lines, contraexemplos e limites em `13-exact-0009-sqlite-tenant-integrity-evidence.md`. Os seis cenários envolvem dois positivos, duas negações por FK e dois contraexemplos: favorito B para imagem/galeria A **aceito** e capa da galeria A apontando para imagem da galeria B **aceita**. As duas lacunas são de **DDL legada isolada**, não um bypass HTTP comprovado da R4.

Reprodução:
```sh
python docs/operations/private-albums-r5-guided/verify-0009-favorites-isolation.py
# No clone, lê migrations/0009_private_client_galleries.sql; sha Git da migração é conferido antes de executar DDL.
# Neste turno executou-se alternativa equivalente no Linux auxiliar com --migration /tmp/punctum_0009_private_galleries.sql,
# cujo Git blob SHA coincidia exatamente com a migração do repositório.
```
Verificador remoto `verify-0009-favorites-isolation.py` Git blob `a58a7061ffaa1695635a1ce207210a83f5b5a65c` (idêntico ao executado), último commit `212eacf8e4e46910160b9936c1d50b492a58bbc8`. Relatório `13-exact-0009-sqlite-tenant-integrity-evidence.md` commit `2c84b57ca84ffe19f70ce0f2d9d813049a4ac568`, blob `1b35e472bed89caf31a054db2a6f7b117e0b9a57`. Matriz `01-executable-matrix.md` atualizada pontualmente com contraprova PP01 e RED futuro, commit `a3f45ba56c710e073b74e2c23b89f5e80c1e5f16`, blob `eac022e480e36873f5c7744c11df169b533546a0`. Todos foram lidos de volta por GitHub; comparar HEAD final após atualizar o ledger.

**Autoria/admin:** o corpo real da função `auditPrincipal` do blob `9a976bf131b73f6bd3eedec2dde5c4f5d557ec20` foi avaliado em V8 com três identidades sintéticas. Dois e-mails distintos via `authSource: "shared-password"` produziram **o mesmo** `shared-password@punctum.invalid`; identidade sem esse `authSource` retorna seu e-mail. É verificação isolada da função pura, não autenticação no Worker nem prova de pessoa concreta. O parecer anterior `11-auth-media-cost-and-red-review-20261028.md` já cobre essa limitação; nenhuma autenticação ou política alterada.

## Operacional: novo caminho de execução e bloqueios

Novo acesso seguro investigado e utilizado: terminal **Linux auxiliar** independente, disponível para scripts só de stdlib com fontes pinadas. `git 2.47.3`, `node v22.16.0`, `npm 10.9.2`; sem clone completo e sem DNS do GitHub: `git ls-remote ...` **exit 128**, stderr `Could not resolve host: github.com`; `getent ahostsv4 github.com` **exit 2**. Sem Windows command session de ownership conhecido; não houve acesso/escrita a PowerShell antigos, processos alheios, locks ou worktrees. Nenhuma worktree R5 criada. Testes de código, Vitest, Playwright, build e `npm ci` **NOT_RUN** nesta rodada; não há `testedSha`, CI da branch ou reviewers externos formalizados. Nenhuma medição real R5 de CPU/RAM/Images, R2, D1, email, batch ou física realizada.

**PP01 ganha critério adicional de persistência, não status:** após aprovar SPEC e plano, testar migration `0010` *local* com dois tenants: FK composta de `clientId↔galleryId`, `galleryId↔proofId/finalVersionId/revisionId`, candidato/seleção e blocos, capa coerente; positivo A→A e B→B; negações cross tenant, CAS atômico, migração/rollback sem destruir 0009. D1 Free oficial 500MB/banco, 100 bind parameters/statement, 2MB/row; medir snapshots JSON e limites, **não** inferir margem real.

## Estado e transferência

```text
PP00=BLOCKED_EXTERNAL
PP01=NOT_RUN   PP02=NOT_RUN   PP03=NOT_RUN   PP04=NOT_RUN
PP05=NOT_RUN   PP06=NOT_RUN   PP07=NOT_RUN   PP08=NOT_RUN
PP09=BLOCKED_EXTERNAL  PP10=BLOCKED_EXTERNAL
R4 G05/G17=FAIL; G15/G19/G20/G22/G23=BLOCKED_EXTERNAL
readiness=NO_GO; testedSha=null; approval implementationAllowed=false
```

As 18/18 verificações textuais sobre 13 Git blobs, controle negativo 1/1, 17 invariantes de fixture e 26 cenários RED **já estavam documentados e não foram reexecutados**. Nenhum novo `PASS` de gate, `BLOCKED_COST` ou custo `R$0` foi inferido. Revisão independente de segurança/frontend/custos segue indisponível, não requisitada a terceiros sem identidade apropriada.

**Próximo passo:** esperar prova humana formal ligada aos blob SHAs da SPEC `db25502f25eed89131bac16e3a3172248f716ec1` **e** plano `41e06e5fdd353eaff9a5f43357fbcbce741b2770`; então inventariar `AGENTS.md`, status, locks, processes, owners, branches e worktrees **antes** de criar isoladamente a R5. Executar scripts de inspeção e suites completas no checkout owned com logs e exit codes, depois Tasks 00–12 em `RED → GREEN → REFACTOR → REVIEW → COMMIT → CHECKPOINT`, reviewers separados, PR draft de implementação futura, QA física/custos/CI por SHA. Nada de merge, deploy, migration remota, billing ou produção automática.
