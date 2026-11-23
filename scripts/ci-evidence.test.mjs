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

test('PR verification uses a read-only token and covers the managed Node adapter', () => {
  assert.match(workflow, /^permissions:\s*\n  contents: read$/m);
  const checkouts = [...workflow.matchAll(/uses: actions\/checkout@v7\s+with:\s+ref: [^\n]+\r?\n\s+persist-credentials: false/g)];
  assert.equal(checkouts.length, 2);
  const nodeJob = workflow.split('  hostinger-node-qa:')[1];
  assert.ok(nodeJob.includes('node --test services/punctum-hostinger-production/*.test.mjs'));
});

test('managed Node CI compares two candidate builds with a clean second output directory', () => {
  const nodeJob = workflow.split('  hostinger-node-qa:')[1];
  assert.match(nodeJob, /npm run build:hostinger:candidate\s+- name: Compare managed candidate builds/);
  assert.match(nodeJob, /mv -- dist\/hostinger-candidate "\$first"\s+npm run build:hostinger:candidate\s+node scripts\/hostinger-candidate-build-equivalence\.mjs "\$first" dist\/hostinger-candidate/);
});

test('remote recovery changes are eligible for the explicit QA trigger and never run incidentally', async () => {
  const edge=await readFile(new URL('../.github/workflows/r4-edge-qa.yml', import.meta.url),'utf8');
  for(const path of ['scripts/r4-recovery-execute.mjs','scripts/lib/r4-recovery-qa.mjs','scripts/r4-recovery-qa.test.mjs']) assert.ok(edge.includes('"'+path+'"'),'Missing QA path: '+path);
  assert.match(edge,/if: contains\(github\.event\.head_commit\.message, '\[r4-qa-run\]'\)/);
});

test('read-only provider workflows propagate probe failures through tee', async () => {
  for (const name of ['punctum-clerk-r1-instance-readonly', 'punctum-hostinger-account-preflight']) {
    const probe = await readFile(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
    assert.ok(probe.split(/^      - /m).some((step) =>
      /^        shell: bash\r?$/m.test(step) && /\| tee outputs\//.test(step)), name);
  }
});
