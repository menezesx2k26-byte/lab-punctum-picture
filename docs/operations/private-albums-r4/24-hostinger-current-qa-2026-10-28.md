# Hostinger — inventário, onboarding e probe QA

Consulta autorizada: **28/10/2026, 18:00:35 Brasília / 21:00:35 UTC**. Dez GETs via integração Hostinger/Composio, dez sucessos, paginação conferida, **zero alterações**. Evidência reduzida: `evidence/hostinger-current-2026-10-28.json`.

As duas contas consultadas têm um pedido ativo **Premium Web Hosting / hostinger_premium_v3** e dois websites habilitados cada. Uma contém o sandbox PHP do PersistFlow e um Builder; a outra contém o **PersistFlow gerenciado Node (`website_type=nodejs`)** e outro Builder. O Node existente está ocupado. Nenhum app Node de QA vazio apareceu, nem VPS ou setup novo nas últimas 24h. A lista de setups recentes não é prova de vagas contratuais.

**Node em Premium foi comprovado na conta existente.** Não se deve concluir que o plano seja incapaz de Node. A divergência entre esse caso e a [elegibilidade pública atual Business/Cloud](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) pode envolver condição legada; sua causa e o direito a criar outra aplicação não foram provados. A consulta não demonstrou slot Node adicional, HTTPS dedicado, CPU/RAM/processos livres ou custo incremental zero de um novo app.

