# PUNCTUM R4 — ciclo G | limpeza segura de R2 e leitura de chave canônica

**Data:** 08/11/2026. **Missão:** SPEC R4 original §23, DoD G01–G24. **Decisão de produção:** `NO_GO_PRODUCTION`. **Custo incremental autorizado:** R$ 0,00. Nenhum deploy, merge, alteração de QA remoto, conta Cloudflare, D1/R2 real, fotografias reais ou infraestrutura compartilhada.

## 1. Baseline reconciliado

- PR [#32](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/32): open/draft/unmerged, base `agent/hst-001-hostinger-qa-20261028`.
- HEAD remoto anterior: `13e8e89af2d842d26aaf240b3c847981b072cb69`; tree `2b45f400619fec5545b540ca02999aa9eaf3a1ac`; parent remoto `41028b3e650dd5f91ef23b66a9e352f19a23b2cc`.
- Checkout local irmão `2f7aacae132f8c8b4b7d156c444c2c4c9619524d`, mesma tree; worktree inicialmente limpa. F [CI #42533343668](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42533343668) completed/success; não retroatribuir ao ciclo G.
- A SPEC original `PUNCTUM_SPEC_R4_ALBUNS_PRIVADOS.txt` não está no checkout; mapeamento histórico preservado em `16-original-g01-g24-reconciliation.md` e GOAL 36. Nenhum conteúdo ausente foi presumido.

## 2. Contraprovas RED — Miniflare, D1/R2 exclusivamente sintéticos

1. **Cross-tenant / mesma galeria (G05/G09/G18):** um intent expirado da imagem pending A apontava para `storage_key` de fotografia ready B, com bytes e SHA conhecidos. O cleanup anterior se limitava a `startsWith("client-galleries/")` e **excluiu o objeto R2 B**. RED: `expected null not to be null`. O teste cobre também chave de outra foto da mesma galeria.
2. **Leitura privada (G09/G10):** uma linha D1 ready restaurada tinha chave de outra fotografia na mesma galeria ou extensão incompatível com MIME. `servePrivateGalleryImage` usava somente prefixo da galeria e chegou a `bucket.get/head`; o proxy de R2 produziu `Mismatched key must not read R2` em vez de 404. Variações de GET/HEAD para thumb/gallery/download.
3. **Corrida restauração/cleanup (G18):** após o claim do intent e antes da atualização da imagem, o teste promove a imagem a `ready`. A atualização retorna zero linhas, mas o cleanup anterior ainda apagava R2. RED: `expected null not to be null`.

Os três RED são reproduções locais; não demonstram incidente em fotografia real ou exploração externa.

## 3. GREEN e arquitetura da correção

- Função pura `privateGalleryStorageKey(galleryId,imageId,mimeType)` compartilhada entre criação/continuação de upload, cleanup e mídia. Aceita somente segmentos seguros, tipos suportados e a chave exata `client-galleries/<gallery>/<image>.<jpg|png|webp>`.
- A seleção do cleanup agora requer JOIN entre intent/imagem com galeria+image ID, MIME, tamanho e chave idênticos, status de imagem diferente de ready e chave canônica SQL. Rows restauradas inconsistentes ficam fora da varredura: **não apagadas e não declaradas concluídas**; requerem triagem/quarentena posterior. Intents válidos continuam aptos a retry.
- O claim no D1 repete os vínculos e predicados temporais sob `UPDATE ... RETURNING`. A transição da imagem `status=failed` exige as mesmas identidades e `meta.changes=1` antes de qualquer DELETE R2. Uma corrida que promova/retire a imagem não apaga bytes nem marca cleanup concluído. Falhas do `R2.delete` permanecem retentáveis, sem `completed_at` falso.
- A mídia autenticada exige chave exata da imagem ready, antes de R2 e Images. Para chave incorreta retorna 404/NOT_FOUND sem leitura/transformação; nenhuma URL ou cache público criado.
- Sem alteração de migrations, formato dos objetos, endpoint público, payload de cliente ou limite operacional de 20.000.000 bytes.

## 4. Validação e escopo

- Focused RED inicial: **2 novos testes falharam**, demais 18 passaram. RED adicional concorrência: **1 novo teste falhou**, 3 passaram.
- GREEN focado definitivo: **21/21** em 2 arquivos, incluindo cleanup legítimo, retry de R2.delete, fotos ready, MIME, concorrência e isolamento. Vitest amplo final após o ajuste: **250/250 em 57 arquivos** (anterior: 249/249 antes do último teste).
- Demais verificações da rodada: **Node 14/14**, **SSR Miniflare 1/1**, TypeScript, ESLint e build Vinext 5 estágios PASS, `npm audit` **0 vulnerabilidades**, Chromium local E2E PASS (clientes sintéticos A/B, galeria, Studio/Colagem, oito larguras, restart, rollback, logout). Avisos preexistentes de sourcemap/classificação Vinext e `workerd` pump canceled observados sem falha dos jobs. CI exact-SHA final continua obrigatória.
- Ferramentas: Vitest/Miniflare D1/R2 sintéticos; TypeScript; ESLint; build Vinext; Node/SSR; Chromium local; audit do lockfile; CI exata do novo SHA mediante publicação.
- Regras específicas: nenhuma medição CPU Workers Free neste ciclo; nenhum rollback QA remoto; sem prova de 25 MiB end-to-end. A CI e SHA finais serão certificados por readback externo de PR/Drive, e não autodeclarados neste documento versionado.

## 5. Matriz canônica de gates (histórico anterior + impacto novo)

As evidências de `PASS` abaixo são **históricas**, do SHA remoto F e relatórios reconciliados; o ciclo G só expande cobertura técnica local até CI exact-SHA. Todos os campos devem ser interpretados por escopo, sem aprovações inventadas.

| GATE | STATUS | OWNER | SHA | TESTES | AMBIENTE | EVIDÊNCIAS | BLOQUEIOS | PRÓXIMA AÇÃO |
|---|---|---|---|---|---|---|---|---|
| G01 | PASS histórico | Engenharia | F | git/PR/tree | GitHub/local | PR #32, CI F | SPEC original não recuperada | Recuperar fonte original |
| G02 | PASS histórico | Engenharia | F | Workers/Chromium/CI | local/Actions | CI F, diff auditável | nova CI G pendente | CI SHA G |
| G03 | PASS histórico | Admin/Eng. | F | E2E/D1 | sintético | matriz 16/GOAL 36 | QA não repetido G | Revisão de release |
| G04 | PASS histórico | Admin/Eng. | F | galeria/publicação | browser sintético | relatórios 32–43 | sem produção | Revisão regressiva |
| G05 | FAIL | Produto/Images QA | F+G local | uploads/cleanup/hash | Miniflare | RED/GREEN G, fluxo piloto local | SPEC 25 MiB vs Images 20MB, QA produto integrado | Pipeline 25 MiB seguro e homologação real |
| G06 | PASS histórico | Segurança | F | JWT/JWKS | QA anterior | matriz 16 | nova auditoria G19 | Revisão independente |
| G07 | PASS histórico | Access/owner | F | OTP real sanitizado | QA anterior | matriz 16 | físico G15 | Revalidar entrada no aparelho |
| G08 | PASS histórico | Segurança | F | revogação/sessão | QA anterior + local | matriz 16 | release novo | Ensaio autorizado |
| G09 | PASS histórico + RED corrigido local | Segurança | F+G local | A/B, chave canônica | Miniflare | três contraprovas G | G19 independente | Revisão de ownership/restore |
| G10 | PASS histórico + hardening local | Segurança | F+G local | GET/HEAD 404/0 | Miniflare | mídia exata G | release G22 | CI e auditor externo |
| G11 | PASS histórico | Produto | F | favoritos persistidos | Chromium | matriz 16 | sem dispositivo físico | Teste físico |
| G12 | PASS histórico | Produto | F | download/hash | Chromium | matriz 16 | sem QA final | Revalidar consentimento |
| G13 | PASS histórico | UI cliente | F | lightbox/foco | Chromium | matriz 16 | emulação ≠ físico | Teste G15 |
| G14 | PASS histórico | UI admin | F | upload/8 larguras | Chromium | matriz 16 | sem produção | Teste QA produto |
| G15 | BLOCKED_EXTERNAL | Testadores Android/iOS | F | TalkBack/VoiceOver | aparelhos reais | GOAL 36 | NOT_RUN | Matriz física documentada |
| G16 | PASS histórico | UI/Studio | F | public home/Colagem | Chromium/CI | relatórios 32–43 | novo SHA | Regressão e leitura CI |
| G17 | FAIL | Infra/Cloudflare | F | cold/MISS CPU | Workers Free remoto | GraphQL sem amostras atuais | 0 amostras efetivas SHA F/G | Amostrar CPU fria sem custo novo |
| G18 | PASS histórico + hardening local | Backup operador | F+G local | D1/R2 hash/restore | QA anterior + Miniflare | run histórico 40786688338, RED/GREEN G | rollback total G23 | Prova remota segregada autorizada |
| G19 | BLOCKED_EXTERNAL | Revisor independente | F | segurança/IDOR | independente | pacote G e histórico | parecer não emitido | Revisão externa assinada |
| G20 | BLOCKED_EXTERNAL | Responsável estúdio | F | LGPD formal | humano | GOAL 36 | aprovação ausente | Aceite formal da controladora |
| G21 | PASS histórico | Eng./Reviewer | F | CI exact-SHA | Actions | run 42533343668 | CI G pendente | Validar nova run |
| G22 | BLOCKED_EXTERNAL | Proprietário | F | aprovação de release | humano | GOAL 36 | autorização específica ausente | Decisão após demais gates |
| G23 | BLOCKED_EXTERNAL | Operador QA | F | rollback/inventário | Cloudflare read-only | token 200 active; D1 401; subscriptions 403 | nenhum rollback remoto autorizado | Escopos/QA segregado e consentimento |
| G24 | PASS histórico | Documentação | F | handoff/readback | repo/PR/Drive | checkpoints F | readback G pendente | Persistir e conferir checkpoint G |

## 6. Pendências e decisão

**G05 FAIL** — exigência 25 MiB (26.214.400 bytes) sem pipeline seguro validado; preservar guarda 20.000.000. **G17 FAIL** — cold/MISS Workers Free não medido para SHA final. **G23 BLOCKED_EXTERNAL** — token ativo não concede escopos D1/Billing nem autoriza rollback; D1 401, subscriptions 403. **G15/G19/G20/G22 BLOCKED_EXTERNAL** — testes assistivos físicos, parecer independente, aprovação LGPD, release específico.

**`NO_GO_PRODUCTION`**. PR deve continuar draft/unmerged, flag de produção OFF, custo incremental R$0,00. A triagem de intents inconsistentes exige processo autorizado, sem descarte de originais privados.
