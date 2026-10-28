import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {clientAccessNavigation} from '../worker/client/access-navigation.ts';

test('a cross-site identity return commits a same-origin document before using its Strict cookie',async()=>{
 let origin;const entryStatuses=[];
 const server=createServer(async(req,res)=>{
   const path=new URL(req.url,'http://fixture.invalid').pathname;
   if(path==='/begin'){res.writeHead(302,{Location:origin+'/albuns/entrar'});res.end();return;}
   if(path==='/albuns/entrar'){
     const r=clientAccessNavigation('qa_strict=authenticated; Path=/; HttpOnly; Secure; SameSite=Strict',true);
     entryStatuses.push(r.status);
     const headers=Object.fromEntries(r.headers);
     // Only this HTTP loopback fixture omits Secure; product and real QA retain it.
     headers['set-cookie']=headers['set-cookie'].replace('; Secure','');
     res.writeHead(r.status,headers);res.end(await r.text());return;
   }
   if(path==='/albuns'){
     if(!req.headers.cookie?.includes('qa_strict=authenticated')){res.writeHead(302,{Location:'/albuns/entrar'});res.end();return;}
     res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<h1>Álbuns de teste</h1>');return;
   }
   res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,resolve));
 const port=server.address().port;origin='http://127.0.0.1:'+port;
 let browser;
 try{
   browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:['--no-sandbox']});
   const context=await browser.newContext();const page=await context.newPage();
   await page.goto('http://localhost:'+port+'/begin',{waitUntil:'domcontentloaded',timeout:15000});
   await page.getByRole('heading',{name:'Álbuns de teste'}).waitFor({timeout:15000});
   assert.equal(new URL(page.url()).pathname,'/albuns');
   assert.deepEqual(entryStatuses,[200]);
   const cookie=(await context.cookies(origin)).find(c=>c.name==='qa_strict');
   assert.equal(cookie.sameSite,'Strict');assert.equal(cookie.httpOnly,true);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
