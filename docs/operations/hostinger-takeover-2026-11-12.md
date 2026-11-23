# Punctum Picture — takeover executado em 12/11/2026

Estado: **PARTIAL_VERIFIED**. **NO_GO_MANAGED_DEPLOY / NO_GO_PRODUCTION / NO_GO_R4**.
Este relatório é um checkpoint verificável; a conclusão da CI do commit que o contém deve ser consultada na PR #33 e no comentário final de execução.

## A. Estado herdado e reconciliação

Handoff anexado lido integralmente. Repositório: `menezesx2k26-byte/lab-punctum-picture`.
Reconciliação autenticada preservou main e toda a genealogia, sem merge ou force push:

| Referência | SHA no início do takeover |
|---|---|
| main | 0636ab7105cf54455bf7db9ad640471ea764e5a2 |
| PR #24 | 50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd |
| PR #32 | 5dd21c1b5b9b494427134663b854edc10b829f32 |
| PR #33 | 52962596dcdcc066077e8ea4b5645d4d1ac4b6cc |

As três PRs estavam abertas, draft e sem merge. #33 continua sobre #32; #32 contém #24. Os comentários 6834244167 e 6834261736 foram lidos. O Drive canônico sgtmenezes foi consultado e identificado como documento anterior ao último SHA do handoff. Nenhuma divergência concorrente foi sobrescrita.

O terminal desta sessão tem Node 24.22.1; não tem credencial gh/GitHub nem checkout Pichau. A cópia de trabalho focalizada foi obtida pelo conector autenticado, com SHA de blob conferido para 31 arquivos herdados. A suíte integral é executada pelo checkout completo do Actions. Codex Native2 não dispõe do turn_token necessário nesta solicitação; nenhum token foi inventado. A integração Chat on Steroids/Pichau não está exposta no inventário desta sessão. Engram/PersistFlow também não têm ferramenta conectada utilizável, inclusive após descoberta de plugins. Não se afirma gravação nem teste de conexão nesses sistemas.

## B. Trabalho executado

Commits preservam a branch existente `agent/hostinger-node-migration-20261112`:

- `fea92f4676c4c8b048b120d8a6ae8e70db32d26b`: inventário ampliado, somente leitura.
- `fdc931cf85b308aeab06aee004b5464e523abd74`: reaplicação dos headers autenticados já usados pelo workflow. A primeira extensão recebeu 403; a consulta original da mesma execução recebeu 200. Após corrigir o formato da requisição, a extensão também recebeu 200.
- `d2dc651146d7f94441d7999444f79a1c60df334f`: guardas de armazenamento privado e metadados SQLite corretos para RETURNING, com testes.
- `bdbce850f926c402c3e445b7d4a9a66b6e3cd796`: manifesto de recuperação sintética, proposta de settings e evidência de navegador.
- `b1776d5a7d2b1647381a875ec7b45c1e8f61f91b`: descoberta de bancos limitada e remoção do inventário duplicado por push.

### Correções comprovadas

1. O runtime aceitava SQLite absoluto em public_html/hbuilds e arquivos legíveis por terceiros. Os testes RED reproduziram ausência de rejeição. O startup e o adaptador agora verificam caminho canônico, árvore de deploy, permissões do arquivo/diretório e hard links. Symlinks para diretórios públicos também falham. A marca sintética do banco continua obrigatória.
2. UPDATE com RETURNING executava a alteração mas informava meta.changes=0. O teste RED observou 0 em vez de 1. O adaptador agora conclui a execução antes de calcular alterações e duração; SELECT e CAS sem correspondência continuam com zero.
3. Dois processos independentes realizaram 80 incrementos confirmados, com espera por lock. A interrupção SIGKILL de um processo sintético com transação aberta não persistiu a escrita não confirmada. A reabertura passou em integridade. Isso testa o filesystem local/runner, não o filesystem da Hostinger.
4. createQaSnapshot usa backup online e destino exclusivo 0600. inspectQaManifest verifica identidade QA, integridade, chaves, todas as tabelas e SHA-256 dos BLOBs. Detecta divergência editorial e bytes corrompidos; não sobrescreve destino existente. As 113 referências static: são classificadas separadamente; seus bytes não são certificados por um snapshot SQLite.
5. A CI herdada apresentou timeout de screenshot/font readiness e depois de navegação. O teste Node passou a reutilizar o helper de captura já existente e testado, registrar modo de captura/falhas de recursos e SHA, e usar navegação limitada a 30 s. Falhas reais continuam reprovando QA. Nenhuma mudança de frontend ou substituição do Studio foi feita.

