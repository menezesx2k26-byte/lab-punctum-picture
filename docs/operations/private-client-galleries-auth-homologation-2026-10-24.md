# Punctum Picture — homologação de autenticação sem Workers Paid

Data: 24/10/2026, America/Sao_Paulo. PR #13, branch `agent/private-client-albums-20261022`.
Baseline auditada: `5b5e1934c62bcb7f0876afb406990522fcbfd3a9`; base da PR `af55e1526b731be099e804335eb143d2b5cfa95e`.
**Estado deste checkpoint: CORREÇÕES E PRIMEIRO PILOTO REMOTO APROVADOS; DEPENDÊNCIAS CORRIGIDAS AGUARDAM NOVA CI/QA; NO-GO para produção.** Não confundir CI, cookies sintéticos ou tela de OTP com identidade homologada.

## Arquitetura escolhida

Principal: **Cloudflare Access Free com One-time PIN por e-mail**, JWT RS256 verificado no Worker, conta/permissões/revogação atuais no D1 e originais privados no R2. O Worker continua emitindo cookie próprio HttpOnly/Secure. D1 é a autoridade de autorização; Access é apenas a prova de identidade. Nenhuma autoridade/credencial PersistFlow participa.

| Critério | Access Free (principal) | Hostinger Password Bridge (secundário, desativado) |
| --- | --- | --- |
| Custo incremental contratado | Zero; Teams Free já ativo, 50 usuários compartilhados na conta | Zero somente se existir capacidade isolada já contratada; isso não está homologado |
| CPU de senha no Worker | Não executa PBKDF2 nesse modo | PBKDF2 nativo no Node separado; 310000 preservado |
| Experiência do cliente | Código por e-mail; depende da caixa postal/entrega | Senha temporária, primeira troca e recuperação pelo estúdio |
| Dependências | Cloudflare Access + Worker/D1/R2 | Worker/D1/R2 + HTTPS/Node/filesystem Hostinger |
| Superfície própria | Validação JWT, sessão e autorização | Soma transporte de senha, HMAC, replay persistente, capacidade, logging e disponibilidade de outro serviço |
| Operação | Política/AUD/cota, revogação D1 e QA de OTP | App isolado, TLS, chave independente, volume compartilhado atômico, rate limit agregado e monitoramento |
| Estado verificado | App de QA e tela real de login disponíveis; OTP pendente | Testes locais; nenhum deployment Hostinger autorizado/realizado |

Access remove o gargalo de CPU demonstrado com menos componentes próprios. Não garante automaticamente todos os fluxos dentro de Workers Free; piloto no edge continua obrigatório. Se a cota de usuários for insuficiente, reavaliar antes de qualquer ampliação, sem contratar automaticamente.

## Infraestrutura identificada por evidência atual

