import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { takeEvidenceScreenshot } from './e2e/screenshot-evidence.mjs';

let stage = 'setup';
const network = [];
const browserHttpProbes = [];
const requestTrace = [];
function routeLabel(path) {
  return path.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}
async function runFunctional() {
const origin = 'https://aliceblue-locust-999458.hostingersite.com';
assert.equal(process.env.PUNCTUM_QA_ORIGIN, origin);
const phase = process.argv[2];
const output = new URL('../outputs/hostinger-managed-functional/', import.meta.url);
await mkdir(output, {recursive:true});
const get = async (path, init) => {
  const started = performance.now();
  const route = routeLabel(path);
  const method = init?.method || 'GET';
  try {
    const response = await fetch(origin + path, {redirect:'manual', signal:AbortSignal.timeout(30000), ...init});
    requestTrace.push({route,method,status:response.status,ms:Math.round(performance.now()-started)});
    return response;
  } catch (error) {
    requestTrace.push({route,method,errorName:error.name,ms:Math.round(performance.now()-started)});
    throw error;
  }
};
const check = (condition, label) => { if (!condition) throw new Error(label); };
const login = await get('/admin/api/session', {method:'POST', headers:{origin,'content-type':'application/json'},
  body:JSON.stringify({email:process.env.PUNCTUM_QA_ADMIN_EMAIL,password:process.env.PUNCTUM_QA_TEST_PASSWORD})});
check(login.status === 200, 'managed authentication status');
const session = login.headers.getSetCookie()[0] || '';
check(/HttpOnly/.test(session) && /SameSite=Strict/.test(session) && /Secure/.test(session), 'managed cookie flags');
const cookie = session.split(';',1)[0];
const mutate = (path, payload) => get(path,{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(payload)});
const report = {phase,sourceSha:process.env.GITHUB_SHA,scope:'managed-synthetic-qa',checks:[]};
let state;
if (phase === 'exercise') {
  for (const path of ['/','/portfolio','/arquivo','/contato']) {
    const response = await get(path); const html = await response.text();
    check(response.status === 200 && /<h1[\s>]/.test(html), 'managed HTML ' + path);
    check(/noindex/.test(response.headers.get('x-robots-tag') || ''), 'managed noindex ' + path);
    check(/frame-ancestors 'none'/.test(response.headers.get('content-security-policy') || ''), 'managed CSP ' + path);
  }
  check(/Disallow: \//.test(await (await get('/robots.txt')).text()), 'managed robots');
  check((await get('/sitemap.xml')).status === 200, 'managed sitemap');
  check((await get('/admin/studio')).status === 303, 'anonymous Studio denied');
  check((await get('/admin/studio',{headers:{cookie}})).status === 200, 'authenticated Studio');
  check((await get('/admin/api/studio',{headers:{cookie}})).status === 200, 'authenticated Studio API');
  for(const path of ['/albuns/entrar','/studio-preview-internal','/application.sqlite','/capability.sqlite','/synthetic-media.bin'])
    check((await get(path)).status === 404, 'private/R4 route denied ' + path);
  const title = 'Hostinger synthetic QA ' + process.env.GITHUB_RUN_ID;
  const created = await mutate('/admin/api/albums',{title}); check(created.status === 201,'create synthetic draft');
  const {album} = await created.json(); check(album.status === 'draft','draft state');
  const original = await sharp({create:{width:640,height:480,channels:3,background:'navy'}}).png().toBuffer();
  const intentResponse = await mutate('/admin/api/uploads/intents',{albumId:album.id,filename:'synthetic.png',mimeType:'image/png',sizeBytes:original.length});
  check(intentResponse.status === 201,'managed upload intent'); const intent = await intentResponse.json();
  const upload = await get(new URL(intent.uploadUrl).pathname,{method:'PUT',headers:{cookie,origin,'content-type':'image/png'},body:original});
  check(upload.status === 200,'managed original upload');
  check((await mutate(`/admin/api/uploads/${intent.intentId}/complete`,{})).status === 200,'managed upload complete');
  check((await mutate(`/admin/api/albums/${album.id}/cover`,{imageId:intent.imageId})).status === 200,'managed cover');
  check((await get(`/media/${intent.imageId}/card`)).status === 404,'unpublished original denied');
  check((await mutate(`/admin/api/albums/${album.id}/publish`,{})).status === 200,'publish synthetic fixture');
  state = {albumId:album.id,slug:album.slug,imageId:intent.imageId,title,originalSha256:createHash('sha256').update(original).digest('hex')};
  await writeFile(new URL('fixture.json',output),JSON.stringify(state,null,2)+'\n');
  const contact = await mutate('/api/public/inquiries',{name:'QA fixture',email:'contact@example.test',message:'Synthetic managed Node QA inquiry.'});
  check(contact.status === 201,'managed contact create');
  report.checks.push('HTML/SEO/security/Studio/upload/cover/publication/contact');
} else {
  state = JSON.parse(await readFile(new URL('fixture.json',output),'utf8'));
}
if (phase !== 'archive') {
  const published = await get('/ensaios/' + state.slug);
  check(published.status === 200 && (await published.text()).includes(state.title), 'request-time synthetic album SSR');
  const image = await get(`/media/${state.imageId}/card`,{headers:{accept:'image/webp'}});
  check(image.status === 200,'published media');
  const bytes = Buffer.from(await image.arrayBuffer()); const metadata = await sharp(bytes).metadata();
  check(metadata.format === 'webp' && metadata.width > 0 && metadata.height > 0,'managed native Sharp WebP');
  report.thumbnailSha256 = createHash('sha256').update(bytes).digest('hex');
  report.checks.push('persisted album SSR and Sharp media');
}
if (phase === 'browser') {
  stage = 'browser.launch';
  const {chromium} = await import('playwright'); const browser = await chromium.launch();
  try {
    report.viewports = [];
    for(const [width,height] of [[390,844],[1440,920]]) {
      const page = await browser.newPage({viewport:{width,height}}); const failures=[];
      page.on('pageerror',()=>failures.push('pageerror'));
      page.on('requestfailed', request => network.push({width,path:new URL(request.url()).pathname,type:request.resourceType(),error:request.failure()?.errorText}));
      page.on('response', response => {if(response.status() >= 400) network.push({width,path:new URL(response.url()).pathname,status:response.status()});});
      stage = `browser.http-probe.${width}`;
      const started = performance.now();
      const httpResponse = await get('/');
      const httpHtml = await httpResponse.text();
      browserHttpProbes.push({width,status:httpResponse.status,durationMs:Math.round(performance.now()-started)});
      check(httpResponse.status === 200 && /<h1[\s>]/.test(httpHtml),'managed browser HTTP preflight');
      stage = `browser.navigation.${width}`;
      const response=await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:30000});
      check(response?.status() === 200,'managed browser navigation');
      stage = `browser.screenshot.${width}`;
      const capture = await takeEvidenceScreenshot(page,new URL(`managed-${width}.png`,output).pathname,{fullPage:true});
      stage = `browser.metrics.${width}`;
      const dimensions=await page.evaluate(()=>({viewport:innerWidth,body:document.documentElement.scrollWidth,css:document.styleSheets.length}));
      check(dimensions.body <= dimensions.viewport && dimensions.css > 0 && !failures.length,'managed browser layout');
      report.viewports.push({width,height,...dimensions,pageErrors:failures.length,capture}); await page.close();
    }
  } finally {await browser.close();}
}
if (phase === 'archive') {
  check((await mutate(`/admin/api/albums/${state.albumId}/archive`,{})).status === 200,'managed archive');
  check((await get(`/media/${state.imageId}/card`)).status === 404,'archived media denied');
  report.checks.push('archive/media denial');
}
const logout=await get('/admin/api/session',{method:'DELETE',headers:{cookie}});
check(logout.status===200 && /Max-Age=0/.test(logout.headers.getSetCookie()[0] || ''),'managed logout');
report.status='PASS';
await writeFile(new URL(`report-${phase}.json`,output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
}

try { await runFunctional(); }
catch (error) {
  let message = String(error.message || error.name).slice(0,1500);
  for (const [key,value] of Object.entries(process.env)) {
    if (value && /PASSWORD|SECRET|TOKEN|AUTH|API_KEY|HASH/.test(key)) message = message.replaceAll(value,'[REDACTED]');
  }
  const failure = {phase:process.argv[2],stage,errorName:error.name,message,browserHttpProbes,requestTrace:requestTrace.slice(-40),network:network.slice(0,40)};
  const directory = new URL('../outputs/hostinger-managed-functional/',import.meta.url);
  await mkdir(directory,{recursive:true});
  await writeFile(new URL(`failure-${process.argv[2]}.json`,directory),JSON.stringify(failure,null,2)+'\n');
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
}
