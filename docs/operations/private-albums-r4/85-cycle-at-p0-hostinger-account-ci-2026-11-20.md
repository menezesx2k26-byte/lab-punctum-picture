# Punctum P0 · conta Hostinger, CI e continuidade R4

Data: 20/11/2026, America/Sao_Paulo. [PR #42](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/42) em draft, branch `cursor/r4-aj-security-phase-b-ae72`. Produção `PRODUCTION_NO_GO`. Este checkpoint sucede o [handoff 84](84-cycle-as-qa-unblock-vps-origin-2026-11-20.md). O HEAD corrente e seu CI são registrados na PR.

## Verificação executada

- Baseline `9290cd907009b2e1f691a0d35311abf594ed9ca3`. Os jobs `verify` e `hostinger-node-qa` concluíram com sucesso no [CI 44775747707](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44775747707).
- Commit `2a199562f1bffd98c50acdc1c8b7d0862a05e5a6`. A regressão mostrou seis consultas no preflight com um pedido cancelado. A correção exige um site Node habilitado e o pedido ativo antes das consultas do runtime. O CI da PR passou a usar permissão de leitura, remover a credencial do checkout após a operação e executar toda a suíte Node 24 do adaptador gerenciado. [CI 44783627742](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44783627742).
- O preflight Hostinger com o segredo do repositório verificou a mesma identidade registrada para `hostinger_usings-moko`: `punctumpicture.com`, usuário `u571409090`, pedido `1008628483` ativo, `hostinger_premium_v3`. Há dois sites no pedido, um deles Node.js. Configuração lida via HTTP 200: Node 24, npm, build `build:hostinger:managed-runtime`, entrada `services/punctum-hostinger-production/candidate-server.mjs`. Histórico acessível, consulta de variáveis HTTP 500 e host temporário histórico ausente do inventário. Nenhuma escrita. [Preflight e artefato 14652823100](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44783616955).
- A etapa que grava os artefatos de pré-verificação do Clerk e da Hostinger usa Bash explícito para que uma falha do processo seja propagada por `tee`. A regressão foi reproduzida e validada com `node --test --test-reporter=dot scripts/ci-evidence.test.mjs scripts/punctum-clerk-instance-readonly.test.mjs` (11 passaram) e `python -m unittest discover -s scripts -p punctum_hostinger_account_preflight_test.py` (3 passaram).
- HTTPS público respondeu 200 em `punctumpicture.com/api/health` e 308 em `www.punctumpicture.com/`, com validação TLS do cliente. DNS autoritativo na Cloudflare. Inventário anterior associa o tráfego ao Worker `punctum-picture-migration`. A origem temporária histórica da Hostinger encerrou a conexão antes de responder. [Runbook de rollback](../PUNCTUM-ROLLBACK.md).
- O [CI 44784525425](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44784525425) concluiu ambos os jobs com sucesso no commit `5cb2166f3dea268f14ec07e41cb71469faf28d3e`. Auditoria npm com zero vulnerabilidades, QA Node 40 aprovados e adaptador gerenciado 69 aprovados. O teste de recusa em plataforma sem grupos de processos teve skip esperado no Linux e passou isoladamente no Windows. O [artefato Playwright 14654650155](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44784525425/artifacts/14654650155) traz 23 verificações sintéticas.
- [Preflight Clerk nesse SHA](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44784514200) confirmou a identidade da instância de produção. A API Backend retornou a leitura da instância sem o campo de duração máxima de sessão. O artefato preserva `BLOCKED_API_GAP`, sem alterar configurações nem revogar sessões.

### Build do candidato Hostinger

Dois `npm run build:hostinger:candidate` em Ubuntu/WSL com Node 24.21.0 e saídas limpas geraram 555 arquivos por build a partir de `2a19956`. Os SHA-256 de 552 arquivos coincidiram. As diferenças ficaram em `server/index.js`, `server/vinext-server.json` e `server/ssr/vinext-server.json`. O ensaio controlado partiu de `5cb2166` e acrescentou um protótipo local para fixar `generateBuildId`. As mesmas três diferenças persistiram e o protótipo foi descartado.

No Vinext 0.0.50 do lockfile, o bundle inclui o UUID de Draft Mode e os dois manifestos contêm `prerenderSecret` gerado no build. A comparação estrutural confirmou `prerenderSecret` como único campo variável nos manifestos e uma única linha variável no bundle. Os valores das credenciais ficaram fora do registro. Reprodutibilidade byte a byte permanece em aberto. Próxima ação técnica: verificar se o Vinext oferece injeção segura desses valores em runtime ou qualificar separadamente essa mudança no servidor gerenciado, preservando o comportamento dos controles de Draft Mode e prerenderização.

## G01–G24

Escopo e critérios conforme a [reconciliação 16](16-original-g01-g24-reconciliation.md). A SPEC integral `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` não foi localizada em Git, worktrees ou anexos. A sessão disponível do Drive exige login.

| Gate | Estado | Evidência e dependência |
| --- | --- | --- |
| G01 Baseline | PARTIAL_VERIFIED | HEAD, CI, PRs relacionadas e identidade Hostinger reconciliados. Falta cotejar a SPEC integral. |
| G02 Integração | PARTIAL_VERIFIED | CI verde em `5cb2166`. Dois builds do candidato diferiram em três arquivos com valores aleatórios do Vinext. |
| G03 Cadastro admin | PARTIAL_VERIFIED | Chromium local e SQLite sintético. Falta cadastro no destino autorizado. |
| G04 Galeria/publicação | PARTIAL_VERIFIED | Chromium local com publicação sintética. Falta medição no destino. |
| G05 Upload | PARTIAL_VERIFIED | Fronteira de 26.214.400 bytes e aborto de stream cobertos localmente. Falta aceite remoto dos 25 MiB. |
| G06 JWT | PARTIAL_VERIFIED | Testes criptográficos e validação de sessão local. Falta exercitar Clerk/JWKS do candidato em staging. |
| G07 OTP | NOT_RUN | OTP real do candidato depende de instância e usuário de QA autorizados. |
| G08 Sessão | PARTIAL_VERIFIED | Revogação e logout sintéticos. Faltam leitura de duração máxima ≤14 dias, logout e revogação reais. |
| G09 Isolamento | PARTIAL_VERIFIED | Matriz sintética A/B com cookies e mídia. Falta validar após restart do destino. |
| G10 Mídia | PARTIAL_VERIFIED | Negação e ausência de bytes em QA sintético. Falta confirmação com a origem e o CDN do destino. |
| G11 Favoritos | PARTIAL_VERIFIED | Persistência local de favorito. Falta ensaio após restart remoto. |
| G12 Downloads | PARTIAL_VERIFIED | UI/API e hash do original sintético local. Falta ensaio no destino. |
| G13 Frontend cliente | PARTIAL_VERIFIED | Chromium em desktop/mobile emulado. Falta homologação na origem remota. |
| G14 Frontend admin | PARTIAL_VERIFIED | Chromium sintético em múltiplas larguras. Falta homologação na origem remota. |
| G15 Acessibilidade | READY_FOR_AUTHORIZATION | Evidência automatizada disponível. Produto e acessibilidade precisam executar a matriz assistiva física. |
| G16 Público | PARTIAL_VERIFIED | HTTPS público lido e testes públicos de CI. Falta smoke na build de staging. |
| G17 CPU/custos | FAILED_VERIFIED | Worker implantado medido em cerca de 156,5 ms de CPU p99 contra 10 ms no [ciclo AR](83-cycle-ar-p0-execution-2026-11-20.md). Candidato e plano Node permanecem sem medição comparável. |
| G18 Recuperação | PARTIAL_VERIFIED | SQLite, manifesto e hashes cobertos em testes sintéticos. Falta restore descartável no destino com paridade banco/objetos e persistência após rebuild. |
| G19 Segurança | READY_FOR_AUTHORIZATION | [Pacote de revisão disponível](g19-independent-review-package-2026-11-20.md). Revisor independente deve concluir a revisão no SHA de release. |
| G20 LGPD | READY_FOR_AUTHORIZATION | Controladora deve aprovar finalidade, retenção, exclusão, terceiros e entrega. [Decisões propostas](11-lgpd-decisions.md). |
| G21 Integração da PR | PARTIAL_VERIFIED | Draft, CI por SHA na PR. Revisão formal e integração pendentes. |
| G22 Release | READY_FOR_AUTHORIZATION | Proprietário deve autorizar a publicação após os gates aplicáveis. |
| G23 Rollback | PARTIAL_VERIFIED | Runbook com referência ao Worker atual e escopo corrigido. Falta ensaio de rollback no destino autorizado. |
| G24 Handoff | PARTIAL_VERIFIED | Este checkpoint e os links de evidência permitem retomar via Git. Checkpoint PersistFlow segue sem confirmação. |

## Impedimentos e próxima ação

| ID | Evidência e alternativa examinada | Próxima ação e responsável |
| --- | --- | --- |
| HST-01 | API do pedido confirmou apenas o site Node principal. O hostname temporário anterior não consta no inventário. hPanel pede login. O [catálogo de criação de apps Node](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/) lista Business/Unlimited e Cloud. A capacidade do Premium legado de criar outro backend permanece indeterminada. | Operador da conta Punctum confirma em hPanel ou com a Hostinger um segundo hostname gratuito e vazio com TLS. Se o plano não o oferecer, o proprietário pode indicar um destino descartável Punctum já autorizado. Em seguida a engenharia verifica filesystem, cron, logs e limites efetivos, exercita G03–G14, G17, G18 e G23 e registra o resultado. |
| CLK-01 | Backend API informa configurações de token. O [Clerk documenta a duração máxima no Dashboard](https://clerk.com/docs/guides/secure/session-options), que pede login na sessão disponível. | Administrador Clerk do Punctum fornece leitura efetiva da instância e acesso de QA para verificar duração, OTP, logout e revogação. |
| SPEC-01 | Reconciliação em Git disponível. A SPEC integral não apareceu no nome histórico em arquivos ou anexos e o Drive pede login. | Proprietário indica um link acessível ou anexa o arquivo íntegro. |
| OPS-01 | VPS `2135319` é compartilhada e pertence à Conthabil. A chave pública temporária permanece como pendência registrada no handoff 84. | Responsável pela VPS decide sobre revisão e eventual revogação específica da chave. |

Próximo passo de engenharia: qualificar a passagem segura das credenciais geradas pelo Vinext para o runtime e repetir a comparação de hashes. A frente remota continua quando o operador confirmar o escopo do destino isolado.
