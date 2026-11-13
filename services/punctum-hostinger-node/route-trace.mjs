import { performance } from 'node:perf_hooks';

// Only report fixed QA routes. Querystrings, credentials and headers are never
// read or emitted, including on stalled/aborted requests.
const TRACED_ROUTES = new Set(['/admin','/admin/studio','/admin/api/studio']);

export function traceQaRequests(server, { enabled = false, emit = console.log } = {}) {
  if (!enabled) return;
  server.on('request', (request, response) => {
    const route = String(request.url ?? '').split('?', 1)[0];
    if (!TRACED_ROUTES.has(route)) return;
    const started = performance.now();
    const output = (event, extra = {}) => emit('PUNCTUM_QA_TRACE ' + JSON.stringify({event,route,...extra}));
    let finished = false;
    output('start');
    response.once('finish', () => {
      finished = true;
      output('finish',{status:response.statusCode,ms:Math.round(performance.now() - started)});
    });
    response.once('close', () => {
      if (!finished) output('abort',{ms:Math.round(performance.now() - started)});
    });
  });
}
