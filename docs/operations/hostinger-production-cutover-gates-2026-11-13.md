# Punctum Picture — gates de migração para Hostinger (checkpoint 2026-11-13)

**Estado: MANAGED_SYNTHETIC_QA_PASS / VPS_SYNTHETIC_QA_PASS / NO_GO_PRODUCTION / NO_GO_DNS / NO_GO_R4.**

Este registro acompanha a PR #33 e a branch experimental `agent/hostinger-production-import-preflight-20261113`. Não muda a produção Cloudflare, o domínio, os dados reais nem ativa o R4. Sem custo incremental.

## 1. Evidência de runtime e rollback já verificada

- Candidato de código `aa90c8ae6bc07b8c7e819ad4837543191a647725`, disparo gerenciado `7039dc5271e4472d6163874c676cd8d676c47aa5`.
- Workflow gerenciado [43466607268](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43466607268): **MANAGED_SYNTHETIC_NODE_QA_VERIFIED**; fluxos `exercise`, `browser`, `after-restart`, `after-rebuild`, `archive` PASS. Chromium 390×844 e 1440×920 sem overflow nem page errors. Miniatura sintética manteve SHA-256 `6cca9d25c5fa3468ace9a61d8e4e09f155ed9579d409d49002576805e33dc692`.
- QA gerenciado `aliceblue-locust-999458.hostingersite.com` serve `/api/health`, home, portfólio, arquivo, contato e imagem com 200 no candidato, noindex/noarchive. API do provedor às vezes devolve 500 ao salvar variáveis; workflow relê chaves e confirma funcionamento real, não assume valores mascarados.
- VPS 2135319, projeto Docker `punctum-qa-20261113`, container `punctum-vps-qa`: imagem `sha256:e6f8fdadb5d8a03ae8d14688b5ae96b1be0d3f720842836935177db707d72a8f` criada após o commit e tag `punctum-picture-vps-qa:aa90c8a-20261113`. Hashes de `server.mjs` e `isolated-sharp.mjs` iguais à fonte Git; somente loopback 127.0.0.1:3018.
- VPS QA: home, /portfolio, /arquivo, /contato, /api/health e JPG sintético respondem 200; /admin sem sessão devolve 303. SQLite marcado estritamente como QA (0x50554e51): quick_check ok e foreign_key_check 0. BLOB marcador `qa-worker2-persistence-aa90c8-20261113` SHA-256 `af86f034709701f1ee0935acb0eadaaaeb94e4ceb7145c80c6b64f7407855f8b` preservado após reinício e force-recreate sem alteração da imagem.
- Backup isolado pré-upgrade em `/opt/punctum-qa-20261113/backup-pre-aa90c8a-20261113`: SQLite SHA `90fd1e5eb6c53649e9f7f9733053b94850c683c44b959d61f3a3abffc6fab361`, Compose SHA `84d37c5a745f58a48dbb4c06fc4a8e74a8af5119c49d9efa1dbddbf66606be75`, fonte SHA `9d2166edd7ae83654d5bc8eb6ac67d26853f55f7fa0c755a1ede8551c4b3350e`; rollback tag da imagem antiga mantida. Não fazer restauração geral da VPS compartilhada.

## 2. Inventário atual e fluxo de dados seguros

- Produção pública observada: 329 fotografias exibidas, das quais 217 dinâmicas, 19 álbuns, 10 categorias na API de categorias.
- Auditoria D1 somente leitura [43476240401](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43476240401), banco ID `22697f13-7484-41e3-9441-f7b902c6577a`: imagens 339, álbuns 20, categorias 10, admin_credentials 1, audit_log 323, upload_intents 139, site_config_versions 11, site_media 12, backup_runs 82. Fonte dinâmica sujeita a alterações: recapturar antes de importar.
- O workflow antigo `d1-drive-backup.yml` produz SQL bruto em artefato GitHub e **não deve ser usado para exportar dados atuais** num repositório público.
- Branch de staging criptografado: `scripts/hostinger-encrypt-d1-stage.mjs`, testes de AES-256-GCM/RSA-OAEP, recusa adulteração/fingerprint divergente, workflow [43475598146](https://github.com/menezesx2k26-byte/lab-punctum-picture/actions/runs/43475598146) PASS **sintético**, sem exportação de produção.
- Auditoria remota somente de esquema/contagens é independente do dump e publica apenas agregados. Importador `scripts/hostinger-import-sqlite-preflight.mjs`: exige hash do SQL e identidade D1, compara esquema/contagens exatas, verifica integridade/FK, rejeita DB QA/arquivo existente, deixa banco novo com marca de *staging*, nunca pronto para produção. Testes sintéticos na CI.
- `services/punctum-hostinger-production/originals.mjs`: adaptador de mídia original com armazenamento privado por SHA-256 da chave, bytes imutáveis, metadados com SHA-256, leitura e head, escrita administrativa/delete/list **desativados**. Não é serviço de produção pronto; necessário demonstrar importação real e gated writes mais tarde.

## 3. Critérios ainda bloqueados — não afirmar GO

1. Certificado de destinatário de criptografia **confiável e confirmado no destino** (chave privada exclusiva da VPS sob 0600), para só então exportar D1 criptografado. Não publicar nem transportar SQL bruto/segredos em artefatos, chat, git, logs ou pasta web. A geração remota de chave não foi concluída e não deve ser declarada como realizada.
2. Exportação integral D1 e importação **privada**, verificando `schemaSha256`, contagens por tabela, integridade, FK, segredos históricos, audit logs, soft-deletes e upload intents; verificar repetibilidade/delta após congelamento editorial.
3. Inventário completo do R2 originais e objetos privados, backup privado e transferência byte-a-byte com SHA-256, preservação de prefixos, chaves, MIME e metadados; checar órfãos/quarentena sem deletar. Não inferir igualdade de 217 fotos públicas com todos os objetos R2.
4. Implementação integrada do runtime de produção separado do QA: SQLite sem marca sintética, armazenamento persistente de fotos e backups, autenticação, sessões, Studio, upload, SEO, mídia, agendas e endpoints privados; testes e validações para autorizar writes. **O binário QA é deliberadamente incapaz de iniciar com um DB real.**
5. Homologação em ambiente privado usando snapshot real, Chromium mobile/desktop, administração, upload/edição, álbum privado R4 ou flag **false**, mídias diversas, reinício, rebuild, recuperação e cenários de falha. Obter critérios objetivos e relatório assinado/traceable.
6. Backup/rollback de produção com digest e recuperação verificável. Não fazer restore da VPS inteira (compartilhada), nem ativar R4 com G05/G17 FAIL e gates externos pendentes.
7. Somente após GO: preparar origem Hostinger HTTPS/host header, validação DNS/TTL/SSL e cutover explícito do domínio com janela de reversão e smoke tests; Cloudflare continua produção até lá.

## 4. Isolamento

- Os testes de QA foram sintéticos e não transportaram D1/R2 real. 
- PR #33 permanece draft, sem merge. A presente branch não deve ser confundida com release pronta.
- DNS do domínio público e produção Cloudflare sem alterações deliberadas durante esta migração; R4 flag desativada.
- Se quaisquer hashes, contagens ou provedores divergirem, parar e reconciliar; **não** completar via reset destrutivo ou seed sintético sobre conteúdo real.
