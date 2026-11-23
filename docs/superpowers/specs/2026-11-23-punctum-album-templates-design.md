# Punctum R4 | SPEC de templates clicáveis dos álbuns privados | reconciliação com RAG
**Data:** 23/11/2026
**Estado:** candidato em PR draft #48, integrado ao plano R4, nunca release independente ou substituto do DoD.
**Fonte de verdade:** `docs/operations/private-albums-r4/execution-state.json`, SPEC R4 original §22–23, GOAL G01–G24 e handoffs recentes. Não promover gates por interpretação de memória.
**RAG consultado:** Engram, Drive sgtmenezes/GOAL-PUNCTUM-R4-DoD-G01-G24.md, checkpoint R5 22/11 e código/PR #45. Proveniência ao final.

## 1. Escopo e fronteira de produto
O produto são **álbuns privados por cliente**, já planejados e parcialmente implementados. A fotógrafa Maria cria o cliente, vincula a galeria, envia fotografias, define capa e ordem, habilita downloads, publica/despublica e consulta favoritos. Cada cliente acessa somente suas próprias galerias. Os cinco layouts clicáveis alteram **apenas a apresentação** dessas galerias em `/albuns`; não representam contas, sites separados, landing pages públicas ou novos produtos.

Os sete presets já existentes do **site público** são outra superfície e devem continuar intactos. Não duplicar `applySitePreset` ou misturar o draft/publish do Studio com o ciclo privado; eventual melhoria dos templates públicos pertence ao Release A/PR próprio, sem dependência da ativação R4.

**Cinco presets privados, sem editor livre:** `classico` (default, aparência legada), `editorial`, `colagem`, `mosaico`, `cinema`. Miniaturas sintéticas no painel e estilização CSS escopada e responsiva. Nenhuma foto, script, HTML, CSS ou URL arbitrária no registro de preset. Tema `noir|ivory|warm` é escolha cromática separada e preservada.

## 2. Clerk/identidade: reutilização obrigatória
Clerk **já foi integrado** ao R4 e ao Studio nas branches candidatas; não criar novo tenant, aplicativo, login, OAuth ou tabela de usuários. O Studio/admin usa `/acesso` e `/admin/api/clerk-session`; o cliente usa `/albuns/entrar` e `/api/client/clerk-session`. Reutilizar `worker/auth/clerk-auth.ts`, vínculos D1 explícitos (migrations `0014`/`0015`) e `tests/integration/clerk-r4-security-matrix.spec.ts`.

Clerk identifica e verifica a sessão; **D1 é a autoridade de autorização/titularidade/revogação**. Nunca usar o `userId` Clerk como autorização suficiente para ler um álbum. Servidor deve confirmar vínculo ativo com `client_accounts.id`, modo `CLIENT_AUTH_MODE`, issuer, `azp`, sessão, validade, revogação, cliente ativo, galeria publicada e propriedade em toda consulta e mídia. Administração é papel separado, via `requireAdmin`; cliente via `requireClient`. Não relaxar PBKDF2/Access legados enquanto ainda habilitados. Não modificar `ADMIN_AUTH_MODE`, `CLIENT_AUTH_MODE`, `CLERK_AUTH_ENABLED` ou `CLERK_PILOT_ENABLED` por conta dos templates. Confirmar valores efetivos no runtime apenas por leitura autorizada.

## 3. Persistência sem efeitos colaterais
- `client_galleries.layout_preset` é coluna D1 aditiva na migration `0016` com `CHECK` e default `classico`, para compatibilidade com álbuns antigos.
- `shared/client-galleries.ts` define enum + schema Zod estrito e fallback de renderização. `worker/client/repository.ts` lê/serializa o mesmo valor, inclusive em listagem, edição e resposta autenticada.
- `worker/api/client-admin.ts` aceita escolha somente via POST/PATCH **administrativos existentes**, autenticados, Origin validado, rate limit e auditoria no mesmo `D1.batch`. Cliente nunca pode atualizar template nem usar endpoint administrativo.
- Escolha de layout jamais altera `client_id`, `status`, `cover_image_id`, `allow_downloads`, `session_version`, permissões, imagens, posições, favoritos, originais R2, chaves de storage ou modo de publicação.
- `PrivateGallery` seleciona apenas classe/data-attribute resolvido pela allowlist; imagens continuam em `/api/client/galleries/:galleryId/images/:imageId/:preset` e downloads privados autenticados com no-store/noindex, nunca `/_vinext/image` ou CDN público.
- O editor mantém confirmação de salvar/publicar; selecionar cartão não publica nem concede acesso. `draft`, `published` e `archived` seguem os mesmos contratos.
- Com `PRIVATE_GALLERIES_ENABLED=false`, superfícies R4 continuam desabilitadas e templates não podem expor nenhuma galeria. Nenhuma migração remota é implicitamente autorizada.

