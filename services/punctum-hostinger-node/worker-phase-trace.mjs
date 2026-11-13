import { performance } from 'node:perf_hooks';
import { AsyncLocalStorage } from 'node:async_hooks';
import { qaRequestIdPattern, tracedQaRoute } from './route-trace.mjs';

const mediaPhase = new AsyncLocalStorage();
const mediaPhases = new Set([
  'media-original-start', 'media-original-end',
  'media-body-start', 'media-body-end', 'media-sharp-start', 'media-sharp-end',
  'media-metadata-start', 'media-metadata-end', 'media-decode-start', 'media-decode-end',
]);

export function markQaMediaPhase(phase) {
  if (mediaPhases.has(phase)) mediaPhase.getStore()?.(phase);
}

const studioRoutes = new Set(['/admin', '/admin/studio', '/admin/api/studio', '/admin/api/me']);
const publicSsrRoutes = new Set(['/', '/portfolio', '/arquivo', '/contato', '/ensaios/:qa']);
const renderPhases = new Set(['render-start', 'render-end']);
const sessionPhases = ['session-start', 'session-key-ready', 'session-verified', 'session-end'];
const uploadPhases = new Set([
  ...sessionPhases, 'rate-limit-start', 'rate-limit-end', 'upload-json-start', 'upload-json-end',
  'upload-validation-start', 'upload-validation-end', 'upload-commit-start', 'upload-commit-end',
]);
const studioPhases = new Set([
  ...sessionPhases,
  'studio-draft-start', 'studio-draft-end', 'studio-history-end',
  ...renderPhases,
]);

// This runner is bundled only into the disposable Node QA target. Never print
// response bodies, request headers, cookie values, stack traces or query strings.
export async function traceQaWorker(path, execute, {
  enabled = false, emit = console.log, requestId, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  const route = enabled && tracedQaRoute(path);
  if (!route) return execute();
  const started = performance.now();
  const correlation = typeof requestId === 'string' && qaRequestIdPattern.test(requestId) ? { requestId } : {};
  const report = (phase, extra = {}) => emit('PUNCTUM_QA_PHASE ' + JSON.stringify({
    route, phase, ...correlation, ...extra,
  }));
  const uploadRoute = route === '/admin/api/uploads/:id/complete';
  const mediaRoute = uploadRoute || route === '/media/:id/card';
  const loopStart = performance.eventLoopUtilization();
  const cpuStart = process.cpuUsage();
  const runtimeMetrics = () => {
    const { user, system } = process.cpuUsage(cpuStart);
    return {
      loopBusyPct: Math.round(performance.eventLoopUtilization(loopStart).utilization * 100),
      cpuMs: Math.round((user + system) / 1000),
    };
  };
  report('start');
  const timer = setTimer(() => report('pending', {
    ms: Math.round(performance.now() - started),
    ...runtimeMetrics(),
  }), 5000);
  timer.unref();
  try {
    const allowed = uploadRoute ? uploadPhases : studioRoutes.has(route) ? studioPhases :
      publicSsrRoutes.has(route) ? renderPhases : null;
    const mark = allowed ? (phase) => {
      if (allowed.has(phase)) report(phase, { ms: Math.round(performance.now() - started) });
    } : undefined;
    const response = mediaRoute
      ? await mediaPhase.run((phase) => report(phase, { ms: Math.round(performance.now() - started) }), () => execute(mark))
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
  } finally {
    clearTimer(timer);
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
