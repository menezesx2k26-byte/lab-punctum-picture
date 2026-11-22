# LOCAL_GATE_UNBLOCK_PACKET — 22/11/2026

**Estado deste recibo:** LOCAL_INCREMENT_VERIFIED / RELEASE_GATES_BLOCKED. Mídia, recuperação, logout e auditoria de senhas foram publicados em `469c76e011d63df74e9a2f47cf66e4540884cedc`, com [CI 45048482582](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/45048482582) e artefatos exatos verificados. O incremento posterior [91](91-cycle-local-clerk-development-api-2026-11-22.md) registra OTP real Development e a correção de configuração SDK, fonte `524e4eafeff44e25acc3dc7716a47996f5f71b4a`, revisada e integrada somente ao PR #45. A CI do HEAD integrado e o readback final são registrados no checkpoint operacional/Drive após o commit. **PARTIAL_VERIFIED / PRODUCTION_NO_GO** nos Releases A e B.

## Baseline, fontes e preservação

- Repositório `menezesx2k26-byte/lab-punctum-picture`, [PR #45](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/45) OPEN/DRAFT. Baseline histórico local/remoto/PR reconciliado em `855e91be001b271aa8eb98f16725754cae3a0dda`, branch `codex/punctum-unlimited-release-20261120`. Base do PR `a44397d79dcc0b9835f7253dfc8cb20c0681f4ea`.
- [CI 44992168021](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44992168021) desse baseline: verify `137115380700` e hostinger-node-qa `137115380500` success. Essa execução valida somente o baseline; o candidato técnico usa a CI exata indicada acima.
- Planos vinculantes lidos: [LC0–LC6](../../superpowers/plans/2026-11-22-punctum-luna-gate-closure.md), [BH/T00–T06](../../superpowers/plans/2026-11-21-punctum-continuation-bh-tasks-gates.md), planos Unlimited de 20/11, fontes operacionais 16/88/89/90, ledger, pacote G19, decisões LGPD, checklist de sessão e runbooks de rollback. O design original do cliente foi recuperado do [Markdown no Drive](https://drive.google.com/file/d/1A4iAg4DRYX23_7p5REn9ojab_oWkIB4o/view), modificado em 13/11; ele ainda descreve senha inicial e troca obrigatória.
- O [checkpoint Sgtmenezes existente](https://drive.google.com/file/d/1x7-qc48BbWYdCvVuuXZKD4UOazuIMtWe/view) foi relido: Markdown, 22.011 bytes, modificado em `2026-11-22T06:10:03.734Z`, já inclui o fechamento `855e91b`. Preservar integralmente esse prefixo em eventual atualização.
- Somente este chat apareceu ativo no projeto na consulta do aplicativo. Os serviços locais existentes foram preservados; nenhum executor anterior foi interrompido. As correções `51b329b`, `3cecc27`, `44d2771` e `1c4edd5` permanecem integradas. A comparação histórica do importador D1 não foi reaberta.
- WIP original: `C:/Users/Pichau/Documents/ChatGPT/Punctum Picture`, branch `agent/punctum-clerk-auth/20261121-045514`, HEAD `b417405c0406daf286b192a8151cf45c4a50f89c`. Todos os 31 blobs/bytes, branch/HEAD, status, índice e diff coincidem com o baseline. Hash somente de caminhos/bytes/blobs do WIP, sem versões do candidato: `bc4a3521f1c206340a9984487f3d3333eba590857083a1f2226bf4c39ebd9071`. O fingerprint agregado inicial `2041175650063e3fca0882bc99436d84d4e325c7515a4f1df52b64a5bfd5f597` incluía também versões do candidato; não é uma medida exclusiva do WIP.
- Contra o código final `469c76e` são **10 caminhos idênticos, 20 divergentes e um documento exclusivo**. O inventário 12/18/1 usava `5ebf35d`; 11/19/1 foi confirmado contra o baseline `855e91b`. As diferenças adicionais vieram de `worker/auth/clerk-auth.ts` e depois `worker/api/admin-auth.ts` no candidato, devido às correções de revogação e auditoria. O WIP permaneceu inalterado.

## Fatos, decisões e ambientes

| Fato/decisão | Fonte e data | Conta/aplicativo/ambiente | Natureza e limite |
| --- | --- | --- | --- |
| Custo incremental R$ 0; sem produção, DNS, merge, suporte ou ativação R4 | Objetivo expresso de 22/11 e LC0–LC6 | Todos | Autorização vinculante; nenhuma sessão amplia o escopo |
| Integração local Clerk preservando login existente | Registro local da sessão Clerk de 21/11 e guia WIP | Checkout WIP, sem rollout remoto | Histórico local; não aprova substituir senha/troca obrigatória por OTP globalmente |
| Punctum Picture existe como organização `org_3MNtO768q73RF4fdLpOvHHLrMEC`, com zero membros | Navegador autenticado, 22/11 | Personal Workspace / My Application, app `app_3M14L9JyjaJ9ySitVTsQFf6xJ2A` | Organização selecionada e lida; Miranda não foi operada. Organizações desse aplicativo não equivalem a aplicativos isolados |
| Development identificado | Seletor de ambiente + Domains, 22/11 | `ins_3M14L5pOMO7DQ8ZX4CW5bZ3w3eB`, domínio `causal-leopard-4871.clerk.accounts.dev` | Configuração observada; não certifica origem QA do produto, vínculos A/B ou autorização de OTP |
| E-mail exigido/verificado; OTP de cadastro e entrada ON; link por e-mail OFF; senha de cadastro ON | User & authentication, 22/11 | Development acima | Leitura, sem alteração. Inventário sanitizado detectou cinco endereços com padrão de teste; contatos e identidades não foram copiados |
| Máximo de sessão sete dias; inactivity OFF; reverificação dez minutos; native igual web; multisession OFF | Sessions, 22/11 | Development acima | Configuração observada. Mudanças de duração só alcançam sessões novas, conforme aviso do painel; replay/expiração reais não executados |
| Allowed subdomains OFF/desabilitado | Domains, 22/11 | Development acima | Não comprova `CLERK_AUTHORIZED_PARTIES` do runtime; origem/JWKS/azp efetivos no QA ainda pendentes |
| Production histórica permanece separada | BH/90 e checkpoint relidos | `ins_3M6H9ktM3jO84RvEu5BmKFokCfr`, issuer `https://clerk.punctumpicture.com` | Identificação histórica; nenhuma configuração, usuário ou sessão Production foi alterada |
| Node correto e plano confirmados | hPanel autenticado, 22/11 | Unlimited, usuário `u775492464`, pedido histórico `1008583103`; `magic-lime-guanaco-79.hostingersite.com` | Plano e usuário relidos; pedido vem do preflight anterior. ZIP instalado `punctum-r4-synthetic-a136f721.zip`, Node 24.x, variáveis Nenhum. Esse ZIP não é o novo candidato |
| Cotas atuais | Detalhes do plano, 22/11 | Node Unlimited acima | 50 GB, RAM 3072 MB, dois núcleos, 600.000 inodes, 120 processos; não são medições de uso livre ou reserva exclusiva |
| Domínio ainda separado do Node | hPanel e [issue #44/comentários](https://github.com/menezesx2k26-byte/lab-punctum-picture/issues/44), 22/11 | Registro Punctum / Node Unlimited | BLOCKED_PROVIDER. Nenhum protocolo ou liberação novos. Recusa histórica `is_accessible=false`, TXT vazio não foi repetida |
| Produção e conteúdo público continuam distintos do staging | Dois GETs públicos e DNS NS, 22/11 | Cloudflare / Node temporário | Ambos `/api/public/site` HTTP 200 com hashes diferentes; NS `nia`/`pedro.ns.cloudflare.com`. Nenhuma escrita. Uma leitura não é benchmark G17 nem prova completa G16 |

Admin e cliente continuam separados por autorizadores, cookies e tabelas explícitas de vínculo. A existência de uma organização ou igualdade de e-mail não cria um vínculo administrativo nem transfere propriedade de álbum. Modo legado permanece disponível; piloto e configuração produtiva não foram ligados.

### Disposição do WIP

O inventário por caminho original permanece em [90-cycle-luna-closeout](90-cycle-luna-closeout-2026-11-22.md). Foi reutilizado porque todos os blobs WIP continuam iguais; cada blob foi comparado novamente ao candidato. `DUPLICATE`: os dez idênticos ao código final, sem cópia. `CONFLICT`: frontends, handlers, modos e dependências divergentes, incluindo agora `worker/api/admin-auth.ts`, até reconciliação com o candidato qualificado. `UNSAFE` para substituir os handlers administrativos/autorizadores atuais por versões que perderiam auditoria atômica e compare-and-set. O documento local exclusivo serve como fonte, sem transplante. Nenhum caminho foi descartado ou aplicado cegamente.

## Incremento técnico: fronteira de publicação do Hero

Reprodução com D1/R2 reais do Miniflare: três referências inválidas (`pending`, `failed`, ausente) podiam ser publicadas; uma mídia `ready` somente no draft era servida anonimamente; uma referência publicada que deixava de estar pronta não caía no fallback. Cinco testes falharam por esses comportamentos, não por fixture. O teste da URL de prévia também reproduziu `/media` onde era necessário `/admin/media`.

Correção mínima: validação de referências `heroMedia` antes de salvar/publicar/restaurar; fallback em memória para referência indisponível, preservando o snapshot armazenado; serving público somente para mídia pronta referenciada pela publicação atual; prévia pelo endpoint administrativo existente e cache privado. A URL administrativa é propagada apenas no rendering interno do Studio. Não foram alterados resolução mínima, fotos, logo, recorte, tokens, layout ou transporte de upload.

Arquivos: `shared/site-config-storage.ts`, `worker/media/serve.ts`, `worker/site-media.ts`, `app/lib/public-visuals.ts`, `app/sections/home/HomeHeroSection.tsx`, `HomeRenderer.tsx`, `app/components/HomeExperience.tsx`, `app/studio-preview-internal/page.tsx`, `tests/integration/site-media.spec.ts`, `tests/unit/public-visuals.spec.ts`.

**Validação local:** regressão de seis arquivos, 36/36; repetição focada após ajuste de fixture, 15/15; typecheck, ESLint dos dez arquivos e `git diff --check` PASS. A fixture negativa passou a restaurar seu draft em `finally`. Uma tentativa adicional de SSR dentro do Worker pool revelou incompatibilidade do harness com Next/browser e hooks; o teste experimental foi retirado, sem alterar o produto para contornar o harness. A renderização compilada e o navegador passaram na CI `45048482582`; não se reivindica homologação visual/gerenciada.

**Revisão:** Gemini health passou, mas a trilha Hero encerrou com exit 3 e a trilha identidade devolveu apenas progresso; nenhum parecer Gemini foi aceito. Nash, agente `01a203e4-4bf1-7c80-b690-6ff383db2ccd`, revisou o diff Hero e não encontrou defeitos Critical/Important: seguro para commit/push ao PR draft. Apontou a lacuna menor de teste do iframe; ela foi coberta na CI compilada do candidato atual. Confirmou por código toda a propagação de URL e a compatibilidade com `Path=/admin`. Não certificou navegador ou runtime gerenciado.

O CoS worker-1 concluiu a revisão do baseline no run `2c12eb6a-ee62-41b1-b7ee-5ce79791e7e0`, owner `ea1248e2-086d-4785-b7e7-9bea72c2bae5`. Relatório `f370f0d1` lido e reconhecido. Encontrou quatro itens que exigem verificação/correção, mantendo G19 HOLD:

| Item | Efeito e confirmação | Encaminhamento |
| --- | --- | --- |
| SR1 / P1 | Logout Clerk incrementa versões antes de revogar `sid`; login concorrente pode emitir cookie da versão nova, e os validadores não consultam revogação. Sequência confirmada no código pelo principal | Correção nativa `979c023` revisada e integrada como `74f9218`; CI exata do candidato PASS; aceite G19 inteiro pendente |
| SR2 / P1 condicional | Restore inconsistente pode cruzar uma referência pública com uma chave privada | RED reproduzido; guards de import/backup/serving integrados em `90ef926` e `2988efb`; CI exata do candidato PASS; aceite G19 inteiro pendente |
| SR3 / P2 | Trocas de senha próprias atualizam credencial antes de auditoria; falha do INSERT deixa alteração efetiva com erro de API | RED/GREEN com triggers e CAS; `a655f31` revisado e integrado como `b98a4c1`; CI exata do candidato PASS; aceite G19 inteiro pendente |
| SR4 / P2 | Export reverso deixava o TAR original fora da retenção diária | RED reproduzido; limpeza somente de arquivos próprios em `1582712`; CI exata do candidato PASS; aceite G19 inteiro pendente |

O executor CoS foi reutilizado na branch `agent/punctum-clerk-logout-race/20261122-153935`, a partir de `855e91b`, em worktree nativo separado. Solicitação `29d920cc`, run `3c2fcdaa-f669-4b08-96b3-98e52884c7f4`: encerrou sem commits/alterações; recibo `eea669cf` reconhecido, entrega não aceita. A sessão informava zero chamadas de ferramenta, sem evidência de execução mutante; não se atribui sucesso nem uma causa não comprovada. Essa frente deve prosseguir pela execução nativa autorizada.

**CI/readback Hero:** [45039891788](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/45039891788), verify `137261759597` e hostinger-node-qa `137261759397`, ambos success no SHA exato `4208260`. Artefato R4 `14761540733`: ZIP baixado, SHA-256 `5dad4f28f34d337206fac5b57aa7c8a832a157c59e64331c1118abbd95b1b3b0` e CRC verificados. `report.json`: sourceSha exato, PASS_LOCAL, 23 checks, zero erros de página/servidor, sessões sintéticas, nenhum dispositivo físico/leitor de tela, `checkoutDirtyAtRun=true`. O artefato Node `14761341176` tem digest GitHub `4a2581868158232b65516f0fa1101386fa44eaf3adea8dc69a6727da68f21318`; corpo baixado, SHA-256 e CRC verificados. CI verde não fecha os achados de segurança posteriores nem prova o destino gerenciado.

**Checkpoint intermediário:** o mesmo arquivo Markdown do Drive recebeu apenas uma seção de continuidade em `2026-11-22T15:54:45.338Z`, 27.738 bytes. O prefixo anterior de 22.011 bytes foi comparado ao download raw antes da escrita; SHA-256 anterior `eba17efbac5da66336bfa067f06f73382e033a213a8b09c625e650fc17bc1754`. O readback de bytes do arquivo atualizado tem recibo separado no workspace local; este espelho é intermediário e deverá receber o fechamento das correções restantes.

**Limites adicionais do Hero:** a publicação atual é revalidada na origem, mas o cache público existente de até 300 segundos não foi convertido em revogação instantânea de CDN. O incremento abaixo cobre também perda de um objeto R2 com linha ainda `ready`; a homologação no ambiente gerenciado continua pendente.

### Incremento de mídia e recuperação integrado

Nash concluiu quatro commits isolados, revisados pelo principal antes de cherry-pick: `65328c2` → `90ef926` (namespace no import/backup), `d67386e` → `1582712` (limpeza do exportador), `3303d23` → `2988efb` (serving/fallback), `0179854` → `44e1f2e` (regressão de navegador). O principal acrescentou `b5d3eff` para exigir navegador novo e decodificação da URL antiga após perda do original. Nenhuma dependência nova.

`client-galleries/` é negado em referências públicas antes da leitura de bytes. Chaves públicas legadas válidas continuam aceitas. O exportador remove seus arquivos temporários em sucesso e falha, preservando backups diários e arquivos alheios. A leitura pública verifica a existência do original do Hero e resolve fallback em memória; URLs antigas também recuperam a imagem pelo pipeline existente. O snapshot publicado não é reescrito. Uma consulta R2 HEAD por Hero configurado no SSR foi acrescentada; não há afirmação de desempenho medida.

RED: seis falhas comportamentais de recuperação, três de mídia e uma URL antiga retornando 404. GREEN: recuperação em WSL/Node 24.21, **43 pass / 1 platform skip / 0 fail**; mídia, **39/39 em seis arquivos**. Typecheck, ESLint focado, `node --check` do E2E e diff check passaram. Nenhum build ou suíte completa local foi repetido. A primeira execução compilada do teste novo foi a CI `45047797507`, encerrada com a falha de teste descrita abaixo; a correção passou em `45048482582`.

O artefato Node anterior `14761341176` também foi baixado e verificado: SHA-256 `4a2581868158232b65516f0fa1101386fa44eaf3adea8dc69a6727da68f21318`, CRC PASS, sourceSha `4208260`, zero pageErrors, `checkoutDirtyAtRun=true`, `managedQa=NOT_TESTED`. Ausência de campos status/checks no summary não equivale a zero testes. Esse readback substitui a indicação anterior de corpo baixado, SHA-256 e CRC verificados.

A resposta do usuário confirmou `org_3MNtO768q73RF4fdLpOvHHLrMEC`. Leitura posterior do Development confirmou zero membros e nenhum convite; o ID da organização não fornece os vínculos individuais admin/A/B ou um canal de OTP. Nenhuma identidade ou configuração foi criada.

### Logout e auditoria de senhas integrados

Uma barreira no teste reproduziu a corrida com D1 real: o login pausa depois de ler a lista de revogação, o logout completa e o login continua obtendo a nova versão. Cookies antigos e concorrentes agora são negados; outro token do mesmo `sid` também é negado. Os validadores de cookies Clerk consultam as chaves persistidas de revogação. Falhas de armazenamento retornam 503 e não se tornam uma sessão válida. Os modos legados permanecem preservados.

Trocas de senha administrativas e de clientes agora gravam credencial e auditoria na mesma transação D1. Os testes abortam o INSERT do audit, exigem HTTP 500 com a linha inteira inalterada e nenhum evento novo, depois confirmam retry atribuído uma única vez. O CAS do cliente tem auditoria condicionada a `changes()=1`, com teste real de versão concorrente e zero evento de sucesso quando a atualização perde a corrida.

RED original: cinco falhas de logout/revogação e duas diferenças de linha após falha de auditoria. GREEN final do executor: **32/32 em sete arquivos**; fluxo administrativo de senha adicional: **um pass / 19 skips intencionais pelo filtro**. O agente interrompeu por `usage_limit_exceeded` antes do último commit; seu estado terminal foi confirmado e encerrado. O principal assumiu o worktree isolado, revisou o diff/testes, confirmou typecheck, ESLint focado e diff check com exit 0 e commitou `a655f31`. Não se atribui ao agente uma conclusão que ele não entregou. Os dois commits foram integrados por cherry-pick explícito e publicados.

Na CI de mídia `45047797507`, verify `137286099034` falhou apenas no E2E novo, após os demais passos; Node `137286099261` passou. O ZIP de falha `14764022911` foi baixado e verificado (SHA-256 `ac960a5dde523f2eb7f46a5fb77354588ce02cc5b0d2a60f666e301d0723edac`, CRC PASS): sourceSha `b5d3eff`, status FAILED, zero pageErrors/consoleErrors/serverErrors, `page.setContent` timeout de 30 segundos aguardando load. A asserção já havia confirmado a imagem de fallback no SSR. O teste foi corrigido em `469c76e` para abrir a URL antiga diretamente em página nova, exigindo HTTP 200, Content-Type de imagem e `image.decode()`/naturalWidth. Não se removeu a prova; o resultado compilado da correção passou na CI exata `45048482582`.

Preservação revalidada antes da integração auth: todos os 31 blobs/bytes do WIP, branch/HEAD, status, índice e diff idênticos ao baseline; os 24 gateRecords também idênticos. O fingerprint agregado continuava `2041175650063e3fca0882bc99436d84d4e325c7515a4f1df52b64a5bfd5f597`.

## G19: atribuição dos alertas por pacote

[Recibo sanitizado](evidence/2026-11-22-local-gate-dependabot.json): 31 alertas abertos do branch padrão, duas páginas autenticadas e 23 avisos distintos lidos. As faixas afetadas não incluem nenhuma versão correspondente do candidato: React Server DOM 19.2.9, Sharp 0.35.5, undici 7.30.1, Next 16.4.6, satori 0.33.5, esbuild 0.25.12/0.28.1/0.28.2. Lockfile blob `19ec74bc14e5487b26e8f66eba83bbdd7c798bd3`. `npm audit --json` atual: zero vulnerabilidades. Sem alteração de dependências ou fechamento de alertas no GitHub; essa atribuição não substitui revisão de autorização, recuperação, upload, cache e segredos.

## G17: proposta concreta, ainda NÃO aceita

No candidato gerenciado correto, R4 OFF: até dez aquecimentos e 50 leituras medidas por rota/origem, concorrência máxima dois e no máximo duas requisições por segundo; parar por erro crescente, rate limit, degradação ou custo. Home, portfólio, arquivo, health e login/Studio; mídia/Sharp e upload somente no QA isolado autorizado. Comparar mesma janela e mesmas condições com Cloudflare. Reportar p50/p95, contagem e máximo; **não certificar p99**. Primeira leitura após ociosidade é observação separada, sem chamá-la de cold-start comprovado; nenhum restart está implícito.

Proposta para decisão: zero erros inesperados na amostra; p95 público até 1,5 s e no máximo duas vezes a referência simultânea; recursos sustentados abaixo de 70% das cotas confirmadas; disco incluindo backups abaixo de 70%; nenhum aumento de custo e nenhum vazamento privado. Esses números são uma proposta operacional, não SLA, medição ou aceite. CPU/RAM/logs/cron precisam de recibos do gerenciado. A coleta não foi iniciada no ZIP antigo ou na VPS para substituir a prova correta.

## G18 e G23: recibos independentes de pré-condição

- `RESTORE_REMOTE_G18`: **BLOCKED_TARGET**, `eligibleWriteTargets=0`, escritas zero. Não há banco/diretório remoto comprovadamente vazio e autorizado para restaurar o candidato gerenciado; o Node existente contém fixtures. Faltam snapshot consistente, manifesto/checksum de banco e mídia, retenção, contagens/FKs e restart/rebuild no destino elegível.
- `ROLLBACK_REMOTE_G23`: **BLOCKED_TARGET**, `eligibleWriteTargets=0`, escritas zero. Faltam destino próprio, escritas pós-snapshot, freeze/delta/replay e prova de app/config/dados/mídia/permissões/sessões/Studio/Colagem/jobs, com RPO/RTO medidos e reabertura. O recibo G18 e o retorno de DNS não fecham esse gate.

A VPS 2135319 permanece QA auxiliar; sua conta de comando `smoke` e provas sintéticas anteriores não autorizam restore do ambiente gerenciado. Não houve novo job VPS, importação, exclusão ou escrita em alvo ocupado.

## T00–T06 / LC0–LC6

| Item | Situação deste incremento |
| --- | --- |
| T00 / LC0 | Baseline, PR/CI, executores, WIP, Drive e fontes reconciliados |
| T01 | Provas anteriores reutilizadas; zero build/QA VPS repetido |
| T02 / LC2 | Auditoria atômica e unlink anteriores preservados; novos testes de rollback/retry para as duas trocas de senha e correções transacionais integradas |
| T03 / LC1 | Development e contrato histórico identificados; OTP real do operador verificado por FAPI nativa; login web e configuração SDK ainda incompletos; WIP preservado |
| T04 | Publicação, prévia privada, namespace e perda de original reproduzidos/corrigidos localmente; caso compilado na CI atual; uso/visual/físico no alvo pendentes |
| T05 / LC3 | Patches revisados e publicados; CI exata `45048482582` PASS nos dois jobs e artefatos verificados. G16/G17 do gerenciado continuam sem prova |
| LC4 | Dois recibos BLOCKED_TARGET, zero escrita |
| LC5 | Atribuição Dependabot concluída; quatro achados reproduzidos com patches locais integrados; parecer formal do candidato inteiro, G15, G20 e aceites pendentes |
| T06 / LC6 | Pacote e ledger em preparação; publicar e verificar SHA/CI/Drive após revisão |

## Matriz de release preservada

Os 24 registros `currentCycle20261121AY.gateRecords` e todo o histórico permanecem intactos.

| Gate | Estado | Prova ainda necessária |
| --- | --- | --- |
| G01 | PASS | Revalidar SHA final e preservação do WIP |
| G02 | HOLD | Integração/revisão do candidato |
| G03 | NOT_VERIFIED | Cadastro real no QA correto |
| G04 | NOT_VERIFIED | Jornada de galeria/publicação no alvo |
| G05 | BLOCKED | Upload/retentativa/hash no gerenciado |
| G06 | BLOCKED | Issuer/audience/JWKS/azp/sid QA reais |
| G07 | BLOCKED | Identidades A/B e OTP no fluxo web do alvo correto; operador nativo já verificado |
| G08 | BLOCKED | Logout/expiração/revogação/replay reais |
| G09 | BLOCKED | Matriz A/B/anônimo no alvo |
| G10 | BLOCKED | GET/HEAD privados e cache no alvo |
| G11 | NOT_VERIFIED | Favoritos após reload/restart |
| G12 | NOT_VERIFIED | Download real autorizado/negado |
| G13 | NOT_VERIFIED | Navegador cliente autenticado |
| G14 | NOT_VERIFIED | Admin/Studio/Colagem no alvo |
| G15 | BLOCKED | TalkBack Android e VoiceOver iOS físicos |
| G16 | FAIL | Paridade real no Node correto, R4 OFF |
| G17 | NOT_VERIFIED | Medição, capacidade/custo e critérios aceitos |
| G18 | BLOCKED | Restore remoto próprio e backup retido |
| G19 | HOLD | Parecer completo independente do SHA final |
| G20 | HOLD | Decisão expressa da controladora |
| G21 | HOLD | CI/review/aceites integrados do candidato |
| G22 | HOLD | Autorizações A e B específicas |
| G23 | BLOCKED | Rollback completo independente |
| G24 | PASS | Recibo final versionado e espelho verificado |

| Suplementar | Estado | Limite |
| --- | --- | --- |
| H01 | NOT_VERIFIED | Referências reconciliadas; divergência histórica de resolução não decidida |
| H02 | NOT_VERIFIED | Upload/mime/bytes/retry no alvo não homologados |
| H03 | NOT_VERIFIED | Nova prova local de draft/publicação, sem aceite remoto |
| H04 | NOT_VERIFIED | Fallback de referência e perda de original cobertos localmente; caso compilado PASS local; recuperação no alvo pendente |
| H05 | NOT_VERIFIED | Picker/foco/mobile/conteúdo e físico pendentes |
| H06 | NOT_VERIFIED | SHA/ambiente gerenciado/release pendentes |

## Releases, responsáveis e continuidade

**Release A:** NO_GO; faltam associação/TLS, paridade, medição, recuperação e autorização específica. **Release B:** NO_GO; acrescenta identidade/sessões reais, segurança, LGPD, acessibilidade e autorização própria. Cloudflare preservada; R4 e Clerk pilot continuam OFF. Custo incremental efetivo **R$ 0**.

Próximas ações: engenharia verifica a CI exata e seus artefatos, publica o pacote/ledger e confirma readback do mesmo checkpoint Drive. Proprietário/Hostinger resolve a associação existente e comprova TLS, preservando dados e DNS; responsável por identidade confirma QA isolado, vínculos admin/A/B e mecanismo de OTP; controladora decide LGPD; revisor independente emite parecer do candidato inteiro; responsáveis humanos produzem provas físicas e aceites independentes. A resposta mais recente confirmou o cadastro dos clientes pela Maria e o uso de e-mail do usuário para OTP de teste; origem QA e vínculos reais ainda precisam de prova. Nenhum contato de suporte ou aceite foi fabricado.

### RELEASE_A_PACKET

Código-fonte revisado do último incremento `524e4eafeff44e25acc3dc7716a47996f5f71b4a`; HEAD integrado e CI exata no PR #45/checkpoint. Destino proposto: Node gerenciado Unlimited, R4 OFF. Produção Cloudflare preservada. Situação **PARTIAL_VERIFIED / PRODUCTION_NO_GO**. Faltam associação/TLS corretos, paridade G16, critérios aceitos e medição G17, recuperação/rollback segregados, revisão formal e autorização específica. Janela, freeze/delta, DNS/cutover e pós-cutover precisam de autorização própria; nenhum deles é autorizado pela correção técnica.

### RELEASE_B_PACKET

Mesmo candidato de código, com liberação própria **PARTIAL_VERIFIED / PRODUCTION_NO_GO**. R4 não foi ativado. Acrescenta jornadas de identidades reais admin/A/B, sessões/OTP/replay/disable, GET/HEAD/cache, favoritos/download e persistência no alvo correto, acessibilidade física, decisão LGPD e autorização independente. Uma aprovação eventual do Release A não libera o Release B.

Continuidade local ignorada: `.superpowers/sdd/2026-11-22-punctum-luna-gate-closure/local-gate-unblock/`, com baseline/hashes, RED/GREEN, checks, relatórios, recibos e quota. O agente nativo encerrou por limite de uso; o principal concluiu a integração a partir de estado terminal comprovado. Guard determinístico com telemetria de 22/11: semanal 85%, EMERGENCY / CHECKPOINT_ONLY, sem novos agentes pesados. Decisão de memória: fatos específicos deste projeto ficam neste repositório; nenhum novo fato estável entre projetos foi identificado.

## Fechamento do código e inventário de arquivos

[Recibo CI sanitizado](evidence/2026-11-22-local-gate-ci-469c76e.json): verify `137288178777` e Node `137288178941`, ambos SUCCESS. Vitest principal **367/367 em 66 arquivos**; Colagem **7/7 em um arquivo**. E2E **PASS_LOCAL, 25 checks**, incluindo o iframe protegido, recuperação da URL antiga e negações GET/HEAD sem bytes privados. Zero pageErrors/consoleErrors/serverErrors. Artefatos R4 `14765160325` e Node `14764811366` baixados e verificados por digest GitHub, SHA-256 local, CRC e sourceSha. Ambos reportam `checkoutDirtyAtRun=true`; Node declara `managedQa=NOT_TESTED`. Nenhum desses resultados promove um gate do gerenciado ou substitui aceite humano.

Arquivos de código/testes alterados desde o baseline (26):

- `app/components/HomeExperience.tsx`
- `app/lib/public-visuals.ts`
- `app/lib/server-content.ts`
- `app/sections/home/HomeHeroSection.tsx`
- `app/sections/home/HomeRenderer.tsx`
- `app/studio-preview-internal/page.tsx`
- `scripts/e2e/punctum-browser.mjs`
- `services/punctum-hostinger-production/managed-import.mjs`
- `services/punctum-hostinger-production/managed-import.test.mjs`
- `services/punctum-hostinger-production/managed-recovery-export.mjs`
- `services/punctum-hostinger-production/managed-recovery-export.test.mjs`
- `services/punctum-hostinger-production/managed-restore-check.mjs`
- `services/punctum-hostinger-production/managed-restore-check.test.mjs`
- `shared/site-config-storage.ts`
- `tests/integration/clerk-logout-race.spec.ts`
- `tests/integration/clerk-r4-security-matrix.spec.ts`
- `tests/integration/password-change-audit.spec.ts`
- `tests/integration/site-media.spec.ts`
- `tests/unit/public-visuals.spec.ts`
- `worker/api/admin-auth.ts`
- `worker/api/client-session.ts`
- `worker/auth/clerk-auth.ts`
- `worker/client/auth.ts`
- `worker/media/serve.ts`
- `worker/site-media.ts`
- `worker/utils/auth.ts`

## Decisão de cadastro e identidade recebida durante a execução

Em 22/11, o usuário reafirmou que **Maria cadastra os clientes pelo caminho simples já definido**. A SPEC original, seção de administração, já descreve cadastrar cliente → senha temporária → criar álbum associado → adicionar imagens → publicar. O produto mantém o cadastro pelo painel existente em `/admin/clientes`; o E2E compilado percorre esse formulário com dados fictícios. Esta orientação não autoriza substituir globalmente o contrato de senha/troca obrigatória por OTP.

O usuário informou que não tem acesso ao e-mail dela e orientou usar um e-mail dele caso o teste exija código. O perfil Gmail conectado forneceu um endereço do usuário, excluído dos artefatos públicos. No incremento 91 foi criado e verificado por OTP um operador Development do próprio usuário e emitida sessão/JWT por FAPI nativa. O aplicativo local continuou negando a troca, mesmo com vínculo D1 local explícito: faltava o segredo exigido pelo SDK e o token nativo não contém `azp` de web. A correção sinaliza a configuração ausente como 503 e preserva todas as validações. Não houve login web homologado, vínculo administrativo remoto, membro de organização ou alteração Production. Maria continua operadora do cadastro dos clientes; identidades A/B e jornadas reais no alvo permanecem pendentes.

O fechamento documental será publicado na mesma branch; sua CI de HEAD e o readback final do mesmo Drive serão registrados no recibo operacional local e no checkpoint remoto, sem alterar retrospectivamente os 24 gates canônicos.
