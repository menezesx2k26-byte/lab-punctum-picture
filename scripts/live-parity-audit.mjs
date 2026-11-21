import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';

const PROD = process.env.PROD_ORIGIN ?? 'https://punctumpicture.com';
const DEST = process.env.DEST_ORIGIN ?? 'https://punctum-picture-migration.menezesx2k26.workers.dev';
const outPath = process.env.AUDIT_OUT ?? 'requests/live-parity-audit-result.json';
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isCount = value => Number.isSafeInteger(value) && value >= 0;
const publicContracts = {
  '/api/public/site': value => isRecord(value.site) && typeof value.site.brandName === 'string'
    && Boolean(value.site.brandName.trim()) && isRecord(value.siteConfig)
    && Number.isSafeInteger(value.siteConfig.schemaVersion) && value.siteConfig.schemaVersion > 0,
  '/api/public/stats': value => isRecord(value.stats)
    && ['photoCount', 'albumCount', 'categoryCount'].every(field => isCount(value.stats[field])),
  '/api/public/albums?limit=100': value => Array.isArray(value.albums)
    && Number.isInteger(value.page) && Number.isInteger(value.limit),
  '/api/public/archive': value => Array.isArray(value.images),
};
const validateSitemap = `
import sys
from xml.etree.ElementTree import ParseError, fromstring
from urllib.parse import urlsplit

ns = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
try:
    root = fromstring(sys.stdin.read())
except ParseError:
    sys.exit(1)
entry_tag = {ns + "urlset": ns + "url", ns + "sitemapindex": ns + "sitemap"}.get(root.tag)
if not (entry_tag and len(root) and all(
    entry.tag == entry_tag and len(entry.findall(ns + "loc")) == 1
    for entry in root
)):
    sys.exit(1)
locations = [entry.findtext(ns + "loc", "") for entry in root]
try:
    urls = [urlsplit(location) for location in locations]
    valid = all(
        0 < len(location) < 2048 and not any(char.isspace() for char in location)
        and url.scheme in ("http", "https") and url.hostname
        and (url.port is None or 1 <= url.port <= 65535)
        for location, url in zip(locations, urls)
    ) and len({url.hostname for url in urls}) == 1
except ValueError:
    valid = False
sys.exit(0 if valid else 1)
`;

const sha = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest('hex');
const short = (v, n = 400) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s == null) return null;
  return s.length <= n ? s : `${s.slice(0, n)}…`;
};

async function get(url, redirect = 'follow') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch(url, {
      redirect,
      signal: controller.signal,
      headers: { 'user-agent': 'Punctum-Parity-Audit/2.0' },
    });
    const body = await r.text();
    return {
      ok: true,
      status: r.status,
      url: r.url,
      location: r.headers.get('location'),
      contentType: r.headers.get('content-type'),
      body,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), body: '' };
  } finally {
    clearTimeout(timer);
  }
}

function diff(a, b, path = '$', out = []) {
  if (out.length >= 300 || Object.is(a, b)) return out;
  if (a === null || b === null || typeof a !== typeof b) {
    out.push({ path, production: short(a), destination: short(b) });
    return out;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      out.push({ path, production: short(a), destination: short(b) });
      return out;
    }
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n && out.length < 300; i++) {
      if (i >= a.length || i >= b.length) out.push({ path: `${path}[${i}]`, production: short(a[i]), destination: short(b[i]) });
      else diff(a[i], b[i], `${path}[${i}]`, out);
    }
    return out;
  }
  if (typeof a === 'object') {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const k of keys) {
      if (!Object.hasOwn(a, k) || !Object.hasOwn(b, k)) {
        out.push({ path: `${path}.${k}`, production: short(a[k]), destination: short(b[k]) });
      } else {
        diff(a[k], b[k], `${path}.${k}`, out);
      }
      if (out.length >= 300) break;
    }
    return out;
  }
  out.push({ path, production: short(a), destination: short(b) });
  return out;
}

