import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZoomBrowser } from './browser-zoom-evidence.mjs';

async function launchOptions(executablePath) {
  const directory = await mkdtemp(join(tmpdir(), 'punctum-native-zoom-launch-'));
  try {
    let result;
    const fakeChromium = {
      async launchPersistentContext(profile, options) {
        assert.equal(profile, directory);
        result = options;
        return {};
      },
    };
    await createZoomBrowser(fakeChromium, directory, executablePath);
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('uses full Chromium rather than default headless shell for native zoom', async () => {
  const options = await launchOptions(undefined);
  assert.equal(options.channel, 'chromium');
  assert.equal(options.headless, true);
  assert.equal(options.viewport, null);
});

test('keeps an explicit executable without changing its channel', async () => {
  const options = await launchOptions('/opt/google/chrome/chrome');
  assert.equal(options.executablePath, '/opt/google/chrome/chrome');
  assert.equal(options.channel, undefined);
});