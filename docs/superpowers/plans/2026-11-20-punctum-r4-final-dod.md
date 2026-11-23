# Punctum R4 | Plano de conclusão operacional

**Objetivo:** homologar os álbuns privados no candidato Node 24 da PR #42, com as evidências dos 24 gates e custo incremental de R$ 0,00.

**Baseline:** `18193a9fcda873df12536624444e45b315e0324d`, base `f0f951d9f30225d717c1f82df7661889e287ec34`, [CI 44787355848](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44787355848), produção `NO_GO`. Use a [reconciliação G01–G24](../../operations/private-albums-r4/16-original-g01-g24-reconciliation.md) e mantenha as provas históricas com seus SHAs e ambientes.

## 1. Build e runtime local

- [x] Em Linux e Node 24, executar `npm ci`, `npm audit --audit-level=low` e dois `npm run build:hostinger:candidate` em saídas limpas do mesmo SHA.
- [x] Em `services/punctum-hostinger-production/build-equivalence.test.mjs`, provar que divergências adicionais, arquivos ausentes e valores inconsistentes falham. Implementar a comparação SHA-256 em `scripts/hostinger-candidate-build-equivalence.mjs`. Restringir a normalização aos valores gerados de Draft Mode, prerender e build ID nas posições confirmadas no Vinext 0.0.50. Conferir a consistência da mesma build e emitir somente caminho, contagens e resultado sanitizado.
- [x] Validar SSR, Draft Mode e a suíte gerenciada em Linux.
- [ ] Conferir a matriz de integração, os dois jobs e os artefatos do SHA publicado no CI antes de fechar os gates aplicáveis.

## 2. Origem gerenciada e Clerk

- [x] Conciliar a leitura dos painéis em `docs/operations/private-albums-r4/execution-state.json`. O Premium exibe limite atingido para um segundo app Node. A instância Clerk de produção exibe sessão web máxima de 7 dias, OTP por e-mail e domínio verificado.
- [ ] Aguardar uma origem HTTPS isolada, aprovada para o Punctum e dentro do orçamento zero. Confirmar pedido, certificado, hostname, Node 24, entrypoint, volumes privados, cron e logs antes de publicar qualquer candidato. Usar o hostname exato na configuração e manter a validação fechada para outros hosts.
- [ ] Reusar os scripts Clerk, Node e Playwright com identidades de QA autorizadas. Verificar OTP real, vinculação administrativa e de cliente, expiração, logout, revogação, isolamento A/B, redirects e negação de sessões antigas.

## 3. Homologação e recuperação na origem aprovada

- [ ] Exercitar cadastro, rascunho, publicação, arquivo, capa, ordem, lightbox, favoritos e download. Verificar 25 MiB exatos, um byte acima, SHA-256 de ida e volta, retry, duplicata, concorrência, interrupção, MIME e falhas de persistência e processamento. Conferir GET e HEAD indevidos e zero bytes privados, inclusive via CDN e otimizador.
- [ ] Comparar Studio, Colagem, hero, portfólio e rascunhos com o baseline. Validar 320–1440 px nas oito larguras do GOAL, teclado, zoom, foco, reduced motion, mouse e touch. Registrar o ensaio físico de TalkBack e VoiceOver com o responsável.
- [ ] Exercitar backup, restart, rebuild, restore descartável, hashes, SQLite, originais, sessões, rollback e reabertura. Medir RTO e RPO. Registrar cold start, SSR, API, upload/download, concorrência, CPU, RAM, disco, limites e custo do pedido. Manter G17 aberto até a medição e o aceite da equivalência do critério Node.

## 4. Evidência e aprovações

- [ ] Registrar os 24 gates com estado canônico, SHA, ambiente, comando, evidência, falha, responsável, bloqueio e próxima ação. Vincular evidências locais, remotas e humanas a seus escopos.
- [ ] Obter parecer independente no SHA exato, aceite do contrato Clerk frente ao Access e aprovação LGPD da controladora. Tratar integração, publicação com a flag desligada e ativação/cutover como autorizações distintas.
- [ ] Entregar o relatório no formato do GOAL e verificar o checkpoint no Git. Preservar Cloudflare público, DNS, dados históricos, fotos, VPS da Conthabil e orçamento. Manter `NO_GO` enquanto houver gate obrigatório pendente.
