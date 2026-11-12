# Punctum R4 — ciclo Z: proteção de URL no snapshot público e continuidade segura

**Data:** 10/11/2026 UTC. **Decisão:** `NO_GO_PRODUCTION`. **Custo incremental autorizado:** R$ 0,00.

## Base de trabalho e proteção da concorrência

- Projeto `menezesx2k26-byte/lab-punctum-picture`, PR #32, branch `fix/punctum-albums-r4-completion-20261107`.
- HEAD de entrada remoto e worktree Z limpo: `07a2d15b816b340d62d21792c410139fa2562608`; tree `5aa3ac91407cd5b6620701e37516cfae0d8b3739`.
- CI **de entrada**, não das mudanças Z: run `42728502231`, `completed/success` conforme readback do handoff anterior. Não reutilizar o resultado para o novo SHA.
- Worktree Z: `/home/desktop/Documents/punctum-r4-cycle-z-20261110`; worktree V com modificações concorrentes preservado, sem limpeza/reset. Node 22.23.4 e npm 10.9.9 locais, `npm ci` anterior concluído.
- Nenhuma alteração na produção, Cloudflare Access, migrations remotas, D1/R2 históricos, dados ou fotografias reais, Workers de produção ou billing.

## TDD RED → GREEN: rotas privadas disfarçadas por caracteres de controle

O leitor de snapshot `validPublicSsrHtml()` decodificava entidades HTML/números, percent-escapes e JS-escapes de caracteres ASCII imprimíveis, mas preservava tab (`U+0009`), LF (`U+000A`) e CR (`U+000D`). Um navegador pode descartar esses controles na análise de uma URL: um `href` com `/api/cl&Tab;ient/galleries/secret` efetivamente referencia a rota privada `/api/client/galleries/secret`. Isso evitava a comparação lexical de marcadores do guardião. A defesa é adicional: só um produtor offline confiável está autorizado a preparar snapshots, mas uma falha do produtor não deve ser normalizada silenciosamente como HTML público.

1. **RED reproduzido:** novo teste em `tests/unit/public-home-snapshot.spec.ts` enviou `<a href="/api/cl&Tab;ient/galleries/secret">` a `stagePublicHomeSnapshot()`. Antes da alteração, retornou `true` e a asserção esperava `false`. Resultado: `1 failed / 4 skipped`, com a discrepância no caminho citado.
2. **GREEN direcionado:** `worker/public-home-snapshot.ts` remove controles literais e entidades `&Tab;`/`&NewLine;`, além de remover tab/LF/CR revelados por entidades numéricas, `%xx` e escapes JavaScript, repetindo a normalização com limite de 8 passes. Não transforma HTML servido, apenas a cópia usada na decisão de segurança. A primeira versão do teste passou `1/1` após essa correção.
3. **Cobertura ampliada GREEN:** a regressão do mesmo teste inclui entidades decimais/hex, controles literais e sequências codificadas/aninhadas. Reexecutado o arquivo completo após a ampliação: **5/5 PASS**, Vitest, exit code `0`. A primeira execução 1/1 isolada não foi usada como prova das variantes adicionadas depois.
4. **Não promovido:** não existe leitura real de CPU cold/MISS neste SHA, nem staging autorizado de HTML SSR completo em D1 remoto. O projeto continua na rota SSR dinâmica quando o snapshot não está elegível. Workers Free limita a CPU a 10 ms/request, <https://developers.cloudflare.com/workers/platform/limits/>; **G17 permanece FAIL**.

## G05: contrato de 25 MiB não alterado

- SPEC original exige **26.214.400 bytes (25 MiB)**; o caminho seguro atual recusa `>20.000.000 bytes` antes de D1/R2. O guard não modifica o CHECK histórico do banco nem concede uma redução de escopo.
- Cloudflare mantém o limite explícito de **20 MB para `Images Binding.input()`**: <https://developers.cloudflare.com/images/get-started/limits/> e <https://developers.cloudflare.com/images/optimization/binding/> (consultados em 10/11/2026). Transformação por URL remota, processamento no browser ou parser de imagens no Worker exigem uma arquitetura específica e provas de segurança, proveniência, custo, quotas e CPU; nenhuma delas está homologada.
- A regressão focal no HEAD de entrada, antes da correção de snapshot, aprovou **49/49 testes em quatro arquivos** (`client-upload-config`, `client-media`, `public-home-cache`, `public-home-snapshot`). Abrange guarda de tamanho, retries, concorrência e integridade locais, **não** upload remoto integrado 25 MiB.
- **G05 continua FAIL**, sem aceitar foto grande por simples magic header, derivado não atestado ou link público de origem privada.

