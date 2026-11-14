# Runbook de Backup, Restore e Rollback — Punctum Picture (Hostinger VPS `2135319`)

## 1. Arquitetura de Persistência e Backups

- **Banco SQLite (D1-compatível):** `/opt/punctum/private/production/db/application.sqlite` (`WAL`, `synchronous=FULL`, `application_id = 0x50554e50`, permissões `0700`/`0600`).
- **Originais (R2-compatível):** `/opt/punctum/private/production/originals/` (permissões `0700`/`0600`).
- **Backups lógicos D1:** `/opt/punctum/private/production/backups/backups/d1/{daily,weekly,monthly}/` gerados pelo cron diário (`0 3 * * *`) via `services/punctum-hostinger-production/candidate-cron.mjs`.
  - **Retenção automática:** 7 dias (`daily`), 28 dias (`weekly`), 183 dias (`monthly`).
- **Regra de segurança:** nunca sobrescrever o snapshot dourado de importação (`/opt/punctum-qa-20261113/private/production-import-20261113`) nem expor diretórios `/data/*` via HTTP.

---

## 2. Backup Manual Sob Demanda

```bash
# 1) Backup lógico via cron runner do container
docker exec punctum-production-candidate \
  node services/punctum-hostinger-production/candidate-cron.mjs daily

# 2) Snapshot físico consistente do SQLite (online backup API, sem corromper WAL)
mkdir -p /opt/punctum/private/manual-snapshots/$(date -u +%Y%m%dT%H%M%SZ)
chmod 700 /opt/punctum/private/manual-snapshots/$(date -u +%Y%m%dT%H%M%SZ)
python3 -c '
import sqlite3, sys
src = sqlite3.connect("/opt/punctum/private/production/db/application.sqlite")
dst = sqlite3.connect(sys.argv[1])
src.backup(dst)
dst.close(); src.close()
' "/opt/punctum/private/manual-snapshots/$(date -u +%Y%m%dT%H%M%SZ)/application.sqlite"
```

---

## 3. Procedimento de Restore Isolado (Validação Prévia Obrigatória)

Antes de restaurar em produção, validar em diretório isolado (`0700`):

```bash
RESTORE_DIR="/tmp/punctum-restore-verify-$(date +%s)"
mkdir -p "$RESTORE_DIR" && chmod 700 "$RESTORE_DIR"

# Copiar snapshot SQLite candidato (ou reconstruir a partir do JSON diário)
cp /path/to/backup/application.sqlite "$RESTORE_DIR/application.sqlite"
chmod 600 "$RESTORE_DIR/application.sqlite"

# Verificar integridade estrutural e referencial
sqlite3 "$RESTORE_DIR/application.sqlite" "PRAGMA quick_check;"
sqlite3 "$RESTORE_DIR/application.sqlite" "PRAGMA foreign_key_check;"
sqlite3 "$RESTORE_DIR/application.sqlite" "SELECT COUNT(*) AS images FROM images; SELECT COUNT(*) AS albums FROM albums;"
```

Para promover o restore validado para produção:
1. Parar o container `punctum-production-candidate`.
2. Mover os arquivos atuais `application.sqlite*` para um diretório de contingência com timestamp.
3. Copiar o `application.sqlite` validado com permissões `0600`.
4. Subir novamente o container e validar `GET /api/health`, `/`, `/portfolio` e amostras `/media/<id>/card`.

---

## 4. Procedimento de Rollback de Container / Imagem

1. Manter sempre a tag anterior testada na VPS (ex.: `punctum-hostinger-candidate:previous-20261113`).
2. Em caso de regressão após deploy de nova imagem:
   ```bash
   # Atualizar image tag no compose ou recriar com a tag anterior
   docker stop punctum-production-candidate
   docker rm punctum-production-candidate
   # Subir novamente com a imagem anterior mantendo os volumes /data/db, /data/originals e /data/backups
   ```
3. Se a regressão envolver schema/dados gravados após o deploy, restaurar o snapshot SQLite pré-deploy conforme Seção 3.
4. Verificar `GET /api/health` (`200 OK`) e rotas públicas.
