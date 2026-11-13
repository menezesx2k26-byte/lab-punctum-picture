import punctum from "../../worker/index";
import {env} from "./sandbox-bindings";
import {mutableSandboxConfig} from "./sandbox-runtime.mjs";
import {publicPaths} from "../punctum-hostinger-node/public-files";

const context={
  waitUntil(task:Promise<unknown>){void task.catch(()=>console.error("Synthetic sandbox deferred operation failed"));}
} as ExecutionContext;
export default async function fetchSandbox(request:Request):Promise<Response>{
  const url=new URL(request.url), origin=mutableSandboxConfig().origin;
  if(url.host!==origin.host)return new Response(null,{status:421,headers:{"Cache-Control":"no-store"}});
  if(publicPaths.has(url.pathname))return new Response(null,{
    headers:{"x-vinext-static-file":encodeURIComponent(url.pathname),"X-Robots-Tag":"noindex,nofollow,noarchive"},
  });
  const target=new URL(origin);target.pathname=url.pathname;target.search=url.search;
  const response=await punctum.fetch(new Request(target,request),env,context);
  const headers=new Headers(response.headers);
  headers.set("X-Robots-Tag","noindex,nofollow,noarchive");
  headers.set("Cache-Control","private,no-store");
  headers.set("Referrer-Policy","no-referrer");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
