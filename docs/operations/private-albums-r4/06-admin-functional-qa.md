# Administração — cobertura atual e lacunas

A implementação integrada mantém o editor privado separado do Studio. `client-galleries.spec.ts` cobre criação/normalização de e-mail, duplicidade, listagem sem hashes, desativação/revogação, validação de Origin, capa da própria galeria, ordem exata e publicação incompleta. `client-media.spec.ts` cobre intent, bytes, raster corrompido, confirmação, retries e concorrência. O modo Access não emite senha temporária, conforme `client-access.spec.ts`.

Esses testes exercitam handlers contra D1/R2 local. Não foi executado E2E administrativo em navegador do HEAD atual: formulário, progresso visual, erro/retry, sessão expirada, toque e favoritos no painel permanecem pendentes. Nenhuma conta real foi cadastrada. G03–G05/G14 não devem ser promovidos a PASS com base apenas nessa cobertura.
