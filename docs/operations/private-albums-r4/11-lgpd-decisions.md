# LGPD — decisões pendentes

A minuta `../private-client-galleries-lgpd-decision.md` permanece proposta não aprovada. A retomada não definiu controlador, contato, base legal, retenção, canal do titular, prazo de atendimento, incidentes ou suboperadores em nome do estúdio. Não houve cadastro, exportação ou exclusão de pessoa real.

O backup privado de QA contém somente fixtures sintéticas na execução testada; bibliotecas de recuperação não são uma API de exportação ao titular. A entrega ao titular deve excluir hashes, salts, sessões e backups internos, e usar canal privado aprovado. A simulação assistida completa de exportação/exclusão e a aprovação do estúdio não foram concluídas. G20: BLOCKED_EXTERNAL; procedimentos de exclusão não autorizam apagar produção ou evidências QA.

## Atualização incremental Argon R4 — Exportação Sanitizada do Titular (2026-10-27)

- **Implementação técnica concluída**:
  - Criado `worker/client/lgpd.ts` (`buildSanitizedTitularExport`, `loadSanitizedTitularExport`, `FORBIDDEN_LGPD_EXPORT_KEYS`) e exposto `GET /admin/api/clientes/:clientId/lgpd-export` em `worker/api/client-admin.ts` (protegido por `requireAdmin`, `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow, noarchive` e registrado em `audit_log` como `client.lgpd_exported`).

## Registro para decisão expressa da controladora — 28/10/2026

Todos os campos abaixo estão **PENDENTES**, sem prazo, base legal ou aprovação presumidos. A matriz prepara a decisão; não produz parecer jurídico nem autoriza expurgo/produção.

| Decisão | O que a controladora deve registrar | Evidência técnica disponível |
|---|---|---|
| Controlador e contato | Identidade responsável, canal do titular e responsáveis operacionais | Nenhum campo foi preenchido pelo agente |
| Finalidade e base legal | Finalidades de identificação, entrega, seleção/favoritos, segurança e recuperação; informação ao titular e base aplicável validadas pelo responsável | Inventário da minuta; dados privados separados do portfólio |
| Retenção | Evento inicial, prazo e exceções de fotos, favoritos, contas, intents, auditoria e backups, separadamente | Não há purge automático autorizado de fotos prontas; versão de sessão permite revogação |
| Eliminação | Quem autoriza, escopo, exceções, efeito em backups e confirmação ao titular | Revogar/arquivar não significa apagar; exercício destrutivo real não autorizado |
| Terceiros | Papéis, acesso, transferências e contratos efetivos dos operadores | Arquitetura prevista usa Access/Worker/D1/R2; Hostinger/PersistFlow não receberam fotografias privadas nesta missão; GitHub/Drive/Engram recebem somente evidência sanitizada |
| Exportação | Escopo do pacote, tratamento de terceiros em imagens/textos e responsável pela revisão | JSON por allowlist, inclusive metadados retidos, snapshot D1.batch e testes A/B; binários de fotos não fazem parte desse endpoint |
| Entrega | Identidade/legitimidade verificada, destinatário, canal privado, validade, confirmação e registro | Nenhuma exportação de cliente real foi produzida/enviada |
| Incidentes e restauração | Quem pode restaurar, quem aprova reabertura e como cumprir retenção após recovery | Quarentena e rotação de segredo no contrato técnico; G18/G23 exigem ensaio próprio |

Para aprovação: registrar versão da política, decisões de cada linha, nome/atribuição de quem decide, data, exceções e evidência de aceite. Até isso ocorrer, **G20 BLOCKED_EXTERNAL por governança e produção NO_GO**. O agente não pode assinar pela controladora nem presumir concordância pelo silêncio.
  - O pacote de exportação do titular inclui exclusivamente dados pessoais e escolhas do cliente solicitado (`titular`, `galleries`, `images` prontas e `favorites`) e **exclui estritamente**: `password_hash`, `password_salt`, `password_iterations`, `session_version`, `must_change_password`, `storage_key`, `temporaryPassword`, tokens/cookies/segredos e quaisquer registros de outros clientes.
  - Coberto por `tests/unit/client-lgpd.spec.ts` e `tests/integration/client-security-matrix.spec.ts`.
- **Estado de governança (`G20`)**:
  - Parte técnica/documental: `PASS`.
  - Aprovação formal do controlador de dados / responsável pelo estúdio: `BLOCKED_GOVERNANCE`.

## Pacote de decisão para a responsável do estúdio — **aprovação NÃO obtida**

A aprovação é uma decisão real de governança e não pode ser inferida de testes. Antes de assinar, a responsável precisa confirmar por escrito:

| Decisão | Resposta da responsável (pendente) |
|---|---|
| Identidade jurídica do controlador e contato privativo de atendimento | NÃO INFORMADA |
| Base legal e finalidade por operação (cadastro, sessão, fotos, favoritos, download, exportação) | NÃO APROVADA |
| Aviso ao titular, consentimentos quando aplicáveis e canal de oposição/correção | NÃO APROVADO |
| Prazos de retenção, exclusão, backups, recuperação e tratamento de litígio | NÃO APROVADOS |
| Suboperadores (Cloudflare D1, R2, Access), região/transferência, acesso da equipe | NÃO APROVADOS |
| Operação de solicitação de acesso/portabilidade: autenticar solicitante, expurgar dados incidentais de terceiros, entregar canal seguro | NÃO APROVADA |
| Política de incidentes, rastreabilidade e quem responde ao titular | NÃO APROVADA |
| Autorização de coleta e exposição em piloto real | NÃO AUTORIZADA |

**Registro de aprovação:** Responsável: **PENDENTE** · data: **PENDENTE** · decisão: **NÃO APROVADO** · referência assinada: **AUSENTE**.

A evidência local prova projeção técnica e isolamento nos fixtures; não prova conformidade integral com a LGPD nem constitui parecer jurídico. Preservar `G20 = BLOCKED_GOVERNANCE` até assinatura verificável.

## Atualização técnica de 28/10/2026 — metadados retidos e consistência D1

Na PR #20 foi acrescentada a seção `retainedImageMetadata` do export, incluindo registros de imagens **pendentes, falhadas e excluídas logicamente** que ainda permaneçam no banco. Os campos são selecionados individualmente e limitados ao cliente solicitado; as fotografias/bytes, chaves R2, hashes, sais, sessões e dados de outros titulares permanecem excluídos. O conjunto `galleries[].images` continua restrito às fotos prontas e não excluídas para preservar a semântica de apresentação. Os favoritos retidos são vinculados à mesma galeria e conta.

A leitura de conta/galerias/imagens/favoritos agora ocorre num único `D1.batch` transacional, e não em quatro chamadas independentes. Testes de RED–GREEN e integração com D1 local sintético estão versionados. Não houve exportação de dados reais nem alteração de armazenamento remoto.

**Limite de governança:** a controladora precisa definir se metadados de terceiros incidentais devem ser revisados antes da entrega, quem atende o titular, categorias de retenção, prazo de descarte, políticas sobre fotos soft-deleted e meios seguros de envio. A implementação é técnica, não uma aprovação de conformidade jurídica. Issue #22 documenta governança e verificação real, permanecendo aberta. **G20 = BLOCKED_GOVERNANCE.**
