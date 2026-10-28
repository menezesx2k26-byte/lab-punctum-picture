# HST-001 — operação e rollback do QA

Estado em 28/10/2026: **BLOCKED; procedimento de implantação NÃO executado**. O domínio histórico Hostinger atende PersistFlow; não é alvo do Punctum. Nenhuma mudança de Access, D1/R2 histórico ou produção é autorizada por este procedimento.

## Arquitetura e decisão atual

Navegador → Access/Worker → D1/R2. O adaptador de processamento externo continua opt-in por `CLIENT_PASSWORD_BACKEND=hostinger`. O valor ausente/`local` mantém o comportamento anterior. `CLIENT_AUTH_MODE=access` continua sendo o modo principal.

O serviço existente só implementa PBKDF2 de senha. Em Access, os fluxos de senha de cliente são rejeitados e a criação de clientes utiliza marcadores `ACCESS_ONLY`. Isso não explica automaticamente a cauda de CPU do Worker. Não ativar senha nem enviar fotografias para justificar o uso do serviço. Imagens continuam no R2/Cloudflare Images até haver medição e autorização de transferência específicas.

## Pré-condições para implantação isolada

1. Obter inventário atual do hPanel/API/SSH usando conexão segura existente: plano contratado, apps Node e slots livres, CPU/RAM/processos/disco, domínio HTTPS, diretórios, usuários e dependências. Não tomar documentação histórica como prova de capacidade atual.
2. Excluir expressamente o site `darkslategrey-raccoon-448222.hostingersite.com` e toda a autoridade, diretórios, secrets, logs e processos PersistFlow. Não reiniciar ou editar essa aplicação para testar o Punctum.
3. Comprovar capacidade adicional incluída no contrato e isolamento de processo, diretório e secrets. Nenhuma contratação, renovação, upgrade ou plano pago automático. Se não for possível, manter BLOCKED.
4. Identificar operação pesada com CPU por invocação/rota e versão, em workload sintético. Se nenhuma operação justificar transferência, manter processamento no Worker e registrar a decisão.
5. Confirmar franquias e uso agregado Cloudflare/Hostinger. Preço-base zero de assinatura R2 não comprova custo de uso zero. Reservar QA independente com D1/R2 comprovadamente vazios, sem tocar nos dois históricos de cinco contas.

## Pacote Node existente — somente se a operação de senha for elegível

- Runtime Node suportado pelo plano; código nativo em `services/punctum-password-bridge/`. Entrada: `node services/punctum-password-bridge/index.mjs`; nenhuma dependência npm adicional do serviço.
- App/site **dedicado** com HTTPS validado, `PORT` atribuído pelo gerenciador e proxy somente para seu próprio processo. Não servir diretório privado ou nonce pelo HTTP.
- Secret `PUNCTUM_PASSWORD_BRIDGE_SECRET` gerado no mecanismo seguro do provedor, exclusivo e de 32+ bytes. Não reutilizar chaves Access, sessão, PersistFlow ou outro ambiente. Não colocar secret no comando, arquivo versionado, resposta ou log.
- `PUNCTUM_PASSWORD_BRIDGE_REPLAY_DIR`: caminho absoluto privado, durável e externo ao deployment, fora de `hbuilds`, `nodejs` e `public_html`. Réplicas precisam compartilhar **o mesmo diretório** com criação exclusiva atômica. Caso contrário, manter uma única réplica isolada e não alegar proteção entre réplicas.
- Gerenciador persistente e recuperação após reinício precisam ser fornecidos pelo plano e testados no app dedicado; não improvisar daemon em hospedagem sem esse suporte.
- Logs gerados pelo app contêm apenas `event`, `status` e `durationMs`; o startup informa só evento/componente. Desabilitar captura de body/headers/query no proxy/APM. Verificar também logs do provedor, não apenas os do código.
- Limites do serviço: corpo 4096 bytes, senha 1–1024 caracteres, quatro requisições simultâneas por processo, até 120 requisições autenticadas/minuto/processo, timestamp ±30s, nonce persistido 60s. Limitar também o agregado na borda se houver múltiplas réplicas. Os timeouts de entrada não comprovam tempo de execução de PBKDF2 no hardware remoto.
- Health: `GET /healthz`, somente `{ok,component}`. Processamento: `POST /internal/punctum-password/v1`, HMAC SHA-256 sobre `timestamp + "\n" + nonce + "\n" + body`. Nunca chamar pelo navegador nem expor segredo ao cliente.
- Validar payload/resposta exatos e PBKDF2-SHA256/310000 contra referência independente. Serviço não guarda senha, hash nem fotografia; somente nonces.

