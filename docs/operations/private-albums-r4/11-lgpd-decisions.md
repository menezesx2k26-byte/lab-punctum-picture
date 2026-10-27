# LGPD — decisões pendentes

A minuta `../private-client-galleries-lgpd-decision.md` permanece proposta não aprovada. A retomada não definiu controlador, contato, base legal, retenção, canal do titular, prazo de atendimento, incidentes ou suboperadores em nome do estúdio. Não houve cadastro, exportação ou exclusão de pessoa real.

O backup privado de QA contém somente fixtures sintéticas na execução testada; bibliotecas de recuperação não são uma API de exportação ao titular. A entrega ao titular deve excluir hashes, salts, sessões e backups internos, e usar canal privado aprovado. A simulação assistida completa de exportação/exclusão e a aprovação do estúdio não foram concluídas. G20: BLOCKED_EXTERNAL; procedimentos de exclusão não autorizam apagar produção ou evidências QA.

## Atualização incremental Argon R4 — Exportação Sanitizada do Titular (2026-10-27)

- **Implementação técnica concluída**:
  - Criado `worker/client/lgpd.ts` (`buildSanitizedTitularExport`, `loadSanitizedTitularExport`, `FORBIDDEN_LGPD_EXPORT_KEYS`) e exposto `GET /admin/api/clientes/:clientId/lgpd-export` em `worker/api/client-admin.ts` (protegido por `requireAdmin`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow, noarchive` e registrado em `audit_log` como `client.lgpd_exported`).
  - O pacote de exportação do titular inclui exclusivamente dados pessoais e escolhas do cliente solicitado (`titular`, `galleries`, `images` prontas e `favorites`) e **exclui estritamente**: `password_hash`, `password_salt`, `password_iterations`, `session_version`, `must_change_password`, `storage_key`, `temporaryPassword`, tokens/cookies/segredos e quaisquer registros de outros clientes.
  - Coberto por `tests/unit/client-lgpd.spec.ts` e `tests/integration/client-security-matrix.spec.ts`.
- **Estado de governança (`G20`)**:
  - Parte técnica/documental: `PASS`.
  - Aprovação formal do controlador de dados / responsável pelo estúdio: `BLOCKED_GOVERNANCE`.
