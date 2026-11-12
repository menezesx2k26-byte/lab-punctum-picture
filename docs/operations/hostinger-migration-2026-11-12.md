# Punctum Picture na Hostinger

12/11/2026 · **PARTIAL_VERIFIED** para o candidato Node. **NO_GO** para deploy do candidato no QA gerenciado, cutover do domínio e ativação do R4.

## Baselines e origem

| Referência | SHA | Uso |
| --- | --- | --- |
| `main` | `0636ab7105cf54455bf7db9ad640471ea764e5a2` | Baseline do repositório para produção |
| [PR #24](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/24) | `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd` | Probe e trabalho anterior de R4 |
| [PR #32](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32) | `5dd21c1b5b9b494427134663b854edc10b829f32` | Base R4 do candidato, já contém a #24 |
| [PR #33](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/33) | `ec0af24462199b7cd561803c42e9f77bd5ba1f73` | Código Node, branch `agent/hostinger-node-migration-20261112` |

A análise do merge-base mostrou que o diff líquido das alterações exclusivas de `main` é um recibo operacional de permissão Cloudflare, sem mudanças no código do Punctum. As duas PRs de R4 seguem em rascunho.

O site público respondeu em home, portfólio, arquivo, contato, SEO, hero e API. O acesso anônimo ao Studio redirecionou ao login, e a entrada dos álbuns respondeu 404. A API pública contou 329 fotos, 19 ensaios e 8 categorias com ensaios publicados. O D1 registrou 329 imagens prontas, 19 ensaios publicados, 10 categorias visíveis e a tabela de versões editoriais. A consulta pública conta as categorias ligadas a ensaios publicados.

O inventário autenticado confirmou o Worker `punctum-picture-migration`, D1, Assets, Images, a configuração do segredo de sessão administrativa por nome e os dois buckets. O bucket de originais listou **230 objetos / 372.040.548 bytes**. O de backups listou **21 objetos / 7.801.528 bytes**. As duas paginações chegaram ao fim. Os objetos incluem categorias de armazenamento que não equivalem à contagem de fotos do site. O WebP público do hero e o arquivo versionado tiveram SHA-256 idêntico, `03eac5f8f42d4ab0b97089a4c82124e5c13979af5739812e549070d16552c5f1`. Os originais do R2 só foram inventariados por metadados. [Inventário somente leitura](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43291670124)

## Evidência do Node

O candidato reaproveita as rotas App Router, SSR Vinext, handlers, migrações SQL e verificações de acesso existentes. Ele executa em Node 24 com SQLite identificado como QA e Sharp para validar e redimensionar imagens. O teste local mudou o título no banco durante a execução e verificou o HTML atualizado. Exercitou formulário, autenticação administrativa, Studio, logout, upload de PNG sintético, definição de capa, publicação, acesso à mídia, arquivamento e negação de mídia arquivada. O backup SQLite restaurado passou em integridade, chaves estrangeiras e SHA-256 dos bytes do original sintético. Um lote com erro reverteu integralmente. `lint`, `typecheck`, 308 testes Workers e as duas suítes Node passaram.

Os dois jobs da [CI de f44764e](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43291670224) concluíram com sucesso. O [ZIP de ec0af24](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43291440488/artifacts/13977381720) foi baixado e comparado ao digest do GitHub. Contém quatro capturas e resumo Chromium. As páginas de QA e de produção renderizaram a 390 e 1440 px, com CSS carregado, sem overflow horizontal e sem erro de página. As capturas usam configurações editoriais diferentes. Em outro ensaio local, copiei exclusivamente o JSON já público de `/api/public/site` para um SQLite temporário. O candidato devolveu os mesmos objetos `site` e `siteConfig`, e a home devolveu o mesmo H1 e conjunto de classes estruturais. SHA-256 do JSON normalizado de configuração `de3355a266b98cf7e790e3569f96a690676785297ca7baf86dfed05511987c32`. Isso comprova portabilidade dessa configuração publicada. A paridade visual com o acervo e o histórico editorial completo ainda precisa de homologação.

## Hostinger e restauração

A API autenticada com o secret `HOSTINGER_API` confirmou o site Node ativo no plano existente **Premium Web Hosting**, código `hostinger_premium_v3`. Confirmou dois builds concluídos, nenhuma variável de aplicação registrada e a configuração `other`, Node 24, npm, script `build`, entrypoint `server.mjs`, sem root/output personalizado. O probe HTTPS respondeu com `r4-node-probe-20261028-v2`, Node `v24.22.3`, nonce correto e `ssrValidated=false`. A documentação pública oferece Node gerenciado para Business/Unlimited e Cloud. A existência deste serviço no Premium comprova a capacidade atual de executar o probe neste site. Cotas efetivas, direito a um novo build, armazenamento persistente, MySQL provisionado, tráfego e uso real permanecem sem confirmação. [Planos Node](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)

A consulta do document root encontrou um item e nenhum dos quatro arquivos do probe. As leituras de arquivo retornaram HTTP 422 com indicação de indisponibilidade. O hPanel redirecionou para login. Reconstruí o ZIP da fonte versionada, conferi seus quatro membros e testei o build e o health da restauração local. O [ZIP reconstruído no Drive](https://drive.google.com/file/d/1cOBDXvuyiQqIFb8Lijw7346Plx-ft58T/view) tem 2.384 bytes e SHA-256 `918755f5d4c1ebb1064cafceb4dfbfc20491a309d47147c6fe6e57a2731a75ca`. A configuração foi recuperada do provedor. O ZIP reconstruído e o ensaio local deixam pronta uma opção de recuperação. Ainda falta comprovar a restauração no serviço gerenciado. A API documenta que iniciar um build pode sobrescrever os arquivos do site. [API oficial de builds](https://github.com/hostinger/api-php-sdk/blob/main/docs/Api/HostingNodeJSApi.md)

## Decisões de migração e próximos gates

| Área | Estado e ação |
| --- | --- |
| Node na Hostinger | Build e SSR locais aprovados. Verificar um caminho de rollback gerenciado do probe e um diretório privado persistente antes do primeiro deploy isolado. |
| Dados | O SQLite preserva as migrações e o padrão de transações do D1 no candidato. Confirmar persistência e locking no destino antes de escolhê-lo para produção. MySQL exigiria adaptação de SQL, inclusive upserts, índices parciais e consultas com `RETURNING`. Uma ponte D1 autenticada exige prova de transações e escopo de credenciais. |
| Fotos e backups | Validar snapshot consistente em ambiente privado, contagens, referências e SHA-256 dos originais. O recibo histórico do D1 de 23/08/2026 não representa o estado de hoje. Manter R2 privado até concluir a estratégia de mídia. |
| Segurança | Login e Studio testados com identidade sintética. Validação do Access, sessões reais, persistência de auditoria, rotinas agendadas e enquadramento por ponto focal no Node permanecem pendentes. A flag de álbuns está forçada a desligada no candidato. O R4 mantém G05/G17 e gates externos em aberto. |
| Domínio e custo | Nenhum custo contratado nesta execução. Certificado, compatibilidade com cotas, estabilidade, rollback de tráfego, proteção dos registros de e-mail e smoke pós-cutover dependem da homologação do destino. O domínio principal segue na Cloudflare. |

Nenhum build, alteração de ambiente ou upload ao site gerenciado foi iniciado. O inventário não alterou D1, R2, Studio, DNS ou produção. O próximo gate é confirmar a restauração do probe no destino existente e homologar o QA com dados sintéticos antes de migrar qualquer estado de produção.
