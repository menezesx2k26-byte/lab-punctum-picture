import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { privateQaDatabasePath } from './runtime.mjs';
import { createQaSnapshot } from './migration-manifest.mjs';

export async function prepareManagedQaDatabase(file, {verifyTransactions=false} = {}) {
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
  let transactionChecks;
  if (verifyTransactions) {
    const result = spawnSync(process.execPath, ['--test', fileURLToPath(new URL('./sqlite.test.mjs', import.meta.url))], {
      env:{...process.env,TMPDIR:directory},encoding:'utf8',timeout:45000,
    });
    if (result.status !== 0) throw new Error('Managed private SQLite lock/concurrency/interruption checks failed');
    transactionChecks = {status:'PASS',filesystem:'same-private-directory',
      cases:['RETURNING/CAS','two writers/80 commits/lock wait','SIGKILL/uncommitted rollback/integrity/FK'],
      logSha256:createHash('sha256').update(result.stdout).digest('hex')};
  }
  const manifest = await createQaSnapshot(file, join(directory, `application-snapshot-${bootId}.sqlite`));
  return {schema:1, bootId, sourceSha:process.env.PUNCTUM_QA_SOURCE_SHA, transactionChecks, manifest};
}
