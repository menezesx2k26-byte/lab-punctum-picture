# Ciclo AJ | GOAL P0 PUNCTUM-R4-ALBUMS-FINAL-DOD-20261119

Data: 2026-11-19. Estado de release: **NO_GO_PRODUCTION**.

## Escopo e reconciliação factual

- Repositório: `menezesx2k26-byte/lab-punctum-picture`; PR #40 aberta em draft, não integrada.
- HEAD remoto de partida da PR #40: `3e9db949556a9b61179b63f0fb65152a4b20327d`; base `codex/punctum-managed-production-20261114` em `8abb9f38a0bc7a265ddde10e71686964f21a5dd9`. Main remota observada: `f0c82f2c7200417e41c1fd3a21414607c2c5a973`; divergência main...PR40: 21 commits à esquerda e 528 à direita.
- PRs #13, #17, #20, #24, #32, #33 e #36 foram consultadas, sem merge autorizado. Documentos da PR40, Drive `sgtmenezes` e SPEC original `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` (seção 23) foram reconciliados. A SPEC original, não os nomes de ciclos posteriores, define G01-G24.
- Worktree isolada: `C:\ttk-dungeon-qa\punctum-r4-p0-20261119`, branch `agent/punctum-r4-p0-20261119-approved`; worktrees existentes em D: preservadas. Host físico `DESKTOP-L6CITUI/Pichau`.
- Evidência histórica de CI: GitHub Actions run `43890336906` com sucesso no HEAD `3e9db949`. **Não é CI do novo candidato**, nem evidência Hostinger remota.

## Mudanças funcionais implementadas nesta rodada

1. **P1 identidade Clerk ao transferir cliente**: RED no teste `tests/integration/clerk-r4-security-matrix.spec.ts`, cookie de A anteriormente ainda listava galeria (HTTP 200) após vínculo A→B. `linkClerkClientAccount` passa a atualizar `client_accounts.session_version` quando muda `clerk_user_id` e gravar `session_version_at_link` atualizado na mesma transação D1 `db.batch`. Vínculo com o mesmo usuário permanece idempotente. Teste verifica rejeição do cookie A na API e em mídia GET/HEAD, sem bytes privados, e acesso válido de B.
2. **P1 revogação Clerk e logout sob falhas D1**: RED reproduzido para ausência da tabela `revoked_clerk_tokens`; o código retornava sucesso e aceitava token com `sid`. Outro RED reproduziu erro de leitura da tabela de vínculo no logout admin que retornava falsamente 200. Agora escrita e leitura da lista de revogação falham fechadas, o verificador da sessão admin propaga indisponibilidade do banco como HTTP 503 e a rota de logout exige binding D1 presente antes de afirmar sucesso. A matriz injeta sinteticamente falha de leitura, ausência do DB binding e falha de gravação de revogação, verificando a validade do cookie antigo na instância saudável quando nenhuma revogação ocorreu.
3. **Troca de identidade na UI**: os dois controles `Trocar conta` primeiro encerram a sessão Punctum autenticada e, apenas com confirmação HTTP, chamam Clerk `signOut`. O `UserButton` que permitiria saída fora desse caminho foi removido nesses dois pontos; o botão de logout do Studio não redireciona quando DELETE falha e apresenta erro perceptível.

Arquivos de código/testes alterados: `worker/auth/clerk-auth.ts`, `worker/utils/auth.ts`, `worker/api/admin-auth.ts`, `tests/integration/clerk-r4-security-matrix.spec.ts`, `app/albuns/components/ClerkClientLogin.tsx`, `app/acesso/ClerkAdminLogin.tsx`, `app/admin/components/LogoutButton.tsx`. Script adicional de QA POSIX sintética: `scripts/r4-local-posix-hostinger-qa.sh`.

## Provas novas locais e suas limitações

- `npx vitest run tests/integration/clerk-r4-security-matrix.spec.ts --testTimeout=60000`: **4/4 PASS** no runtime sintético Cloudflare/Vitest após extensão para falha de leitura/ausência do binding D1. Três reproduções RED foram observadas antes das correções.
- `npm test`: **325/325 PASS**, **62/62 arquivos PASS** na worktree Windows com dependências `npm ci` instaladas.
- `npm run typecheck`: **PASS**. `npx eslint` nos seis arquivos alterados: **PASS**. `git diff --check`: **PASS**.
- `npm run build`: **PASS** (vinext Vite, client, RSC, SSR; warnings de sourcemap não bloqueantes).
- Testes Node Hostinger executados no Windows incluem falhas dependentes de permissões POSIX; não foram convertidos em prova de falha no Linux nem em PASS. Qualificação Linux é separada.
- **Sem** Clerk real no alvo, OTP real, prova local de signOut no navegador, teste de dispositivo físico, R4 real remoto, CPU/custo de conta ou persistência/redeploy/restauração dos mesmos bytes no Hostinger gerenciado. Nenhum resultado local foi promovido a homologação remota.

## Hostinger / implantação e impedimentos