- Cloudflare: conta do Punctum confirmada; assinatura `teams_free`/Teams Free Base com 50 usuários e preço base 0; R2 Paid existente é distinto de Workers Paid. A listagem de assinaturas não mostrou Workers Paid. Nenhum plano foi alterado.
- Worker público: `punctum-picture-migration`; deployment observado `366e1e15-ee14-46fd-aa39-4b86c5c1fd8c`, versão `84b4e28d-9c26-4024-81bc-ccf5a98a7dca`, publicado em `2026-10-22T15:55:07.361378Z`. Ainda será comparado ao fechamento.
- QA existente: `punctum-picture-albums-qa`; dois D1 e três R2 com nomes exclusivos `punctum-picture-albums-qa*`. Bindings observados inicialmente usavam D1 de restauração e R2 `*-restored`, modo Access, flag true e team/AUD marcadores. Não se leu conteúdo de fotografias privadas.
- Access antes: organização existente, zero aplicativos, somente IdP Cloudflare; não havia OTP. Nesta missão foram adicionados IdP OTP `2f3f09a1-2715-4021-a359-810a3c596566`, app de QA `9ba6f47a-a0d2-4588-9d21-6b14d54dad6a` e política `9fc898c0-21a0-40e3-9117-4f36604e9f06`, restrita à conta do proprietário e OTP. Apenas o caminho `/albuns/entrar` no hostname de QA; nenhum domínio público do Punctum na app.
- Hostinger: conexão correta lista `darkslategrey-raccoon-448222.hostingersite.com` como `nodejs`, habilitado, pedido ativo `hostinger_premium_v3`, assinatura Premium Web Hosting até 15/03/2030. **Não é VPS.** Metadados não comprovam cota de banco 20 GB nem capacidade livre.
- HTTPS Hostinger `/` identifica `service=persistflow`; `/healthz` confirma `authority=file`, `durable=true`. **Não reutilizar, modificar nem instalar o bridge nesse alvo.** A prova de saúde pontual não substitui teste de restart/redeploy do PersistFlow.
- Origem GitHub, commit implantado, versão Node e limites CPU/RAM do Node ativo permanecem não comprovados. Endpoints NodeJS documentados de settings/builds retornaram 404 pela superfície disponível; não inferir site inexistente ou ocioso a partir disso. A API de inventário funciona.
- Secret `HOSTINGER_API_TOKEN`: nome confirmado em `ops-codex-os`; valor não lido, escopo não comprovado e não copiado ao Punctum. Tokens GitHub não podem ser recuperados pela listagem de secrets.
- Documentação lida: `ops-codex-os/docs/persistflow-hostinger.md` no commit `fee07aad…`; README/design de `ops-persistflow-sandbox` na main `bc3249f…`. Documentos históricos não são prova de runtime; o README antigo da sandbox ainda diz implementação não iniciada.

## Correções e arquivos

- `worker/client/access.ts`: exige expiração, emissão, sujeito, e-mail e token de aplicação; não aceita JWT assinado sem `exp` ou tipo incorreto.
- `worker/client/router.ts`, `worker/client/response.ts`: erros de entrada Access em navegação HTML recebem página privada com orientação de retorno/contato, sem expor JWT/e-mail e sem formulário de senha. Respostas JSON da API e flag desativada permanecem preservadas.
- `worker/client/password-provider.ts`: rejeita chave de bridge igual às chaves de sessão; lê no máximo 2048 bytes de resposta, cancela excesso; normaliza credenciais não utilizáveis em trabalho dummy e negação genérica. HTTPS, caminho fixo, redirect error, timeout e falha fechada permanecem.
- `services/punctum-password-bridge/{server,index,replay-store}.mjs`: armazenamento durável de nonces com criação exclusiva atômica, obrigatório fora do deployment; concorrência antes do primeiro await, limites e timeouts; validação estrita de hash/salt. Nenhuma conta, cookie ou permissão é emitida pelo serviço.
- `scripts/lib/private-preview.mjs`, `scripts/private-galleries-preview.mjs`: removem limite de CPU pago e distinguem 401 sem app de 302 para team/AUD reais. O piloto de domínio continua declarando sessão sintética e resultado parcial.
- `.env.example` e documentos operacionais: flags e segredos explícitos; bridge off; configuração/rollback e impedimentos atualizados.
- Regressões: testes de JWT, bridge, provider e configuração do piloto. Nenhuma migration alterada; migration 0009 mantém PBKDF2 >=310000 e domínio relacional isolado.
- Commit de autenticação: `8dbe2944f01f16b93586b8e8adb071d0f7db6b5a`, enviado e relido no HEAD da PR. As atualizações de dependências são um segundo conjunto, com validação própria abaixo.
- `package.json`, `package-lock.json`, `.github/workflows/deploy.yml`: Next 16.4.3, Zod 4.6.7, Vite 8.3.5, Vitest 4.1.12, Wrangler 4.152.0 e componentes Cloudflare compatíveis. Overrides fixam image-size 2.0.4, sharp 0.35.5, undici 7.30.1 e Zod corrigido; somente o consumidor legado `@esbuild-kit/core-utils` recebe esbuild 0.25.12. Não foi usado `npm audit fix --force`. Não houve migração de framework nem alteração de migrations.

