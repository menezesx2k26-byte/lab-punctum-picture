# Punctum Picture R5 — reconciliação de origem gerenciada (22/11/2026)

**Estado:** PARTIAL_VERIFIED / PRODUCTION_NO_GO, Releases A e B sem autorização.
**Escopo:** exclusivamente consultas autenticadas read-only e probes HTTP não destrutivos. Nenhum deploy, DNS, nameserver, Cloudflare, Clerk Production, dados de clientes, build, certificado ou configuração foi alterado.
**Baseline Git:** PR #45 draft; HEAD inicial `2999ecf80c7f156ddbf5b765fb7e289269a0a987`.
**Execução:** EXZA Remote conectado ao Martha (Windows); conexão API Hostinger destinatária, GitHub, navegador com leitura e fontes oficiais. Pichau não utilizado.

## Readback independente do vínculo

- Hostinger `HOSTINGER_LIST_WEBSITES` na conexão destinatária: `punctumpicture.com`, `nodejs`, `is_enabled=true`, `order_id=1008583103`, `username=u775492464`, `client_id=1018395836`, `/home/u775492464/domains/punctumpicture.com/public_html`. Registro de website efetivo comprovado, não apenas portfólio. Não repetir a associação.
- No mesmo pedido existe o hostname `darkslategrey-raccoon-448222.hostingersite.com` classificado como website principal. **Não usá-lo como endereço da Punctum**: GET sem autenticação retornou JSON de serviço distinto (`service=persistflow`). A listagem do pedido não contém o hostname histórico `magic-lime-guanaco-79.hostingersite.com`. Sua identidade anterior NÃO foi reconciliada.
- `hosting_websites_list-domains(punctumpicture.com)`: `parked=[]`, `subdomains=[]`; não há alias de QA demonstrado.
- `hosting_git_list-website-repositories`: `[]`. Não há Git vinculado ao site gerenciado pelo endpoint consultado.

## Build, runtime e configuração

- `hosting_get-deployment`: UUID `01a1faf6-edef-7175-9761-aa69a3125f40`, estado `completed`, Node 24, entry `app.mjs`, origem archive `punctum-r4-synthetic-a136f721.zip`, última atualização 2026-11-22T22:08:01Z. Log inclui restauração de fonte anterior, portanto build concluído **não comprova** correspondência de código/bytes ao HEAD Git.
- Runtime log (janela 1h): `[vinext] Production server running at http://0.0.0.0:3000` em 2026-11-22T22:08:11Z. Processo iniciado não é prova de paridade funcional, disponibilidade externa ou correto roteamento.
- `hosting_nodejs_list-environment-variables`: conjunto vazio; apenas nomes/presença avaliados, sem valores secretos. Não supor Clerk ou bindings remotos configurados.
- A tentativa read-only de detectar opções do ZIP no website atual retornou HTTP 404: arquivo não demonstrado nessa raiz; não conclui perda de dados nem inexistência no caminho histórico.

## HTTPS e tráfego

- Hostinger `hosting_websites_get-settings`: `ssl.status=waiting_for_retry`, `last_error=Domain challenge failed`, `is_https_redirect_enabled=false`, CDN Hostinger habilitada, cache servidor desabilitado. A origem HTTPS NÃO está homologada.
- Probe público do Martha em `https://punctumpicture.com/`: HTTP 200, `Server: cloudflare`. Esse resultado não prova Hostinger. O domínio principal permanece sob Cloudflare; o HTTP público sem redirect foi registrado em evidência anterior na issue #44.
- Hipótese diagnóstica, não causa provada: o caminho de validação do certificado da Hostinger está incompatível com o roteamento/proxy atual. A Hostinger informa que sua instalação Lifetime SSL requer apontamento do domínio para a hospedagem e, com Cloudflare, pode exigir ajuste de proxy. Referência: https://www.hostinger.com/support/5613445-how-to-fix-a-failed-lifetime-ssl-installation-in-hostinger/ . Qualquer alteração DNS/Proxy/Worker, mesmo temporária, está fora da autorização. NÃO executar automaticamente.
- HTTPS de borda Cloudflare não deve ser confundido com TLS validado da origem, conforme modelo Full (strict): https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/

## Segurança e CI

- Hostinger `hosting_nodejs_list-vulnerabilities` mostrou uma ocorrência `esbuild@0.25.12` (`GHSA-gv7w-rqvm-qjhr`) rotulada high pelo provedor, **mas a própria descrição a classifica como withdrawn advisory** para outro pacote Deno. Não promover nem dispensar G19 com base nesse registro isolado; triagem formal permanece necessária.
- GitHub CI **do HEAD exato** `2999ecf80c7f156ddbf5b765fb7e289269a0a987`: run https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/45056980309, concluída `success`. Os jobs `verify` e `hostinger-node-qa` também concluíram com `success`, mas são provas do candidato em CI, não do runtime Node gerenciado. Commit posterior deste relatório exige leitura própria de CI antes de atribuir sucesso ao novo HEAD.

## Gates e releases, sem promoção

- Permanecem `G05=FAIL` (upload remoto 25 MiB), `G17=FAIL` (capacidade/custos reais), `G15/G19/G20/G22/G23=BLOCKED_EXTERNAL`, conforme contrato original, e `H01–H06=NOT_VERIFIED` conforme relatório 90. Não rebaixar controles nem marcar gates como PASS por testes locais.
- Release A: `PRODUCTION_NO_GO`; TLS origem, identidade e paridade da versão gerenciada, endpoints de QA e rollback não comprovados.
- Release B: `PRODUCTION_NO_GO`; adicionalmente faltam Clerk Development via navegador real, isolamento A/B, G05, G19, LGPD, backup/rollback e autorização específica. R4 não foi ativado.

## Próximo passo seguro e dependências

1. Obter da Hostinger procedimento documentado que permita validar SSL e um hostname/endpoint isolado para QA sem modificar a produção Cloudflare nem apagar dados; submeter qualquer operação de tráfego à autorização humana específica.
2. Obter uma prova de versão do artefato realmente instalado (manifesto/hash imutável ou endpoint de versão autenticado), distinta do nome do ZIP; não substituir build silenciosamente.
3. Com origem isolada e segura, executar scripts existentes `hostinger-managed-acceptance-http.mjs`, `hostinger-managed-functional.mjs`, `hostinger-clerk-browser-proof.mjs` e `hostinger-managed-recovery-download.mjs` conforme contrato original, sob limites de carga.
4. Obter parecer independente G19, decisão formal LGPD G20, acessibilidade física G15 e autorização separada por release. Sem estes, manter NO_GO.

**Decisão:** nenhuma escrita de infraestrutura. O vínculo ao pedido Unlimited está comprovado; TLS, build instalado e testes remotos seguem pendentes. Fonte de verdade de gates: `execution-state.json`; este relatório é evidência complementar, não alteração retroativa de PASS/FAIL.