PR #33 registra probe anterior Node 24 e `server.mjs` sob `aliceblue-locust-999458.hostingersite.com`, com reinícios, rebuilds e preservação de dados sintéticos no período documentado. PR #36 registra QA em VPS 2135319 e D1/R2 sintéticos, mas não homologa o candidato R4 final. O conector Hostinger disponível nesta sessão retornou **zero websites** e **zero orders**; leitura por domínio alvo indicou ausência neste vínculo. O site/probe gerenciado **não foi readquirido nem alterado**, e `/health` do alvo não pôde ser comprovado. Prova histórica do probe não comprova restauração do novo código/DB/mídias privadas.

Sem mudanças em DNS, Cloudflare de produção, clientes reais, R2/D1 reais, settings de produção, flag de ativação ou custo incremental contratado. Estado da flag real de produção não foi autenticado nesta sessão; não inferir seu valor.

## G01-G24: estado conservador para este ciclo

Estados canônicos da SPEC mantidos; este ciclo registra provas locais **parciais** em gates que exigem homologação/alçada externa. Nenhum gate é promovido a PASS apenas por testes locais.

| Gate | Estado | Evidência atual ou lacuna determinante |
| --- | --- | --- |
| G01 | PASS | GitHub PR #40/base/main, worktrees e SPEC canônica reconciliados |
| G02 | NOT_RUN | 325 testes e build locais PASS, revisão de integração e CI do novo SHA ainda pendentes |
| G03 | NOT_RUN | API admin sintética; falta browser/Clerk real e persistência alvo |
| G04 | NOT_RUN | Galeria/publicação sintética; falta E2E real no alvo |
| G05 | FAIL | 25 MiB local historicamente PASS, mas QA Hostinger real + Clerk + restart/retry ausentes |
| G06 | NOT_RUN | RS256/sid sintético PASS; falta identidade real Clerk no alvo |
| G07 | BLOCKED_EXTERNAL | Login/OTP real no ambiente QA controlado não comprovado |
| G08 | NOT_RUN | TDD de revogação/rebind PASS local; ciclo real de sessão do alvo ausente |
| G09 | NOT_RUN | A/B local PASS; isolamento remoto A/B após restart/redeploy ausente |
| G10 | NOT_RUN | Media GET/HEAD local negativa; CDN/storage remotos não testados |
| G11 | NOT_RUN | Favoritos locais; persistência/navegador remotos ausentes |
| G12 | NOT_RUN | Download local; UI e permissões alvo não homologadas |
| G13 | NOT_RUN | Build e testes frontend; browser real de cliente pendente |
| G14 | NOT_RUN | Build e API; browser real admin pendente |
| G15 | BLOCKED_EXTERNAL | Matriz assistiva em dispositivo real não realizada |
| G16 | NOT_RUN | Regressão local 325/325; publicação remota/public staging final não homologada |
| G17 | FAIL | CPU e limites/custos efetivos do target não medidos |
| G18 | NOT_RUN | Restore D1/R2 sintético local histórico, não refeito no Hostinger do candidato |
| G19 | BLOCKED_SECURITY | Auditoria independente identificou riscos adicionais em aberto, revisão final não aprovada |
| G20 | BLOCKED_EXTERNAL | Decisões LGPD e aprovação responsável pelo estúdio pendentes |
| G21 | NOT_RUN | PR draft, CI novo SHA/review/integração pendentes |
| G22 | BLOCKED_EXTERNAL | Sem autorização humana específica de merge/ativação/cutover |
| G23 | BLOCKED_EXTERNAL | Rollback código + dados não ensaiado no alvo autorizado |
| G24 | NOT_RUN | Handoff novo será verificado somente após commit, checkpoint e readback |

Contagem conservadora: 1 PASS, 2 FAIL, 5 BLOCKED_EXTERNAL, 1 BLOCKED_SECURITY, 15 NOT_RUN. Decisão geral `NO_GO_PRODUCTION`.

## Riscos residuais e próximo trabalho concreto

- `sid:` revogações têm TTL local de 24 h; uma sessão Clerk upstream mais longa ainda poderia renovar token com mesmo `sid` depois do TTL. Exige revogação upstream comprovada ou limite de sessão contratualmente validado e teste de expiração.
- Botões gerais de logout cliente/admin limpam sessão Punctum, mas provider Clerk pode permanecer logado até fluxo separado de troca de conta. A UI `Trocar conta` foi endurecida, porém navegador real e ciclo de signOut completo precisam de homologação.
- Piloto opt-in `worker/client/clerk-pilot.ts` precisa ser reconciliado com contrato `sid` obrigatório da verificação principal.
- Testar Node Hostinger em filesystem POSIX isolado (permissões 0600/0700), 25 MiB multipart/stream, upload interrompido, novo build, restart, hash download após reinício, restore D1/objetos com casos negativos; ainda não equivale a homologação managed remota.
- Readquirir acesso **autorizado** à hospedagem gerenciada correta e reconciliar bindings sem ler ou publicar segredos. Evitar mudanças de domínio e deploy no site público.
- Reexecutar CI contra SHA de integração; revisão de segurança independente no SHA final, browser real e aprovações G20/G22 antes de qualquer merge/produção.

**Checkpoint não substitui prova:** se Engram, PersistFlow ou Drive estiverem indisponíveis, registrar indisponibilidade em vez de declarar persistência nesses destinos.
