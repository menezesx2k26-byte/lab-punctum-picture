import { performance } from 'node:perf_hooks';
import { isTracedQaRoute } from './route-trace.mjs';

const studioRoutes = new Set(['/admin', '/admin/studio', '/admin/api/studio', '/admin/api/me']);
const studioPhases = new Set([
  'session-start', 'session-key-ready', 'session-verified', 'session-end',
  'studio-draft-start', 'studio-draft-end', 'studio-history-end',
  'render-start', 'render-end',
]);

// This runner is bundled only into the disposable Node QA target. Never print
// response bodies, request headers, cookie values, stack traces or query strings.
export async function traceQaWorker(route, execute, { enabled = false, emit = console.log } = {}) {
  if (!enabled || !isTracedQaRoute(route)) return execute();
  const started = performance.now();
  const report = (phase, extra = {}) => emit('PUNCTUM_QA_PHASE ' + JSON.stringify({
    route, phase, ...extra,
  }));
  const loopStart = studioRoutes.has(route) ? performance.eventLoopUtilization() : undefined;
  const runtimeMetrics = () => loopStart
    ? { loopBusyPct: Math.round(performance.eventLoopUtilization(loopStart).utilization * 100) }
    : {};
  report('start');
  try {
    const mark = studioRoutes.has(route)
      ? (phase) => {
          if (studioPhases.has(phase)) report(phase, { ms: Math.round(performance.now() - started) });
        }
      : undefined;
    const response = await execute(mark);
    report('returned', {
      status: response.status,
      ...runtimeMetrics(),
      ms: Math.round(performance.now() - started),
    });
    return response;
  } catch (error) {
    report('error', { ...runtimeMetrics(), ms: Math.round(performance.now() - started) });
    throw error;
  }
}

export function traceQaLoginBody(request, { enabled = false, emit = console.log } = {}) {
  const route = new URL(request.url).pathname;
  if (!enabled || route !== '/admin/api/session' || request.method !== 'POST') return request;
  const readJson = request.json.bind(request);
  request.json = async () => {
    const started = performance.now();
    const report = (phase, extra = {}) => emit('PUNCTUM_QA_PHASE ' + JSON.stringify({ route, phase, ...extra }));
    report('body-start');
    try {
      const data = await readJson();
      report('body-read', { ms: Math.round(performance.now() - started) });
      return data;
    } catch (error) {
      report('body-error', { ms: Math.round(performance.now() - started) });
      throw error;
    }
  };
  return request;
}