A proposta exata `services/punctum-hostinger-node/hostinger-settings.candidate.json` usa build_script=build:hostinger:qa, entry_file=services/punctum-hostinger-node/server.mjs, Node 24, npm e raiz/output personalizados null. Ela **não foi aplicada ao serviço**. O bundle continua em dist/hostinger-qa, resolvido relativamente ao módulo.

## C. Evidências e limites

[CI do checkpoint b1776d5](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43298687591):
job hostinger-node-qa **success, 10/10**. Inclui build Vinext/Sharp, SSR após edição SQLite, HTTP/SEO/noindex, sessão sintética, Studio, formulário, upload, capa, publicação, arquivamento, negação de mídia, backup e manifesto. Chromium: 390 e 1440 px; a conclusão e o modo efetivo de cada captura constam do summary.json. O job verify estava em execução no fechamento deste checkpoint; o recibo final na PR registra a conclusão no SHA corrente.

[Inventário do checkpoint b1776d5](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43298687657): **success como coleta**, com falhas por endpoint registradas. Não é aprovação da hospedagem.

[Inventário completo dos dois builds fdc931c](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43297648174):
os dois logs responderam 200; 47 linhas por build. Hashes sanitizados:
- build 01a1847b-73bf-71a9-8bd4-59a2836a1b1a: 1cbc56c4e5d30448185b2ac2e8e893b6ebb4f0dc71a7b3b3e24dc3feb8b22168
- build 01a18461-9f2e-7139-b1c1-9d19df785cca: 45b774381ccaa98bf89004f35a7ff613b5b5312fc07542fb369d3ef9c640c66b

Ambos são deployments por archive, completed, com a tupla do probe. Os logs brutos não foram publicados. O inventário posterior preserva erros intermitentes 500/timeout sem convertê-los em inexistência de arquivos.

O ZIP privado do Drive foi baixado: **2.384 bytes**, SHA-256 **918755f5d4c1ebb1064cafceb4dfbfc20491a309d47147c6fe6e57a2731a75ca**, quatro membros correspondentes à fonte versionada. O probe local passou 2/2. O HTTPS gerenciado confirmou identidade v2, Node v24.22.3, nonce correto e ssrValidated=false.

API: site Node existente; pedido correspondente plan.name=hostinger_premium_v3; settings atuais build/server.mjs, Node 24/npm. Ambiente retornou zero variáveis na coleta anterior; a consulta posterior teve timeout. Document root retornou um arquivo e nenhum dos quatro arquivos do probe. A API de conteúdo não recuperou esses arquivos. A consulta filtrada de bancos retornou 422 sem campo inválido identificado; não se conclui ausência de MySQL. A coleta final adiciona a consulta sem filtro e autodetecção do arquivo de build anterior quando o caminho retornado é relativo e seguro.

O hPanel foi novamente aberto e redirecionou para auth.hostinger.com/login. Sem sessão autenticada, não houve intervenção no File Manager. Os dados de pedidos retornados expõem apenas o nome do plano; memória, CPU, slots, disco disponível e direito de novo build sem cobrança não são comprovados.

