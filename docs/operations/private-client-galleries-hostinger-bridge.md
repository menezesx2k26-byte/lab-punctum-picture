# Punctum — plano B2: Hostinger Node.js como coprocessador de senhas

**Estado:** spike implementado em PR #13, DESATIVADO por padrão, sem deploy da Hostinger, sem migração e sem custos contratados. **Não aprovado para produção.**  
**Investigação atualizada:** 2026-10-24. Decisão principal: Cloudflare Access Free; bridge permanece secundário e desativado.

## Evidência de infraestrutura e limites da inferência

- A API Hostinger conectada lista um site `nodejs` habilitado em `darkslategrey-raccoon-448222.hostingersite.com`. Em 24/10, HTTPS `/` retornou `service=persistflow`; `/healthz` retornou `authority=file`, `durable=true`. **O alvo serve PersistFlow e está excluído da instalação do bridge.** A origem GitHub e a versão do Node ainda não foram comprovadas por metadados de deployment.
- `menezes-platform/ops-persistflow-sandbox` contém documentação de design de 2026-09-16, porém o README da `main` informa que a implementação **ainda não havia começado**; é uma sandbox de execução, não um Identity Provider. Fonte: https://github.com/menezes-platform/ops-persistflow-sandbox
- `menezes-platform/ops-codex-os/docs/persistflow-hostinger.md` documenta um control plane PersistFlow real em Hostinger Node.js. Sua autoridade e credenciais são distintas; **nunca adicionar rotas de cliente nele sem revisão de isolamento**.
- A listagem de nomes confirmou `HOSTINGER_API_TOKEN` no repositório `ops-codex-os`, sem ler seu valor. Isso não comprova o escopo do token nem o torna disponível ao Punctum; nenhum secret Hostinger foi copiado ou compartilhado com o bridge.
- A cota específica de banco de 20 GB mencionada pelo proprietário não foi verificada nos metadados de assinatura; a implementação abaixo **não precisa do banco da Hostinger**.

## Escolha: terceirizar apenas CPU, não autenticação

```text
Browser Punctum (mesma origem)
   | POST /api/client/session (senha)
   v
Cloudflare Worker Free ---- D1 contas, salt e hash, rate limit
   | POST HTTPS assinado por HMAC (server-to-server)
   v
Hostinger Node.js ISOLADO
   | PBKDF2-SHA256 / 310000, native crypto.pbkdf2()
   v
JSON valid/credential sem cookie ou sessão
   |
   v
Worker: emite cookie HttpOnly e valida autorização D1 a cada rota
   |
   v
R2 originais privados, galeria e favoritos protegidos
```

Vantagens: o Punctum preserva o login nativo de senha temporária e troca obrigatória; não precisa copiar cliente/álbum para MySQL nem criar outra autoridade sobre permissões. Os 310 mil ciclos executam fora do Worker. A alternativa Access OTP continua existente e é **a escolha atual do preview**; usar Hostinger requer optar por `CLIENT_AUTH_MODE=password` explicitamente e reexecutar toda QA.

## Arquivos do spike

- `services/punctum-password-bridge/server.mjs` — serviço independente, endpoint `POST /internal/punctum-password/v1`, PBKDF2 nativo, HMAC SHA-256 de timestamp+nonce+body, limite de 4 KiB, quatro requisições admitidas antes da leitura do corpo, até 120 requisições autenticadas/minuto por processo, timeouts e healthz sem credenciais.
- `services/punctum-password-bridge/replay-store.mjs` — reserva atômica de nonce por criação exclusiva de arquivo, preservada entre reinícios. Todas as réplicas precisam montar o **mesmo diretório durável**, privado e externo ao deployment. Sem esse diretório o serviço não inicia. Apenas nonces são armazenados; nunca senhas, hashes, sessões ou dados dos clientes.
- `services/punctum-password-bridge/index.mjs` — entrypoint Node que lê `PORT` e `PUNCTUM_PASSWORD_BRIDGE_SECRET`.
- `worker/client/password-provider.ts` — adaptador opcional HTTPS do Worker; serviço não responde ou fornece dados inválidos => 503 (falha fechada), sem fallback silencioso para derivação local. As rotas `client-admin` (create/reset), `client-session` (login/troca) optam pelo backend por binding.
- `tests/unit/client-password-provider.spec.ts` + `services/punctum-password-bridge/server.test.mjs` — HMAC, algoritmo, integridade, replay, fail-closed e compatibilidade.

## Configuração em ambiente isolado (NÃO executar ainda)

