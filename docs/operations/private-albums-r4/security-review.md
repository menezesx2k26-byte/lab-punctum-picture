# Revisão independente — R4

Revisão estática independente solicitada nesta execução. Não equivale a pentest nem a homologação do Access real. As alterações foram verificadas em testes sintéticos locais; o estado e configuração remotos não foram observados.

| ID | Severidade | Evidência e causa | Correção e testes | Estado |
|---|---|---|---|---|
| R4-SEC-01 | alta, condicional a configuração incorreta | A audience de clientes podia coincidir com a administrativa; `requireAdmin` confiava na audience admin, permitindo confusão de aplicações. | Guard verifica igualdade no caminho Access administrativo independentemente de flag/modo e na configuração de clientes. Teste RED falhou pela ausência do guard; GREEN valida flag ligada/desligada com JWT sintético assinado. | Corrigido localmente; configuração real não verificada |
| R4-REL-02 | alta para confiabilidade | R2 podia gravar objeto antes de D1 atualizar intent; retry retornava 409 e ficava sem recuperação. | Retry compara bytes e metadados antes de aceitar objeto existente; intent expirado não avança. RED reproduziu objeto existente/intent pendente; GREEN incluiu bytes divergentes, resposta repetida e PUTs concorrentes. | Corrigido localmente; falha D1 não injetada e teste real edge pendente |

Demais áreas exigem revisão complementar e evidências A/B, restore e OTP reais; não declarar ausência global de P0/P1 por esta revisão. Segredos, JWT completos e fotos reais não foram registrados.
| R4-REL-03 | alta para confiabilidade | Duas confirmações concorrentes: falha tardia de decodificação podia rebaixar imagem `ready` e intent `completed`. | RED coordenou uma falha após a outra requisição concluir e observou `failed`; GREEN exige `ready`/`completed`. Atualizações de falha usam predicados condicionais em batch. A revisão independente confirmou o cenário específico; não executou a suíte. | Corrigido e testado localmente; QA edge pendente |
