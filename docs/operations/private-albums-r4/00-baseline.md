# P0 — baseline da integração R4

Leitura UTC: 2026-10-27 (execução atual). Repositório: menezesx2k26-byte/lab-punctum-picture.

- Main remoto: `a77654281a80be3c9e8857f4aef2744a942a991b`.
- PR #13: draft aberta, HEAD `a735103c13af206980dbc60e9b6491a21eaf96b8`.
- Merge-base: `af55e1526b731be099e804335eb143d2b5cfa95e`; main 40 à frente e PR 72 à frente.
- Branch isolada: `integration/punctum-private-albums-r4-20261027`, criada a partir da main. Worktree limpa antes deste registro. Checkout original contém arquivo temporário não rastreado, preservado.
- CI histórica PR: [40162658257](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40162658257), sucesso no HEAD da PR. Não é evidência da integração atual.
- Configuração versionada identifica produção e preview; o ID de D1 preview é um placeholder. Existência, isolamento e permissões efetivos dos recursos QA não foram verificados. D1/R2 de produção referenciados na configuração não serão usados em QA.
- Flag efetiva em produção: não verificada; configuração atual da main não declara a flag. Nenhuma escrita em produção autorizada.
- Preset público: documentação versionada descreve publicação de `colagem-autoral`; estado efetivo atual não verificado.
- `git merge-tree --write-tree` identifica conflitos em CI, package.json e lockfile. Ausência de conflito em outros arquivos não significa compatibilidade.
- Bloqueios iniciais: BLOCKED_REAL_OTP (identidade real não comprovada), BLOCKED_QA_AUTHORITY (isolamento/permissões atuais desconhecidos), BLOCKED_DEVICE_QA (aparelhos físicos não disponíveis), BLOCKED_BILLING_READ (custo efetivo não observado), BLOCKED_LGPD_APPROVAL. Situação registrada; verificação atual pendente.

Produção tocada: não. Próxima ação: inventário e integração controlada, com os workflows e dependências da main preservados.

## Releitura Cloudflare — 27/10/2026 UTC

Consulta somente leitura identificou Worker de produção `punctum-picture-migration` e Worker `punctum-picture-albums-qa`. Existem bancos QA de origem e restauração distintos entre si e do D1 principal. Os bindings atuais do Worker QA apontam para o D1 de **restauração**, bucket QA restaurado e bucket QA de backup; modo Access e flag QA `true`. Team, audience de cliente e secret de sessão aparecem como bindings presentes, sem inspeção de valores secretos; audience administrativa não aparece nos bindings QA consultados.

App Access QA self-hosted identificada para `/albuns/entrar`, sessão configurada de 1h, com uma política allow contendo uma condição. Isso não confirma entrega OTP nem o conteúdo da política para um usuário específico. Os buckets QA de originais, restaurados e backups retornaram `r2.dev` desabilitado e zero domínios customizados. Não houve teste direto de leitura anônima de objetos.

Settings consultados do Worker de produção não retornaram binding `PRIVATE_GALLERIES_ENABLED`; isso é uma observação da configuração lida, não comprovação independente de todo o tráfego implantado. Nenhum binding ou política foi modificado. Billing subscriptions retornou 403 por falta de Billing Read no OAuth. Não foi possível confirmar gasto/uso atual.
