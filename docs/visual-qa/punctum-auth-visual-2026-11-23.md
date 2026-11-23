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