## Integração reversível do Worker QA

Este passo está bloqueado e **não foi executado**. Não alterar o modo Access para habilitar um coprocessador de senha sem utilidade demonstrada.

Quando existir operação elegível, versão imutável e QA vazio autorizado: preservar uma versão anterior identificável; configurar endpoint HTTPS dedicado e secret independente por mecanismo de secrets; habilitar somente a flag da operação. Para o adaptador legado, os bindings são `CLIENT_PASSWORD_BACKEND`, `CLIENT_PASSWORD_SERVICE_URL` e `CLIENT_PASSWORD_SERVICE_SECRET`. O serviço deve responder sem redirecionamento, com JSON estrito de até 2048 bytes.

O Worker tem deadline de cinco segundos incluindo fetch e body; após três falhas abre circuito por 30 segundos e admite uma única probe de recuperação por isolate/objeto de bindings. Não é um rate limiter global. Falha no backend selecionado resulta em 503; não há fallback silencioso para PBKDF2 local. A autorização e emissão de sessão continuam no Worker/D1.

## Homologação exigida antes de PASS

- Assinatura válida/inválida, corpo adulterado, timestamp vencido/futuro, replay, tamanho, saturação e isolamento A/B com dados sintéticos.
- Indisponibilidade, timeout de headers/body, resposta inválida e circuit breaker; checar que nenhum caminho sensível é liberado.
- Restart **e redeploy** do app QA dedicado, comprovando rejeição do mesmo nonce ainda válido. Não usar restart do PersistFlow como prova.
- Mesmo SHA/workload/amostras/intervalos com e sem offload; CPU Worker p50/p95/p99, latência ponta a ponta, erros/timeouts, RSS/limites/restarts Hostinger, tráfego e franquias agregadas. Separar wall time do Worker de latência medida pelo cliente.
- Executar suíte, CI, site público/Studio/Colagem, dispositivos e gates independentes. Evidência local não homologa hardware ou borda.

## Rollback

**Estado desta missão:** não houve deploy/configuração remota do bridge; portanto não há uma versão do Punctum implantada na Hostinger para reverter. Rollback remoto **NOT_RUN**. Testes locais de flag e fail-closed não substituem o ensaio operacional G23.

Para um futuro QA dedicado já homologável:

1. Bloquear a operação por sua flag e confirmar resposta segura; preservar Access e o restante do site.
2. Restaurar o artefato/versão Worker anterior identificado e a configuração anterior por mecanismo seguro. Não aplicar migrations reversas, apagar registros ou restaurar D1/R2 históricos.
3. Desativar somente o processo/app Punctum dedicado, se necessário. Preservar nonces até expirar a janela; rotacionar a chave antes de reutilizar um diretório de replay novo. Não alterar PersistFlow.
4. Repetir smoke público, Studio, Colagem e negações privadas; conferir hashes/configuração/versões e registrar tempos, resultados e impactos.
5. Em problema de dados, preservar originais e seguir G18 em par vazio. Não transformar rollback de código em restauração destrutiva.

## Alternativas sem contratação

| Alternativa | Condição / limitação |
|---|---|
| Manter Access e processamento atual no Cloudflare | Escolha atual; não resolve nem ignora G17. Medir rotas e investigar SSR, upload/validação e transformações separadamente. |
| Otimizar a operação comprovada no Worker | Primeiro reproduzir CPU por rota e SHA; cache público ou redução de trabalho apenas se preservar autorização, consistência e produto. Nenhuma otimização por palpite nesta missão. |
| App Node Hostinger dedicado incluído no contrato | Viável somente após inventário de slots, isolamento, persistência, recursos e custo; ainda não comprovado. |
| Nó já pertencente ao ecossistema | Não utilizar automaticamente Fleet/PersistFlow/VMs: disponibilidade, isolamento, HTTPS e orçamento também precisam de prova. |

Nenhuma alternativa libera G17 ou produção sem medições e gates próprios.