Os [limites publicados](https://www.hostinger.com/support/hostinger-node-js-limits-for-web-and-cloud-plans/) descrevem recursos compartilhados e timeout de requisição, não capacidade efetiva livre da conta. Não equivalem a benchmark nem isolamento em relação ao PersistFlow.

A carga candidata seria a **renderização pública SSR**, que mostrou CPU alta no Edge. O Password Bridge atende derivação/verificação de senha e segue fora desse caminho. Migrar esse bridge não resolve a CPU medida da home. Um eventual SSR em Node precisa de app separado e comprovadamente incluído, compatibilidade do runtime/Vinext/D1, benchmark e rollback próprios; não há implantação homologada.

Na inspeção inicial do agente não houve criação, deploy, reinício, troca de plano, alterações de permissões, cobrança ou modificação de qualquer PersistFlow. O usuário prosseguiu depois no hPanel; o resultado posterior está abaixo. Próxima ação segura para essa alternativa: obter do provedor/hPanel uma confirmação verificável da elegibilidade e dos recursos de uma aplicação independente já incluída. Não usar o app do PersistFlow como hospedagem compartilhada improvisada para Punctum. Hostinger opcional; produção permanece **NO_GO**.


## Onboarding e resultado posterior ao “Feito”

As duas capturas fornecidas mostram Node no menu Premium e onboarding GitHub/GitLab/upload. O indicador3% é uso genérico, não CPU contratada. Preparado probe Node sem dependências, dados privados, D1/R2 ou integração PersistFlow: `services/punctum-hostinger-qa/`. O ZIP contém somente README/package/server; build `npm run build`, start `npm start`, Node22/24 e PORT do provedor. Teste HTTP local PASS. Isso não implementa SSR.

Após o usuário informar “Feito”, oito GETs de API completos identificaram `aliceblue-locust-999458.hostingersite.com`, tipo nodejs, setup completed às21:18:06Z. HTTPS aceitou TLS; `/health` com dois nonces distintos retornou **503 HTML** às21:24:11Z e21:24:25Z (10.196/6.170ms de latência). Nenhum identificador do probe, Node, uptime ou RSS foi observado. Deploy do código enviado **não comprovado**. Não confundir setup completed com aplicação saudável. Evidência: `evidence/hostinger-probe-live-2026-10-28.json`.

**Diferença relevante:** a conta A continua com2websites; o antigo sandbox PHP PersistFlow não aparece na lista completa atual e o novo Node usa o mesmo pedido/usuário de hospedagem. Exclusão, migração ou substituição não foram confirmadas. O PersistFlow Node da conta B permanece listado. O agente fez0writes/restarts/deploys, não atribui autoria ou causa da diferença e não declara isolamento em relação ao PHP antigo. Solicitação textual ao operador: informar status/erro de build/start e se houve substituição intencional, sem segredos. Não repetir deploy nem restaurar/excluir qualquer serviço por suposição.

Automação de browser CoS indisponível por falta do contexto originário. Computer Use local encerrou automaticamente porque não conseguiu determinar a URL atual para aplicar sua política; nenhuma entrada de mouse/teclado foi executada e o bloqueio não foi contornado. A investigação prosseguiu somente por API/HTTPS autorizados. Custo incremental, quotas/headroom e SSR continuam não homologados.


Confirmação posterior direta do proprietário: **o sandbox PHP foi substituído intencionalmente**. A diferença de inventário está esclarecida; o novo Node é destino QA pretendido. O 503, identidade do código, quotas/custo e SSR continuam pendentes. Nenhuma alteração no PersistFlow Node da outra conta está autorizada ou foi executada.


## Hostinger v2 — erro reproduzido, corrigido e HTTPS homologado

O proprietário forneceu o log real: `App did not call listen() within 3 seconds`, com orientação do provedor sobre guards de execução direta. O probe v1 tinha o equivalente ESM: comparava argv[1] com o próprio arquivo e não chamava listen quando importado pelo loader. RED `3fc7fb2` reproduziu a importação em processo filho:1PASS/1FAIL, `Hosted import never called listen()`. GREEN `6e994691e469f9830b9a7d44b83f1fb7f09a5d17` separa factory em app.mjs e entrypoint server.mjs com listen incondicional;2testes PASS, incluindo socket HTTP real antes do deadline3s. Build/syntax check e lint focado passaram. Nenhuma dependência nova.

ZIP v2:2369bytes, SHA256 `c388255e81ff4407800bc90a544442cc250abfc033266441b560bca29170db7e`, quatro arquivos raiz README/package/app/server conferidos byte a byte com a fonte. Usuário fez o reenvio no QA existente e informou “Implantado”. Agente executou somente dois GETs de verificação em21:48:10UTC: **HTTP200 ambos, service punctum-hostinger-qa-probe, version r4-node-probe-20261028-v2, Node v24.22.1, nonce exato, Cache-Control no-store, nosniff**. Uptime49s e RSS64159744bytes, que é memória do processo do probe, não RAM/CPU livre do plano. Latências117.95/26.13ms, não CPU faturável nem benchmark SSR. `ssrValidated=false`, `production=false`.

**Capacidade Node/HTTPS do novo QA comprovada.** SSR Punctum/Vinext, D1/R2, reinício gerenciado, carga, limites/headroom e custo incremental não comprovados. G17/G18/G23 e demais gates permanecem como na matriz; health200 não os promove. PersistFlow Node da outra conta preservado; substituição PHP confirmada intencional pelo proprietário. Evidência `evidence/hostinger-v2-live-2026-10-28.json`.


### Fechamento do adendo v2

CI40774699509 **completed/success exact6e994691e469f9830b9a7d44b83f1fb7f09a5d17**:218Workers/53arquivos,7Colagem,46Node,14Chromium; typecheck/lint/audit0/buildPASS. Artefato12853928040 relido SHA correto/checkoutlimpo/cincoPNGs/zeroerrosinesperados. Evidência `evidence/ci-code-6e99469.json`. Adendo Drive https://drive.google.com/file/d/1TobuZai1C8Ms5ORW4pKOpApzpNdUZ96p/view?usp=drivesdk criado emSgtmenezes e raw SHA256 7f1f3ce48558f33b9717d4994b17365bee17ae35cf642ec12a054e269c40a1e2 verificado. Engram3mensagens/get; PersistFlowgeração1/checkpoint4 às21:51:54.566Z inspecionado, sem takeover/continuidadeautomática. Recibos `evidence/hostinger-v2-{drive,persistence}-receipt.json`. G24PASS documental; demaisgatesnão promovidos. CI do commit documental final deve ser conferida na PR; não criar autorreferência impossível no próprioarquivo.
