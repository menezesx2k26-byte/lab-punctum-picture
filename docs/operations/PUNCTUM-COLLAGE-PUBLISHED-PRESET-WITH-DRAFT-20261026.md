# Punctum — publicar Colagem Autoral preservando o rascunho

**Solicitação:** ativar `colagem-autoral` no domínio principal, após a PR #14 ter sido integrada, sem perder as alterações não publicadas do Studio.

## Problema anterior

O workflow `publish-colagem-production.yml` era bloqueado quando `hasUnpublishedChanges=true`. Isto evitava substituir o rascunho, mas também impedia a publicação apenas visual. A API `/admin/api/studio/publish` publica o rascunho inteiro e o atualiza, portanto não serve para esse caso.

## Contrato da correção

O novo endpoint administrativo autenticado `POST /admin/api/studio/publish-visual` aceita **somente** `presetId=colagem-autoral`, além de `expectedPublishedVersionId` e `expectedDraftRevision`.

Ele:

1. Lê a **versão publicada** atual, não o conteúdo do rascunho.
2. Executa `applySitePreset` e verifica que somente `identity`, `theme` e `variant` das seções mudam. Mídia, textos, IDs, estrutura, ordem e habilitação permanecem idênticos.
3. Verifica referências de mídias publicadas.
4. Cria novo snapshot imutável de publicação e atualiza **somente** `site_config_pointers.published_version_id`, por `D1.batch` e CAS de IDs/revisão.
5. Mantém `site_config_pointers.draft_version_id`, configuração e revisão do rascunho inalterados; grava auditoria da mudança e preserva a versão anterior no histórico.
6. Rejeita concorrência, versões anteriores inválidas e parâmetros inesperados.

O workflow separado `Publish Punctum visual colagem in Studio` consulta o estado antes/depois via credenciais existentes do GitHub Actions. Ele confirma `draftHash`, revisão, contagens públicas do acervo, versão publicada e preset.

**Atenção editorial:** um futuro clique de "Publicar" no Studio poderá publicar o rascunho antigo com sua configuração visual anterior. Não alterar silenciosamente o rascunho para evitar isso: a responsável decide quando e como publicá-lo.

## Rollback

O endpoint retorna `previousVersionId`; a versão anterior permanece no histórico. Se necessário, preparar uma restauração **somente da versão publicada**, preservando rascunho e fazendo CAS; o endpoint de restauração comum **não** é seguro para esse objetivo, pois também reseta o rascunho.

Este endpoint exige sessão administrativa, verificação de origem e rate limit existentes; não cria acesso público de escrita e não mexe em álbuns privados, OTP ou PR #13.