## Evidência de testes neste checkpoint

| Verificação | Resultado observado |
| --- | --- |
| CI histórica em 39987795196 | Reconsultada: success para o HEAD baseline; não prova o HEAD futuro |
| Baseline Node original | PASS 4/4 antes das correções |
| Regressões Node antes da correção | FAIL reproduzido: replay em outra instância, startup sem store, concorrência antes do body, coerção de hash/salt; rate limit também falhou no teste dedicado |
| Node final | PASS 10/10, incluindo novo processo Node contra o mesmo armazenamento de nonces e compatibilidade Unicode PBKDF2 independente |
| Suíte original + novas regressões Worker | 158 PASS, 3 FAIL esperados: JWT sem claims, reuso de chaves e stream sem limite durante leitura |
| Worker após correção focada | PASS 11/11; typecheck PASS |
| Regressão posterior `ACCESS_ONLY` | FAIL reproduzido: 503 em vez de negação genérica; corrigida, passou durante execução completa em andamento |
| Preview helper | Red: limite pago e ausência de reconhecimento de Access; Green: PASS 6/6 |
| Execução Windows concorrente anterior | FAIL: teste de autorização de mídia excedeu 20s; quatro erros de startup/encerramento workerd/ECONNRESET. Esta execução não foi aceita como evidência positiva. Tipagem opcional do novo helper também falhou e foi corrigida com JSDoc explícito |
| Suíte local, antes/depois das dependências | PASS: 40 arquivos, 164/164 testes em ambas as execuções; 88,50s e 109,62s respectivamente em 24/10. Node 10/10 novamente. Zero falhas/unhandled errors; `npm test -- --maxWorkers=1 --no-file-parallelism`; timeout/asserts originais preservados |
| Typecheck/lint/build após dependências | PASS: `npm run typecheck`, `npm run lint`, `npm run build`; Node 24.19.0. Também PASS `drizzle-kit check` e `git diff --check`. Warnings de sourcemap, futura configuração nativa Vite e classificação de rotas vinext não impedem build; fixture pública inválida ainda gera o aviso de raster já existente |
| Auditoria de dependências | FAIL inicial confirmado no lockfile: 20 entradas (1 critical, 12 high, 7 moderate). PASS após atualizações: `npm audit --json`, zero entradas em todas as severidades. Isso não prova ausência de vulnerabilidades desconhecidas nem exploração prévia. Pool Workers 0.23 emite aviso de renomeação/depreciação; migração para outro pacote fica fora desta correção |
| CI de autenticação | PASS [40123116360](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40123116360), SHA `8dbe294`; nova execução necessária após dependências |
| QA remoto de autenticação | PASS domínio [40123168662](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40123168662), SHA `8dbe294`. Relatório `partial-access-otp-required`, `accessProviderTested=false`, `productionTouched=false`; entrada `access-redirect`; 10 uploads e retry, publicação, favoritos, download, negação de mídia pública, 70 linhas D1 e 30 objetos R2 restaurados e verificados; archive/reset/disable revogam. Cookie HMAC sintético somente em QA. Nova execução necessária após dependências |
| UX de erro no login | Red reproduziu JSON bruto para navegação HTML; Green incluído nos 164 testes: página privada recuperável, sem senha enganosa, API JSON preservada |
| Navegador QA | Tela real Cloudflare “Log in to Punctum private albums QA 20261024” / “Send login code” observada |
| OTP verdadeiro | BLOCKED até interação segura com a credencial do proprietário; nenhum código lido de e-mail ou solicitado em chat |

## Riscos residuais e DoD

