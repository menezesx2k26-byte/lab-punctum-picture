// Read-only, bounded capability/usage inventory. Credentials remain in the runner.
const account = '257bca437616da74ece1ce4bbaf0bd89';
const report = { observedAt: new Date().toISOString(), writes: 0, candidates: [] };
for (const name of ['CF_TOKEN_1', 'CF_TOKEN_2', 'CF_TOKEN_3']) {
  const token = process.env[name];
  if (!token) continue;
  const candidate = { name, probes: [] };
  for (const path of ['/d1/database?per_page=100', '/r2/buckets', '/workers/subdomain', '/workers/account-settings', '/subscriptions', '/workers/scripts']) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    const body = await response.json();
    const probe = { path, status: response.status, success: body.success };
    if (body.success) {
      if (path.startsWith('/d1/')) probe.databases = body.result.map(d => ({ name: d.name, uuid: d.uuid, fileSize: d.file_size }));
      if (path === '/r2/buckets') probe.buckets = body.result.buckets.map(b => ({ name: b.name, location: b.location }));
      if (path === '/workers/subdomain') probe.subdomain = body.result.subdomain;
      if (path === '/workers/account-settings') probe.settings = body.result;
      if (path === '/subscriptions') probe.plans = body.result.map(s => ({ product: s.rate_plan?.public_name, id: s.rate_plan?.id, price: s.price, currency: s.currency, state: s.state }));
      if (path === '/workers/scripts') probe.workers = body.result.map(s => ({ name: s.id, modifiedOn: s.modified_on }));
    } else probe.codes = body.errors?.map(e => e.code);
    candidate.probes.push(probe);
  }
  report.candidates.push(candidate);
}
// Inspect only provider field types/counts, never object names, keys, contents or cursors.
const listingToken=process.env.CF_TOKEN_2;
if(listingToken) {
  report.r4ObjectListingSchema=[];
  for(const name of ['punctum-r4-qa-originals-20261028','punctum-r4-qa-restored-20261028','punctum-r4-qa-backups-20261028']) {
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${name}/objects?per_page=1`,{headers:{Authorization:`Bearer ${listingToken}`},signal:AbortSignal.timeout(20000)});
    const body=await response.json();
    const fieldTypes=value=>value && typeof value==='object' ? Object.fromEntries(Object.entries(value).map(([key,item])=>[key,Array.isArray(item)?`array(${item.length})`:item===null?'null':typeof item])):typeof value;
    report.r4ObjectListingSchema.push({bucket:name,httpStatus:response.status,success:body.success,topKeys:Object.keys(body),resultIsArray:Array.isArray(body.result),resultLength:Array.isArray(body.result)?body.result.length:undefined,resultFields:fieldTypes(body.result),paginationFields:fieldTypes(body.result_info),paginationKeys:body.result_info?Object.keys(body.result_info):[],truncation:typeof body.result_info?.is_truncated==='boolean'?body.result_info.is_truncated:undefined,cursorPresent:typeof body.result_info?.cursor==='string'&&body.result_info.cursor.length>0});
  }
}
console.log(JSON.stringify(report, null, 2));
