# Punctum R4 | Ciclo AU de qualificação operacional

| Campo | Resultado |
| --- | --- |
| GOAL | `PUNCTUM-R4-PRIVATE-ALBUMS-OPERATIONAL-DOD` |
| RESULT | `PARTIAL_VERIFIED` |
| REPOSITORY | `menezesx2k26-byte/lab-punctum-picture` |
| BRANCH / PULL_REQUEST | `cursor/r4-aj-security-phase-b-ae72` · [PR #42](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/42) |
| HEAD de entrada | `18193a9fcda873df12536624444e45b315e0324d` sobre `f0f951d9f30225d717c1f82df7661889e287ec34` |
| CI de entrada | [44787355848](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44787355848), `verify` e `hostinger-node-qa` aprovados nesse SHA |
| SHAs e CI do delta | [Código 854f11f](https://github.com/menezesx2k26-byte/lab-punctum-picture/commit/854f11fe4623d40b892078fbd9810c3e9592c02a) · [checks do HEAD na PR](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/42/checks) |
| COST / PRODUCTION | R$ 0,00 de custo incremental · `NO_GO` |

## Alterações e verificações

- [Plano incremental](../../superpowers/plans/2026-11-20-punctum-r4-final-dod.md) e [matriz G01–G24 em execution-state.json](execution-state.json), chave `currentCycle20261120AU`.
- Comparador SHA-256 do candidato, seis testes de regressão e inclusão no job Node 24. O Vinext 0.0.50 também emite um build ID aleatório em três posições do RSC, usadas por metadados da requisição, cache ISR e grafo RSC. A qualificação normaliza essas três posições e as posições dos segredos de Draft Mode e prerender. O comparador exige consistência dentro da build, renovação entre builds e igualdade dos demais bytes. Os valores ficam fora da saída.
- Revisão independente de leitura do [Vinext v0.0.50](https://github.com/cloudflare/vinext/tree/v0.0.50), CoS `a03e1ec3-acb8-47a6-aee0-32cd02a959f0` / `worker-1`. A origem dos dois valores foi confirmada também no tarball cujo SHA-512 consta no lockfile. Essa revisão cobre a geração dos valores e o desenho da comparação. G19 exige parecer independente sobre o produto e o SHA de entrega.
- Node 24.21.0 em Linux. `npm ci` instalou 557 pacotes e `npm audit --audit-level=low` retornou zero vulnerabilidades. Em dois builds limpos no SHA de entrada, `node scripts/hostinger-candidate-build-equivalence.mjs build-a build-b` comparou 555 arquivos. 552 são idênticos byte a byte. `server/index.js`, `server/ssr/vinext-server.json` e `server/vinext-server.json` são estruturalmente equivalentes após a normalização restrita. O build do worker agendado e a suíte POSIX do adaptador gerenciado, restauração SQLite e preflights concluíram com código 0.
- Smoke no candidato compilado com banco de QA descartável. Health e SSR público retornaram 200, Draft Mode retornou 200 com `no-store` e a rota de prerender retornou 403 sem segredo ou com valor inválido. Com o valor da mesma build, a requisição passou pelo controle e retornou 404 para a rota de parâmetros consultada. A evidência registra apenas status e comportamento de cache.

## Hostinger e Clerk

- **Hostinger.** No hPanel do Punctum, o site Node existente corresponde à identidade do [pedido 1008628483 no preflight](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44783616955). O Premium mostra 1 núcleo, 2.048 MB de RAM, 20 GB e 80 processos. O deploy atual é um ZIP manual de 15/11. O assistente de um segundo app Node parou em **limite atingido**, com oferta de upgrade. A tela de logs retornou falha ao carregar. O cron de backup está cadastrado para `17 1 * * *`, com última execução ainda sem comprovação. Acesso ao painel confirmado. HST-01 segue aberto pela falta de origem isolada em HTTPS. [Painel Punctum](https://hpanel.hostinger.com/websites/punctumpicture.com)
- **Clerk.** O navegador abriu em Development e o seletor levou à instância de produção reconhecida no preflight. O dashboard mostrou OTP por e-mail para login e cadastro, máximo web de 7 dias, inatividade desativada, domínio `punctumpicture.com` verificado e certificados emitidos. Os fallbacks de login e cadastro usam o domínio padrão. O código da aplicação encaminha a sessão de cliente para `/albuns` e a administrativa para `/admin`. A leitura resolve a lacuna documental sobre duração máxima. A prova de entrega do OTP, logout e revogação permanece pendente. [Política Clerk](https://clerk.com/docs/guides/secure/session-options)

## G05–G24 e próximas ações

- **UPLOAD_25_MIB / PRIVATE_GALLERIES.** `node scripts/hostinger-r4-25mib-local-proof.mjs` passou 49 verificações no candidato compilado em loopback, com fixture sintética e autenticação legada de QA. O original de 26.214.400 bytes foi recuperado com SHA-256 `c16e100efa8b3233461abdf30df0be13c291ed17c5cd4f6c4dbc40c562aab4ce`. O ensaio incluiu limite +1, upload curto, checksum inválido, interrupção, retry, capa, publicação, favoritos, autorização de download e negações A/B e anônimas. G03–G14 seguem pendentes na origem homologada com Clerk.
- **BACKUP_RESTORE / ROLLBACK.** Exercitar persistência após restart e rebuild, restore descartável e retorno à versão anterior na origem aprovada. Registrar SHA-256, integridade SQLite, sessões, RTO e RPO. G17 mantém a falha medida no Worker público e depende da medição e do aceite do critério Node.
- **SECURITY / LGPD.** Faltam revisão independente formal G19, aprovação LGPD G20, aceite da equivalência Access/Clerk, matriz assistiva física G15 e autorizações de release G22. Revisão formal, publicação com flag desligada e ativação/cutover são decisões separadas.
- **NEXT_SAFE_ACTION.** O responsável pelo Punctum indica uma origem HTTPS isolada, vinculada a recursos autorizados e sem custo incremental. Engenharia comprova o ambiente antes de publicar qualquer candidato de QA. Preservar o tráfego Cloudflare, o site principal, a VPS Conthabil, os dados e os backups históricos.
- **DURABLE_CHECKPOINT.** O plano, este relatório e o ledger são a trilha primária em Git. A SPEC integral permanece indisponível no checkout e nos anexos consultados. A [reconciliação versionada](16-original-g01-g24-reconciliation.md) é a referência de contingência.
