# Procedimento de Sincronização Final e Cutover de DNS — Punctum Picture

> **RESTRIÇÃO ATUAL:** Este documento descreve o procedimento preparado e validado para o cutover futuro. **Não** executar alteração de DNS de `punctumpicture.com` nem congelamento/desativação da produção Cloudflare sem autorização explícita do usuário no momento da virada.

---

## 1. Pré-requisitos para a Janela de Cutover

1. Todos os gates `A` a `G` homologados em `GO_DNS`.
2. Acesso administrativo Cloudflare (D1, R2, DNS) e SSH na VPS `2135319` (`srv2135319`).
3. Janela de baixo tráfego combinada com o usuário para evitar uploads/edições simultâneas no Cloudflare Studio durante o delta final.

---

## 2. Sincronização Final Reproduzível (Cloudflare -> Hostinger)

Objetivo: eliminar qualquer divergência entre a produção Cloudflare e o snapshot Hostinger antes da virada de DNS, preservando as 8 referências não prontas e a intenção incompleta (ou qualquer novo registro criado até a janela).

### Passo 1 — Congelamento temporário de escrita (somente na janela de cutover)
- Suspender novas publicações/uploads no Studio da Cloudflare (ou entrar em modo manutenção breve).

### Passo 2 — Exportação delta D1 e R2
- Exportar snapshot D1 atualizado (SQLite/SQL) e verificar `PRAGMA quick_check = ok` e `PRAGMA foreign_key_check = 0`.
- Sincronizar novos objetos R2 (ou verificar `sha256` dos objetos existentes) via transferência criptografada CMS/SSH para `/opt/punctum/private/production/originals/` com permissões `0700`/`0600`.
- Executar `validate-real-parity.mjs` sobre o diretório de destino para confirmar:
  - `missingReady === 0`
  - `checksumMismatch === 0`
  - `integrity_check === ok`
  - `foreign_key_check === 0`

### Passo 3 — Promoção atômica na VPS `2135319`
1. Subir o container definitivo `punctum-production-candidate` via `config/hostinger/compose.production-candidate.yaml` com `candidate.env` de produção (`PUNCTUM_CANDIDATE_ENVIRONMENT=production`, `PUNCTUM_CANDIDATE_ORIGIN=https://punctumpicture.com`, `PUNCTUM_CANDIDATE_PUBLIC_URL=https://punctumpicture.com`).
2. Configurar o Caddy principal (`/etc/caddy/...` ou `menezes-mcp-https-https-1`) com o bloco de `config/hostinger/Caddyfile.production.template` para `punctumpicture.com` e `www.punctumpicture.com` apontando para `127.0.0.1:3025`.
3. Instalar e habilitar os `systemd` timers descritos em `config/hostinger/systemd-cron.md` (`0 * * * *` e `0 3 * * *`).
4. Validar localmente via `--resolve punctumpicture.com:443:127.0.0.1` antes de alterar o DNS público:
   - `GET /api/health` -> `200`
   - `GET /`, `/portfolio`, `/arquivo`, `/contato` -> `200`
   - Amostras `/media/<id>/card` -> `200` (`image/webp`)
   - `GET /robots.txt` sem `X-Robots-Tag: noindex` (modo produção ativo).

---

## 3. Cutover de DNS e Critérios Objetivos de Rollback

### Cutover
1. Reduzir TTL dos registros `A`/`AAAA`/`CNAME` de `punctumpicture.com` e `www.punctumpicture.com` na Cloudflare para `60s` com antecedência.
2. Apontar `punctumpicture.com` (e `www.punctumpicture.com`) para o IP público da VPS `2135319` (`179.236.241.135`), inicialmente **DNS-only** (nuvem cinza) para emissão/validação direta de certificado TLS pelo Caddy.
3. Monitorar emissão ACME no Caddy, logs do container `punctum-production-candidate`, latência e taxa de erro `5xx` por 15–30 minutos.
4. **Manter a produção Cloudflare em standby read-only** por pelo menos 24–72 horas antes de qualquer desativação.

### Rollback Instantâneo (em caso de anomalia crítica pós-cutover)
1. Reverter os registros DNS de `punctumpicture.com` e `www.punctumpicture.com` de volta para a origem Cloudflare (com TTL `60s`, propagação < 2 minutos).
2. Preservar logs e snapshot SQLite da VPS para análise causal antes de nova tentativa.
