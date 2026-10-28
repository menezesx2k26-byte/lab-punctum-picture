import { createServer } from 'node:http';

export function createQaServer() {
  return createServer((request,response)=>{
    const url=new URL(request.url,'http://qa.invalid');
    response.setHeader('Content-Type','application/json; charset=utf-8');
    response.setHeader('Cache-Control','no-store');
    response.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,body)=>{response.statusCode=status;response.end(request.method==='HEAD'?undefined:JSON.stringify(body));};
    if(!['GET','HEAD'].includes(request.method)) return send(405,{error:'METHOD_NOT_ALLOWED'});
    if(!['/','/health'].includes(url.pathname)) return send(404,{error:'NOT_FOUND'});
    const nonce=url.searchParams.get('nonce');
    if(nonce!==null && !/^[a-zA-Z0-9-]{1,64}$/.test(nonce)) return send(400,{error:'INVALID_NONCE'});
    send(200,{service:'punctum-hostinger-qa-probe',version:'r4-node-probe-20261028-v2',node:process.version,uptimeSeconds:Math.floor(process.uptime()),rssBytes:process.memoryUsage().rss,nonce,ssrValidated:false,production:false});
  });
}

