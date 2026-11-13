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
## Proteção de armazenamento e recuperação sintética

O startup agora rejeita banco dentro da árvore do projeto, `public_html`, `hbuilds`, `public` ou `dist`, inclusive quando um symlink resolve para esses locais. Exige arquivo e diretório imediato com permissões exclusivas do proprietário e arquivo sem hard links. Isso impede configurações sabidamente inseguras; **não comprova persistência gerenciada**.

A proposta exata de build está em `hostinger-settings.candidate.json`. Ela preserva a raiz do repositório e mantém a saída interna em `dist/hostinger-qa`; o startup resolve a saída relativa ao módulo. É uma proposta para o primeiro QA autorizado após B/C/D, não uma configuração já aplicada ao provedor. As variáveis administrativas continuam exclusivas de QA. Não reutilizar `build` / `server.mjs` do probe no candidato.

`createQaSnapshot(source, target)`, de `migration-manifest.mjs`, usa backup online do SQLite e criação exclusiva de destino. Aceita somente banco marcado como QA. O manifesto inclui hash de schema, contagem e hash de **todas** as tabelas, integridade, relações e SHA-256 de cada BLOB sintético. Divergência editorial, original corrompido, referência dinâmica sem objeto ou destino existente falham. Referências `static:` são contadas separadamente: os bytes dos assets versionados não são certificados pelo manifesto SQLite. Nenhum comando desta ferramenta lê D1/R2 nem importa produção.

```bash
node --test services/punctum-hostinger-node/*.test.mjs
```

A suíte exercita escrita concorrente em dois processos, espera por lock, interrupção de uma transação não confirmada, reabertura íntegra e metadados de alterações em SQL com `RETURNING`. Os resultados locais/Actions continuam distintos de restart, rebuild, rollback e persistência na Hostinger.

