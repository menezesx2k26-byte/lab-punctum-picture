import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('PR verification checks out its exact head and preserves the browser visual evidence', () => {
  assert.match(workflow, /uses: actions\/checkout@v7\s+with:\s+ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /node --test scripts\/ci-evidence\.test\.mjs/);
  assert.match(workflow, /path: outputs\/browser-e2e\//);
  assert.doesNotMatch(workflow, /path: outputs\/browser-e2e\/report\.json/);
});

test('remote recovery changes are eligible for the explicit QA trigger and never run incidentally', async () => {
  const edge=await readFile(new URL('../.github/workflows/r4-edge-qa.yml', import.meta.url),'utf8');
  for(const path of ['scripts/r4-recovery-execute.mjs','scripts/lib/r4-recovery-qa.mjs','scripts/r4-recovery-qa.test.mjs']) assert.ok(edge.includes('"'+path+'"'),'Missing QA path: '+path);
  assert.match(edge,/if: contains\(github\.event\.head_commit\.message, '\[r4-qa-run\]'\)/);
});
