# Punctum — liberação da colagem autoral

Data: 2026-10-26. Solicitação explícita: integrar PR #14 à main e publicar o site principal.

## Limites

- A PR #13 de álbuns privados permanece separada; este release **não** ativa OTP/álbuns privados nem migra acessos.
- O Worker de produção é `punctum-picture-migration`, site `https://punctumpicture.com`; o deploy de `main` usa `.github/workflows/cloudflare-git-main.yml`.
- Estado público observado antes do release: HTTP 200, preset `intenso-noturno`, 329 fotos, 19 álbuns e 8 categorias. Esses números **não** são defaults e não devem ser regravados.
- Dados editoriais, mídias, ordem da página, links, autenticação, D1 e buckets R2 existentes devem ser preservados.

## Sequência segura

1. Checar HEAD e CI da PR #14, incluindo o teste de transição de preset.
2. Integrar apenas a PR #14 na `main`, sem criar novas migrações ou tocar na PR #13.
3. Aguardar o workflow Git main → Cloudflare Worker. O gate captura o estado real anterior e verifica que o deploy de código não regrava a configuração publicada nem reduz contagens do acervo; remove contagens fixas desatualizadas.
4. Somente após sucesso do deploy, disparar manualmente `.github/workflows/publish-colagem-production.yml` na `main`.
5. O script de ativação usa as credenciais administrativas já existentes no GitHub Actions para **ler primeiro** o Studio, bloquear se houver um rascunho não publicado, carregar a implementação real de `applySitePreset`, verificar campo a campo que somente identidade, tema e variantes visuais mudam, salvar com controle de revisão e publicar via APIs versionadas do Studio.
6. Conferir o preset `colagem-autoral` pela API pública, preservação de 329/19/8 (ou baseline mais recente), home/ensaios, imagens, mobile e autenticação. Preservar o ID anterior publicado para eventual restauração.

## Recuperação

- Se o deploy do Worker produzir erros críticos, consultar o runbook `docs/operations/PUNCTUM-ROLLBACK.md` e usar uma versão previamente **verificada como ativa**; o SHA de setembro nesse runbook é histórico e não deve ser considerado automaticamente o último estado estável.
- Se a alteração visual causar regressão mas o Worker permanecer saudável, usar o histórico do próprio Studio para restaurar a versão publicada anterior registrada pelo script; confirmar a revisão atual antes de restaurar, nunca sobrescrever trabalho simultâneo de outro administrador.
- Nunca reverter ou limpar D1/R2 para trocar aparência. O workflow automatizado deve abortar sem modificar Studio quando houver rascunho não publicado.

## Gates fora de escopo

TalkBack, VoiceOver, iPhone físico e testes OTP reais da PR #13 continuam pendentes. O QA Chrome local de 320–1440 px da PR #14 está documentado separadamente, com testes, fotos de evidência e CI verde.
