# R4 — homologação final incremental, 28/10/2026

**DoD técnico parcial; produção NO_GO.** PR #24 sobre #20 sobre #17. Ponto de partida realmente conferido: `4229aa4320cadb20c881c257a76fe23c966e5831`. Checkout original limpo preservado; implementação em worktree próprio `agent/r4-final-qa/20261028`. Push normal à branch da PR, sem force, após conferir ancestralidade do HEAD remoto. Nenhum merge main, deploy de produção, alteração de Access/billing ou aplicação PersistFlow autorizado/executado.

## Fonte primária e correção da matriz

A SPEC **original** `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` foi localizada na Library pelo worker CoS, lida integralmente e materializada com 40.541 bytes. SHA-256 local e da fonte: `2989e0ba18982658570dc699842393b3f980c9a5312237af33ab02292d10ecfb`. O handoff solicitado no Drive Sgtmenezes foi materializado com 6.083 bytes, SHA-256 `5c27126672577e16f2406162936e91a03475246759c27ef9e895f5eeec5ce3f0`. O conector Drive direto desta conversa era de outra conta e retornou 404; a leitura correta usou a conta autorizada Sgtmenezes via CoS. Isso é evidência de recuperação de fonte, sem inferir acesso entre contas.

A seção 23 original define **G13 frontend cliente**, **G14 frontend admin** e **G15 acessibilidade/matriz assistiva**. As tabelas anteriores os haviam remapeado para a11y/dispositivos/SEO. O estado v3 restaura as definições exatas dos 24 gates, conserva o snapshot anterior como histórico e usa somente os estados previstos na SPEC. Escopo local/sintético está em campo separado. Dispositivos físicos e SEO permanecem requisitos suplementares; não substituem G13–G15.

## Correções e RED–GREEN

| Defeito | RED | Correção/evidência GREEN | Limite |
|---|---|---|---|
| CI navegava no merge temporário e descartava PNGs | `588e499` | `53c13c6`: checkout do HEAD exato da PR e retenção do diretório de capturas; teste Node PASS | CI posterior deve mostrar SHA no próprio relatório |
| Requisição sem resposta era descrita como outra versão | `8cec2cd` | `da23806`: falhas HTTP/rede e divergência de versão são contadas separadamente; seis guard tests PASS | Erros continuam no resultado; workflow verde não significa G17 verde |
| Retomada tentaria criar novamente recursos já alocados | `8cec2cd` | `da23806`: IDs/nome do recibo 40756797747, inventário atual, zero contas, cotas D1/R2/Workers; sem novas alocações/migrations | Qualquer conta inesperada interrompe o ensaio |
| JWT admin válido sem claims de identidade/validade obrigatórias | `3331ccc`: 2 FAIL / 1 PASS | `f9f8b96`: required exp/iat/sub/email/type, type app e limites temporais; 19 testes focados PASS | Requer token assinado pelo emissor autorizado; não foi comprovada falsificação de assinatura |
| Reorder e upload pendente sem atribuição na auditoria | `a1fba42`: 2 FAIL | `22664cf`: auditPrincipal em ambos, sem nome original/storage key/tokens; 23 testes focados PASS | Senha compartilhada segue explicitamente não individual |
| Admin solicitava chunk JS removido de CSS compartilhado | `ad6b78a`: E2E falhou por console 404 | `df273bb`: CSS carregado uma vez no layout admin; E2E ampliado PASS, sem filtrar o erro | Direção visual e regras CSS preservadas |

Nenhum assert foi removido para aceitar erro de produto. O ensaio admin aguardou a hidratação pelo carregamento das opções de cliente; preencher markup SSR antes de handlers não era uma reprodução determinística do fluxo interativo.

## Verificação local e CI

Instalação local: 540 pacotes, 541 auditados, zero vulnerabilidades. Typecheck/lint PASS. Antes dos cinco novos testes de segurança/auditoria: **211/211 Workers em 50 arquivos**, **7/7 Colagem**, build e teste real de imports SSR PASS. Node atualizado: **33/33**, mais um teste SSR após build. Os novos testes focados foram executados após os respectivos GREEN; a CI final deve consolidar as contagens e o SHA exato.

