# Recuperação D1/R2 — estado

A execução histórica de QA na PR #13 reporta 93 registros D1 e 40 objetos R2 restaurados byte a byte em recursos isolados. Ela não testou a árvore integrada desta PR e não prova a recuperabilidade atual.

Nesta execução: nenhuma restauração D1/R2 remota realizada; isolamento, permissões e billing dos recursos QA atuais não foram verificados. O script de preview pode criar bancos/buckets e escrever dados; não foi executado sem confirmação do ambiente e autoridade. `client-maintenance.spec.ts` passou localmente, mas não é teste de restore. Gate G18: BLOCKED_EXTERNAL. Não usar recursos de produção nem apagar originais. Preparar duas contas e 10+ fotos sintéticas, backups em recursos distintos, comparar hashes/contagens/vínculos e repetir autorização/revogação antes de qualquer liberação.

## Risco do piloto histórico

Após a leitura inicial, foram observados bancos QA separados e buckets QA sem domínio público nas configurações consultadas. Isso não verifica o conteúdo ou a autorização de substituir registros já existentes. O script `scripts/private-galleries-preview.mjs` lê **todas** as linhas privadas da origem, faz UPSERT no banco restaurado e grava novamente os objetos no bucket restaurado; também troca os bindings e secrets do Worker QA. A execução não foi acionada: pode substituir evidências já existentes e transportar conteúdo desconhecido. Antes de rodar, estabelecer destino vazio e isolado, limitar o escopo a fixtures sintéticas da execução, evitar sobrescritas e verificar custos; não apagar ou sobrescrever objetos sem autorização. O script histórico também espera cookies antigos válidos após restauração; a política de invalidação de sessão precisa ser definida e testada antes de G18 PASS.
