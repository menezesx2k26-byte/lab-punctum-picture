# Ciclo AR | recuperação somente leitura — 2026-11-20

**Veredito:** `PARTIAL_VERIFIED`  
**Produção:** `NO_GO` / cutover `READY_FOR_CUTOVER_AUTHORIZATION`  
**Não** é `COMPLETED_VERIFIED` e **não** é `TECHNICAL_READY_VERIFIED`.

Nenhuma mudança de DNS, deploy, banco, objeto ou configuração Clerk/Hostinger foi feita. A baseline de setembro em `docs/operations/PUNCTUM-ROLLBACK.md` foi preservada; a seção 7 só registra o alvo vivo.

Evidência: `docs/operations/private-albums-r4/evidence/2026-11-20-cycle-ar-recovery.json`.

## Refs

| Item | Valor |
| --- | --- |
| PR | https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/42 |
| Branch | `cursor/r4-aj-security-phase-b-ae72` |
| Código medido localmente | `66b2c9958de14d685f561b1d0e0f2a967d28e3e2` |
| Commit documental | `384507406de848e6d3b16c6264a1729e14eb46e0` |
| CI `verify` desse SHA | success [44694282725](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/44694282725) |
| `hostinger-node-qa` | skipped pelo filtro de branch |
| Worker no ar | `punctum-picture-migration` |
| `GIT_SHA` plain | `4a9842dac2726699a5272d137ea7eedfe20d469c` |
| Deployment / version 100% | `276eb966-4561-4c95-b35c-3b461ff0c18d` / `e9b62f5d-acc5-4ad3-8319-24a0c7e98ee7` |

## O que foi comprovado

- DNS público autoritativo na Cloudflare. Apex e `www` respondem pelo Worker. `GET /api/health` 200. `www` redireciona 308 para o apex. Canonical da home é `https://punctumpicture.com/`.
- Conta Hostinger usada: `hostinger_usings-moko` (Punctum Picture). Pedido `1008628483` ativo, plano `hostinger_premium_v3`, site Node `punctumpicture.com` habilitado, usuário `u571409090`. Assinatura Premium Web Hosting `non_renewing`, expira 2027-01-22. As três contas conectadas listam zero VPS.
- A conexão `custom_punctum_picture_administra_o_stamen-form` está ACTIVE e a leitura de websites devolve 401. A API de builds Node não existe no toolkit Hostinger conectado.
- VPS `2135319` (`srv2135319.hstgr.cloud`, `179.236.241.135`) aceita TCP 22/80/443. HTTP devolve 308 da Caddy. TLS fecha com alerta interno. Não há chave SSH neste agente. Não é a origem do domínio público.
- D1 de produção: 20 álbuns (19 published, 1 draft), 339 imagens, FKs de álbum/categoria em zero. Migrações aplicadas: `0001`–`0008`. `0009`–`0015` não estão aplicadas.
- R2 originals: 230 objetos, 372040548 bytes. 218 imagens ready coincidem em tamanho. 113 ready são referências `static:/photos`, não objetos. 12 objetos `site-media/hero` coincidem com `site_media`. Zero divergência de tamanho.
- Backup diário `2026-11-20T03:00:30Z` completed. Comparação isolada em memória: ids iguais nas tabelas que o Worker implantado exporta. `site_media` fica de fora porque `4a9842d` não a inclui. `backup_runs` 88 contra 89 é o próprio registro do job.
- Clerk produção `ins_3M6H9ktM3jO84RvEu5BmKFokCfr`, desenvolvimento separado. Config `session` nula. O schema da plataforma só tem lifetime do token (default 60s), clock skew e claims. Não há campo de lifetime máximo da sessão. Nenhum login, logout ou revoke real foi executado.
- Local, neste agente, sobre `66b2c99`: audit 0, typecheck, lint 0 erros, Vitest 333/333, colagem 7/7, `node --test` 126/126, unittest Hostinger 2/2, build, SSR 1/1, e2e Chromium `PASS_LOCAL` com logout/revogação sintética, restart e rollback isolado. OTP real e produção não foram tocados.

## Gates oficiais (SPEC §23, fonte `16-original-g01-g24-reconciliation.md`)

Estados desta rodada, apenas os permitidos. Evidência comum: o JSON acima e, para o código, o SHA `66b2c99` até o CI do commit documental.