Chromium local: primeira tentativa bloqueada por binário Playwright 1208 ausente; repetição com Chromium já instalado passou. O E2E ampliado passou **14 checks**, incluindo cliente A/B, mídia cruzada, favoritos, download byte a byte, teclado/Escape/foco, estado pendente/404, envelope malformado, Studio, Colagem, cadastro admin Access sem senha, criação/edição/upload/progresso/capa/publicação, restart, snapshot local e logout. Larguras **320/360/375/390/430/768/1024/1440** para galerias, Colagem e editor privado. Capturas inspecionadas. O banco local não contém o acervo público R2 completo; espaços de imagem nas capturas públicas não homologam a apresentação fotográfica de produção.

`adb devices` não encontrou aparelho conectado. Chromium em viewport móvel não é Android Chrome/iOS Safari físico. OTP real, TalkBack/VoiceOver e aprovação jurídica/controladora não foram simulados como aprovação.

CI histórica desta missão: [40762657123](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40762657123), **completed/success** em `da2380685495a992e65bd19b6fc635683713e8c7`; relatório browser confirma checkout do HEAD, com PNGs retidos. Commits posteriores precisam de CI própria, registrada no estado/PR final.

## Desempenho real — G17 FAIL

[Ensaio 40762650132](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40762650132) concluiu a coleta; o resultado da aplicação é **PERFORMANCE_QA_WITH_REQUEST_FAILURES**. Artefato completo preservado no run; subconjunto sanitizado versionado em `evidence/r4-edge-current-40762650132.json`.

| Medida | Baseline b417405 | Candidato da23806 |
|---|---:|---:|
| Requisições da home | 64 | 64 |
| HTTP 503 | 10 | 17 |
| Divergência de versão | 0 | 0 |
| Eventos de CPU da versão | 53 | 48 |
| CPU telemetria p50 / p95 / p99 (ms) | 50 / 90 / 137 | 57 / 111 / 204 |
| Parede telemetria p50 / p95 / p99 (ms) | 621 / 690 / 988 | 669 / 897 / 997 |
| Latência cliente p50 / p95 / p99 (ms) | 646 / 772 / 946 | 672 / 957 / 1036 |

Baseline e candidato usaram a mesma configuração e o mesmo D1 dedicado, versão efetiva conferida por cabeçalho e eventos. O GraphQL retorna microssegundos nos campos CPU/wall e possui amostragem diferente (30 e 25 requisições), portanto esses valores não devem ser somados nem confundidos com os eventos em milissegundos. Nenhum custo monetário foi calculado a partir desses eventos; telemetria CPU não é uma fatura. HTTP 503 não foi atribuído a Error 1102 sem corpo/código comprobatório. Cinco GETs adicionais do candidato responderam 200, sem provar ausência do erro intermitente.

