# R5 — desenho de jornadas, autorização, QA e revisão técnica preliminar

**Fase:** planejamento read-only, sem aprovação humana para implementação. **Status de revisão:** análise técnica interna de fontes e código; **nenhum subagente independente foi executado** e não há parecer formal. Objetivo: permitir que revisores de segurança, frontend/acessibilidade e custo retomem em paralelo sem escritores concorrentes.

## Jornada integrada da Maria (admin)
1. **Studio → Solicitações/Pendências:** listagem privada, contagem, estados loading/vazio/erro/retry, filtro por cliente/álbum, sem mídia de terceiros em preview. Só Maria ou papel admin validado.
2. **Configurar álbum:** regra exata N / até N / livre (mín. 1); downloads de finais permitidos ou bloqueados; expiração opcional; abertura autoral em blocos permitidos **só para provas**; grade padronizada. Auditoria de edição e `expectedRevision` com conflito 409.
3. **Upload seguro de provas:** usar auth/intent/R2 existente. Produzir derivada realmente marcada nos pixels, dimensões reduzidas, MIME e hash fixados, objeto imutável; falha IMAGES/CPU impede publicação e renderização cliente. Nunca fallback ao original.
4. **Acompanhar seleção:** ver favoritos em painel próprio; seleção preliminar separada de recibo confirmado. Somente Maria pode reabrir rodada, registrando evento e mantendo recibos prévios imutáveis. Bloquear associação de final a prova fora do conjunto confirmado vigente.
5. **Finais externas:** Maria edita fora do serviço e faz upload via intent seguro, vinculando `proofImageId→finalVersionId`; v1/v2 em R2 distintas, com hashes. Nenhum overwrite em bytes/versões históricas.
6. **Compor entrega privada:** seis blocos tipados `cover,text,photo,sequence,divider,closing`; reorder por teclado e mouse, copy, ocultar/remover, crop por ocorrência com limites, reuso sem duplicar objeto. Validar referências, autoria/tenant e performance no preview (320–1440).
7. **Publicação explícita:** confirmar candidatos e versões elegíveis; snapshot imutável, ponteiro publicado único/atômico e evento depois do commit. Entrega 25/30 publica só 25 finais e sinaliza cinco pendentes; bloqueio se houver item sem permissão.
8. **Solicitações/reedições:** cada foto ou pedido geral com estados, motivo e thread contextual; aprovar pedido não publica nada. Maria prepara candidato editado; cliente revisa 4/5, recusa uma e pode revogar aceitação pré-publicação (D28); Maria só publica as aceitas, mantendo versão anterior das pendentes.
9. **Gestão de acesso e avisos:** expirar álbum sem apagar dados; titular pode pedir renovação, Maria concede/nega. Monitorar eventos in-app/outbox e falhas de email, sem chamar entrega de `sent` sem recibo real.
10. **Conclusão/rollback:** manter versão publicada, histórico e R2 imutáveis, flag OFF por padrão, inspeção/restore somente em QA isolado após autorização.

## Jornada integrada do cliente
1. Cloudflare Access OTP já existente → biblioteca própria, loading/sem álbuns/erro/sessão expirada, noindex e cache privado. Usuário B não vê existência, imagem, contador ou mensagem de A.
2. Abre álbum válido → abertura autoral, explicação da regra, grade de provas derivadas com marca em pixels; foco visível, alt apropriado, lazy-loading, navegabilidade por teclado/toque.
3. Seleciona: exact N, max entre 1 e N, free ≥1; contador + feedback de faltantes/excesso; favoritos são independentes. Confirmar apresenta revisão dos IDs e recibo; duplo clique/replay/corrida não geram confirmação duplicada.
4. Após confirmação: estado `em edição`, seleção fechada; pedidos não reabrem. Ação de Maria pode autorizar nova rodada com histórico.
5. Abre entrega publicada parcial ou completa: somente finais da última revisão, narrativa por blocos responsivos; pendentes indicadas sem imagem de prova apresentada como final. Download só com permissão.
6. Abre solicitação por foto/geral, responde em thread contextual com textarea segura. Não há aprovação implícita.
7. Revisa candidato antes/depois via imagem privada com teclas/touch e labels claros; aceita/rejeita por foto e desfaz aceite pré-publicação com evento audível. A versão antiga segue visível até publicação explícita.
8. Recebe aviso in-app e, somente se envio real comprovado/permitido, e-mail sem fotos; se expirar, vê cartão de acesso bloqueado e pede renovação, mas nenhum GET/HEAD de mídia serve bytes.

## Matriz de autorização deny-by-default por recurso

