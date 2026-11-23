# R4 — Cloudflare QA: evidências remotas somente leitura (28/10/2026)

## Escopo e decisão

**NO-GO para produção.** Esta rodada consultou diretamente a conta Cloudflare conectada e a CI GitHub, **sem** alteração de Access, Worker, D1, R2, faturamento, segredos, dados de clientes, deploy, merge ou recursos pagos. Não foi realizada autenticação OTP com identidade real, ensaio de recuperação, teste mobile físico ou auditoria independente.

Dados abaixo se referem ao **Worker QA já implantado**, não ao HEAD da PR #20. Conferir publicação/commit antes de utilizar os percentis para homologar código novo.

## Inventário verificado

- Worker existente `punctum-picture-albums-qa`; observabilidade habilitada, **última modificação do script observada em 24/10/2026 às 19:17:43 UTC**.
- D1 `punctum-picture-albums-qa`: **5 contas** em `client_accounts` (consulta `SELECT COUNT(*)`, `rows_written=0`).
- D1 `punctum-picture-albums-qa-restore`: **5 contas** no mesmo teste (`rows_written=0`).
- Buckets R2 encontrados: `punctum-picture-albums-qa-originals`, `punctum-picture-albums-qa-backups` e `punctum-picture-albums-qa-restored`.
- Aplicação Access `Punctum private albums QA 20261024`, domínio `punctum-picture-albums-qa.menezesx2k26.workers.dev/albuns/entrar`, duração de sessão **1h**, um IdP configurado e política **Owner QA OTP only** de decisão allow, com critério `email` e uma condição adicional de `require`. Identidades e valores de critérios não foram registrados.
- Settings QA do Worker: `CLIENT_AUTH_MODE=access` e `PRIVATE_GALLERIES_ENABLED=true`; bindings de D1/R2 e segredos de sessão registrados por nome/tipo na plataforma. **Isso não comprova que o login OTP e as rotas privadas funcionem de ponta a ponta.**
- Leitura de `/accounts/{id}/subscriptions` e billing profile retornou **403 / missing Billing Read** na conexão OAuth. Não foi possível comprovar plano, cobrança e consumo agregado da conta.

## G17 — CPU medida em produção QA antiga

Consulta GraphQL `workersInvocationsAdaptive` para `scriptName=punctum-picture-albums-qa` no intervalo **2026-10-24T00:00:00Z a 2026-10-28T13:30:00Z**:

| Métrica | Valor |
|---|---:|
| Requisições | **142** |
| Erros agregados | **0** |
| `cpuTimeP50` | **4.259 µs = 4,259 ms** |
| `cpuTimeP99` | **134.200 µs = 134,2 ms** |
| Referência Workers Free publicada | **10 ms CPU/requisição** |

Fontes oficiais Cloudflare:
- https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/ (formato de query e interpretação dos percentis)
- https://developers.cloudflare.com/workers/platform/limits/ (limites CPU Workers Free)

**Interpretação limitada:** o p99 observado supera o limite documentado do Free, mas os dados **não identificam a rota, o tráfego, o plano nem o commit** que produziu o outlier. Os números não bastam para provar faturamento, nem para afirmar que o HEAD da PR #20 excede o limite, tampouco para liberar G17. Investigar o caso com observabilidade controlada e medir após atualização segura em QA isolado; não elevar limites nem criar assinatura paga automaticamente.

## Atualização da decisão por gate

- **G07 — BLOCKED_EXTERNAL**, apesar de configuração Access e segredos confirmados: requer OTP real (sem registrar token/código), identidade, vínculo D1, revogação e matriz de negações.
- **G14 — PARTIAL**: browsers físicos Android Chrome/iOS Safari ainda não ensaiados.
- **G17 — BLOCKED_EXTERNAL, now measured-risk**: p99 QA antigo 134,2 ms e Billing 403; verificar plano/custo, isolar requisições pesadas e revalidar HEAD atual.
- **G18/G23 — BLOCKED_EXTERNAL/PARTIAL**: dois D1 QA têm cinco contas. **Não apagar, migrar nem restaurar sobre eles**. Exige ambiente novo **comprovadamente vazio**, isolado, dentro do orçamento autorizado e ensaio reversível.
- **G19 — PARTIAL**: revisão de segurança independente, configuração Access real e assinatura continuam em aberto.
- **G20/G22 — BLOCKED_GOVERNANCE**: controladora deve aprovar decisões LGPD; proprietário deve decidir GO só depois de todas as evidências.

A CI da PR #20 para o SHA `f97b74a7eade1688171d54ea85bbdad12efb8bf1` foi verificada **completed/success** em https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40691125576 **antes** de adicionar este documento. O novo HEAD documental deverá ter CI verificada separadamente. PR #17 base e PR #20 continuam draft/unmerged.

## Próximo procedimento seguro

1. Obter acesso de leitura Billing (ou relatório do titular), sem alterar subscrição.
2. Inspecionar registros de CPU por rota/invocação no QA antigo; separar autenticação PBKDF2 e processamento de mídia de requisições leves, sem registrar PII nem tokens.
3. Homologar o HEAD correto em QA independente, com recursos D1/R2 vazios e dentro da franquia gratuita verificada.
4. Executar OTP real, Android Chrome, iOS Safari, teste de restauração/rollback e auditoria de segurança independente; documentar aprovação LGPD.
5. Somente após todos os gates, solicitar autorização separada para merge/deploy/ativação; preservar produção e colagem pública até lá.

## Adendo HST-001 — evidência posterior no mesmo dia

O [relatório 18](18-hst-001-hostinger-qa-2026-10-28.md) amplia estes dados: CPU p95=12,667ms, eventos por família de rota e versão, e Billing subscriptionsHTTP 200 com uma credencial já existente do repositório. Os403 deste relatório continuam histórico correto da conexão OAuth usada. Home pública129/134/166ms em três versões QA; senha não foi demonstrada como causa. Sem medição do HEAD/offload, franquias agregadas ou Hostinger isolada, G17 continua BLOCKED_EXTERNAL.
