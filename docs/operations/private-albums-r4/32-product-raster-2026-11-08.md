# Punctum R4 — contrato único do raster (2026-11-08)

## Problema e escopo
O upload privado finalizava fotos pela operação `IMAGES.info` e `IMAGES.input(...).transform(...).output(...)`. Um ensaio remoto anterior havia comprovado o binding Images da Cloudflare, mas **duplicava** a lógica em outro Worker. Resultado: Image Binding PASS sintético não demonstrava que o mesmo decodificador usado pelo produto era compatível com a conta Free.

Esta continuação extrai `validateGalleryRaster(images, stream)` para `worker/client/gallery-raster.mjs`, importada sem alterações do mesmo arquivo por:
1. `worker/api/client-gallery-upload.ts` no caminho real autenticado `POST /admin/api/albuns-privados/:id/uploads/:intent/complete`. O R2 `object.body` é dividido com `tee()` em streams independentes para `info` e transformação 1×1 PNG. A função exige metadados válidos (inteiros positivos) e a resposta transformada HTTP OK, MIME PNG e assinatura PNG; retorna dimensões e tamanho transformado.
2. `scripts/r4-images-probe-worker.mjs` na prova efêmera isolada que usa um único PNG sintético de 2×2 px. Não tem D1, R2, Access, fotos reais, upload nem host personalizado; está protegida por token efêmero. **O ensaio agora executa literalmente a mesma função de validação de raster.**

O caminho do produto preserva a falha fechada, audita operações e controla intents/R2/DB como antes. O produto não recebe uma API extra nem libera `PRIVATE_GALLERIES_ENABLED`.

## TDD e verificações
- RED: `scripts/r4-product-raster-validation.test.mjs` importou helper inexistente e falhou com `ERR_MODULE_NOT_FOUND`.
- GREEN: 3 testes novos cobrindo streams distintos, dimensões incorretas e transformações inválidas. Regressões antigas do Worker efêmero adaptadas para PNG completo, não só quatro bytes de assinatura. Focado `11/11` Node tests (5 preflight, 3 probe, 3 product raster).
- O workflow `.github/workflows/r4-images-ephemeral-qa.yml` observa alterações no próprio helper ou no caminho de upload, e a CI geral roda os novos testes. Execução remota exige commit [r4-image-binding-qa], inventário de Workers/Free prévio, Worker único e limpeza validada.
- **Readback remoto real** da mesma função/HEAD `bce855164715660a320d14e85acd916c567b2cfa`: [Actions #42492484685](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42492484685) completed/success, `SYNTHETIC_IMAGES_BINDING_PASSED_AND_CLEANED`, PNG sintético 2×2 convertido em 1×1, HTTP 200, 67 bytes; Worker efêmero criado/deletado uma vez, inventário 17→17, `cleanupVerified=true`. `D1Queries=0`, `R2Operations=0`, `imagesStored=0`; artefato `13621848308` ZIP SHA-256 `df145d90181970d192bab578a565ca361942c301a346642e66a24e305ede06c7`. Esta prova compartilha exatamente `validateGalleryRaster` com o upload real, mas não exercita o caminho completo D1/R2 autenticado.
- CI exata de `bce8551`: [#42492488717](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42492488717) completed/success, 30 etapas concluídas, zero falhas, browser E2E incl. Chromium; artefato de navegador `13622575353` presente (conteúdo não inspeccionado por falta de permissão de download). G05 não é PASS sem fluxo remoto completo e independente do produto.

## Bloqueios mantidos
- G05 **ainda FAIL**: falta fluxo integrado remoto do produto com D1/R2/imagem, JWT/OTP, bytes/retry/retorno e reconciliação de recursos; a conta D1 possui 10/10 bancos, portanto não criar um 11º, apagar banco existente nem alterar fixtures históricos para falsificar prova.
- G17 **FAIL**: cache público (35/36 HIT, purge MISS→HIT) já comprovado; o custo de CPU em MISS do SSR continua sem homologação frente a Workers Free 10ms. O helper não tenta contornar a CPU por pagamento.
- G15 física/a11y, G19 revisão independente, G20 LGPD controladora, G23 rollback integral, G22 release continuam bloqueados por evidências ausentes. Produção permanece NO_GO, PR draft, sem merge nem deploy.
