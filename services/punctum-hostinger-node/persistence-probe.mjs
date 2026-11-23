import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { privateQaDatabasePath } from './runtime.mjs';
import { qaApplicationId } from './sqlite.mjs';

const marker = 'punctum-private-capability-synthetic-20261112';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export async function probePrivateStorage(directory) {
  let created = false;
  try { mkdirSync(directory, {mode: 0o700}); created = true; }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) ||
      (process.getuid && info.uid !== process.getuid())) throw new Error('An owner-only private directory is required');
  const file = join(directory, 'capability.sqlite');
  if (created) closeSync(openSync(file, 'wx', 0o600));
  privateQaDatabasePath(file);
  const db = new DatabaseSync(file, {enableForeignKeyConstraints: true, timeout: 5000});
  const bootId = randomUUID();
  try {
    if (created) {
      db.exec(`PRAGMA application_id=${qaApplicationId};
        CREATE TABLE capability (id INTEGER PRIMARY KEY CHECK(id=1), marker TEXT NOT NULL,
          sentinel TEXT NOT NULL, boots INTEGER NOT NULL) STRICT`);
      db.prepare('INSERT INTO capability VALUES(1, ?, ?, 0)').run(marker, randomBytes(32).toString('hex'));
      writeFileSync(join(directory, 'synthetic-media.bin'), Buffer.from('Punctum synthetic private media fixture\n'), {flag:'wx', mode:0o600});
    }
    if (db.prepare('PRAGMA application_id').get().application_id !== qaApplicationId) throw new Error('Unmarked database');
    const row = db.prepare('SELECT * FROM capability WHERE id=1').get();
    if (row?.marker !== marker || !/^[a-f0-9]{64}$/.test(row.sentinel)) throw new Error('Unmarked capability fixture');
    const mediaPath = join(directory, 'synthetic-media.bin');
    privateQaDatabasePath(mediaPath);
    const media = readFileSync(mediaPath);
    if (media.toString() !== 'Punctum synthetic private media fixture\n') throw new Error('Persistent synthetic media changed');
    db.exec('BEGIN IMMEDIATE; UPDATE capability SET boots=boots+1 WHERE id=1; COMMIT');
    const boots = db.prepare('SELECT boots FROM capability WHERE id=1').get().boots;
    const integrity = db.prepare('PRAGMA integrity_check').get().integrity_check;
    if (integrity !== 'ok') throw new Error('SQLite integrity failed');
    const snapshot = join(directory, `snapshot-${bootId}.sqlite`);
    closeSync(openSync(snapshot, 'wx', 0o600));
    await backup(db, snapshot);
    privateQaDatabasePath(snapshot);
    const restored = new DatabaseSync(snapshot, {readOnly:true});
    try {
      const restoredRow = restored.prepare('SELECT * FROM capability WHERE id=1').get();
      if (restoredRow.marker !== marker || restoredRow.sentinel !== row.sentinel || restoredRow.boots !== boots ||
          restored.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup verification failed');
    } finally { restored.close(); }
    return {schema:1, scope:'synthetic-only', bootId, boots, fixtureSha256:sha256(row.sentinel + sha256(media)),
      integrity, backupVerified:true, privateOutsideDeployment:true,
      directoryMode:(info.mode & 0o777).toString(8), databaseMode:(statSync(file).mode & 0o777).toString(8)};
  } finally { db.close(); }
}
