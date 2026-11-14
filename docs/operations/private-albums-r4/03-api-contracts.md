# Inventário de rotas privadas — parcial

Contratos derivados dos handlers nesta árvore; schemas completos em `shared/client-galleries.ts` e `worker/api/client-*.ts`. Todo acesso privado depende da flag. Respostas privadas são no-store; mutações verificam Origin e auth. Erros comuns incluem 400 validação, 401/403 identidade/permissão, 404 recurso não autorizado/inexistente, 405 método, 409 estado/conflito e 429 limite. Esta tabela é inventário inicial, não certificação completa de todos os payloads e efeitos.

| Método e rota | Identidade | Efeito / resposta |
|---|---|---|
| GET `/albuns/entrar` | JWT Access no modo access | valida JWT e conta ativa D1; emite cookie e redireciona |
| GET `/api/client/me` | cookie cliente | identidade atual |
| DELETE `/api/client/session` | sessão cliente / Origin | limpa cookie; no modo Access devolve URL de logout Access |
| POST `/api/client/session`, POST `/api/client/password` | legado | indisponíveis no modo Access |
| GET `/api/client/galleries` e `/:id` | cliente | galerias publicadas próprias, fotos prontas e favoritos |
| PUT/DELETE `/api/client/galleries/:id/favorites/:imageId` | cliente / Origin | insere/remove favorito D1, idempotente |
| GET/HEAD `/api/client/galleries/:id/images/:imageId/{thumb,gallery,download}` | cliente | autorização atual D1; bytes R2/transformação; download condicionado |
| GET/POST `/admin/api/clientes` | admin | lista/cria conta D1; modo Access não devolve senha |
| PATCH `/admin/api/clientes/:id` | admin / Origin | ativa/desativa e incrementa versão de sessão |
| POST `/admin/api/clientes/:id/reset-password` | admin / Origin | no modo Access reenquadra conta e revoga sessões |
| GET/POST `/admin/api/albuns-privados` | admin | lista/cria rascunho D1 |
| GET/PATCH `/admin/api/albuns-privados/:id` | admin | detalhe/favoritos ou atualização de metadados |
| PUT `/:id/cover`, PUT `/:id/order` | admin / Origin | define capa pronta da própria galeria ou ordenação |
| POST `/:id/{publish,archive,unpublish}` | admin / Origin | transição de estado; publicar exige cliente ativo e capa pronta |
| POST `/:id/uploads/intents` | admin / Origin | cria intent e imagem pendente D1; retorna URL/token de upload |
| PUT `/:id/uploads/:intent/direct` | admin / Origin / token | valida tamanho e tipo; grava R2 privado; retry idêntico |
| POST `/:id/uploads/:intent/complete` | admin / Origin | verifica objeto e raster; confirma imagem/intent D1 |
| GET/HEAD `/:id/images/:imageId/{thumb,gallery,download}` sob namespace admin | admin | entrega imagem privada autorizada |

Os testes relevantes são `client-access`, `client-galleries`, `client-media` e `client-pilot`. Falta detalhar cada schema/resposta e testar todos os erros e efeitos sob falha real; não marcar esta tabela como contrato definitivo.
