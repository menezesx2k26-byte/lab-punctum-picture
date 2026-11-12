# Punctum R4 — prova integrada local de rollback Studio/Colagem (08/11/2026)

## Fonte e escopo de segurança
Nova regressão `tests/integration/r4-public-rollback.spec.ts` executa a **aplicação real** em `@cloudflare/vitest-pool-workers` / Miniflare com D1/R2 totalmente locais, dados sintetizados e `PRIVATE_GALLERIES_ENABLED` temporariamente desligada apenas na chamada de verificação. Não usa Cloudflare remoto, histórico QA, produção, fotos ou identidade de clientes.

Este ensaio atravessa a mesma API administrativa do produto, sem executar migrations reversas:
1. Captura a configuração pública antes de qualquer alteração e o ID da versão publicada (Studio).
2. Insere uma conta/galeria/foto de teste em D1 local, guarda o hash SHA-256 dos bytes de um PNG 2×2 no R2 local e o registro original da imagem privada.
3. Salva e publica uma edição textual no Studio; confirma a mudança em `/api/public/site`.
4. Salva uma segunda edição como **rascunho não publicado**, publica somente o preset visual `colagem-autoral` e confirma que o rascunho secreto continua restrito ao Studio; o texto público permanece o primeiro.
5. Restaura a versão publicada originalmente pelo endpoint `/admin/api/studio/restore`, verifica `restoredFromVersionId` e exige igualdade estrutural exata da configuração pública inicial, inclusive identidade/Colagem/editorial.
6. Exige igualdade do registro D1 da imagem privada e do hash SHA-256 dos bytes R2 originais. A rota pública `/media/:id/thumb` continua 404 e a rota privada `/api/client/galleries/:id/images/:id/download` com flag false fica 404 e **zero bytes**.

O primeiro teste RED exigia zero bytes também de uma resposta *metadados* 404 JSON — suposição indevida (uma mensagem genérica JSON não é arquivo privado). Foi corrigido para distinguir resposta API genérica de mídia privada, sem alterar o runtime.

## Resultado e limites
- Teste focalizado GREEN: 1/1, sem arquivos remotos ou migração de dados reais.
- Verificação sintética cobre rollback lógico de Studio/Colagem, isolamento D1/R2 e impedimento de entrega privada após flag-off.
- **G23 permanece BLOCKED_EXTERNAL**: ainda falta rollback remoto completo em QA com versão Worker previamente comprovada, reabertura, verificação física, config e integração de infraestrutura. **G18 PASS** histórico não substitui essa prova.
- G05 ainda FAIL para upload remoto completo: validação de raster exata do produto passou no binding Images real em `bce8551`/Actions `42492484685`, mas não há QA isolado D1/R2 com slots livres (10/10). Não criar D1 extra, não modificar fixtures históricas.
- G17 permanece FAIL em renderização de home cold/Workers Free 10ms; o cache público e purge têm prova remota separada.
- G15 assistiva física, G19 revisão independente, G20 LGPD controladora, G22 release continuam bloqueados. Produção NO_GO, PR draft, `PRIVATE_GALLERIES_ENABLED=false`, sem upgrade.
