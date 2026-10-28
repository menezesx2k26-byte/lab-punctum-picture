# Matriz de segurança — evidência local parcial

Execução local no conteúdo da árvore `67a6d7e7334425a255e0d25bb3b2c8e8d89e48c9`, CI em acompanhamento. Sessões e JWT dos testes são sintéticos. PASS abaixo significa apenas a asserção descrita em Miniflare/D1/R2 local, não prova de Access, edge ou bucket remoto.

| Cenário | Estado | Evidência/limite |
|---|---|---|
| A lê seu álbum, B nega A; capa de outro álbum negada; favoritos isolados e idempotentes | PASS local | `tests/integration/client-galleries.spec.ts` |
| Mídia própria, cliente B e anônimo negados; download off/on; draft, archived, pending, failed e revogada negados | PASS local | `tests/integration/client-media.spec.ts`; negações verificam status, não prova completa de zero bytes em todo cenário |
| GET/HEAD privado autorizado e negado; `/_vinext/image` | PASS local parcial | `client-media.spec.ts`; não substitui teste do proxy no edge |
| Cookie adulterado, secret errado, sessão antiga e conta desativada | PASS local | `client-galleries.spec.ts` |
| Audience, issuer e claims sintéticos; audiences iguais falham fechadas | PASS local parcial | `client-access.spec.ts`; não prova JWKS nem app Access real |
| 8 requisições simultâneas, limite 2, contador estável e expiração | PASS local | `tests/integration/rate-limit.spec.ts` |
| Upload repetido, colisão com bytes diferentes, concorrência e falha tardia | PASS local parcial | `client-media.spec.ts`; falha D1 entre R2/D1 foi simulada por estado, não injetada |
| Limpeza de pendentes e preservação de fotos prontas | PASS local parcial | `client-maintenance.spec.ts`; restore remoto não executado |
| OTP não concluído, fluxo real e JWT real | BLOCKED_EXTERNAL | requer app e identidade QA verificados e interação segura |
| Link direto R2 e privacidade efetiva do bucket | BLOCKED_EXTERNAL | não foi inspecionada a configuração remota |
| Matriz completa A1/A2/B1, zero bytes em todas as negações e ciclos reais de sessão | NOT_RUN | completar na infraestrutura QA isolada |

A lista não comprova que todos os requisitos da SPEC passaram. Ver também `security-review.md` e `12-release-readiness.md`.

## Atualização incremental Argon R4 (2026-10-27)

- **Zero bytes e zero metadados sensíveis em todas as negações de mídia (`GET`, `HEAD` e `/_vinext/image`)**:
  - Endurecido `worker/client/router.ts` para garantir `new Response(null, { status })` com `Cache-Control: private, no-store` e `X-Robots-Tag: noindex, nofollow, noarchive` em todas as negações de rotas de mídia privada (`/api/client/galleries/:galleryId/images/:imageId/:variant`, `/admin/api/albuns-privados/:galleryId/images/:imageId/:variant`) e requisições `HEAD`.
  - Endurecida a normalização iterativa de `/_vinext/image` (`new URL(decodeURIComponent(path), url).pathname`) para bloquear path traversal com dupla codificação (`/public/%252e%252e/api/client/galleries/...`) e prefixos de storage R2 (`/client-galleries/...`, `/private-galleries/...`) com `404` e `0` bytes.
- **Fronteira B1 em Cloudflare Access (`worker/utils/auth.ts`)**:
  - `requireAdmin` normaliza `payload.email` para minúsculas e exige pertinência explícita a `ADMIN_ALLOWED_EMAILS` também no caminho `cf-access-jwt-assertion`, impedindo escalada de privilégio caso uma identidade não administrativa apresente JWT do domínio Access.
- **Prova automatizada**: `tests/integration/client-security-matrix.spec.ts` (`PASS` local em Miniflare/D1/R2; validação de app Access e bucket R2 remotos permanece `BLOCKED_EXTERNAL` sob política R$ 0 e sem escrita remota).
