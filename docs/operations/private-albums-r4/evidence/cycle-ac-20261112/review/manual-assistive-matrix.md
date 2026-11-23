# G15 — execução física pendente

**Nenhuma linha abaixo foi executada em dispositivo físico nesta rodada.** Desktop Chromium headless com zoom real200% é evidência separada.

Precondição: QA segregado autorizado e recuperável, duas contas sintéticas A/B, galeria publicada com10fotos sintéticas, downloads permitidos/proibidos, álbum vazio/arquivado e admin próprio. Não usar produção, identidade ou fotos de clientes. OTP deve ser digitado pelo titular fora dos logs; registrar apenas resultado sanitizado.

Registrar em cada sessão: aparelho/modelo, OS, navegador, versão TalkBack/VoiceOver, configuração de texto/zoom/reduced-motion, orientação, data, URL QA e versãoWorker/SHA verificados. Evidências não devem conter credenciais/cookies/OTP.

| Caso | Procedimento e resultado exigido | Android Chrome/TalkBack | iOS Safari/VoiceOver |
|---|---|---|---|
| Entrada | Login autorizado, nome/título e avisos anunciados; biblioteca A sem dados B | NOT_RUN | NOT_RUN |
| Biblioteca | Ordem de leitura, nome dos links, vazio/erro/carregando; abrir álbum correto | NOT_RUN | NOT_RUN |
| Galeria | Descrição de fotos, ordem, capa e introdução sem overflow; ações com nomes exclusivos | NOT_RUN | NOT_RUN |
| Lightbox | Dialog nomeado; foco no diálogo; próximo/anterior anunciados; fechar e devolver foco à mesma foto | NOT_RUN | NOT_RUN |
| Favoritos | Estado pressed anunciado; toggle e reload preservam favorito sem revelar B | NOT_RUN | NOT_RUN |
| Download | Ação identificável; original correto quando permitido; negação quando proibido/foreign | NOT_RUN | NOT_RUN |
| Reflow/zoom | Zoom/texto do navegador real200%, retrato/paisagem; nenhuma perda de ação/texto ou scroll horizontal indevido | NOT_RUN | NOT_RUN |
| Movimento | Preferência OS reduced-motion aplicada; navegação não depende de animação | NOT_RUN | NOT_RUN |
| Admin | Labels, seleção cliente/tema, progresso, erro/retry, capa/ordem/publicação compreensíveis com assistiva | NOT_RUN | NOT_RUN |
| Logout/revogação | Retornar/logout e sessão revogada negam conteúdo, sem leitura/cache de fotos anteriores | NOT_RUN | NOT_RUN |

Contraste: revisar os alvos que permanecem `REQUIRES_MANUAL_REVIEW`/`UNSUPPORTED_COMPOSITING` no report qualificado, incluindo imagens, gradientes, pseudo-elementos e sobreposição. Bound conservador baixo não é violação automática. Assinar resultado observado, falhas, versão e evidência; não preencher PASS por inferência.
