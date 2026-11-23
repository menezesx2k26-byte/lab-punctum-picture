# Punctum Picture — diagnóstico do login no Node gerenciado

**Estado em 13/11/2026: PARTIAL_VERIFIED / NO_GO_QA / NO_GO_PRODUCTION / NO_GO_R4.**

Escopo dos ensaios: a aplicação sintética já existente na Hostinger, em `aliceblue-locust-999458.hostingersite.com`. A produção Cloudflare, o DNS, o acervo e o R4 ficaram fora das alterações.

| Execução | Evidência |
| --- | --- |
| [43426863776](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43426863776) | Build do pacote passou. API de variáveis retornou HTTP 500 antes de iniciar build gerenciado. A primeira leitura após limpar as variáveis ainda não confirmou a remoção. Fora do job, a leitura mostrou a lista vazia e o probe respondeu com o nonce esperado. As configurações originais foram reaplicadas e verificadas pela API sem rebuild. |
| [43427748107](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43427748107) | Candidato `01a1d4f1-db13-70f6-841c-83ada7276241` concluiu build e respondeu 200 no health. A rota `/arquivo` respondeu 200 em leitura independente. O POST de login entrou no Node e no handler, sem registrar retorno do handler até o cliente desistir em 30 s. O Node registrou abort aos 30.144 ms. Houve `ERR_STREAM_UNABLE_TO_PIPE` nos logs, sem vínculo comprovado com a requisição do login. Rollback verificado, build `01a1d4f9-8940-727c-befe-ead611a78f18`, variáveis vazias e settings originais. |
| [43429701261, tentativa 1](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43429701261/attempts/1) | Três respostas HTTP 500 ao ler as variáveis antes de alterações. Zero builds ou escritas de configurações/variáveis. |

A instrumentação mede a chegada ao servidor, o retorno do handler e a finalização ou interrupção da resposta. A leitura do JSON do login ganhou medições próprias, sem registrar corpo, cookies, credenciais ou mensagens de exceção. A verificação de variáveis passou a repetir apenas leituras para confirmar a convergência após uma escrita ambígua. Chaves desconhecidas ou duplicadas interrompem o fluxo. O login real de QA continua obrigatório para confirmar os valores mascarados.

[CI do candidato com a instrumentação de corpo](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43429711650): `verify` e `hostinger-node-qa` aprovados, incluindo Chromium no runner. Validação local: build Node QA, 25 testes Node, 28 testes Python, typecheck e 308 testes Vitest no ciclo.

## Reteste com leitura do corpo

[Execução 43429701261, tentativa 2](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43429701261/attempts/2), fonte `7834a4cf115b8eb89958ab1db3739558e3f30d10`.

- O build candidato `01a1d501-5735-7020-868e-b9c891b37b74` concluiu. O login retornou 200. O handler mediu 94 ms, com leitura de JSON em 1 ms. As rotas públicas testadas passaram, incluindo `/arquivo`.
- O handler autenticado de `/admin/api/studio` levou 29.525 ms, e o handler de `/admin` levou 21.508 ms. A chamada autenticada a `/admin/studio` entrou no handler e expirou no cliente aos 30.002 ms. A demora de 29,5 s já estava dentro do handler, antes de o servidor concluir a resposta.
- O corpo do login foi rápido nesta execução. A evidência mantém aberta a causa dos timeouts intermitentes, incluindo o timeout anterior no login. A próxima discriminação deve medir separadamente verificação de sessão, consultas e validação do Studio, renderização e atraso do loop de eventos no mesmo processo.
- Rollback verificado pelo workflow: build `01a1d505-2722-723a-a6fd-ffbdd38429ea`, configurações originais, ambiente vazio, probe v2 com nonce correto. O exercício encerrou antes de Chromium e antes das provas de persistência do candidato completo.
