# Continuação R4 — recuperação e proteção do QA

Base retomada: `3cc4db8c7a936f51d75025226970676a87f89ba7`, PR #17 draft, sem merge. Nenhuma alteração remota de recursos, migração, segredo ou política foi executada nesta rodada; houve consulta SQL somente leitura nos dois D1 QA, retornando cinco contas em cada um.

## Mudanças implementadas

- Biblioteca operacional de captura/restauração explícita por cliente, com snapshots relacionais em batch D1, verificação de capa/vínculos/tamanho/MIME/SHA-256, objetos R2 imutáveis e INSERTs transacionais sem UPSERT.
- Worker de recuperação standalone e temporário, fora do entrypoint público. Exige preview, origem exata, segredo independente e o ID exato da fixture da execução. Recusa contas sem identidade sintética do piloto e limita a operação a 50 imagens/2 MiB.
- Backup JSON no bucket privado com gravação condicional, releitura e comparação de hash; restore usa o conteúdo relido. Metadados e originais não aparecem na resposta HTTP nem em artifacts públicos.
- Quarentena de todas as contas restauradas. Uma revisão demonstrou que `session_version + 1` sozinho pode ressuscitar um cookie emitido após a captura. Reabrir exige segredo independente novo, além da ação controlada de reativação. O piloto faz essas etapas apenas para a fixture.
- Piloto exige recursos QA existentes: não cria bancos ou buckets. Antes de qualquer migration/deploy/secret, verifica os dois D1 e os dois buckets de originais vazios e a privacidade dos três buckets. BACKUPS é append-only e pode conter cópias anteriores.
- Respostas D1 incompletas e paginação REST R2 desconhecida falham fechadas; o REST usa `per_page` e `result_info.is_truncated`.

## RED/GREEN e revisão

Os testes observaram falhas antes das correções para recuperação ausente, liberação indevida de QA ocupado, cookie pós-backup aceito, snapshot incoerente aceito e fixture histórica aceita pelo Worker. A revisão independente identificou e reavaliou esses casos, além dos envelopes D1/REST e da privacidade por domínio próprio. Trata-se de revisão direcionada, não homologação remota nem auditoria exaustiva.

`tests/integration/client-recovery.spec.ts` exercita D1/R2 Miniflare reais em recursos locais distintos. Os testes incluem dez PNGs com hash determinístico, conflitos, integridade referencial, favorito, preservação pública, cookies antigos, falha parcial de R2/retry, autenticação de QA e isolamento entre clientes após restauração.

## Falhas observadas e limitações

- A primeira suíte completa desta rodada reprovou um teste legado: `retains standard PBKDF2 hashes when the edge WebCrypto cap is enforced`, por timeout de 20s. Reexecução isolada com o mesmo limite também reprovou; com janela de 60s passou, com ~20,16s de testes. O limite de tempo foi aumentado somente nesse teste de compatibilidade CPU-bound, sem reduzir iterações ou alterar código criptográfico/limites Workers.
- O download de Chromium retornou HTML (195 bytes) no URL do ZIP; instalação interrompida. Não há screenshots ou QA assistivo atuais. Ver 08-browser-accessibility.md.
- Recursos remotos de origem/restauração estão ocupados. O gate novo impede acionar o piloto sobre o histórico; não foram limpos e nenhum recurso novo foi criado. Billing Read segue sem confirmação de franquia/custo. OTP real e LGPD continuam pendentes.
- O transporte standalone foi compilado por `wrangler deploy --dry-run`; isso não é deploy nem medição de CPU edge. A chamada real deve ocorrer apenas no par QA vazio, autorizado e com custo confirmado. Falha/resultado ambíguo exige inspeção; não repetir a recuperação automaticamente.

## Verificação final local desta rodada

- `npm test`: PASS, **44 arquivos / 187 testes**, 59,54s, sem skips reportados.
- `npm run typecheck`: PASS, 4,17s.
- `npm run lint`: PASS, 14,89s, zero warnings na rodada final.
- `npm run build`: PASS, 16,12s; mantém os avisos de bundler/sourcemap já registrados.
- `vitest run --config vitest.collage.config.ts`: PASS, 7 testes.
- Testes Node de bridge, CSS e publicação: PASS, 22 testes.
- `node --check scripts/private-galleries-preview.mjs` e `git diff --check`: PASS.
- O bundle público de servidor gerado não apresentou as strings do endpoint/secret de recuperação; a etapa standalone permanece separada do produto.

O primeiro timeout está registrado acima e não foi omitido. Os testes criptográficos mantêm o trabalho de 310 mil iterações; o prazo maior no teste não é evidência de que o fallback caiba no limite de CPU do Workers Free.
