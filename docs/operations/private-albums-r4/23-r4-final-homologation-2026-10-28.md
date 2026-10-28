# R4 — homologação final incremental, 28/10/2026

**Em execução; produção NO_GO.** PR #24 sobre #20 sobre #17. Ponto de partida realmente conferido: `4229aa4320cadb20c881c257a76fe23c966e5831`. Checkout original limpo preservado; implementação em worktree próprio `agent/r4-final-qa/20261028`. Push normal à branch da PR, sem force, após conferir ancestralidade do HEAD remoto. Nenhum merge main, deploy de produção, alteração de Access/billing ou aplicação PersistFlow autorizado/executado.

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