## Regressão de segurança e diagnóstico do runner Linux

Durante o Vitest completo, `client-security-matrix.spec.ts` atingiu o limite padrão de **20.000 ms** no único caso que executa 13 requisições sequenciais de negação de mídia. O mesmo caso, isolado e sem outra suíte concorrente, voltou a atingir o timeout padrão (não houve falha de asserção de bytes, HTTP ou cache). Um terceiro ensaio isolado com `--testTimeout=60000` completou **1/1 PASS**, levando **34.509 ms de execução do teste**; as asserções de zero bytes e de headers privados permaneceram intactas.

Foi ajustado **somente** o orçamento Vitest deste caso para `60_000` ms, sem tocar nas rotas de mídia, nas verificações de autorização ou no limite Workers Free. A regressão completa Linux foi interrompida por esse resultado já não-PASS, e **não** é declarada verde. O resultado do teste com o timeout local versionado, build e CI do novo SHA serão registrados separadamente. Latência do runner local não é medida de CPU real na borda.

## Evidência e bloqueios ainda abertos

| Gate | Estado canônico | O que foi demonstrado | Falta para aprovação |
|---|---|---|---|
| G05 | FAIL | 49/49 regressão focal inicial; 20 MB fail-closed | Pipeline privado 25 MiB seguro e E2E real Access→D1→R2→Images→entrega, custo/quotas |
| G17 | FAIL | Snapshot RED→GREEN em teste local; checks de CPU read-only | CPU fria e MISS/purge sob Free no SHA final, dados reais de uso/custos |
| G23 | BLOCKED_EXTERNAL | 20/20 Node CPU/rollback read-only PASS neste ciclo | Rollback remoto integral autorizado, versions/config/dados/Studio/Colagem/sessões com reabertura |
| G15 | BLOCKED_EXTERNAL | Acessibilidade automatizada histórica, não repetida neste ciclo | TalkBack Android e VoiceOver iOS físicos com matriz integral |
| G19 | BLOCKED_EXTERNAL | Revisões técnicas anteriores não equivalem a auditoria formal | Parecer independente assinado e P0/P1 zerados |
| G20 | BLOCKED_EXTERNAL | Decisões LGPD preparadas historicamente | Aceite formal datado da controladora do estúdio |
| G22 | BLOCKED_EXTERNAL | PR draft, sem release | Autorizações distintas R1 código, R2 deploy flag off, R3 ativação |

Os 17 gates com PASS histórico continuam associados a evidências e SHAs anteriores. A matriz completa G01–G24 é a de `16-original-g01-g24-reconciliation.md` e relatório `60-cycle-y-upload-chunk-cache-and-rollback-preflight-2026-11-10.md`; não herdar PASS em lote para este ciclo.

## Trabalho posterior obrigatório

1. Concluir Vitest total/Colagem, build e browser/E2E do novo diff, registrando warnings/falhas. Verificações já concluídas antes do ajuste pontual do timeout: typecheck exit `0`, lint exit `0`, Node CPU/rollback **20/20 PASS**, snapshot expandido **5/5 PASS**, `npm audit` **0 vulnerabilidades** e `git diff --check` PASS. Não substituir a CI exata por esses resultados parciais.
2. Somente com validação: commit e publicação fast-forward na branch da PR #32; readback do SHA/tree, workflow e artefatos sem declarar CI antiga como atual.
3. Validar preflight G23 remoto apenas se recursos/autorizações segregados estiverem comprovados. Não realizar rollback, deploy ou staging de D1 em produção.
4. Preparar solicitações objetivas de G15/G19/G20/G22, sem inventar aprovações. Sem todos os gates: `NO_GO_PRODUCTION`.

**Nota de escopo:** esta é evidência de engenharia local; não é parecer independente de segurança, teste de produção nem autorização de release.