A [documentação Workers](https://developers.cloudflare.com/workers/platform/limits/) mantém referência de 10 ms CPU/req no Free. O experimento não comprova adequação ao Free, nem melhoria do candidato sobre o baseline. Amostra pequena, sem controle de POP/cold start e com erros: não extrapolar uma tendência de produção. O Password Bridge continuou fora desse caminho; não há prova para atribuir-lhe a CPU da home.

O profiler local existente recebeu histogramas de frames. Dois isolates/12 requisições servem **somente diagnóstico**: flushBuffered, pushLinkImpl/stringToChunk, parsing/validação de configuração e chamadas D1 aparecem entre amostras; não são atribuição de custo Edge. `React.cache` já deduplica loaders no render e o renderer já carrega referências admin sob demanda. Não foi introduzido cache que atrasasse publicação do Studio ou expusesse conteúdo privado para fazer a medição passar.

## Recursos, franquias e recuperação

O run histórico **40756797747 realmente criou** dois D1 e três buckets dedicados, migrou os D1 e publicou o baseline antes de falhar. Esse estado não constava do handoff final. IDs: origem `2e7710f3-dc92-4aeb-976a-5f15d8c5262c`; destino `0141b8f9-3074-4aa4-a184-92a4f7379ecc`; Worker `punctum-picture-r4-qa-20261028`; buckets `punctum-r4-qa-{originals,restored,backups}-20261028`. Os dois bancos históricos com cinco clientes não foram consultados para migração nem usados como destino.

O ensaio atual reutilizou somente esse recibo: **zero recursos criados**, **zero migrations**, quatro trocas de versão do Worker dedicado, sem R2 bindings e com flag privada false no ensaio de performance. Preflight atual: 4.313 requests Workers/dia; D1 384.010 linhas lidas/1.877 escritas; R2 máximo agregado observado 404.091.927 bytes e 1.554 operações contadas conservadoramente contra ambas classes. A conta alcançou dez D1 depois da alocação histórica; não criar outro par. Esses números são observações com janela e amostragem do artefato; não constituem garantia futura de custo. Subscriptions Free/Teams Free/R2 com base zero são evidência histórica corrente do preflight, sem upgrade. Não houve gasto autorizado novo.

Rollback remoto **do Worker dedicado** PASS: versão baseline serviu HTML completo com ID conferido, depois o candidato voltou. Isso não homologa G18 nem o rollback integral de dados/sessões G23. Um harness de recuperação sintética em worktree isolado está sob revisão; estado e execução real serão registrados separadamente. Objetos/fixtures remanescentes serão preservados; nenhum cleanup destrutivo está implícito.

## Segurança, LGPD e persistência

Revisor CoS distinto realizou avaliação auxiliar e reproduções locais. Não é sign-off formal autorizado G19, pentest ou prova do Access real. Gemini retornou somente intenção de revisão; nenhuma conclusão sua foi contada. Mapa dos limites e riscos continua em `security-review.md`; nenhuma aprovação do controlador foi inventada. As decisões pendentes de finalidade, base legal, retenção de fotos/favoritos/contas/logs/backups, eliminação, terceiros, exportação e entrega permanecem na minuta e no documento 11.

Handoff Drive final, Engram e criação/checkpoint/inspeção PersistFlow ainda serão confirmados por readback. API de checkpoint não autoriza modificar a aplicação PersistFlow. Nenhum takeover automático será declarado apenas porque um serviço responde health.

**Próxima decisão segura:** concluir os checks do novo SHA, executar apenas recuperação estritamente isolada que passe os próprios preflights, atualizar os 24 gates e persistir handoff final. Produção permanece NO_GO por CPU/erros reais, OTP, revisão formal, LGPD, dispositivos e release.


## Consolidação posterior — execução remota, correções e bloqueios

O ensaio [40767207339](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40767207339) mediu3272df6 (CPU candidato26/38/82ms,56eventos,0/64erros) e parou antes de writes de recuperação: a API R2 omitira `result_info` para listagem vazia. Reproduzido RED88fa8e8, corrigido GREEN070a137 em adapter exclusivo R4 que aceita somente o envelope vazio observado; parser estrito histórico e asserts de paginação permanecem. Consulta somente leitura40768031299 confirmou esse schema. Guard tests PASS.

O último ensaio real [40768574085](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40768574085), **d02e774dc0d0aa59cacf0c6bcfda729dba00e75f**, terminou **failure / FAILED_CLOSED_PRIVATE_UPLOAD**. A home teve64requisições por versão,0erros e0divergências. CPU da telemetria baseline **31/58/104ms**,65amostras; candidato **30/62/114ms**,63amostras. Latência cliente candidato **1699/1777/1844ms**. Parede/GraphQL e eventos têm suas próprias amostras/unidades no arquivo `evidence/r4-edge-current-40768574085.json`; não são CPU faturada nem evidência para código posterior. Oscilação entre ensaios impede atribuir melhora geral ou causa ao bridge. **G17 FAIL**. Preflight observou4683Workers requests/dia, D1 619584lidas/1877escritas, R2 máximo404091927bytes/1563operações conservadoras por classe;10D1. Assinatura Free/base0 não prova franquia futura nem entitlement Images/ocupação Access.

A recuperação conseguiu criar somente1cliente sintético, galeria e intenção; completude do PNG retornou400 INVALID_IMAGE. A configuração funcional isolada remove IMAGES para não ativar transformações sem quota verificada; o uploader chamou a validação sem binding e classificou erro de serviço como imagem inválida. RED5dcc5f7 reproduziu em intenção ISO válida; GREEN96b71ea retorna503 IMAGE_VALIDATION_UNAVAILABLE antes de alterar imagem/intenção. **18testes Workers focados/3arquivos e12Node passaram**. Preflight adicional bloqueia novas fixtures sem binding e allowance demonstrados. Nenhuma validação de imagem foi desabilitada para passar QA. [Documentação Images](https://developers.cloudflare.com/images/optimization/binding/): info é gratuita, transformação/output tem franquia própria; não habilitada sem consumo/entitlement efetivos verificados.

**Backup/restore não foram executados.** Origem2e7710f3-dc92-4aeb-976a-5f15d8c5262c agora tem1cliente; destino0141b8f9-3074-4aa4-a184-92a4f7379ecc tem0, relidos após falha. Três buckets preservados, sem limpeza; objeto sintético pode permanecer. Galeria66c091c1-8a4f-47a8-bc57-43cfbebfa0f0, intenção b7bf8640-b49e-4d34-8092-9cfd3e6314e5 identificam a tentativa. Não repetir fluxo que exige origem vazia nem apagar fixtures para torná-lo verde. Próxima execução deve validar ownership/estado e continuidade desses registros, Images/custo e autorização antes de restaurar. `finally` confirmou candidato flagfalse, sem R2 bindings, versão **c9f54971-adcf-4e2b-aa5d-b356caf7b830**. Rollback Worker PASS; **G18/G23 integrais bloqueados**. Bancos históricos5clientes preservados.

A revisão visual demonstrou labels de ações truncados em320px, embora o contêiner não transbordasse. RED94c452d / GREEN53830ca ajustou flex mínimo apenas nos botões do editor em mobile, sem redesign. E2E14checks passa incluindo labels visíveis em8larguras; screenshots reais mantidos.

Hostinger: Node novo identificado após onboarding humano, mas `/health`503duas vezes e PHP anterior ausente na mesma conta. Não há app saudável ou isolamento comprovado do sandbox antigo. Nenhum write do agente, reinício/deploy/alteração PersistFlow. Relatório24 contém a diferença e dependência do operador. Probe ZIP não é SSR e não homologa CPU/D1/R2.

A CI [40768584773](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/40768584773) foi **success no SHA d02e774** (217Workers/52arquivos,7Colagem,14Chromium). Nova CI **40772288364** verifica96b71ea; resultado final e artefato são registrados separadamente após readback. Não transportar PASS para HEAD sem confirmação. O default branch continua com10alertas Dependabot; auditoria do lockfile da PR0vulnerabilidades, são árvores distintas.

PersistFlow: criação, checkpoint e inspeção efetivamente confirmados no run `punctum-r4-final-qa-20261028-cc33d21e`, geração1/checkpoint1 às20:41:38.915Z, via Gabriel_MCP_Remote; statusACTIVE, successor=null, takeover=false, automaticContinuation=false. Isso é estado durável de checkpoint, sem controlador automático homologado nem mudança na aplicação. Handoff final Drive/Engram e refresh do checkpoint terão recibo próprio.

**Decisão: NO_GO produção e DoD técnico parcial.** Gates5,7,15,17,18,19,20,22,23 e fechamento documental24 têm limites explícitos no estado. Prosseguir nas dependências externas individualmente; nenhuma delas promove outra por inferência. Não há autorização para merge/deploy/álbuns reais/migração/Access produção/destruição/custo adicional.


Readback CI40772288364: **SUCCESS exact96b71ea3992d155753f610cd4627d1b71cbaf371**,218Workers/53arquivos,7Colagem,45Node(incluindo14Bridge),14Chromium. Artefato12853401485 lido: SHAcorreto/checkoutlimpo,5PNGs,0consoleerrors/0pageerrors/0servererrors;1negação404esperada. Typecheck/lint/audit0/buildPASS. Evidência vidence/ci-code-96b71ea.json. Proprietário confirmou substituição intencional do PHP Hostinger; diferença de inventário esclarecida,health503segue bloqueio.


## Recibos de persistência confirmados

Engram privado `conv_lP9LHRJ-nnMZnGPpUbavW`, duas mensagens e get/readback. PersistFlow `punctum-r4-final-qa-20261028-cc33d21e`, geração1/checkpoint3 às2026-10-28T21:37:16.505Z, inspeção confirmada; automaticContinuation=false/takeover=false. Correções de CI verde e substituição PHP intencional foram acrescentadas aos registros. Recibo: `evidence/final-persistence-receipt.json`. Drive Sgtmenezes: https://drive.google.com/file/d/1kmznqRZ67XkAtfBl-jlAMSQKZXgXooes/view?usp=drivesdk; bytes/hash/conteúdo relidos. Recibo: `evidence/final-drive-receipt.json`. G24 PASS com escopo documental, sem promover outros gates.
