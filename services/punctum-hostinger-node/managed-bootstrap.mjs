import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { privateQaDatabasePath } from './runtime.mjs';
import { createQaSnapshot } from './migration-manifest.mjs';

export async function prepareManagedQaDatabase(file) {
  if (!file || !isAbsolute(file)) throw new Error('Absolute private QA database required');
  const directory = dirname(file);
  const parent = lstatSync(directory);
  if (!parent.isDirectory() || parent.isSymbolicLink() || (parent.mode & 0o077) ||
      (process.getuid && parent.uid !== process.getuid())) throw new Error('Owner-only private storage required');
  if (!existsSync(file)) {
    const seeded = spawnSync(process.execPath, [fileURLToPath(new URL('./seed.mjs', import.meta.url)), file], {encoding:'utf8'});
    if (seeded.status !== 0) throw new Error('Exclusive synthetic QA initialization failed');
  }
  privateQaDatabasePath(file);
  const bootId = randomUUID();
  const manifest = await createQaSnapshot(file, join(directory, `application-snapshot-${bootId}.sqlite`));
  return {schema:1, bootId, sourceSha:process.env.PUNCTUM_QA_SOURCE_SHA, manifest};
}
