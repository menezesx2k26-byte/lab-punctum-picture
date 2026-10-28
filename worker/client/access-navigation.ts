// Fixed same-origin destination; token material belongs only in the cookie header.
export function clientAccessNavigation(cookie: string, browserNavigation: boolean): Response {
  if (browserNavigation) {
    // A cross-site redirect chain can withhold a newly set SameSite=Strict cookie.
    // Commit this document before the same-origin navigation; keep Strict intact.
    return new Response(`<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=/albuns"><title>Abrindo seus álbuns · Punctum Picture</title>
</head><body><main><h1>Abrindo seus álbuns</h1><p><a href="/albuns">Continuar para seus álbuns</a></p></main></body></html>`,{
      status:200,headers:{'Content-Type':'text/html; charset=utf-8','Set-Cookie':cookie},
    });
  }
  return new Response(null, {status:303,headers:{Location:'/albuns','Set-Cookie':cookie}});
}
