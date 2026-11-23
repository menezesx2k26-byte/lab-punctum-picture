// This module is copied unchanged into the isolated CI Worker.
// Deny arbitrary routes and methods even if the full app is in the bundle.
// Only a nonce-authenticated request can purge this ephemeral Worker cache.
export async function cpuProbeFetch(request,env,ctx,app) {
  const url=new URL(request.url);
  const token=env?.R4_CPU_PROBE_TOKEN;
  const authorized=typeof token==='string'&&token.length>=32&&
    request.headers.get('X-R4-CPU-Probe')===token;
  if(!authorized||url.search||url.hash)
    return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  if(request.method==='POST'&&url.pathname==='/probe-purge'){
    try {
      const purge=ctx?.exports?.PublicHome?.purgeCache;
      if(typeof purge!=='function')
        return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});
      const ok=await purge();
      return Response.json({ok:ok===true},{status:ok===true?200:503,
        headers:{'Cache-Control':'no-store'}});
    }catch {
      return Response.json({ok:false},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
  if(request.method!=='GET'||url.pathname!=='/')
    return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  return app.fetch(request,env,ctx);
}