function htmlMeta(r) {
  if (!r.ok) return { ok: false, error: r.error };
  const title = r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
  const canonicalLink = r.body.match(/<link\b[^>]*\srel\s*=\s*(['"])canonical\1[^>]*>/i)?.[0];
  const canonical = canonicalLink?.match(/\shref\s*=\s*(['"])(.*?)\1/i)?.[2];
  const assets = [...new Set([...r.body.matchAll(/(?:src|href)=["']([^"']+)["']/gi)].map(m => m[1]).filter(v => v.startsWith('/') || v.startsWith('http')))].sort();
  return {
    ok: true,
    status: r.status,
    finalUrl: r.url,
    location: r.location,
    title,
    canonicalPath: canonical && URL.canParse(canonical, r.url) ? new URL(canonical, r.url).pathname : null,
    hasPrimaryContent: /<main\b[^>]*>[\s\S]*?<h1\b[^>]*>/.test(r.body),
    bodyBytes: Buffer.byteLength(r.body),
    bodySha256: sha(r.body),
    assets,
  };
}

function assetDiff(a = [], b = []) {
  const A = new Set(a), B = new Set(b);
  return {
    onlyProduction: [...A].filter(x => !B.has(x)).sort(),
    onlyDestination: [...B].filter(x => !A.has(x)).sort(),
  };
}

function followsLoginRedirect(initial, final, origin, path) {
  if (initial.status !== 303 || !initial.location || final.status !== 200) return false;
  try {
    const expectedOrigin = new URL(origin).origin;
    return [initial.location, final.finalUrl].every(location => {
      const url = new URL(location, origin);
      return url.origin === expectedOrigin && url.pathname === '/acesso' && url.searchParams.get('next') === path;
    });
  } catch {
    return false;
  }
}

async function compareJson(path) {
  const [p, d] = await Promise.all([get(`${PROD}${path}`), get(`${DEST}${path}`)]);
  const parse = (r) => {
    if (!r.ok) return { valid: false, value: { __transportError: r.error } };
    try {
      const value = JSON.parse(r.body);
      return { valid: isRecord(value) && publicContracts[path](value), value };
    } catch {
      return { valid: false, value: { __parseError: true, status: r.status, body: short(r.body, 1000) } };
    }
  };
  const pj = parse(p), dj = parse(d);
  const differences = diff(pj.value, dj.value);
  return {
    productionStatus: p.status ?? null,
    destinationStatus: d.status ?? null,
    equal: p.status === 200 && d.status === 200 && pj.valid && dj.valid && differences.length === 0,
    diffCount: differences.length,
    diffs: differences,
    production: pj.value,
    destination: dj.value,
  };
}

function validSeoResponse(path, response) {
  if (response.status !== 200) return false;
  const types = new Set((response.contentType ?? '').split(',')
    .map(value => value.split(';', 1)[0].trim().toLowerCase()));
  if (types.size !== 1) return false;
  const [type] = types;
  const body = response.body.trim();
  if (path === '/robots.txt') {
    return type === 'text/plain' && /^User-agent:[ \t]*\S/im.test(body);
  }
  if ((type !== 'application/xml' && type !== 'text/xml') || !body || body.includes('<!DOCTYPE')) return false;
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', '-c', validateSitemap], {
    input: body,
    timeout: 5000,
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

async function main() {
  const report = {
    checkedAt: new Date().toISOString(),
    productionOrigin: PROD,
    destinationOrigin: DEST,
    authenticatedAdminCompared: false,
    note: 'Admin autenticado exige sessão. Rotas públicas/redirects são comparados; o Studio publicado é comparado por /api/public/site.',
    routes: {},
    api: {},
    text: {},
  };

  for (const path of ['/', '/portfolio', '/acesso', '/admin', '/admin/studio']) {
    const [pm, dm, pf, df] = await Promise.all([
      get(`${PROD}${path}`, 'manual'),
      get(`${DEST}${path}`, 'manual'),
      get(`${PROD}${path}`),
      get(`${DEST}${path}`),
    ]);
    const p = htmlMeta(pf), d = htmlMeta(df);
    const publicPage = path === '/' || path === '/portfolio';
    const comparable = p.status === 200 && d.status === 200 && Boolean(p.title) && Boolean(d.title)
      && (!publicPage || (p.canonicalPath === path && d.canonicalPath === path
        && p.hasPrimaryContent && d.hasPrimaryContent));
    report.routes[path] = {
      productionInitial: { status: pm.status ?? null, location: pm.location ?? null, error: pm.error ?? null },
      destinationInitial: { status: dm.status ?? null, location: dm.location ?? null, error: dm.error ?? null },
      production: p,
      destination: d,
      sameStatus: p.ok && d.ok && p.status === d.status,
      sameTitle: comparable && p.title === d.title,
      sameBody: comparable && p.bodySha256 === d.bodySha256,
      assetDiff: assetDiff(p.assets, d.assets),
    };
  }

  for (const path of Object.keys(publicContracts)) {
    report.api[path] = await compareJson(path);
  }

  for (const path of ['/sitemap.xml', '/robots.txt']) {
    const [p, d] = await Promise.all([get(`${PROD}${path}`), get(`${DEST}${path}`)]);
    const productionValid = validSeoResponse(path, p);
    const destinationValid = validSeoResponse(path, d);
    report.text[path] = {
      productionStatus: p.status ?? null,
      destinationStatus: d.status ?? null,
      productionValid,
      destinationValid,
      equal: productionValid && destinationValid && p.body === d.body,
      productionSha256: sha(p.body),
      destinationSha256: sha(d.body),
      productionExcerpt: short(p.body, 1200),
      destinationExcerpt: short(d.body, 1200),
      productionError: p.error ?? null,
      destinationError: d.error ?? null,
    };
  }

  const loginEquivalent = path => {
    const route = report.routes[path];
    return route.sameTitle
      && followsLoginRedirect(route.productionInitial, route.production, PROD, path)
      && followsLoginRedirect(route.destinationInitial, route.destination, DEST, path);
  };
  report.summary = {
    homeHtmlEqual: report.routes['/']?.sameBody ?? false,
    portfolioHtmlEqual: report.routes['/portfolio']?.sameBody ?? false,
    adminRouteEquivalent: loginEquivalent('/admin'),
    studioRouteEquivalent: loginEquivalent('/admin/studio'),
    publicSiteEqual: report.api['/api/public/site']?.equal ?? false,
    publicSiteDiffCount: report.api['/api/public/site']?.diffCount ?? null,
    statsEqual: report.api['/api/public/stats']?.equal ?? false,
    albumsEqual: report.api['/api/public/albums?limit=100']?.equal ?? false,
    archiveEqual: report.api['/api/public/archive']?.equal ?? false,
    sitemapEqual: report.text['/sitemap.xml']?.equal ?? false,
    robotsEqual: report.text['/robots.txt']?.equal ?? false,
  };

  fs.mkdirSync('requests', { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
}

main().catch((e) => {
  fs.mkdirSync('requests', { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    checkedAt: new Date().toISOString(),
    status: 'audit_failed',
    error: e instanceof Error ? e.stack ?? e.message : String(e),
  }, null, 2) + '\n');
  process.exitCode = 1;
});