Fontes oficiais reconfirmadas:
- [deploy, diretórios e retenção](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [limites e planos Node](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/)
- [API Node](https://github.com/hostinger/api-php-sdk/blob/main/docs/Api/HostingNodeJSApi.md)
- [API de arquivos](https://github.com/hostinger/api-php-sdk/blob/main/docs/Api/HostingFilesApi.md)

A documentação oferece Node em Business/Unlimited e Cloud e descreve diretórios administrados, duas versões retidas, processo/memória compartilhados e timeout de request. Ela não certifica o contrato Premium legado. A API de arquivos limita leituras ao document root e recusa travessia de symlinks; não é acesso ao diretório privado externo necessário.

## D. Gates

| Gate | Estado | Evidência / bloqueio efetivo |
|---|---|---|
| A — Reconciliação | PASS | SHAs e genealogia autenticados, branch preservada, commits fast-forward |
| B — Probe/rollback | PARTIAL_VERIFIED | ZIP e fonte íntegros, probe vivo; falta restauração gerenciada em destino seguro e rollback ensaiado |
| C — Persistência | PARTIAL_VERIFIED | Guardas, concorrência, transações e restore locais/CI; sem diretório externo/restart/rebuild gerenciado comprovados |
| D — Capacidade | PARTIAL_VERIFIED | Serviço e plano identificados; cotas efetivas, Sharp no destino e novos builds sem cobrança não comprovados |
| E — QA Node gerenciado | NOT_TESTED | Node/Chromium no Actions aprovados no checkpoint; B/C/D impedem substituir o probe |
| F — Paridade | PARTIAL_VERIFIED | Manifesto de todas as tabelas e recuperação sintética; falta snapshot/acervo real, bytes estáticos e focal/crop |
| G — R4/segurança | PARTIAL_VERIFIED | R4 desabilitado; matriz #32 preservada, sem sign-off novo |
| H — Cutover | BLOCKED_EXTERNAL | Gates anteriores abertos e aprovação específica não concedida |

A matriz R4 não foi substituída: G05/G17 continuam FAIL; G15/G19/G20/G22/G23 BLOCKED_EXTERNAL. Os 17 PASS históricos são vinculados ao escopo/SHA original. Testes da identidade sintética não certificam clientes reais, Access, aparelhos físicos ou revisão independente.

## E. Produção e custo

Produção observada: home 200, Studio anônimo 303 para acesso, entrada R4 404. As consultas autenticadas confirmaram 329 imagens prontas, 19 ensaios publicados, 10 categorias visíveis, bucket originais 230 objetos/372.040.548 B e backups 21 objetos/7.801.528 B, paginação completa.

Somente GETs do provedor, HTTP público e SELECT agregado D1 foram usados na reconciliação. Nenhum deploy, restart, settings/env, DNS, importação, edição de produção, limpeza, contratação, upgrade ou merge foi executado. A única escrita remota foi código/documentação na branch da PR e a continuidade autorizada no Drive. **Custo incremental contratado R$ 0**; viabilidade comercial do candidato Premium permanece aberta.

## F. Estratégia integral preservada

Não importar acervo antes de B/C/D/E. Após homologação sintética gerenciada:
1. Exportar snapshot consistente D1 em armazenamento privado; registrar identificador/instante, migrações reais, schema, todas as tabelas e contagens.
2. Preservar IDs, slugs, URLs, metadados, ponto focal, relações, histórico editorial e permissões. Não executar seeds de demonstração sobre banco real.
3. Inventariar R2 com paginação completa; separar originais, backups e assets versionados. Verificar bytes/checksum de cada objeto e referências em ambas as direções. Contagem de bucket não equivale à de fotos.
4. Ensaiar importação/restauração integral em destino segregado, validar todos os manifests e testes funcionais; medir focal/crop Sharp versus fixtures de referência antes de trocar imagens públicas.
5. Definir freeze editorial curto ou sincronização incremental com checkpoint, copiar deltas, repetir verificação sem divergência. Sem dupla escrita não ensaiada.
6. Manter Cloudflare, snapshots e configs como origem de reversão. Cutover exige autorização separada, preservação de e-mail/SEO e smoke/monitoramento. Não apagar Cloudflare.

O manifesto implementado aceita apenas QA marcado; não é um importador de dados reais nem certificação de mídia estática ou algoritmo de foco. O adaptador de BLOBs é sintético; a persistência privada de originais reais ainda exige escolha e homologação.

## G. Próxima ação executável e continuidade

Pelo Actions, usar HOSTINGER_API somente dentro do job, sem extrair secrets: conferir o resultado de autodetecção do ZIP anterior e da listagem de bancos sem filtro. O acesso que falta para B/C é um destino gerenciado isolado comprovadamente incluído e um meio de operar o filesystem privado da conta atual, com restauração/restart/redeploy verificáveis. hPanel autenticado ou acesso administrativo equivalente deve ser reconciliado com essa mesma conta; a chave SSH histórica de outra conta/PersistFlow não resolve esse requisito.

A implementação e a regressão continuam executáveis pela PR #33. A prova final de CI, artefatos/digests e cópia de continuidade sgtmenezes são registrados no comentário final da PR após os jobs concluírem. Não usar o verde de um coletor para liberar deploy. **Manter os três NO_GO até provas específicas.**
