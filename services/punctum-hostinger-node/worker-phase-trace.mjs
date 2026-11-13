import { performance } from 'node:perf_hooks';
import { isTracedQaRoute } from './route-trace.mjs';

// This runner is bundled only into the disposable Node QA target. Never print
// response bodies, request headers, cookie values, stack traces or query strings.
export async function traceQaWorker(route, execute, { enabled = false, emit = console.log } = {}) {
  if (!enabled || !isTracedQaRoute(route)) return execute();
  const started = performance.now();
  const report = (phase, extra = {}) => emit('PUNCTUM_QA_PHASE ' + JSON.stringify({
    route, phase, ...extra,
  }));
  report('start');
  try {
    const response = await execute();
    report('returned', {
      status: response.status,
      ms: Math.round(performance.now() - started),
    });
    return response;
  } catch (error) {
    report('error', { ms: Math.round(performance.now() - started) });
    throw error;
  }
}
