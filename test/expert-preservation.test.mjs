import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../dist/core.js';
import { readOptions } from '../dist/options.js';

async function expertExport(t, duringCommit) {
  const directory = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'openbpmn-expert-preservation-')));
  const stem = join(directory, 'invoice');
  const svg = stem + '.invalid.svg';
  const request = JSON.parse(await fs.readFile(new URL('../examples/invoice-review.json', import.meta.url), 'utf8'));
  request.model.processes[0].flows.push({
    key: 'illegalRestart',
    containerRef: 'reviewProcess',
    sourceRef: 'completed',
    targetRef: 'received',
  });
  const input = join(directory, 'request.json');
  await fs.writeFile(input, JSON.stringify(request));
  await fs.writeFile(svg, 'previous expert preview');
  const mkdir = fs.mkdir;
  let injected = false;
  t.after(async () => {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    await fs.rm(directory, { recursive: true, force: true });
  });
  // Interleave a real filesystem change after rendering failed, at the start of commit.
  t.mock.method(fs, 'mkdir', async (path, ...args) => {
    const result = await mkdir(path, ...args);
    if (!injected && String(path).endsWith('.stage')) {
      injected = true;
      await duringCommit(svg);
    }
    return result;
  });
  syncBuiltinESMExports();
  const result = await runCommand(
    readOptions([
      'generate',
      '--input',
      input,
      '--output',
      stem,
      '--export',
      'snapshot',
      '--expert-invalid',
      '--replace',
      '--browser-executable',
      join(directory, 'missing-browser'),
    ]),
  );
  assert.equal(injected, true, 'The test must reach the actual expert artifact commit.');
  return { result, svg, stem };
}

test('an omitted expert preview changed during commit is not falsely reported as preserved', async (t) => {
  const { result, svg } = await expertExport(t, (path) => fs.writeFile(path, 'concurrent user edit'));
  assert.equal(result.signal, 'invalid_exported');
  assert.equal(result.exitCode, 2);
  assert.equal(await fs.readFile(svg, 'utf8'), 'concurrent user edit');
  assert.deepEqual(
    result.artifacts.map(({ kind, state }) => ({ kind, state })),
    [
      { kind: 'bpmn', state: 'produced' },
      { kind: 'quality', state: 'produced' },
    ],
  );
});

test('an unchanged omitted expert preview is reported as preserved when the remaining export is refused', async (t) => {
  const { result, svg, stem } = await expertExport(t, (path) =>
    fs.writeFile(path.replace(/\.svg$/, '.bpmn'), 'concurrent external model'),
  );
  assert.equal(result.signal, 'generation_failed');
  assert.equal(result.exitCode, 4);
  assert.equal(await fs.readFile(svg, 'utf8'), 'previous expert preview');
  assert.equal(await fs.readFile(stem + '.invalid.bpmn', 'utf8'), 'concurrent external model');
  assert.deepEqual(result.artifacts, [{ kind: 'svg', path: svg, state: 'preserved' }]);
});

test('an omitted expert preview is reported as preserved only while its original contents still exist', async (t) => {
  const { result, svg } = await expertExport(t, async () => {});
  assert.equal(result.signal, 'invalid_exported');
  assert.equal(await fs.readFile(svg, 'utf8'), 'previous expert preview');
  assert.deepEqual(
    result.artifacts.filter((artifact) => artifact.kind === 'svg'),
    [{ kind: 'svg', path: svg, state: 'preserved' }],
  );
});

test('an omitted expert preview removed during commit is not recreated or reported as preserved', async (t) => {
  const { result, svg } = await expertExport(t, (path) => fs.unlink(path));
  assert.equal(result.signal, 'invalid_exported');
  await assert.rejects(fs.stat(svg), { code: 'ENOENT' });
  assert.equal(
    result.artifacts.some((artifact) => artifact.kind === 'svg'),
    false,
  );
});