| Recurso / método | Titular ativo | Outro cliente | Maria autenticada | Expirado / revogado | Estado |
|---|---|---|---|---|---|
| Biblioteca GET | somente metadados de seus álbuns | nenhum ID alheio | administração por rota separada | apenas metadados mínimos do próprio bloqueado | API atual + extensão |
| Workflow/seleção GET, PUT, POST confirm | dono, enquanto aberto; CAS/idempotência | 404 opaco, 0 bytes | GET + reabrir em rota admin auditada | leitura mínima, mutações negadas | novo |
| Favoritos PUT | dono, sem afetar seleção | 404 | não é seleção | negar mídia | R4 existente |
| Prova GET/HEAD | **derivada** pronta com watermark real e owner | 404, 0 bytes | original protegido por rota admin dedicada | zero bytes | estender |
| Final GET/HEAD | somente `finalVersionId` do **snapshot publicado atual** | 404, 0 bytes | versão histórica com trilha auditada | zero bytes | novo |
| Candidato GET/HEAD | somente item pendente de revisão do próprio pedido | 404, 0 bytes | admin dentro do álbum | zero bytes | novo |
| Composição draft GET/PATCH | proibido | proibido | Maria, allowlist + CAS | admin com validação | novo |
| Publish POST | proibido | proibido | Maria, seleção confirmada, hashes e decisões | bloqueado se acesso inválido | novo |
| Requests/messages POST/GET | dono do álbum, anti-CSRF, rate-limit | 404, sem conteúdo | Maria no inbox correto | renovação como exceção mínima | novo |
| Renovação POST/decision | pedir, nunca autoativar | 404 | conceder/negar com auditoria | pedido sem mídia | novo |
| Batch manifest / finais GET | somente revisão atual, finais e `allowDownloads` | 404, 0 bytes | inspeção admin controlada | zero bytes | novo |
| API + otimização pública | nenhum key R2, CDN no-store, noindex | negação indistinguível | separado | nenhum bytes | sempre |

Em cada rota servidor/Worker, validar sessão real, principal/role, vínculo cliente-galeria-foto, status da derivada/versão, validade, `GET` e `HEAD`, revogação e flag. Fazer validação antes de `R2.head/get` e antes de gerar headers reveladores. `404` sem payload sensível para IDOR; `410` apenas metadado do próprio álbum expirado. Reusar `worker/client/router.ts`, `worker/media/private-gallery.ts`, `worker/client/repository.ts`, `worker/utils/auth.ts`; não usar `/_vinext/image` para privados. Testes negativos: A tenta IDs e URLs de B, versões antigas, prova sem marca, candidato sem aprovação, link persistido após expiração, `HEAD`, `If-Match` stale, `Idempotency-Key` repetida, CSP/source-map/OG/HTML público.

## Fixtures sintéticas reprodutíveis (PROPOSTAS; nenhum dado foi escrito)
- Maria admin sintética; cliente A `cliente-a@invalid.example`, cliente B `cliente-b@invalid.example`; identidades devem usar a autenticação local de QA ou stub **apenas** de testes, nunca bypass de produção. `invalid.example` identifica endereço não entregável, não usar para teste de email real.
- Álbum A1: 30 provas coloridas de 2–3 paletas, hashes distintos, dimensões e MIME válidos, 30 `proofImageId`; seleção exact 30; finais para provas 1–25, cinco pendentes; três blocos reutilizam foto #3 com crops diferentes. Rodada de revisão para fotos #1–5: quatro aceites, uma rejeição; uma das quatro revogada antes de publicar (portanto publicar somente três candidatas novas).
- Álbum A2: seleção max 5; testar zero, cinco, seis; 5 imagens válidas, favorito #1 sem confirmar. Álbum B1: seleção free; uma prova pronta; B tenta cada ID/URL A1 (inclusive HEAD, download, review, request, batch).
- A1 expira em `2030-01-01T00:00:00Z`: relógio controlado em 1 ms antes, instante de expiração, após; GET/HEAD de todas as categorias ficam sem bytes, renewal não reabre automaticamente.
- Imagens sintéticas: arquivo PNG/JPEG com bitmap geometricamente reconhecível e watermark real de texto `PROVA / PUNCTUM`; capturar SHA256 de input/derivada/final, dimensões e pixel amostrado. Para upload remoto homologado, exigir autorização específica e conta QA.
- UI: cenário desktop 1440/1024/768, tablet 430, smartphone 390/375/360/320; zoom 200%, landscape, dark/forced contrast quando aplicável, reduced motion, teclado/foco, touch e screenreader; capturas nomeadas `gate-device-width-state.png`, referência a SHA do build.
- Cenários negativos: 401 sessão revogada, 403 CSRF, 404 IDOR, 409 CAS, 410 metadado expirado titular, 422 contagem, 429 flood, 503 falta IMAGES/email, interromper download/retry, perder rede e voltar, seleção stale, publicação parcial com R2 faltante.

