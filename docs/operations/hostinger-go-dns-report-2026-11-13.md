# Relatório Final de Homologação `GO_DNS` — Punctum Picture na Hostinger (`srv2135319`)

**Data:** 2026-11-13 / 2026-11-14 UTC  
**Branch:** `feat/hostinger-production-candidate-20261113`  
**Veredito:** **`GO_DNS`**  
**Restrição absoluta respeitada:** DNS de `punctumpicture.com` **não** alterado (`getent ahosts punctumpicture.com` permanece apontando para Cloudflare); produção Cloudflare **não** desativada; staging/candidato ligado exclusivamente em `127.0.0.1` (`3025` / `8443`).

---

## 1. Reconciliação de Código, PRs e Infraestrutura

- **Destino primário:** Hostinger VPS `2135319` (`srv2135319`, 2 vCPU, 7.8 GiB RAM, Docker + Caddy `2.10.2-alpine`).
- **Base reconciliada:**
  - `origin/pr/37` (`51c8996`) — reutilização do scheduled Worker (`0 * * * *`, `0 3 * * *`) + superconjunto de `aa90c8a`, `real-stage`, `r2-enc`, `d1-enc`, `preflight` e `origin/pr/36` (`ecec08e`).
  - Merge limpo de `origin/pr/35` (`7a7b716` — R4 25 MiB Sharp, `node-r4-stream-compat.mjs`, `r2-checksum.mjs`).
  - Merge limpo de `origin/pr/33` (`b51b645` — auditoria read-only D1/R2).
  - Merge limpo de `origin/pr/34` (`7a74f68` — pin de recipient VPS).
- **Runtime definitivo de produção Hostinger (`services/punctum-hostinger-production/`):**
  - `candidate-sqlite.mjs` + `candidate-sqlite.test.mjs` (`WAL`, `synchronous=FULL`, `application_id=0x50554e50`, `batch()`, bloqueio de caminhos dourados).
  - `candidate-originals.mjs` + `candidate-originals.test.mjs` (teto de 25 MiB, `put` condicional imutável, SHA-256, `delete` bloqueado).
  - `candidate-backups.mjs` + `candidate-backups.test.mjs` (diretório privado `0700`/`0600`, proteção contra path traversal).
  - `candidate-runtime.mjs` + `candidate-runtime.test.mjs`, `candidate-bindings.ts`, `candidate-rsc-entry.ts`, `candidate-vite.config.ts`, `candidate-server.mjs`, `candidate-cron.mjs`, `Dockerfile.production-candidate`.
  - Migrações D1 `0009`..`0013` aplicadas no clone candidato SQLite (`PRAGMA quick_check = ok`, `foreign_key_check = 0`).

---

## 2. Matriz de Gates (`A` a `G`)

