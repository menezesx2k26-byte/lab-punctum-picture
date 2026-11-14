# Cron Schedules — Punctum Picture na Hostinger (`srv2135319`)

Substituição dos cron triggers da Cloudflare (`worker/scheduled.ts`) pelo runner Hostinger (`services/punctum-hostinger-production/candidate-cron.mjs`), executado dentro do container `punctum-production-candidate` (ou via `systemd` timers no host).

## Schedules Migrados

| Schedule | Função Real (`worker/scheduled.ts`) | Comando |
|---|---|---|
| `0 * * * *` (horário) | Limpeza de uploads pendentes expirados, galerias/imagens privadas expiradas e buckets antigos de rate limit (`rate_limit_buckets`). | `docker exec punctum-production-candidate node services/punctum-hostinger-production/candidate-cron.mjs hourly` |
| `0 3 * * *` (diário, 03:00 UTC) | Backup lógico diário/semanal/mensal do SQLite para `/private/backups/backups/d1/{daily,weekly,monthly}/...` (permissões `0700`/`0600`) e aplicação da política de retenção (7d diário / 28d semanal / 183d mensal). | `docker exec punctum-production-candidate node services/punctum-hostinger-production/candidate-cron.mjs daily` |

## Instalação via `systemd` Timers (Recomendado para Produção após Cutover)

```ini
# /etc/systemd/system/punctum-cron-hourly.service
[Unit]
Description=Punctum Picture Hourly Maintenance
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker exec punctum-production-candidate node services/punctum-hostinger-production/candidate-cron.mjs hourly
```

```ini
# /etc/systemd/system/punctum-cron-hourly.timer
[Unit]
Description=Run Punctum Picture Hourly Maintenance

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

```ini
# /etc/systemd/system/punctum-cron-daily.service
[Unit]
Description=Punctum Picture Daily Backup Cron
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker exec punctum-production-candidate node services/punctum-hostinger-production/candidate-cron.mjs daily
```

```ini
# /etc/systemd/system/punctum-cron-daily.timer
[Unit]
Description=Run Punctum Picture Daily Backup at 03:00 UTC

[Timer]
OnCalendar=*-*-* 03:00:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```
