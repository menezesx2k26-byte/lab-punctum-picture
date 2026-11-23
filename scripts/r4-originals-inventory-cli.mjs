#!/usr/bin/env node
/**
 * Offline summary for an operator-supplied, read-only D1/R2 manifest.
 * Never accesses the network, credentials, remote D1/R2, or writes any file.
 * Does not emit raw R2 keys, ETags, SHA hashes or customer identities.
 */
import { readFile, stat } from 'node:fs/promises';
import { summarizeOriginalsInventory } from './lib/r4-originals-inventory-readonly.mjs';

const LIMIT_BYTES = 8 * 1024 * 1024;
const [flag, filename, extra] = process.argv.slice(2);

async function main() {
  if (flag !== '--input' || !filename || extra || filename === '-') {
    process.stderr.write('Usage: node scripts/r4-originals-inventory-cli.mjs --input <local-manifest.json>\n');
    process.exitCode = 2;
    return;
  }
  try {
    const file = await stat(filename);
    if (!file.isFile() || file.size > LIMIT_BYTES || file.size === 0)
      throw new Error('invalid offline manifest file');
    const raw = JSON.parse(await readFile(filename, 'utf8'));
    const result = summarizeOriginalsInventory(raw);
    // Strict subset of the library's internal report. No object keys, names,
    // per-object metadata, hashes or cloud account information are emitted.
    process.stdout.write(JSON.stringify({
      schemaVersion: result.schemaVersion,
      scope: result.scope,
      source: 'OPERATOR_PROVIDED_LOCAL_MANIFEST_ONLY',
      status: result.status,
      inventoryComplete: result.inventoryComplete,
      objectClassificationCounts: result.counts,
      observedBytes: result.observedBytes,
      deletionAuthorized: false,
      rollbackAuthorized: false,
      productionSafeToRelease: false,
      writes: 0,
      byteDigestsVerified: 0,
      blockers: result.blockers,
    }, null, 2) + '\n');
    if (!result.inventoryComplete) process.exitCode = 2;
  } catch {
    // Don't print filesystem paths, input content, stack traces or secrets.
    process.stderr.write('OFFLINE_INVENTORY_INPUT_INVALID\n');
    process.exitCode = 2;
  }
}

await main();
