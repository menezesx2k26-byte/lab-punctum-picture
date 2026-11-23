# R4 ciclo AC — execução autorizada

Baseline local limpo `9e086f446817d93f08655cf82031c702eaf1f3c9`, árvore `3f55d91fbdd23ffaa22891cc4ea747edb3edaccf`. Remoto PR32 `f591706114ace01aeb4881b00c490ba8de289c54`, ancestral confirmado. Worktree takeover já isolada. Push sem force falhou por ausência de autenticação HTTPS; não reescrever commits para contornar.

## Escopo

Preservar arquitetura, 25 MiB contratuais, teto operacional 20.000.000, flags, dados e provas históricas. Nenhuma escrita Cloudflare. Custo incremental R$ 0,00. DoD global continua NO_GO_PRODUCTION.

- [x] Inspecionar Git/PR/alterações e tentar publicação fast-forward.
- [x] G17: TDD para recusar CPU parcial, inválida ou não atribuível à requisição/versão/entrypoint; integrar coleta de identidade sanitizada e preservar avaliações separadas de first access e doze MISS/purge.
- [x] G15: executar o que o ambiente permite, completar análise de contraste e preparar zoom real sem substituir por viewport emulado.
- [x] G05: registrar alternativas oficiais e restrições específicas, mantendo FAIL enquanto pipeline completo não for provado.
- [x] G19/G20/G22/G23: validar regressão e pacote de revisão/rollback sem simular signoff ou QA remoto.
- [x] G01/G24: procurar fonte/checkpoints por integrações autorizadas; preservar históricos.
- [x] Regressão focada e completa, lint/typecheck/build/audit; logs, SHA/árvore, matriz e commits novos.
- [ ] Publicar e acompanhar CI exata se a autenticação for resolvida; registrar dependência concreta caso contrário.

## Implementação G17

Arquivos: `scripts/lib/r4-cpu-readonly.mjs`, `scripts/r4-cpu-readonly.test.mjs`, `scripts/r4-cpu-ephemeral-qa.mjs`.
Reprodução: o correlator atual descarta CPUs inválidas antes de tomar o máximo, e aceita um único evento sem provar que o entrypoint PublicHome foi medido. O summarizer também aceita máximo negativo e não exige janela válida na primeira requisição.
RED: CPUs ausentes/negativas/mistas, evento de outra versão/Ray, evento só do entrypoint padrão, duplicata de invocação e janela temporal invertida precisam recusar qualificação.
GREEN: exigir identificação e CPU válida de cada invocação default/PublicHome, mesma versão/Ray, preservar anomalias na evidência e falhar fechado. Testar normalização do Ray com sufixo de colo e eventos epoch/ISO.
Verificação: `node --test scripts/r4-cpu-readonly.test.mjs`, conjunto Node operacional, `npm test`, Colagem, lint/typecheck/build/audit. Não executar probe remoto sem seus preflights externos.

**Fechamento:** testes locais, relatório e evidências curadas registrados em `67-cycle-ac-2026-11-12.md` e `evidence/cycle-ac-20261112/`. Itens externos e publicação seguem abertos; não é DoD concluído.
