import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const script = fileURLToPath(new URL('./live-parity-audit.mjs', import.meta.url));
const publicResponses = {
  '/api/public/site': { site: { brandName: 'Punctum' }, siteConfig: { schemaVersion: 1 } },
  '/api/public/stats': { stats: { photoCount: 0, albumCount: 0, categoryCount: 0 } },
  '/api/public/albums': { albums: [], page: 1, limit: 100 },
  '/api/public/archive': { images: [] },
};

async function serve(t, configure = () => undefined) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (configure(path, res)) return;
    if (path.startsWith('/admin')) {
      res.writeHead(303, { location: '/acesso?next=' + encodeURIComponent(path) }).end();
    } else if (Object.hasOwn(publicResponses, path)) {
      res.end(JSON.stringify(publicResponses[path]));
    } else if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': ['text/plain', 'text/plain; charset=utf-8'] }).end('User-agent: *\nAllow: /\n');
    } else if (path === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' }).end(
        '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.test/</loc></url></urlset>',
      );
    } else {
      res.end('<title>Punctum</title><link rel="canonical" href="https://example.test' + path + '"><main><h1>Punctum</h1></main>');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

async function audit(t, prod, dest) {
  const cwd = await mkdtemp(join(tmpdir(), 'punctum-parity-test-'));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const output = join(cwd, 'report.json');
  await run(process.execPath, [script], {
    cwd,
    env: { ...process.env, PROD_ORIGIN: prod, DEST_ORIGIN: dest, AUDIT_OUT: output },
  });
  return JSON.parse(await readFile(output, 'utf8'));
}

test('matching successful responses and intentional login redirects qualify', async t => {
  const prod = await serve(t);
  const dest = await serve(t);
  const report = await audit(t, prod, dest);
  for (const key of ['homeHtmlEqual', 'portfolioHtmlEqual', 'adminRouteEquivalent', 'studioRouteEquivalent',
    'publicSiteEqual', 'statsEqual', 'albumsEqual', 'archiveEqual', 'sitemapEqual', 'robotsEqual']) {
    assert.equal(report.summary[key], true, key);
  }
});

test('matching HTTP errors or invalid JSON do not establish parity', async t => {
  const failRoutes = (path, res) => {
    if (path === '/api/public/stats') return res.end('not JSON');
    return res.writeHead(503).end('unavailable');
  };
  const prod = await serve(t, failRoutes);
  const dest = await serve(t, failRoutes);
  const { summary } = await audit(t, prod, dest);
  for (const key of ['homeHtmlEqual', 'portfolioHtmlEqual', 'adminRouteEquivalent', 'studioRouteEquivalent',
    'publicSiteEqual', 'statsEqual', 'albumsEqual', 'archiveEqual', 'sitemapEqual', 'robotsEqual']) {
    assert.equal(summary[key], false, key);
  }
});

test('matching login-page titles do not hide an incorrect redirect target', async t => {
  const prod = await serve(t);
  const dest = await serve(t, (path, res) => path === '/admin'
    && res.writeHead(303, { location: '/acesso?next=%2Fadmin%2Fstudio' }).end());
  const { summary } = await audit(t, prod, dest);
  assert.equal(summary.adminRouteEquivalent, false);
  assert.equal(summary.studioRouteEquivalent, true);
});

test('matching 200 SEO fallbacks do not qualify as robots or sitemap', async t => {
  const fallback = (path, res) => {
    if (path === '/robots.txt') return res.writeHead(200, { 'content-type': 'text/plain' }).end(' \r\n');
    if (path === '/sitemap.xml') return res.writeHead(200, { 'content-type': 'application/xml' }).end('<html>Not a sitemap</html>');
  };
  const prod = await serve(t, fallback);
  const dest = await serve(t, fallback);
  const { summary } = await audit(t, prod, dest);
  assert.deepEqual([summary.robotsEqual, summary.sitemapEqual], [false, false]);
});

test('matching malformed sitemap bodies do not qualify', async t => {
  const malformed = (path, res) => path === '/sitemap.xml'
    && res.writeHead(200, { 'content-type': 'application/xml' }).end(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.test/</loc></urlset>',
    );
  const prod = await serve(t, malformed);
  const dest = await serve(t, malformed);
  assert.equal((await audit(t, prod, dest)).summary.sitemapEqual, false);
});

test('sitemap locations must be unambiguous absolute URLs on one host', async t => {
  const url = location => `<url><loc>${location}</loc></url>`;
  const cases = [
    ['relative', url('/portfolio')],
    ['protocol relative', url('//example.test/portfolio')],
    ['non-web scheme', url('javascript:alert(1)')],
    ['missing host', url('https:///portfolio')],
    ['leading whitespace', url(' https://example.test/')],
    ['embedded whitespace', url('https://example.test/a b')],
    ['invalid port', url('https://example.test:invalid/')],
    ['oversized', url('https://example.test/' + 'a'.repeat(2048))],
    ['mixed hosts', url('https://example.test/') + url('https://other.test/')],
    ['duplicate loc', '<url><loc>https://example.test/</loc><loc>https://other.test/</loc></url>'],
  ];
  for (const [name, entries] of cases) {
    await t.test(name, async t => {
      const invalid = (path, res) => path === '/sitemap.xml'
        && res.writeHead(200, { 'content-type': 'application/xml' }).end(
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,
        );
      const prod = await serve(t, invalid);
      const dest = await serve(t, invalid);
      const report = await audit(t, prod, dest);
      assert.equal(report.summary.sitemapEqual, false);
      assert.equal(report.text['/sitemap.xml'].productionValid, false);
      assert.equal(report.text['/sitemap.xml'].destinationValid, false);
    });
  }
});

test('valid sitemap indexes and canonical URLs independent of the fetch host qualify', async t => {
  for (const [root, entry] of [['urlset', 'url'], ['sitemapindex', 'sitemap']]) {
    await t.test(root, async t => {
      const valid = (path, res) => path === '/sitemap.xml'
        && res.writeHead(200, { 'content-type': 'application/xml' }).end(
          `<${root} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><${entry}>`
          + '<loc>https://example.test/portfolio?a=1&amp;b=2</loc>'
          + `</${entry}></${root}>`,
        );
      const prod = await serve(t, valid);
      const dest = await serve(t, valid);
      assert.equal((await audit(t, prod, dest)).summary.sitemapEqual, true);
    });
  }
});

test('matching JSON null and HTML maintenance responses do not qualify', async t => {
  const fallback = (path, res) => {
    if (path === '/api/public/stats') return res.end('null');
    if (path === '/api/public/site') return res.end('{"site":{},"siteConfig":{}}');
    if (path === '/portfolio') return res.end(
      '<title>Maintenance</title><link rel="canonical" href="https://example.test/portfolio">',
    );
  };
  const prod = await serve(t, fallback);
  const dest = await serve(t, fallback);
  const { summary } = await audit(t, prod, dest);
  assert.deepEqual([summary.statsEqual, summary.publicSiteEqual, summary.portfolioHtmlEqual], [false, false, false]);
});

test('correct redirects to matching failed login pages do not qualify', async t => {
  const loginUnavailable = (path, res) => path === '/acesso'
    && res.writeHead(503).end('<title>Punctum</title>');
  const prod = await serve(t, loginUnavailable);
  const dest = await serve(t, loginUnavailable);
  const { summary } = await audit(t, prod, dest);
  assert.equal(summary.adminRouteEquivalent, false);
  assert.equal(summary.studioRouteEquivalent, false);
});