**Worker de QA:** `CLIENT_AUTH_MODE=password`, `CLIENT_PASSWORD_BACKEND=hostinger`, `CLIENT_PASSWORD_SERVICE_URL=https://<domínio-qa-com-ssl>/internal/punctum-password/v1`, secret `CLIENT_PASSWORD_SERVICE_SECRET` aleatório com 32+ bytes.

**Hostinger app QA dedicada:** `PORT`, `PUNCTUM_PASSWORD_BRIDGE_SECRET` e `PUNCTUM_PASSWORD_BRIDGE_REPLAY_DIR` (caminho absoluto privado, fora do repositório e de `public_html`, `nodejs`, `hbuilds`). A chave deve ser independente de `CLIENT_SESSION_SECRET`, `ADMIN_SESSION_SECRET` e de toda credencial PersistFlow. Deploy a partir de **repositório específico aprovado**, sem usar o site PersistFlow identificado. A app não necessita acesso a D1, R2, GitHub ou ao banco Hostinger.

**Requisitos adicionais antes de piloto remoto:**
1. Identificar dono, aplicação e GitHub de implantação do Node ativo; provar que não é a autoridade PersistFlow nem um ambiente compartilhado com secrets operacionais.
2. Hospedar um **serviço separado**. Comprovar persistência do diretório de nonces após restart/redeploy e criação exclusiva atômica entre todas as réplicas; diretórios distintos anulam a proteção entre réplicas. Os testes locais incluem servidores independentes e um novo processo Node; não homologam o filesystem da Hostinger. Rate limiting e concorrência são por processo: a borda deve limitar o agregado, e a capacidade compartilhada precisa ser medida. Não reutilizar diretórios ou autoridade PersistFlow.
3. Testar HMAC assinado pelo Worker real e assinaturas inválidas; requisições não autenticadas devem receber 401. Reexecutar login, primeiro acesso, recuperação de senha, rotação de chave, revogação de sessão, dez uploads, isolamento entre clientes e restauração R2/D1.
4. Testar falha de rede sem fallback, latência e capacidade. O request ao Hostinger contém senha em TLS e hash/salt apenas durante a autenticação; avaliar LGPD, residência e logs de proxies e **nunca registrar corpos HTTP**. Reduzir exposição e rotacionar a chave se comprometida.
5. Confirmar que apps ou fluxos automatizados da Hostinger não sobrescrevem o diretório e que backups não capturam secrets. Estabelecer healthcheck, plano de incidentes e rollback.
6. Aprovar mudança de `CLIENT_AUTH_MODE` e `CLIENT_PASSWORD_BACKEND` somente após QA. Não automatizar promoção para produção; manter `PRIVATE_GALLERIES_ENABLED=false` até aprovação explícita.

## Critérios de decisão

- **Cloudflare Access Free:** menos superfície própria, mas requer IdP OTP e configuração correta de organização/AUD. Se a app real for ativada, tende a ser melhor para operação contínua.
- **Hostinger CPU bridge:** preserva UX com senha, não usa DB Hostinger nem Workers Paid; adiciona dependência operacional e tratamento de senhas por segundo serviço. Útil se o Access Free ficar bloqueado e se houver **instância Node isolada, saudável e monitorada**.
- **Não reutilizar o controle PersistFlow:** o domínio sugerido respondeu como PersistFlow em HTTPS. Sua função, autoridade e segredos permanecem separados da autenticação de clientes de fotografia.

## Endurecimento de 24/10

- Worker limita a resposta a 2048 bytes durante a leitura e cancela o stream excedente; HTTPS, caminho fixo, redirects proibidos e timeout de 5 segundos permanecem.
- Configuração rejeita reaproveitar chaves de sessão no bridge. Indisponibilidade/corrupção do backend retorna 503 sem fallback local.
- Credenciais `ACCESS_ONLY` ou inválidas executam verificação dummy no backend e resultam em negação genérica, sem revelar a existência da conta por um 503 específico.
- O servidor reserva concorrência antes de qualquer `await`, rejeita hash/salt não textuais e captura abortos de leitura sem registrar corpos ou credenciais.
- A compatibilidade com PBKDF2/310000 foi verificada contra `node:crypto` independente, inclusive senha Unicode. Não houve redução do fator de trabalho.

**DoD Hostinger bridge:** CI verde é apenas prova local; DoD global exige piloto remoto real, isolamento da app existente, incident/backup/LGPD, testes móveis e autorização de ativação.
