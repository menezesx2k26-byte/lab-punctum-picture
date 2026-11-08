# R4 — limite real do Images Binding e prevenção de upload sem saída (08/11/2026)

## Divergência confirmada com o provedor
Fonte primária: [Cloudflare Images — Limits and formats](https://developers.cloudflare.com/images/get-started/limits/) (verificação 08/11/2026). O **Images Binding** limita `.input()` a **20 MB**, enquanto o contrato histórico da Punctum para álbuns privados aceitava **25 MiB = 26.214.400 bytes** (plano de 22/10/2026, preservado sem edição). Antes desta correção, a rota `/admin/api/albuns-privados/:id/uploads/intents` autorizava reservar um upload de 20–25 MiB, enviava os bytes ao R2 e só ao concluir chamava o Images Binding — que não é obrigado a aceitar o arquivo. Havia risco de imagem/intenção em estado `failed`, objeto não utilizável e trabalho perdido para Maria.

## Correção fail-closed (não é conclusão integral do requisito original)
- `shared/client-galleries.ts` agora declara `CLIENT_MAX_UPLOAD_BYTES=20_000_000`, **decimal e conservador**, e gera `CLIENT_MAX_UPLOAD_LABEL` a partir da mesma constante. A validação Zod barra o excesso antes da criação de qualquer `client_gallery_images`/`client_gallery_upload_intents` e antes do R2.
- O editor privado mostra o novo limite nas mensagens de seleção e auxílio. Apenas o fluxo de **álbuns privados** mudou; o limite administrativo público do Studio ficou preservado, pois é outra funcionalidade e não foi homologada nesta rodada.
- `worker/client/gallery-raster.mjs` foi alinhado às dimensões publicadas pelo Images: no máximo 12.000 pixels por lado e 100 megapixels, validando metadados antes da transformação. Guardas não substituem o decoder; PNG inválido continua rejeitado pelo decoder real.
- **Não** reduzir a quota do banco legado com migration destrutiva e não remover ou modificar intents/objetos históricos; migração `0009_private_client_galleries.sql` com CHECK de 25MiB permanece como trilha histórica. Requisições antigas maiores podem continuar necessitando recuperação específica; não atribuir-lhes um sucesso falso.

## TDD e evidência
- RED: `tests/unit/client-galleries.spec.ts` com limite e label novos falhou (recebia 26.214.400); `tests/integration/client-upload-config.spec.ts` mostrou que 20.000.001 bytes eram aceitos e retornavam um intento. Os testes integram DB local e verificam que nenhum registro é criado quando o tamanho excede o limite. Inclui também o caso histórico 26.214.400.
- GREEN: ambos focados PASS após mudar o contrato e o texto do editor.
- RED/GREEN independente: `scripts/r4-product-raster-validation.test.mjs` reproduziu a aceitação incorreta de dimensões acima do limite; agora rejeita 12.001px por lado e área 100.010.000 px². O ensaio sintético Images de 2×2 é mantido sem alterações de recurso remoto.
- Validação local completa e CI exata devem ser lidas na PR deste commit antes de marcar todos os checks PASS.

## Decisão de produto ainda necessária
**O requisito original de 25 MiB não foi atendido pelo caminho atual Cloudflare Images Free**. A correção evita falha tardia e preserva dados, mas limita o upload privado a 20 MB. Não tratar o novo teto como aprovação da controladora para reduzir especificação; se 25 MiB precisar continuar sendo suportado, será necessária arquitetura de validação/entrega compatível, comprovada sem custo incremental e sem exposição de imagens privadas. A versão antiga do plano permanece imutável.

**G05 continua FAIL** enquanto não houver upload integrado real com D1/R2/Auth, incluindo essa reconciliação de tamanho. **G17 continua FAIL** para SSR cold no Workers Free; G15/G19/G20/G23/G22 permanecem bloqueados. Sem merge/deploy/upgrade de plano/alteração de clientes; `PRIVATE_GALLERIES_ENABLED=false` na produção, PR draft.