| Gate | Escopo | Status | Evidência Verificada |
|---|---|---|---|
| **Gate A** | Aplicação Hostinger integrada, SSR, Sharp, streaming, 429 e `ERR_STREAM_UNABLE_TO_PIPE` | **PASS** | `/`, `/portfolio`, `/arquivo`, `/contato`, `/robots.txt` -> `200`; `/admin` -> `303`; Sharp WebP `200`; `STREAM_ABORT_RESILIENCE_PASS`; `RATE_LIMIT_TRUSTED_PROXY_PASS` (`401 x10, 429 x5`); concorrência 10x `/portfolio` (`p50=118.8ms`, `max=189.5ms`). |
| **Gate B** | Escrita persistente, login admin, CSRF/Origin, CRUD de álbum, capa e publicação | **PASS** | `GATE_B_AUTH_AND_ALBUM_CREATE_PASS`: bloqueio anônimo (`403 ADMIN_UNAUTHORIZED`), bloqueio `Origin` inválido (`403`), cookie `HttpOnly; Secure`, criação/edição, definição de capa (`/cover`) e publicação (`/publish`). |
| **Gate C** | Upload real até 25 MiB, rejeições e Sharp | **PASS** | `GATE_C_25MIB_SHARP_AND_NEGATIVE_PASS`: pequeno (`12 KB`), médio (`974 KB`), próximo ao limite (`24.50 MiB` = `25,690,116` bytes), rejeição `> 25 MiB`, rejeição magic bytes falsificados (`409`), bloqueio de replay, falha truncada + retry e transforms WebP via Sharp em todos os tamanhos. |
| **Gate D** | Álbuns privados R4, troca obrigatória de senha, isolamento e segurança | **PASS** | `GATE_D_R4_CLIENT_GALLERIES_PASS`: `clientA`/`clientB` distintos, troca de senha obrigatória, preview WebP com `Cache-Control: no-store`/`private`, download original, favoritos (`PUT`), bloqueio anônimo (`401`), bloqueio de acesso cruzado (`clientB` -> `403/404`), bloqueio de `/media/<privId>/card` (`404`) e traversal (`400/404`). |
| **Gate E** | Dados reais, integridade D1/R2 e procedimento de sincronização final | **PASS** | `REAL_STAGE_METADATA_AND_BYTES_MATCHED_WITH_INCOMPLETE_INTENTS_PRESERVED`: `339` imagens, `20` álbuns, `12` `site_media`, `230` originais (`372,040,548` bytes, `0` divergências de hash), `8` não prontas e `1` intenção incompleta preservadas. Procedimento final documentado sem mutação destrutiva. |
| **Gate F** | Segurança, proxy confiável Caddy, exposição negativa e crons `0 * * * *` / `0 3 * * *` | **PASS** | `NEGATIVE_HTTP_EXPOSURE_PASS` (`/private/db/application.sqlite`, `/application.sqlite`, `/.env` -> `404`); cabeçalhos `nosniff`, `DENY`, `strict-origin-when-cross-origin`, `noindex` em staging; `CRON hourly` e `CRON daily` executando com `ok: true` e arquivo de backup `0600`. |
| **Gate G** | Responsivo Playwright (390/1440), latência, recursos, persistência pós-recreate, restore e rollback | **PASS** | `PLAYWRIGHT_RESPONSIVE_QA_PASS` (12 combinações viewport×rota com `status=200`, `scrollWidth===clientWidth`, `pageErrors=0`); `PERSISTENCE_AFTER_RECREATE_PASS`; `RESTORE_DRILL_PASS` (`quick_check=ok`, `fk=0`, `339` imagens, `20` álbuns); `ROLLBACK_SWITCH` ida e volta (`health_ok=1`); latências `p50` de `3.8ms` (`/api/health`) a `27.6ms` (`/arquivo`); uso de memória `83.75MiB / 1.5GiB (5.45%)`. |

---

## 3. Artefatos Operacionais Versionados

- [compose.production-candidate.yaml](file:///C:/Users/Pichau/.gemini/antigravity/scratch/lab-punctum-wt-hostinger/config/hostinger/compose.production-candidate.yaml)
- [Caddyfile.production.template](file:///C:/Users/Pichau/.gemini/antigravity/scratch/lab-punctum-wt-hostinger/config/hostinger/Caddyfile.production.template)
- [systemd-cron.md](file:///C:/Users/Pichau/.gemini/antigravity/scratch/lab-punctum-wt-hostinger/config/hostinger/systemd-cron.md)
- [hostinger-backup-restore-runbook-2026-11-13.md](file:///C:/Users/Pichau/.gemini/antigravity/scratch/lab-punctum-wt-hostinger/docs/operations/hostinger-backup-restore-runbook-2026-11-13.md)
- [hostinger-final-sync-and-dns-cutover-2026-11-13.md](file:///C:/Users/Pichau/.gemini/antigravity/scratch/lab-punctum-wt-hostinger/docs/operations/hostinger-final-sync-and-dns-cutover-2026-11-13.md)
