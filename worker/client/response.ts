import { withSecurityHeaders, json } from "../utils/response";
export function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Vary", "Cookie");
  return withSecurityHeaders(
    new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
}
export function privateJson(data: unknown, init: ResponseInit = {}) {
  return privateResponse(json(data, init));
}

export function privateEntryError(status: number) {
  const title = status === 403 ? "Acesso não habilitado" : status === 401
    ? "Confirme seu acesso" : "Acesso temporariamente indisponível";
  const message = status === 403
    ? "Não foi possível abrir seus álbuns com este acesso. Fale com o estúdio para conferir sua autorização."
    : status === 401
      ? "Não foi possível confirmar seu acesso por e-mail. Tente entrar novamente."
      : "Não foi possível abrir seus álbuns agora. Aguarde um pouco e tente novamente.";
  // All interpolated content is fixed application text, never request/JWT data.
  return privateResponse(new Response(`<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Punctum Picture</title>
<style>body{margin:0;background:#f4f1eb;color:#28251f;font:18px/1.6 system-ui,sans-serif}main{max-width:36rem;margin:12vh auto;padding:2rem}h1{font:2.5rem/1.2 Georgia,serif}a{color:inherit;text-underline-offset:.25em}nav{display:flex;gap:1.5rem;flex-wrap:wrap;margin-top:2rem}</style>
</head><body><main><a href="/">PUNCTUM PICTURE</a><p>Área privada do cliente</p>
<h1>${title}</h1><p>${message}</p><nav aria-label="Opções de acesso">
<a href="/albuns/entrar">Tentar entrar novamente</a><a href="/contato">Falar com o estúdio</a>
</nav></main></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8" },
  }));
}
