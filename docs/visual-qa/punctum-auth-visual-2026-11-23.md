# Punctum | Auditoria visual da autenticação do cliente

**Data:** 2026-11-23
**GOAL:** `PUNCTUM-AUTH-VISUAL-001`
**PR de implementação (draft):** [#60](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/60)
**Base:** `feature/punctum-album-templates-20261123` / PR #48
**Plano:** `docs/superpowers/plans/2026-11-23-punctum-auth-visual-alignment.md` (PR documental #59)
**Estado inicial:** `PARTIAL_VERIFIED / PRODUCTION_NO_GO`
**Revisão editorial:** pendente, sem autorização de merge/deploy.

## Diagnóstico reproduzido

Captura Android enviada pelo responsável: `/albuns/entrar` com fundo bege, texto longo, passos de navegação e botão "Entrar com Clerk", divergente da home com identidade fotográfica e paleta pública `nocturne-plum`.

Evidência do código anterior:
- `app/albuns/albuns.css` impunha `--pa-bg:#f4efe7` no namespace completo de álbuns.
- `app/albuns/components/ClientLogin.tsx` construía o bloco textual separado da composição fotográfica.
- `app/albuns/components/ClerkClientLogin.tsx` expunha o nome do provedor no texto voltado ao cliente.
- `app/components/SiteThemeRoot.tsx` e `app/lib/server-content.ts` já forneciam resolução do tema do Studio.

## Alterações na PR #60

- `ClientAuthShell`: aplica `SiteThemeRoot` apenas nas telas de entrada e troca de senha, com tema **publicado** e sem cursor ornamental.
- `ClientLogin`: composição fotografica com logo e mídia **públicos** do repositório, cópia curta, CTA claro, estados de senha preservados.
- `auth.css`: escopo exclusivamente visual `.pa-auth-shell`, grid desktop, foto decorativa de baixo contraste no mobile, controles ≥48px no CTA, foco, safe areas e redução de movimento. Os temas `.pa-themed` das galerias não foram editados.
- `ClerkClientLogin`: linguagem voltada ao usuário, sem mudar `SignInButton mode="modal"`, logout ou troca de sessão.
- `client-auth-presentation.spec.ts`: cinco asserções de tema, alternância de paleta, foto/logo, senha e modo legado.
- `client-auth-visual-qa.mjs`: matriz visual 320, 360, 390, 430, 768, 1024 e 1440 px, incorporada ao E2E sintético local existente.

## Evidências verificadas

| Etapa | Resultado |
| --- | --- |
| TDD RED: GitHub Actions [run 45252116506](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/45252116506) no commit `5684333` | CI falhou em `typecheck` por `ClientAuthShell` ausente (TS2307). |
| TDD RED: Martha local, Vitest | Suite falhou por módulo `ClientAuthShell` ausente, conforme esperado. |
| Verificação de regressão intermediária | Typecheck aprovado na run 45252730389; lint detectou argumento `children` inadequado em um teste. Corrigido. |
| Vitest unitário específico no checkout Martha, commit `a78c989` | **5/5 testes PASS**, 1 arquivo, duração 3,10 s. |
| Diff GitHub contra branch-base | 9 arquivos de apresentação/testes modificados, 0 alterações em Worker, dados, migrations ou APIs. |

## Verificações não homologadas nesta evidência

- A aprovação do pipeline completo do SHA final, a matriz de browser real, capturas e contraste estão sujeitos ao resultado final do CI.
- O login Clerk real de Development e a aparência do modal do provedor não foram homologados fisicamente nesta entrega.
- Acessibilidade real Android TalkBack/iOS VoiceOver, conteúdo editorial e aprovação da fotógrafa permanecem gates externos.
- Nenhum ambiente de produção, cliente real, Clerk Production, D1/R2 remoto, DNS, Cloudflare ou Hostinger foi modificado.
- O `PRODUCTION_NO_GO` do R4 permanece. Nenhuma conclusão visual promove os gates G01–G24 do projeto.

## Handoff

Atualizar este relatório com SHA, run ID, resultados de browser/axe-core, screenshots e status do CI final. Corrigir falhas reproduzidas por RED→GREEN em branch draft. Não abrir acesso real nem realizar cutover como consequência da alteração visual.


## Verificação conclusiva de CI no candidato técnico

**SHA verificado:** `b4a751a3a595f2929840d0051c313ae779a28222`.
**GitHub Actions:** [CI #45255580432](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/45255580432), job `verify` #137976405038, **completed/success** em 23/11/2026.
**Evidência visual:** [artifact `r4-browser-evidence` #14857452552](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/45255580432/artifacts/14857452552), contendo 13 arquivos incluindo `client-auth-390.png`, `client-auth-1440.png` e `report.json`.

- `npm ci`, `npm audit --audit-level=low`, `npm run typecheck`, `npm run lint`, `npm run build` e suite E2E: **PASS** no mesmo candidato.
- Vitest principal **69 arquivos e 384 testes aprovados**; Vitest adicional da Colagem **7 testes aprovados**; testes Node/Python adicionais do workflow executados sem falha. Teste unitário específico do login com Clerk stub **6/6 PASS**.
- Chromium real no CI, `/albuns/entrar` em fixture sintética `password`, larguras **320, 360, 390, 430, 768, 1024, 1440 px**: todos os checks passaram; sem overflow e CTA >=48px.
- `axe-core` WCAG 2.1 A/AA para login: **390 px: 21 passes, 0 violations, 1 incomplete para revisão manual**; **1440 px: 22 passes, 0 violations, 0 incomplete**. Não equiparar o resultado automatizado ao aceite de leitor de tela físico.
- A suite de segurança `access` da PR #48 continuou isolada e **PASS**: negação anônima, pertences A/B, mídia privada, favoritos, downloads, troca/logout de sessões, restore e Studio. **Zoom real 200% Chromium PASS** para biblioteca, galeria, lightbox, admin e home.
- A execução local na Martha com Chrome instalado atingiu os checks de apresentação e segurança, mas falhou **depois** no verificador de zoom específico do navegador (`sample.cssWidth != 640`); não ocultar esse resultado. A execução canônica no Chromium versionado do GitHub Actions passou no mesmo verificador.
- O 503 inicial do E2E foi rastreado ao fato de o fixture existente `CLIENT_AUTH_MODE=access` interceptar `/albuns/entrar`. **Correção de teste**, não do backend: `client-auth-visual-qa.mjs` cria um **segundo** Miniflare com D1/R2 sintéticos e modo `password`; o fixture Access original e seus controles permanecem intactos. `client-auth-visual-qa.test.mjs` verifica esse isolamento.

### Gates ainda pendentes

**PENDING / PRODUCTION_NO_GO:** aceite editorial de Maria Helena, revisão visual humana das capturas, teste físico TalkBack/VoiceOver, modal e sessão Clerk real em Development, revisão de segurança independente do SHA e demais autorizações originais R4 G01–G24/H01–H06 aplicáveis. Esta entrega não altera a decisão de release e não autoriza merge em `main`, ativação de flags ou publicação.


## Aceite do responsável — 24/11/2026

O responsável aprovou as capturas da PR #60 e autorizou commit e deploy na Hostinger Unlimited. Integração preparada sobre a main `81606834ffeb3b6ae96a76a0ea0cfa77236ad404`, preservando o acesso ao Studio `/acesso` introduzido após a base original. O aceite não equivale a revisão independente de segurança nem a aprovação geral R4. CI do candidato integrado, modalidade real Clerk, recuperação e preservação de armazenamento continuam sujeitos a verificação. Nenhum deploy foi realizado no momento deste registro.


## Publicação visual autorizada — 24/11/2026

PR #61 incorporada à main, CI 45495664727 concluída com sucesso. Deploy solicitado explicitamente pelo responsável no domínio `punctumpicture.com` e executado pelo MCP Unlimited Hostinger, mantendo as configurações Node.js 24 e as variáveis de ambiente existentes. A fonte foi alterada de archive para Git, na branch de release `release/punctum-auth-visual-20261124` (não na main, para evitar publicação automática de futuros pushes na main). Build `01a20f9b-b8c9-722f-94a2-2d8735d013cc`, checkout confirmado `38a78fef09bfc8e5dc54c8949335e06051233cd6`, estado completed às 22:11:38 UTC. Bootstrap: createdDatabase=false, dbFileExists=true, hasLayoutPresetColumn=true, adminClerkLinked=true, integrity=ok, import não solicitado. O campo sourceSha do bootstrap ainda contém `81606834ffeb3b6ae96a76a0ea0cfa77236ad404` porque o ambiente foi preservado; não deve ser usado como prova da versão publicada. A fonte do build Hostinger comprova o SHA novo. GET público sem cache em `/albuns/entrar?qa=1795558308` retornou HTTP 200, `pa-auth-main` e texto 'Suas fotografias' presentes, `pa-entry-grid` e 'O que fica' ausentes. Não houve teste real de login, revisão independente, QA física ou aprovação geral do R4. Publicação visual verificada por HTTP; demais gates permanecem independentes. Não alterar a branch vinculada sem decisão explícita.
