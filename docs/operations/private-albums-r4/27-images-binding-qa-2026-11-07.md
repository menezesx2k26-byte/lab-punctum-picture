# Punctum R4 — Images entitlement e ensaio isolado (07/11/2026, horário SP)

## Evidência de consulta real somente leitura

- Novo pipeline seguro `.github/workflows/r4-images-readonly.yml`, rodada [#42436142155](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42436142155): coleta concluída, sem escritas. O Worker dedicado `punctum-picture-r4-qa-20261028` tem apenas bindings DB/QA_VERSION e continua **sem IMAGES**. Contagem remota D1 = **10**, inclusive origem/restauração anteriores; não criar mais D1.
- Coleta subsequente [#42436271209](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/42436271209): assinaturas lidas no token 2 incluem `free`, `teams_free`, `r2_paid`; nenhum produto Images Paid identificado no inventário visível. Workers, D1 e buckets históricos existentes. API `images/v1/stats` responde 403 (storage, não quota de transformações); analytics GraphQL não produziram contagem acumulada utilizável. Não inferir **zero transformações** nem headroom.
- Limites externos: plano Images Free é padrão, tem 5.000 transformações únicas/mês e **não cobra** por excedentes, que são negados com código 9422. Workers Free: 10ms CPU, 100.000 requisições/dia. Fonte oficial: https://developers.cloudflare.com/images/pricing/ e https://developers.cloudflare.com/workers/platform/limits/.
- O controle inicial de GraphQL confundia ausência da propriedade REST `success` com falha; regressão RED/GREEN em `scripts/r4-images-preflight.test.mjs`. Candidatura de teste completo de upload continua bloqueada por consumo não comprovado, falta de binding e D1 sem slots livres.

## Ensaio efêmero sem exposição de dados

Novo caminho independente `scripts/r4-images-ephemeral-qa.mjs`, ativado somente por commit marcado `[r4-image-binding-qa]` em GitHub Actions, usa a conta exata e token já conectado, com controles:

- Antes de qualquer escrita, assinatura Free, inventário completo, ausência do nome único de Worker e margem em slots de Workers; se não comprovados, bloqueia.
- Cria apenas Worker temporário `punctum-r4-images-probe-<GITHUB_RUN_ID>` com Workers.dev e `IMAGES`. **Sem DB, ORIGINALS, BACKUPS, ASSETS, Access, domínio de produção ou fotos reais**.
- Endpoint obscuro com nonce efêmero mascarado; leitura gratuita `IMAGES.info` e **uma** transformação `2x2→1x1` de PNG sintético codificado em fonte; exige resposta real válida. Nunca renderiza input de usuário.
- Remove somente o Worker recém-criado, verifica inventário posterior, falha se a limpeza não for comprovada. Se o deploy ficar ambíguo, preservar evidência e não deletar recursos de terceiros.
- Validações locais: 8 testes Node PASS dos guards e do Worker sintético, e `wrangler deploy --dry-run` compilou 1,80 KiB com apenas `IMAGES` e variável de teste, nenhuma conexão remota.
- Resultado **da execução remota** será anexado apenas após leitura do run e artefato; não declarar G05 PASS por um probe de binding. G05 exige caminho do produto: D1/R2 upload real, bytes, retry, autenticação e mídia privada, em QA apartado.

## Não promovido

G17 CPU Free continua FAIL, mesmo com prova do binding; G15 aparelhos reais/tecnologia assistiva, G19 revisão independente, G20 decisões LGPD, G23 rollback Studio/Colagem permanecem sem aprovação completa. `PRIVATE_GALLERIES_ENABLED=false` em produção. Sem merge/deploy de site, sem migração de dados, sem upgrade pago; **NO_GO**.