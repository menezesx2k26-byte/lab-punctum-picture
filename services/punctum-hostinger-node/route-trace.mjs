import { performance } from 'node:perf_hooks';

// Only report fixed QA routes and an optional synthetic correlation UUID.
export const qaRequestIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const TRACED_ROUTES = new Set([
  '/api/health', '/admin/api/session', '/portfolio', '/arquivo', '/contato', '/',
  '/admin', '/admin/studio', '/admin/api/studio', '/admin/api/me',
]);

export function tracedQaRoute(path) {
  if (TRACED_ROUTES.has(path)) return path;
  if (/^\/media\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/card$/i.test(path)) {
    return '/media/:id/card';
  }
  if (/^\/admin\/api\/uploads\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/complete$/i.test(path)) {
    return '/admin/api/uploads/:id/complete';
  }
  if (/^\/ensaios\/hostinger-synthetic-qa-[0-9]+(?:-[0-9]+)?$/.test(path)) return '/ensaios/:qa';
}

export function traceQaRequests(server, { enabled = false, emit = console.log } = {}) {
  if (!enabled) return;
  server.prependListener('request', (request, response) => {
    const route = tracedQaRoute(String(request.url ?? '').split('?', 1)[0]);
    if (!route) return;
    const started = performance.now();
    const requestId = request.headers?.['x-punctum-qa-request'];
    const correlation = typeof requestId === 'string' && qaRequestIdPattern.test(requestId) ? { requestId } : {};
    const output = (event, extra = {}) => emit('PUNCTUM_QA_TRACE ' + JSON.stringify({
      event, route, ...correlation, ...extra,
    }));
    let finished = false;
    output('start');
    response.once('finish', () => {
      finished = true;
      output('finish',{status:response.statusCode,ms:Math.round(performance.now() - started)});
    });
    response.once('close', () => {
      if (!finished) output('abort', {
        ms: Math.round(performance.now() - started),
        ...(route === '/admin/api/session' && request.method === 'POST' && {
          requestComplete: request.complete === true,
          requestReadableEnded: request.readableEnded === true,
        }),
      });
    });
  });
}
