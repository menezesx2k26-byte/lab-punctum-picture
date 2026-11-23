# Integração R4 — evidência e limites

Main `a77654281a80be3c9e8857f4aef2744a942a991b`; PR #13 `a735103c13af206980dbc60e9b6491a21eaf96b8`; base comum `af55e1526b731be099e804335eb143d2b5cfa95e`. Merge sem commit executado em branch isolada baseada na main. A tabela completa de 108 arquivos consta em 01-integration-inventory.md.

| Ponto | Resultado da integração | Verificação |
|---|---|---|
| worker/index.ts | roteador privado anterior às rotas públicas, sem substituir o handler público | suites Worker/media; revisão de segurança ainda em andamento |
| worker/scheduled.ts | backup e limpeza privados adicionados; lógica pública mantida | testes de maintenance; recuperação remota atual pendente |
| db/schema.ts | cinco entidades adicionais; migration 0009 aditiva | testes de schema; nenhuma migration remota executada |
| AdminShell.tsx | navegação privada condicionada à flag; navegação pública mantida | typecheck/build; browser admin pendente |
| cloudflare-git-main.yml | versão main preservada, flag privada falsa adicionada | diff auditado; não executado |
| ci.yml | gates da Colagem e publicação da main preservados; teste bridge acrescentado | execução GitHub pendente |
| package / lock | main reconciliada com dependências e overrides corrigidos da PR; auditado | auditoria e suíte locais; conferir resultado no handoff |

Os arquivos `app/components`, `app/lib` e componentes do Studio não sofreram mudanças no diff da integração; isso não prova a ausência de regressão em runtime. A execução pública inicial no código integrado passou 43 arquivos/172 testes, 22 testes Node e 7 testes da Colagem; após mudanças de segurança, reexecutar antes da conclusão. OTP real, restore e homologação em aparelhos reais não foram executados. A CI histórica da PR não constitui evidência deste HEAD.

Uma primeira instalação `npm ci` correu simultaneamente ao merge e falhou por encontrar marcadores temporários de conflito. Uma segunda instalação, depois da resolução, passou; foi refeita após a reconciliação das dependências. Não houve migração, deploy, ativação ou escrita em produção.

## Verificação local após correções

Em 27/10/2026 UTC, no estado de trabalho integrado antes do commit: `npm ci --no-audit --no-fund` PASS; `npm run typecheck` PASS; `npm run lint` PASS; `npm test` PASS, 43 arquivos / 176 testes; `npx vitest run --config vitest.collage.config.ts` PASS, 7 testes; `node --test services/punctum-password-bridge/server.test.mjs scripts/collage-css.test.mjs scripts/publish-colagem-production.test.mjs` PASS, 22 testes; `npm run build` PASS com avisos de sourcemap e rotas desconhecidas; `npm audit --json` reportou zero vulnerabilidades no lock reconciliado. Os resultados são locais e sintéticos, não demonstram OTP real, browser, CPU edge ou recuperação remota. O pool de testes Cloudflare informa depreciação/renomeação.
