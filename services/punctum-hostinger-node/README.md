# Punctum Picture no Node.js para QA

O candidato usa o App Router, os componentes, as consultas e os handlers do Punctum. O servidor Vinext roda em Node 24, com SQLite para as tabelas de QA e Sharp para imagens. A inicialização rejeita bancos que não tenham a marca do seed sintético. O acesso R4 fica desligado e a origem aceita é localhost ou o QA Hostinger designado.

## Executar

```bash
npm ci
npm run build:hostinger:qa
node --test services/punctum-hostinger-node/server.test.mjs
```

Para iniciar, passe a `seed.mjs` o caminho absoluto de um arquivo SQLite novo, em diretório privado fora da raiz pública. Configure `PUNCTUM_QA_DB_FILE`, `PUNCTUM_QA_ORIGIN` e `PORT`. Execute `npm run start:hostinger:qa`. O entrypoint gerenciado é `services/punctum-hostinger-node/server.mjs`. O teste usa credenciais sintéticas descartáveis. Para abrir o Studio manualmente, configure o e-mail de QA, o SHA-256 da senha e um segredo de sessão separado nas variáveis `PUNCTUM_QA_ADMIN_EMAIL`, `PUNCTUM_QA_ADMIN_PASSWORD_HASH` e `PUNCTUM_QA_ADMIN_SESSION_SECRET`.

O build separa os arquivos do QA em `dist/hostinger-qa`. O build padrão do Cloudflare continua disponível no comando `npm run build`. A CI do QA usa Chromium em 390 e 1440 px e guarda o resultado da comparação com a home pública no artefato do job.

## Escopo

O SQLite local comprova as transações do candidato, a edição editorial e o backup sintético. A tabela de bytes de QA existe apenas para testar upload, publicação e restauração com fotos geradas. O redimensionamento usa os presets do produto e a implementação local aplica enquadramento central ou automático. A equivalência de ponto focal com Cloudflare Images, a persistência no servidor compartilhado e as rotinas agendadas seguem pendentes.

O rollout depende de recuperar os arquivos e as configurações do probe, confirmar a restauração no hPanel e validar onde guardar o banco de QA entre builds. Use o site temporário existente. A configuração, as sessões e os dados de produção continuam na Cloudflare. O QA sintético e o eventual cutover público têm gates próprios. A PR #32 conserva o NO_GO do R4.
