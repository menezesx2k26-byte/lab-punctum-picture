# 91 — Clerk Development: OTP real e contrato de configuração

**Resultado:** prova parcial de API, sem login web homologado. Releases A e B continuam **PARTIAL_VERIFIED / PRODUCTION_NO_GO**. Ajuste de configuração do [PR #46](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/46), fonte `524e4eafeff44e25acc3dc7716a47996f5f71b4a`, revisado independentemente e integrado somente à branch do PR #45.

## Autorização e ambiente

O usuário reafirmou que Maria cadastra clientes pelo caminho simples já definido no painel e orientou usar um e-mail dele quando o QA exigir OTP, pois não acessa o endereço dela. O e-mail do usuário foi obtido do perfil Gmail conectado e ficou fora destes artefatos. Esta prova criou uma conta de **operador de QA Development**; não criou clientes, membros de organização, vínculos remotos administrativos ou contas Production.

Aplicativo Development `app_3M14L9JyjaJ9ySitVTsQFf6xJ2A`, instância `ins_3M14L5pOMO7DQ8ZX4CW5bZ3w3eB`, issuer `https://causal-leopard-4871.clerk.accounts.dev`. O GET público de configuração confirmou Native API já habilitada, modo Development, cadastro com senha/e-mail e sem CAPTCHA nesse ambiente. Nenhuma configuração foi alterada para executar o teste. O servidor do produto usou bundle de `1f3a58a`, Node 24.19, origem loopback e D1/R2 novos, segregados e sem clientes.

O navegador interno retornou `Local browser access is unavailable for this chat`; a abertura da prévia foi enfileirada no Codex e não foi tratada como navegação executada. A prova adicional usou a [Frontend API oficial](https://github.com/clerk/openapi-specs/blob/main/fapi/2025-11-10.yml), blob observado `285bf1377436779b2e5a17c19a190a68cb43b58c`, em modo nativo já permitido. O [SDK oficial](https://github.com/clerk/javascript/blob/main/packages/electron/src/react/create-clerk-instance.ts) documenta Authorization de cliente em modo nativo. Não houve extração de cookies ou armazenamento do navegador.

## Prova executada

1. Criado cliente FAPI novo e identificado o endereço do operador; a instância respondeu `form_identifier_not_found`.
2. Preparado cadastro Development do próprio operador, com senha aleatória forte mantida somente em memória; a única exigência restante foi verificar e-mail.
3. Solicitado um OTP em `2026-11-22T18:05:41.875Z`. A conexão Gmail confirmou a mensagem Development com SPF/DKIM/DMARC válidos, mas ocultou o código. O usuário forneceu o fator diretamente; uma tentativa incorreta foi negada e a correção concluiu o cadastro. Nenhum código consta deste recibo.
4. FAPI retornou cadastro `complete`, sessão criada e JWT emitido. Claims observadas: issuer Development correto, `sid` presente, `azp` ausente no token nativo. Tokens e senha ficaram somente em memória; e-mail e identificadores pessoais foram excluídos dos artefatos públicos.
5. Troca por sessão administrativa no aplicativo local: HTTP 403, sem cookie. Criado vínculo **somente no D1 local** para o operador verificado e principal interno fictício; nova troca permaneceu HTTP 403, sem cookie. Nenhuma permissão de produção foi concedida.

Isso comprova entrega/validação do OTP e emissão de sessão na instância Development. Não comprova login web, `azp` do navegador, matriz Clerk A/B, revogação web, QA gerenciado ou aceite produtivo.

## Defeito de configuração reproduzido e candidato

O laboratório não recebeu `CLERK_SECRET_KEY`. No SDK instalado `@clerk/backend` 3.27.0, `authenticateRequest` exige essa chave mesmo quando `jwtKey` foi fornecida. O adaptador do produto capturava a exceção e retornava identidade nula, convertendo uma configuração ausente em 401/403 de login negado.

O candidato valida essa pré-condição na entrada do verificador SDK e retorna **503 / CLERK_NOT_CONFIGURED**, mantendo a mensagem genérica existente. O erro é propagado pelo tratamento já presente de falhas de serviço. Verificadores injetados em testes e modos legados mantêm seu contrato. Não se aceita token sem `azp` nem se remove validação de assinatura, issuer, sessão, origem, revogação ou vínculo explícito para obter um teste verde.

**RED:** dois testes de API com JWT RS256 válido e segredo SDK ausente receberam 403 no admin e 401 no cliente, onde era esperado 503. **GREEN:** ambos passaram após o guard; cinco testes fora do filtro foram explicitamente ignorados nessa execução focada. **Regressão:** 27/27 em quatro arquivos (`clerk-r4-security-matrix`, `clerk-pilot`, `clerk-logout-race`, `client-access`). Typecheck, ESLint dos dois arquivos funcionais e diff check passaram com exit 0.

Arquivos funcionais alterados: `worker/auth/clerk-auth.ts` e `tests/integration/clerk-r4-security-matrix.spec.ts`. Os helpers de laboratório são locais/ignorados e não integram o produto. Nenhum build completo ou suíte completa local foi repetido para esse patch; a CI executa o gate de integração.

## Limites e próxima ação

O segredo SDK ausente é a primeira barreira observada no adaptador; separadamente, o SDK exige `azp` autorizado, que o token nativo não contém. Não é correto afirmar que o vínculo D1 foi suficiente ou que o aplicativo já aceitou a sessão real. É necessário obter configuração Development pelo mecanismo autorizado e executar o fluxo web real quando o navegador interno estiver disponível. Não usar segredo fictício, token fabricado ou relaxamento de `authorizedParties` como prova remota.

O cadastro dos clientes pela Maria e o contrato legado de senha inicial/troca obrigatória permanecem preservados. G01–G24 e H01–H06 mantêm seus estados anteriores. A revisão CoS do SHA anterior continua sem parecer aceito; o estado de fila não é aprovação.

**Revisão do patch:** Gemini 3.8 Flash, conversa `1927ce03-0942-4df5-9dd6-42e32b828969`, examinou o SHA `524e4ea`, o guard, a propagação pelo verificador e os testes. Parecer: seguro para integrar, nenhum defeito Critical/Important/minor. O wrapper inicial retornou texto vazio; o parecer foi recuperado na mesma conversa. O revisor não leu diretamente o chunk do SDK por limite de permissão; o principal já havia verificado a exigência na instalação 3.27.0 e reproduzido os dois erros. Esse limite foi preservado, e o parecer não é aprovação do G19 inteiro ou de produção.

CI fonte `45055375132`: verify `137309329913` SUCCESS; Node `137309331212` SKIPPED pela regra de branch. A integração no PR #45 recebe CI própria de HEAD e prova Node; seu SHA/resultados são registrados no checkpoint de execução e Drive após o commit. Nenhuma CI de branch diferente foi atribuída ao HEAD integrado.

Não houve merge main, deploy produtivo, DNS, Clerk Production, associação de domínio, ativação R4 remota, suporte, contratação ou restore destrutivo. A conta/sessão Development do operador e o vínculo local são recursos de QA desta execução, não autorização de release.