| Item | Gate atual |
| --- | --- |
| Arquitetura principal sem Workers Paid | PASS decisão e assinatura verificadas |
| D1/R2, PBKDF2 e separação PersistFlow preservados | PASS no código/escopo; runtime final ainda precisa de comparação |
| Correções com regressões | PASS local: suíte completa 164 + 10 Node |
| Typecheck/lint/build/suíte local | PASS |
| CI do HEAD final | BLOCKED até execução verificada |
| App/política e UI real Access em QA | PASS configuração e tela; não equivale a autenticação |
| Entrega OTP, JWT real, sessão Punctum, logout/login novamente | BLOCKED credencial segura do proprietário |
| Cliente desconhecido/desativado/revogado com provedor real | BLOCKED login real; domínio tem testes locais e piloto separado |
| Upload, download, favoritos, isolamento e restauração no edge após correções | PASS piloto 40123168662 com sessão sintética; repetir após dependências. Identidade real continua BLOCKED |
| Bridge remoto/HTTPS, filesystem multi-instância, latência e outage reais | BLOCKED app isolado não identificada; secundário desativado |
| Android/iPhone físicos e aprovação LGPD/retenção | BLOCKED ação/decisão do proprietário |
| Produção, merge e ativação | BLOCKED autorização explícita; NO-GO enquanto os gates acima permanecerem |

Revogar a sessão Access não invalida automaticamente o cookie próprio já emitido; para revogação imediata usar desativação ou incremento de `session_version` no D1. Cookies de aplicação duram até 12 horas. Rate limit/concurrency do bridge são por processo e precisam de limite agregado na borda; réplicas com volumes de nonces separados não estão homologadas. Disponibilidade/entrega do e-mail são dependências do modo principal.

Revisão independente de segurança: somente leitura, sem Critical/Important confirmados no diff e código adjacente revisados. Os dois apontamentos de documentação (store de replay e identidade PersistFlow) foram corrigidos. A página de erro HTML foi adicionada em seguida e verificada por regressão red→green; não é uma alegação de nova revisão independente. A revisão não homologou OTP real, Hostinger remoto ou produção.

Não houve contratação, upgrade ou nova dependência de runtime. Operações/armazenamento em serviços já existentes continuam sujeitos às franquias e cobrança de uso do provedor, especialmente R2 Paid; não prometer custo de uso ilimitado zero.

## Ativação e rollback

1. Fechar suíte/CI, piloto de domínio e autenticação OTP verdadeira, incluindo falhas e revogação. Não usar cookie sintético como substituto de identidade real.
2. Obter decisões do estúdio sobre acesso, retenção/LGPD e usuários/cota. Aprovar explicitamente merge e ativação em produção.
3. Somente depois, criar app Access própria para o caminho de login de produção, política aprovada, AUD específico, chave de sessão independente e migrations/backups aprovados. Nunca aplicar app global ao portfólio.
4. Manter `CLIENT_AUTH_MODE=access`, bridge sem configuração e `PRIVATE_GALLERIES_ENABLED=false` até a janela aprovada. Mudança de modo invalida audience dos cookies.
5. Rollback: desabilitar a feature, manter D1/R2 e evidências, invalidar sessões conforme incidente; não apagar recursos nem fotografias. Restaurar versão verificada apenas na janela autorizada. Nunca voltar automaticamente ao PBKDF2 local no Workers Free durante outage.

## Continuidade

Estado específico e evidências ficam neste repositório/PR. Tentativas de criação e inspeção do run `punctum-auth-homologation-20261024` no conector PersistFlow retornaram erro interno; **persistência/takeover não estão declarados ativos**. O checkpoint compartilhado deve registrar esse bloqueio sem alterar o PersistFlow existente.

## Fontes técnicas verificadas

- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- https://developers.cloudflare.com/workers/platform/limits/
- https://github.com/hostinger/api-php-sdk/blob/main/docs/Api/HostingNodeJSApi.md
- https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/
- https://github.com/advisories/GHSA-vcvr-r3jv-pc5j
- https://github.com/advisories/GHSA-2464-fhr4-w9xw
- https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- https://github.com/advisories/GHSA-5p2g-fcmc-qvqq

As páginas Hostinger atuais descrevem Node em Business/Cloud; a API da conta lista um alvo Node em Premium. Essa diferença exige confirmação no hPanel/suporte, sem presumir direito a criar outro app nem realizar upgrade.
