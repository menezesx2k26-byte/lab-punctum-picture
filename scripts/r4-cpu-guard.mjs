// This module is copied unchanged into the isolated CI Worker.
// Deny arbitrary routes and methods even if the full app is present in the bundle.
export function cpuProbeFetch(request,env,ctx,app) {
  const url=new URL(request.url);
  const token=env?.R4_CPU_PROBE_TOKEN;
  if(request.method!=='GET'||url.pathname!=='/'||url.search||url.hash||
    typeof token!=='string'||token.length<32||
    request.headers.get('X-R4-CPU-Probe')!==token)
    return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  return app.fetch(request,env,ctx);
}
