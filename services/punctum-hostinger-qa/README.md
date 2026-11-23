# Probe Node/HTTPS — Punctum QA

App temporário e independente para verificar o runtime Node e a URL HTTPS do provedor. Nenhuma dependência, fotografia, credencial, acesso D1/R2 ou integração PersistFlow. Não executa o SSR do Punctum e não homologa G17.

No onboarding Hostinger, escolher **upload dos arquivos** e este ZIP em app **novo e separado**, associado ao plano já contratado. Se aparecer upgrade/cobrança ou destino existente, interromper antes da confirmação. Não usar os apps PersistFlow como destino.

- Node: 22 ou 24, conforme disponível.
- Build: `npm run build`.
- Start: `npm start`.
- Porta: variável `PORT` fornecida pelo serviço, sem porta manual exposta.
- Nenhum segredo ou variável adicional.

Após a criação autorizada, observar a URL temporária HTTPS e consultar `/health?nonce=qa-20261028`. Esperado: HTTP200, `Cache-Control: no-store`, `service=punctum-hostinger-qa-probe`, Node real, RSS/uptime e nonce correspondente. Repetir em processo/restart gerenciado somente quando isso estiver autorizado e isolado.

HTTPS200 não prova SSR, CPU/RAM contratados, disponibilidade contínua, custo efetivo, D1/R2 ou recuperação. Registrar essas etapas separadamente. O pacote não cria nem altera infraestrutura sozinho.

Versão v2: o entrypoint chama `listen()` também quando importado pelo gerenciador Hostinger. A factory testável fica em `app.mjs`; não adicionar guard de execução direta ao `server.mjs`. Regressão reproduz importação em processo separado, socket HTTP real e deadline de 3s. Esperado no health: `version=r4-node-probe-20261028-v2`.
