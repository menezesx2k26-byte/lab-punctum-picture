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

## Atualização técnica — alternativas oficiais examinadas (10/11/2026)

O readback atual do código confirmou por que `Images.info()` sozinho não substitui a validação raster: `worker/client/gallery-raster.mjs` primeiro lê metadados com `images.info()` e depois chama `images.input(...).transform({width:1,height:1})` para forçar decodificação/transformação; `tests/integration/client-media.spec.ts` mantém regressão que rejeita PNG com cabeçalho/dimensões válidos e dados raster corrompidos. A documentação oficial informa que `.info()` é gratuito, mas não publica limite de tamanho para esse método; isso não prova que `info()` sozinho valide o payload inteiro nem que aceite 25 MiB em produção.

Também foi examinada a alternativa `cf.image` via `fetch()` para imagens remotas: a documentação de limites aceita originais remotos até 100 MB e o plano Images Free inclui 5.000 transformações únicas/mês. Porém, a documentação de controle de origem alerta que imagens privadas/restritas não são recomendadas para resizing porque o resultado transformado é armazenado em cache compartilhado; o caminho de origem autenticada documentado exige `origin-auth: share-publicly` e pressupõe que o cliente aceite cache público. Essa condição conflita diretamente com álbuns privados por cliente. R2 privado não aparece entre as origens autenticadas explicitamente suportadas nessa seção. O plano atual da conta e o consumo mensal de transformações também não foram lidos; no plano Paid, exceder as 5.000 transformações incluídas passa a custar US$ 0,50 por mil.

Fontes primárias consultadas em 10/11/2026:

- [Cloudflare Images — Optimize with Workers](https://developers.cloudflare.com/images/optimization/binding/): `.input()` limitado a 20 MB; `.info()` gratuito; uso do binding com streams.
- [Cloudflare Images — Limits and formats](https://developers.cloudflare.com/images/get-started/limits/): originais remotos até 100 MB; limite separado de 20 MB para `ImagesBinding.input()`.
- [Cloudflare Images — Pricing](https://developers.cloudflare.com/images/pricing/): 5.000 transformações únicas/mês incluídas no plano Free; excedente no Free retorna erro sem cobrança; plano Paid cobra US$ 0,50 por mil transformações após as 5.000 incluídas.
- [Cloudflare Images — Control origin access](https://developers.cloudflare.com/images/optimization/transformations/control-origin-access/): imagens privadas geralmente não são recomendadas para resizing devido ao cache compartilhado; o exemplo de origem autenticada usa `origin-auth: share-publicly`.

**Conclusão de engenharia:** não foi comprovado um caminho que simultaneamente aceite 25 MiB, faça decodificação integral, mantenha isolamento privado e garanta R$ 0,00. Remover `.input()` e manter apenas `.info()` enfraqueceria a rejeição de raster corrompido; usar `cf.image` sem desenho de cache privado provado poderia expor imagens entre clientes. Não houve alteração remota nem mudança de código G05 nesta investigação. O limite operacional de 20.000.000 bytes continua fail-closed.

**Decisão externa necessária:** manter a especificação de 25 MiB e autorizar um experimento em QA segregado para validar uma estratégia de decodificação e entrega privada com cache isolado, confirmando antes o plano/uso Images da conta; ou aprovar formalmente a mudança do limite de produto para 20.000.000 bytes. Até uma dessas decisões e sua homologação, G05 permanece FAIL e `PRIVATE_GALLERIES_ENABLED=false`.
