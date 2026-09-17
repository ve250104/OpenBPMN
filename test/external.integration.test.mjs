import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const example = fileURLToPath(new URL('../examples/invoice-review.json', import.meta.url));
function command(args, expected = 0) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, expected, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}

test('a user validates and renders original supplied BPMN without modifying it or creating a workspace', async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-external-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stem = join(directory, 'original');
  command(['generate', '--input', example, '--output', stem]);
  const original = await readFile(stem + '.bpmn');
  const before = await readdir(directory);
  const validated = command(['validate', '--input', stem + '.bpmn']);
  assert.equal(validated.signal, 'validation_completed');
  assert.equal(validated.report.export.cleanEligible, true);
  assert.equal(validated.report.checks.find((c) => c.id === 'evidence').status, 'not_applicable');
  assert.deepEqual(validated.artifacts, []);
  assert.deepEqual(await readdir(directory), before);
  const rendered = command(['render', '--input', stem + '.bpmn', '--output', join(directory, 'supplied.svg')]);
  assert.equal(rendered.signal, 'render_completed');
  assert.equal(rendered.report.export.cleanEligible, false);
  assert.deepEqual(
    rendered.artifacts.map((a) => a.kind),
    ['svg'],
  );
  assert.deepEqual(await readFile(stem + '.bpmn'), original);
  assert.deepEqual(await readFile(join(directory, 'supplied.svg')), await readFile(stem + '.svg'));
});

test('named consumer fit stays separate from core validity and never implies tenant verification', async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-compatibility-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const stem = join(directory, 'process');
  command(['generate', '--input', example, '--output', stem]);
  const original = await readFile(stem + '.bpmn', 'utf8');
  const compatible = command([
    'validate',
    '--input',
    stem + '.bpmn',
    '--compatibility',
    'celonis-analysis-conformance',
  ]);
  assert.equal(compatible.report.export.cleanEligible, true);
  assert.equal(
    compatible.report.checks.find((c) => c.id === 'compatibility:celonis-analysis-conformance').status,
    'passed',
  );
  assert.ok(compatible.report.findings.some((f) => f.code === 'COMPATIBILITY_UNVERIFIED'));
  await writeFile(stem + '.bpmn', original.replaceAll('bpmn:task', 'bpmn:userTask'));
  const advanced = await readFile(stem + '.bpmn');
  const limited = command(
    ['validate', '--input', stem + '.bpmn', '--compatibility', 'celonis-analysis-conformance'],
    2,
  );
  assert.equal(limited.report.export.cleanEligible, true);
  assert.equal(
    limited.report.checks.find((c) => c.id === 'compatibility:celonis-analysis-conformance').status,
    'failed',
  );
  assert.deepEqual(await readFile(stem + '.bpmn'), advanced);
});
