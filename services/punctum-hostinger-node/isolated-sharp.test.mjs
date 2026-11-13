import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import sharp from 'sharp';
import { runIsolatedSharp } from './isolated-sharp.mjs';

const worker = fileURLToPath(new URL('./sharp-worker.mjs', import.meta.url));

test('isolated Sharp retains format, dimensions and exact transform bytes', async () => {
  const input = await sharp({
    create: { width: 64, height: 48, channels: 3, background: 'navy' },
  }).png().toBuffer();
  const info = await runIsolatedSharp(worker, 'info', input);
  assert.deepEqual(JSON.parse(info), { width: 64, height: 48, format: 'png', fileSize: input.length });

  const options = {
    resize: { width: 32, height: 32, fit: 'cover', position: 'attention', withoutEnlargement: false },
    format: 'webp',
    quality: 82,
  };
  const expected = await sharp(input).autoOrient().resize(options.resize)
    .toFormat(options.format, { quality: options.quality }).toBuffer();
  assert.deepEqual(await runIsolatedSharp(worker, 'transform', input, options), expected);
});

test('isolated Sharp rejects a truncated image that still has readable metadata', async () => {
  const input = await sharp({
    create: { width: 64, height: 48, channels: 3, background: 'navy' },
  }).png().toBuffer();
  const truncated = input.subarray(0, 62);
  assert.equal((await sharp(truncated).metadata()).width, 64);
  await assert.rejects(runIsolatedSharp(worker, 'info', truncated), { code: 'INVALID_IMAGE_BYTES' });
});

test('concurrent isolated operations reuse the same bounded process slot', async () => {
  const input = await sharp({
    create: { width: 32, height: 24, channels: 3, background: 'navy' },
  }).png().toBuffer();
  const results = await Promise.all([
    runIsolatedSharp(worker, 'info', input),
    runIsolatedSharp(worker, 'info', input),
  ]);
  assert.deepEqual(results[0], results[1]);
});
