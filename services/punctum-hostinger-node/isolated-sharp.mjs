import { spawn } from 'node:child_process';

const maximumOutput = 40_000_000;
const timeoutMs = 23_000;
let active;

/**
 * @param {string} worker
 * @param {'info' | 'transform'} action
 * @param {Buffer} input
 * @param {object | null} [options]
 */
export async function runIsolatedSharp(worker, action, input, options = null) {
  const queued = performance.now();
  while (active) {
    const remaining = timeoutMs - (performance.now() - queued);
    if (remaining <= 0) throw new Error('The QA image process did not become available');
    await waitForSlot(active, remaining);
  }
  let release;
  active = new Promise((resolve) => { release = resolve; });
  try {
    const child = spawn(process.execPath, [worker, '--qa-sharp', action, JSON.stringify(options)], {
      env: { UV_THREADPOOL_SIZE: '2' },
      stdio: ['pipe', 'pipe', 'ignore'],
      timeout: Math.max(1, Math.floor(timeoutMs - (performance.now() - queued))),
      killSignal: 'SIGKILL',
    });
    return await new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      let failure;
      child.once('error', (error) => { failure = error; });
      child.stdin.on('error', (error) => { failure ??= error; });
      child.stdout.on('error', (error) => { failure ??= error; });
      child.stdout.on('data', (chunk) => {
        size += chunk.length;
        if (size > maximumOutput) {
          failure ??= new Error('QA image output exceeds its limit');
          child.kill('SIGKILL');
        } else {
          chunks.push(chunk);
        }
      });
      child.once('close', (code, signal) => {
        if (code === 0 && !failure && size) {
          resolve(Buffer.concat(chunks, size));
          return;
        }
        const error = failure ?? new Error('QA image operation did not complete');
        if (code === 2) error.code = 'INVALID_IMAGE_BYTES';
        if (signal === 'SIGKILL' && !failure) error.code = 'QA_IMAGE_PROCESS_TIMEOUT';
        reject(error);
      });
      child.stdin.end(input);
    });
  } finally {
    active = undefined;
    release();
  }
}

async function waitForSlot(slot, remaining) {
  let timer;
  try {
    await Promise.race([
      slot,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('The QA image process did not become available')), remaining);
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
