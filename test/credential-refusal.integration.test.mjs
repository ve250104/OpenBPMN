import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

test('a credential-bearing unsupported concept is refused without disclosure or artifacts', async (t) => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'bpmn-weave-concept-secret-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const request = JSON.parse(await readFile(new URL('../examples/invoice-review.json', import.meta.url), 'utf8'));
  const secret = 'synthetic-review-credential';
  request.issues = [
    {
      key: 'extension',
      kind: 'unsupportedRequirement',
      affectsMeaning: true,
      description: 'The source requires a named extension.',
      concept: `https://example.invalid/?api_key=${secret}#Extension`,
    },
  ];
  for (const additional of [[], ['--export', 'snapshot'], ['--handoff', join(directory, 'review.openbpmn.json')]]) {
    const result = spawnSync(
      process.execPath,
      [cli, 'generate', '--input', '-', '--output', join(directory, 'review'), '--debug', ...additional],
      {
        input: JSON.stringify(request),
        encoding: 'utf8',
        timeout: 10_000,
      },
    );
    assert.equal(result.status, 3, 'A concept identity must not be rewritten or exposed.');
    assert.ok(!result.stdout.includes(secret) && !result.stderr.includes(secret));
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.report.checks.find((check) => check.id === 'input').status, 'failed');
    assert.ok(
      envelope.report.findings.some(
        (finding) => finding.code === 'INPUT_SCHEMA' && finding.inputPointer === '/issues/0/concept',
      ),
    );
    assert.deepEqual(envelope.artifacts, []);
    assert.deepEqual(await readdir(directory), []);
  }
});
