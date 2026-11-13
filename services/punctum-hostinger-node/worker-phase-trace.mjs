import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import { tracedQaRoute } from './route-trace.mjs';

const mediaPhase = new AsyncLocalStorage();
const mediaPhases = new Set([
  'media-original-start', 'media-original-end',
  'media-body-start', 'media-body-end', 'media-sharp-start', 'media-sharp-end',
]);

export function markQaMediaPhase(phase) {
  if (mediaPhases.has(phase)) mediaPhase.getStore()?.(phase);
}

const studioRoutes = new Set(['/admin', '/admin/studio', '/admin/api/studio', '/admin/api/me']);
const studioPhases = new Set([
  'session-start', 'session-key-ready', 'session-verified', 'session-end',
  'studio-draft-start', 'studio-draft-end', 'studio-history-end',
  'render-start', 'render-end',
]);

// This runner is bundled only into the disposable Node QA target. Never print
// response bodies, request headers, cookie values, stack traces or query strings.
export async function traceQaWorker(path, execute, { enabled = false, emit = console.log } = {}) {
  const route = enabled && tracedQaRoute(path);
  if (!route) return execute();
  const started = performance.now();
  const report = (phase, extra = {}) => emit('PUNCTUM_QA_PHASE ' + JSON.stringify({
    route, phase, ...extra,
  }));
  const mediaRoute = route === '/media/:id/card';
  const loopStart = (mediaRoute || studioRoutes.has(route)) ? performance.eventLoopUtilization() : undefined;
  const cpuStart = mediaRoute ? process.cpuUsage() : undefined;
  const runtimeMetrics = () => loopStart
    ? {
        loopBusyPct: Math.round(performance.eventLoopUtilization(loopStart).utilization * 100),
        ...(cpuStart && { cpuMs: Math.round(Object.values(process.cpuUsage(cpuStart)).reduce((sum, value) => sum + value, 0) / 1000) }),
      }
    : {};
  report('start');
  try {
    const mark = studioRoutes.has(route)
      ? (phase) => {
          if (studioPhases.has(phase)) report(phase, { ms: Math.round(performance.now() - started) });
        }
      : undefined;
    const response = mediaRoute
      ? await mediaPhase.run((phase) => report(phase, { ms: Math.round(performance.now() - started) }), execute)
      : await execute(mark);
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
