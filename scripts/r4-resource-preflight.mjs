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
console.log(JSON.stringify(report, null, 2));
