# R4 — retomada controlada dos álbuns privados (2026-11-07)

## Autoridade e escopo
- Base lida de GitHub: PR #24 (draft/unmerged), branch `agent/hst-001-hostinger-qa-20261028`, SHA `50e8fc4b2c1dd43a10bd8f56b4127cd3a108a1dd`.
- Trabalho isolado em `fix/punctum-albums-r4-completion-20261107`. As PRs #13, #17, #20, #24 e a documentação de álbuns guiados na PR #25 continuam preservadas.
- Esta rodada visa corrigir falhas reproduzíveis sem merge, deploy, alteração de políticas Access, billing, D1/R2 remotos nem dados de clientes.
- Observação: a configuração de QA gerada em `scripts/lib/r4-edge-qa.mjs` não adiciona `images`; isso impede G05 na rota real de conclusão, independentemente do sucesso em Miniflare.

## Correções com testes de regressão
1. **Fail-fast em intenções de upload sem IMAGES.** Antes, o POST criava imagem e intenção D1 mesmo sem serviço de decodificação; só o complete retornava 503. Novo teste em `tests/integration/client-upload-config.spec.ts` reproduziu falha (o handler retornava 201) e passou após exigir binding antes de criar a intenção. O guard de conclusão segue fail-closed. Rate-limit/consulta de galeria precedem o guard; o teste garante especificamente zero novas linhas de imagem e intenção no álbum, não zero escritas D1 de qualquer natureza.
2. **HTTP 409 não representa upload aceito.** Em `PrivateGalleryEditor.tsx`, o XHR tratava status 409 como sucesso, embora o endpoint retorne 200 para repetição idêntica legítima. Novo teste `tests/unit/client-gallery-ui.spec.ts` RED (função inexistente), GREEN via `isSuccessfulPrivateUpload`; o editor agora só considera HTTP 2xx sucesso. Conflitos seguem o fluxo de erro, sem avançar como bytes confirmados.

## Verificações
- TDD #1: falha observada na asserção 503 (Response 201), depois 2/2 testes PASS.
- TDD #2: falha observada em função ausente, depois 6/6 testes focados PASS (dois arquivos).
- Após a primeira alteração apenas: 224/224 testes em 54 arquivos, typecheck/lint/build e diff-check PASS.
- Após as duas correções e o ajuste de dependência: **225/225 testes Workers em 54 arquivos PASS**, typecheck PASS, lint PASS, build PASS, Colagem 7/7 PASS, harness R4 Edge 8/8 PASS, diff-check PASS.
- Auditoria RED: 8 achados moderados em cadeia transitiva ESLint -> typescript-eslint -> minimatch 10.2.5. O simples update para 10.2.6 não resolveu. GREEN: override estritamente escopado para `@typescript-eslint/typescript-estree > minimatch@11.0.5`, instalado com a mesma árvore `eslint-config-next@16.4.3`, **npm audit --audit-level=low: 0 vulnerabilidades**.
- Teste local `node --test scripts/access-cookie-navigation.test.mjs`: BLOCKED_ENV; faltava o binário `chromium_headless_shell-1208` na instalação Playwright desta máquina. Não é falha de asserção do produto nem evidencia PASS; CI executa `npx playwright install --with-deps chromium` em runner separado.
- CI do commit final precisa ser verificada pelo SHA exato; não confundir provas locais com CI remota.

## Limites críticos não promovidos
- **G05**: ainda FAIL até upload real validado num QA com `IMAGES` explicitamente autorizado, evidência dos bytes e retry. Nosso fail-fast reduz o dano operacional, mas não confirma o serviço.
- **G17**: ainda FAIL. Última medição Edge histórica do relatório 25: CPU p50/p95/p99 31/57/145 ms (candidato anterior), incompatível com a meta Workers Free de 10 ms por invocação. Nenhum benchmark do novo HEAD.
- **G15**: físicos Android/iOS e tecnologias assistivas ainda insuficientes; emulação não equivale a aparelhos reais.
- **G19/G20**: revisão de segurança independente autorizada e sign-off LGPD da responsável do estúdio não comprovados.
- **G23**: rollback integral QA, inclusive Studio/Colagem e reabertura, não testado.
- **G22**: produção não autorizada enquanto os gates de entrada estiverem abertos. Pedido geral de finalizar não substitui prova de readiness.
- `PRIVATE_GALLERIES_ENABLED=false` na configuração versionada da produção; não alterado.

## Custo zero e verificações externas
- Cloudflare Images Free, conforme página oficial consultada em 2026-11-07, inclui até 5.000 transformações únicas/mês; acima desse teto, novas transformações retornam erro e não geram cobrança automática no Free: https://developers.cloudflare.com/images/pricing/ . `.info()` é gratuito. Isto **não** prova franquia, plano ou binding efetivo da conta Punctum.
- A sessão Wrangler local está logada na conta `bfe54392...`, distinta da conta de destino Punctum `257bca43...`; nenhuma alteração remota por essa sessão.
- A autenticação GitHub CLI local é inválida; usar o conector GitHub autorizado para entregar PR e conferir CI, sem pedir segredo ao usuário.

## Próximos gates, em ordem
1. Consolidar commit/PR filho da #24 e comprovar CI do SHA exato.
2. Verificar plano, entitlement de Images e orçamento da conta correta por integração somente leitura; se faltar evidência, parar antes de mudar bindings ou enviar arquivos.
3. Medir um candidato real de CPU com critérios R$0, sem interpretar sucesso do workflow como sucesso do produto.
4. Homologar upload, mídia, UX e segurança em QA sintético isolado com quotas suficientes, sem modificar os dados QA históricos.
5. Concluir dispositivos físicos e acessibilidade, revisão independente, LGPD da responsável, rollback completo.
6. Somente então aplicar autorização explícita de release, merge/migration/deploy controlado e verificação pós-publicação.