# Pacote de revisão G19/G20/G22/G23 — sem aprovação

Código: `c0e0e45f3a7416391aefe6ae3cdfa3e782447de2`. Aplicação/contratos/migrations/dependências idênticos a `397d1077`; esta rodada altera ferramentas de prova e testes. SHA documental final é registrado no recibo de fechamento.

## Revisor independente G19

Parecer formal: **PENDENTE**, responsável não designado, zero P0/P1 não atestado. Revisão auxiliar desta execução não substitui essa decisão.

| Fronteira | Artefatos de análise | Prova/limite |
|---|---|---|
| JWT/Access/admin | `worker/utils/auth.ts`, `worker/client/auth.ts`, `worker/api/client-session.ts` | Negativos criptográficos e sessões locais; configuração/JWKS/runtime real precisa de revisão independente |
| Isolamento/cache | `worker/client/router.ts`, `worker/media/private-gallery.ts`, `worker/public-home-cache.ts`, `worker/index.ts` | A/B, mídia404/zero bytes, flag-off, optimizer; não substituir inspeção de bindings/políticas reais |
| Upload/integridade | `worker/api/client-gallery-upload.ts`, `worker/client/gallery-integrity.ts`, raster helper e migrations0011/0013 | v3 SHA/HMAC/R2condicional/CAS; v2 legado, retry/races e limite20M mantidos;25MiB FAIL |
| Snapshot público | `worker/public-home-snapshot.ts`, mutation fences e produtores | SHA/epoch/build/fences; HTML não vazio só via staging confiável; produtor de produção ausente |
| Export/auditoria | `worker/client/lgpd.ts`, `worker/api/client-admin.ts` | Export allowlist, D1.batch e A/B; aprovação de finalidade/retencão/canal não inferida |
| Recovery | `scripts/lib/private-recovery.ts`, scripts/tests r4 recovery/rollback | Imutabilidade, quarentena e rotação; demonstração remota integral pendente |

Revisor deve registrar identidade/papel independente, SHA/ambiente, procedimentos, achados com severidade, correções/readback, riscos residuais e aceite expresso. Sem segredos em evidências.

## G20 — controladora

Usar `docs/operations/private-albums-r4/11-lgpd-decisions.md`. Finalidade/base legal, retenção/eliminações/backups, terceiros, exportação/entrega, incidentes e canal continuam **PENDENTES**. Não preencher termos jurídicos nem assinar por Maria.

## G22 — decisões específicas

| Etapa | Decisão real | Evidência |
|---|---|---|
| R1 integração/merge conforme SPEC | NÃO AUTORIZADO | AUSENTE |
| R2 deploy com flagfalse | NÃO AUTORIZADO | AUSENTE |
| R3 ativação clientes/flagtrue | NÃO AUTORIZADO | AUSENTE |

Pedidos técnicos autorizam os testes/commits desta rodada; não promovem nenhuma etapa acima. CI do novo SHA, revisão, SPEC e gates técnicos/externos devem estar reconciliados antes da decisão.

## G23 — sequência reproduzível para o operador autorizado

1. Preflight somente leitura: confirmar conta, D1/buckets/Worker QA exatos, privacidade, custos/franquias, destino vazio existente autorizado e versão/config anterior recuperável. D1 anterior401 e subscriptions403 continuam bloqueios, não autorização de mudança.
2. Capturar manifesto inicial sanitizado de versão/traffic/settings/bindings e hashes/contagens/relações de D1/R2; preservar fixtures existentes. Não executar restore sobre destino ocupado e não criar/excluir D1 nesta missão.
3. Capturar backup privado append-only da fixture sintética explicitamente autorizada; validar bytes/hash do readback antes de restore. Usar contrato `10-d1-r2-recovery.md`; nenhum UPSERT global.
4. Restaurar apenas no destino aprovado; comprovar hash de cada objeto, vínculos/FK/capa, estado/quarentena e segredo independente. Nenhuma versão de sessão sozinha invalida todos os cookies pós-backup.
5. Em QA autorizado: flag-off, versão/config anterior, mídia GET/HEAD404/zero bytes, sessões antigas negadas, reentrada fresca controlada; comparar versão/settings antes/depois. Sem migration reversa destrutiva.
6. Verificar home/Studio/rascunho/Colagem e rollback visual isolado sem publicar rascunhos. Demonstrar restauração de disponibilidade sem vazar mídia de terceiros.
7. Readback final completo e recibo de cleanup/rollback. Resultado ambíguo exige inspeção antes de retry. Não apagar evidências/histórico para obter PASS.

Esta sequência é procedimento preparado. **Não foi executada remotamente nesta rodada.** Provas locais estão nos testes/reports e não promovem G23.