| Gate | Definição original | Estado anterior no PR | Agora | Estado |
| --- | --- | --- | --- | --- |
| G01 | Baseline — SHAs/inventário | PASS | Inventário Cloudflare, D1, R2, Hostinger e DNS relido | PASS_VERIFIED |
| G02 | Integração sem regressão | NOT_RUN no AQ; CI anterior verde | Suíte local em `66b2c99` e `verify` success em `3845074` | PASS_VERIFIED |
| G03 | Cadastro admin E2E/D1 | NOT_RUN no AQ | E2E local cria cliente sintético; sem OTP real | PARTIAL_VERIFIED |
| G04 | Galeria e publicação E2E | NOT_RUN no AQ | E2E local publica galeria sintética | PARTIAL_VERIFIED |
| G05 | Upload confiável — bytes/retry | FAIL histórico; NOT_RUN_REMOTE no AQ | Suíte local verde, teto plain `26214400`; sem upload remoto de 25 MiB | PARTIAL_VERIFIED |
| G06 | JWT — testes criptográficos | NOT_RUN no AQ | Testes locais verdes; JWKS de produção não reexercido | PARTIAL_VERIFIED |
| G07 | OTP real | BLOCKED_EXTERNAL | Não executado | BLOCKED_EXTERNAL |
| G08 | Sessão — auth/revogação | NOT_RUN no AQ | E2E local: logout revoga A e preserva B. Sessão Clerk real não revogada | PARTIAL_VERIFIED |
| G09 | Isolamento A/B | NOT_RUN no AQ | E2E local A/B e mídia estrangeira negada | PARTIAL_VERIFIED |
| G10 | Mídia privada — zero bytes indevidos | NOT_RUN no AQ | E2E local e `GET` anônimo de mídia falsa 400 sem imagem | PARTIAL_VERIFIED |
| G11 | Favoritos | NOT_RUN no AQ | E2E local persiste favorito após restart | PARTIAL_VERIFIED |
| G12 | Downloads | NOT_RUN no AQ | E2E local confere bytes do original sintético | PARTIAL_VERIFIED |
| G13 | Frontend cliente | NOT_RUN no AQ | E2E Chromium local, sem dispositivo físico | PARTIAL_VERIFIED |
| G14 | Frontend admin | NOT_RUN no AQ | E2E admin local em nove larguras | PARTIAL_VERIFIED |
| G15 | Acessibilidade assistiva física | BLOCKED_EXTERNAL | axe local sem leitor de tela físico | READY_FOR_AUTHORIZATION |
| G16 | Não regressão pública | NOT_RUN no AQ | Produção atual 200 nas rotas públicas; candidato não implantado | PARTIAL_VERIFIED |
| G17 | CPU/custos | FAIL histórico; NOT_RUN_REMOTE no AQ | Sem medição nova de CPU/custo | PARTIAL_VERIFIED |
| G18 | Backup/restauração byte a byte | PASS histórico scoped; NOT_RUN_REMOTE no AQ | Backup de hoje comparado em memória; `site_media` de fora | PARTIAL_VERIFIED |
| G19 | Segurança independente | BLOCKED_SECURITY | Sem sign-off independente neste SHA | READY_FOR_AUTHORIZATION |
| G20 | LGPD — estúdio | BLOCKED_EXTERNAL | Sem aprovação da controladora | READY_FOR_AUTHORIZATION |
| G21 | PR — CI/revisão | NOT_RUN até o CI do próprio SHA | `verify` success em `3845074`; revisão independente e merge continuam abertos | PARTIAL_VERIFIED |
| G22 | Release | BLOCKED_EXTERNAL | Sem autorização de merge ou cutover | READY_FOR_AUTHORIZATION |
| G23 | Rollback testado | BLOCKED_EXTERNAL | Runbook reconciliado; restore lógico isolado; produção não revertida | PARTIAL_VERIFIED |
| G24 | Handoff verificável | NOT_RUN no AQ | Este arquivo e o JSON | PASS_VERIFIED |

## Corte que não foi feito

Para o domínio público passar a sair da Hostinger, a alteração seria nos registros proxied de `punctumpicture.com` e `www.punctumpicture.com` na zona Cloudflare. A zona Hostinger já aponta para `*.cdn.hstgr.net`, mas não é a autoridade. O retorno é a version `e9b62f5d-acc5-4ad3-8319-24a0c7e98ee7` e o proxy atual do Worker. Isso continua sem autorização.
