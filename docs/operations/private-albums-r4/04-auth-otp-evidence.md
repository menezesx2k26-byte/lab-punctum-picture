# Access OTP — evidência

REAL_OTP_VERIFIED=false. Nesta execução foram testadas assinaturas e claims com chaves locais sintéticas, não foi apresentado código ao Cloudflare e não foi verificada a aplicação Access real nem a vinculação dela ao D1 de QA. O piloto remoto histórico citado na PR #13 usou sessão sintética após o acesso e explicitamente `accessProviderTested=false`; não é evidência do commit integrado.

Próxima etapa: verificar ambiente isolado e identidade já autorizada; completar OTP no formulário seguro do provedor, sem transmitir código no chat. Registrar somente resultado sanitizado de issuer/audience, vínculo D1, cookie, isolamento e logout/revogação. Até lá o gate é BLOCKED_EXTERNAL.