## 4. Gates canônicos impactados, sem inventar aprovação
G02 integração/diff/testes; G03 cadastro e edição administrativa; G04 publicação; G06–G08 Clerk/Access e sessão; G09 isolamento A/B; G10 zero bytes indevidos e URLs privadas; G11 favoritos; G12 downloads; G13 interface do cliente; G14 interface administrativa; G15 acessibilidade física e zoom 200%; G16 não regressão Studio/site/Colagem; G17 capacidade, franquias e **custo incremental R$ 0,00 incluindo Clerk**; G18 backup/restauração; G19 auditoria independente; G20 LGPD; G21 CI exata; G22 autorização separada; G23 rollback; G24 handoff. G05 requer upload efetivo de **25 MiB = 26.214.400 bytes**, e não se resolve com as miniaturas.

**Histórico canônico no ledger em 22/11:** 17 PASS, 2 FAIL (G05/G17), 5 BLOCKED_EXTERNAL (G15/G19/G20/G22/G23); H01–H06 ainda NÃO VERIFICADOS. Cada prova é condicionada ao SHA e ao ambiente. O próprio ledger mantém `PARTIAL_VERIFIED / PRODUCTION_NO_GO`. Não transformar CI de templates em `G13/G14/G15 PASS` real ou em liberação do Clerk/TLS.

## 5. Segurança, acessibilidade e custo
Interface com cinco botões reais, `aria-pressed`, legendas, foco, toque >=44px, navegação por teclado, tolerância a 320–1440px e `prefers-reduced-motion`. Imagens originais sem corte obrigatório, sem fontes ou assets externos por template. Regressão obrigatória de login/logout, trocar conta, 401/403/404 genéricos, sessão revogada, cliente A/B, favoritos, downloads e despublicação. Não adicionar dependências/licenças pagas, novos serviços ou tokens. Clerk Student/Pro não prova custo zero sem readback de billing, cotas e possibilidade de excedentes; G17 segue FAIL.

## 6. Plano de release
Releases separados: **A** site público/Studio, R4 OFF; **B** álbuns privados com Clerk depois de homologação e autorização específica. `R1` integração em PR, `R2` deploy autorizado com feature OFF, `R3` ativação controlada. Dependências Hostinger: website associado na Unlimited, mas TLS da origem `waiting_for_retry / Domain challenge failed`, build-to-SHA ainda não comprovado e H01–H06 não verificados no checkpoint R5 de 22/11. Não mexer em produção Cloudflare, DNS, Clerk Production, billing, migrações remotas ou dados reais. Não usar VPS 2135319 da Conthabil como destino Punctum.

## 7. Evidência e rastreabilidade
- [GOAL R4 G01–G24 no Drive](https://docs.google.com/document/d/1UtLEPN-XpXUW3bC5owcLRVfEDCqM6bEM/edit)
- [R5 checkpoint 22/11 no Drive](https://docs.google.com/document/d/1SXWSo4TeYZ0LZd-K7OgkGVFi_Y_Eqj77XVgK5AsELiQ/edit)
- [Design inicial dos álbuns privados](https://docs.google.com/document/d/1A4iAg4DRYX23_7p5REn9ojab_oWkIB4o/edit)
- [PR #45 candidato R4](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/45) e [PR #48 templates](https://github.com/menezesx2k26-byte/lab-punctum-picture/pull/48)
- [Ledger](../../operations/private-albums-r4/execution-state.json), [Clerk](../../../worker/auth/clerk-auth.ts), [migrations](../../../migrations), [R4 security matrix](../../../tests/integration/clerk-r4-security-matrix.spec.ts).

**Aceite restrito desta PR:** código revisável + CI exata + QA sintético dos cinco layouts e das negações aplicáveis, com os gates canônicos permanecendo no estado comprovado; sem merge/deploy/ativação.
