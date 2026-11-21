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

async function serve(t, configure = () => undefined) {
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (configure(path, res)) return;
    if (path.startsWith('/admin')) {
      res.writeHead(303, { location: '/acesso?next=' + encodeURIComponent(path) }).end();
    } else if (path.startsWith('/api/')) {
      res.end(JSON.stringify({ ok: true }));
    } else if (path === '/robots.txt') {
      res.writeHead(200, { 'content-type': ['text/plain', 'text/plain; charset=utf-8'] }).end('User-agent: *\nAllow: /\n');
    } else if (path === '/sitemap.xml') {
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' }).end(
        '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.test/</loc></url></urlset>',
      );
    } else {
      res.end('<title>Punctum</title>');
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

test('correct redirects to matching failed login pages do not qualify', async t => {
  const loginUnavailable = (path, res) => path === '/acesso'
    && res.writeHead(503).end('<title>Punctum</title>');
  const prod = await serve(t, loginUnavailable);
  const dest = await serve(t, loginUnavailable);
  const { summary } = await audit(t, prod, dest);
  assert.equal(summary.adminRouteEquivalent, false);
  assert.equal(summary.studioRouteEquivalent, false);
});
