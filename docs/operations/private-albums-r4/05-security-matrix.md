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