## Revisão técnica preliminar (não independente)
- **Segurança:** principal risco novo é ampliação de categorias de mídia sem checagem server-side de estado; o endpoint R4 atual serve presets por `galleryId` e `imageId` com validação existente, porém R5 precisa de checagens adicionais para watermark, candidato e snapshot. Confirmar FKs compostas, no-store, denial GET/HEAD, saída escapada de mensagens e blocos tipados. Bloquear `P0/P1` até correção/teste.
- **Frontend/acessibilidade:** `PrivateGallery.tsx` já usa loading/alert/favoritos; separar seleção sem mutar seu significado. Editor público Studio fornece dnd-kit/sensores, não licença para HTML arbitrário. Verificar foco após modal, Escape, contrastes, layouts 320px, 200% zoom, mensagens SR e conteúdo realista. Teste Playwright emulado **não** promove dispositivos físicos.
- **Custos:** contas/telemetria reais não foram consultadas, zero gasto registrado nesta preparação não demonstra custo operacional zero. A R4 mostra CPU Edge do candidato `1d30b97` p50/p95/p99 31/57/145ms, **acima dos 10ms Free**, mas a medição é histórica e não testa a R5/HEAD. Não atribuir a correção de CPU à R5.

## Limites oficiais e decisão financeira pré-implementação (28/10/2026)
- Workers Free: 100.000 requests/dia, 10 ms CPU/req, 128 MB RAM e 50 subrequests/req. Fonte: https://developers.cloudflare.com/workers/platform/limits/
- R2 Standard Free: 10 GB-mês armazenamento, 1 milhão operações Classe A/mês, 10 milhões Classe B/mês; franquia não é aplicável ao Infrequent Access. Fonte: https://developers.cloudflare.com/r2/pricing/
- Images Free: 5.000 transformações únicas/mês; exceder bloqueia novas transformações (9422); contrato/entitlement e binding devem ser verificados antes de uso. Fonte: https://developers.cloudflare.com/images/pricing/ e https://developers.cloudflare.com/images/optimization/binding/
- Cloudflare Email Sending para destinatários arbitrários requer Workers Paid; envios a endereços **verificados** podem ser gratuitos e não substituem emails reais a clientes. Fonte: https://developers.cloudflare.com/email-service/ e https://developers.cloudflare.com/email-service/platform/pricing/
- Streaming ZIP no Worker com CPU não comprovada é proibido por este plano. Comparar ZIP stream no navegador (memória incremental e Browser APIs), pacote gerado pela Maria antes da publicação sem duplicação indevida, e Worker stream só depois de prova CPU. Não carregar dezenas de objetos simultaneamente em RAM.
- Modelo para preencher com telemetria real: `freeRequestsRemaining`, `workerCpuP50/P95/P99`, `r2StoredGiB`, `r2ClassA/BUsed`, `imagesUniqueTransformed`, `batchBytesPeakMemory`, `emailProviderAndReceipt`, `runtimeSha`, `accountPlan`. Sem dados de contrato/franquia, considerar **orçamento não homologado**, eventual `BLOCKED_COST` após medição.
- Nenhuma habilitação de billing, Workers Paid/Images Paid/queues pagas/serviços pagos; cada experimento futuro precisa ser seguro na franquia comprovada. Preferir medições locais e dados sintéticos antes de qualquer chamada externa.

## Riscos e rollback projetado
1. **Privacidade (P0):** feature OFF por padrão, deny-by-default no router e mídia, nenhuma URL R2 pública. Desabilitar a feature preserva R4 e objetos históricos.
2. **Integridade (P0):** operações append-only para confirmação, versão final, revisão e evento; rollback de UI/rotas sem apagar dados. Migração aditiva `0010` testada em DB isolado; nenhuma migração remota agora.
3. **Custo (P1):** interromper experimento no limite de CPU/Images/almacenamento, sem fallback inseguro; manter download e email bloqueados quando não comprovados.
4. **Regressões R4 (P1):** testar Access OTP, logout, sessionVersion, upload R4, favoritos, roteamento, site público/SEO/Colagem/Studio; não alterar `docs/operations/private-albums-r4/`.
5. **Operação (externo):** G05/G17 FAIL e G15/G19/G20/G22/G23 BLOCKED_EXTERNAL na R4 independem de PP01–PP10 e exigem trilhas próprias.

## Critérios de revisões futuras
- Segurança: revisor distinto de implementador, assinatura/identidade, matriz de endpoints GET/HEAD + mutações, evidência A/B/CSRF/XSS/CAS, severidade e resolução P0/P1.
- UI/A11y: revisor distinto testa foco, leitor de tela, contrastes WCAG 2.2 AA, touch e responsividade com conteúdo realista; captura/browser build SHA; QA Android/iOS físicos por participantes autorizados.
- Custos/infra: revisor distinto comprova tipo real da conta, franquias/reservas, CPU runtime, R2/Images e transportes email; anexa consultas/fonte, cálculo de margem conservadora e custo incremental observado.
- Pareceres permanecem **pendentes** até chamadas/revisões com identidade verificável; esta análise preliminar não satisfaz PP09 nem G19.

## Evidência e handoff
`01-executable-matrix.md` contém ordem, TDD, DoD e logs exigidos. Próximo agente deve verificar commits atuais/ownership local e aprovação antes de criar código, executar testes ou transformar `NOT_RUN` em `PASS`. PersistFlow/Engram/Drive não foram escritos ou validados nesta preparação.
