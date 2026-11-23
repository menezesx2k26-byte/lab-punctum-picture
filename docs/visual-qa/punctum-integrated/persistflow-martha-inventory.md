# PersistFlow Sandbox / “Martha” inventory

## Observed

| Source | Read-only result | Classification |
| --- | --- | --- |
| `menezes-platform/ops-persistflow-sandbox` README | Says design approved and implementation not started | VERIFIED repository statement; current runtime still unknown |
| `ops-codex-os/docs/persistflow-hostinger.md` | Describes PersistFlow v1 as Hostinger Node app with `FileAuthorityStore` | HISTORICAL/documented architecture; not proof of active service |
| Authority matrix and repository map | Put run continuity in PersistFlow and future execution-plane work in `resident-node`; sandbox is archive | VERIFIED document content; current service wiring unproven |
| `menezesx2k26-byte/resident-node` README | Rust local-first baseline; identity/process/checkpoint/MCP lanes listed as future | VERIFIED repository statement; not proof this is current PersistFlow controller |
| GitHub repository search | Did not find `Gabriel-Codex-OS` or a Martha-owned repository | UNKNOWN/NOT FOUND in the searched scope; absence is not proof of no tenant |
| Hostinger connection lookups for `darkslategrey-raccoon-448222.hostingersite.com` | No matching site record in either queried connection | CURRENT LOOKUP NOT FOUND; conflicts with earlier historical `/healthz` observation |
| PersistFlow Sandbox connector | `PERSIST_SANDBOX_INSPECT` requires `runId`/`workspaceId`; `PERSIST_RUN_INSPECT` requires `runId`; create is mutating; no inventory/list method | VERIFIED tool capability boundary |

## Decision

The current owner/controller, service capacity, active run/workspace, “Martha” identity and any available scratch environment remain **UNKNOWN**. No ID was invented, no sandbox was created, no run was started, and no PersistFlow/Hostinger service was modified. The historical domain is prohibited for Password Bridge deployment. Required next evidence is an owner-provided inventory/run ID through a read-only authorized method, then explicit resource ownership and cost/quota proof.

**Gate: BLOCKED_INFRA_NOT_VERIFIED.**
