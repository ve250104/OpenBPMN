import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { prepareOutputs, commitOutputs } from '../dist/files.js';

async function directory(t, label) {
  const path = await fs.realpath(await fs.mkdtemp(join(tmpdir(), `openbpmn-audit-${label}-`)));
  t.after(() => fs.rm(path, { recursive: true, force: true }));
  return path;
}

test('a handled lock-cleanup failure cannot delete the only originals and then claim recoverable rollback', async (t) => {
  const dir = await directory(t, 'cleanup');
  const paths = ['process.bpmn', 'process.svg'].map((name) => join(dir, name));
  await Promise.all(paths.map((path) => fs.writeFile(path, 'original')));
  const plan = await prepareOutputs(paths, { replace: true });
  let failed = false;
  await assert.rejects(
    commitOutputs(plan, ['replacement', 'replacement'], {
      ...fs,
      rm: async (...args) => {
        if (!failed && plan.locks.includes(args[0])) {
          failed = true;
          throw Object.assign(new Error('injected lock cleanup fault'), { code: 'EACCES' });
        }
        return fs.rm(...args);
      },
    }),
    (error) => error.code === 'CLEANUP_FAILED',
  );
  assert.deepEqual(await Promise.all(paths.map((path) => fs.readFile(path, 'utf8'))), ['original', 'original']);
});

test('a destination edited after the first sibling replacement is not silently overwritten and discarded', async (t) => {
  const dir = await directory(t, 'late-target');
  const paths = ['process.bpmn', 'process.svg'].map((name) => join(dir, name));
  await Promise.all(paths.map((path) => fs.writeFile(path, 'original')));
  const plan = await prepareOutputs(paths, { replace: true });
  let linked = false;
  await assert.rejects(
    commitOutputs(plan, ['replacement', 'replacement'], {
      ...fs,
      link: async (...args) => {
        await fs.link(...args);
        if (!linked) {
          linked = true;
          await fs.writeFile(paths[1], 'concurrent user edit');
        }
      },
    }),
    (error) => error.code === 'FS_COLLISION',
  );
  assert.deepEqual(await Promise.all(paths.map((path) => fs.readFile(path, 'utf8'))), [
    'original',
    'concurrent user edit',
  ]);
});

test('rollback does not adopt a concurrent edit as its own newly produced content', async (t) => {
  const dir = await directory(t, 'produced-race');
  const paths = ['process.bpmn', 'process.svg'].map((name) => join(dir, name));
  await Promise.all(paths.map((path) => fs.writeFile(path, 'original')));
  const plan = await prepareOutputs(paths, { replace: true });
  let links = 0;
  await assert.rejects(
    commitOutputs(plan, ['replacement', 'replacement'], {
      ...fs,
      link: async (...args) => {
        if (++links === 2) throw Object.assign(new Error('injected next-output failure'), { code: 'EIO' });
        await fs.link(...args);
        if (links === 1) await fs.writeFile(paths[0], 'concurrent user edit');
      },
    }),
  );
  assert.equal(await fs.readFile(paths[0], 'utf8'), 'concurrent user edit');
  assert.equal(await fs.readFile(join(plan.stage, 'old-0'), 'utf8'), 'original');
});

test('partial recursive staging deletion still restores every original after a handled cleanup failure', async (t) => {
  const dir = await directory(t, 'partial-cleanup');
  const paths = ['process.bpmn', 'process.svg'].map((name) => join(dir, name));
  await Promise.all(paths.map((path, index) => fs.writeFile(path, `original-${index}`)));
  const plan = await prepareOutputs(paths, { replace: true });
  let failed = false;
  await assert.rejects(
    commitOutputs(plan, ['replacement-0', 'replacement-1'], {
      ...fs,
      rm: async (...args) => {
        if (!failed && args[0] === plan.stage) {
          failed = true;
          await fs.unlink(join(plan.stage, 'old-0'));
          await fs.unlink(join(plan.stage, 'manifest.json'));
          throw Object.assign(new Error('injected partial recursive cleanup fault'), { code: 'EIO' });
        }
        return fs.rm(...args);
      },
    }),
    (error) => error.code === 'CLEANUP_FAILED',
  );
  assert.deepEqual(await Promise.all(paths.map((path) => fs.readFile(path, 'utf8'))), ['original-0', 'original-1']);
  assert.deepEqual(await fs.readdir(dir), ['process.bpmn', 'process.svg']);
});

test('a redirected output directory is refused before private staging content is written through it', async (t) => {
  const dir = await directory(t, 'directory-redirection');
  const output = join(dir, 'output');
  const parked = join(dir, 'original-output');
  const redirected = join(dir, 'unrelated');
  await fs.mkdir(output);
  await fs.mkdir(redirected);
  const plan = await prepareOutputs([join(output, 'process.bpmn')]);
  await fs.rename(output, parked);
  await fs.symlink(redirected, output, 'dir');
  const redirectedWrites = [];
  await assert.rejects(
    commitOutputs(plan, ['private process description'], {
      ...fs,
      writeFile: async (...args) => {
        const actualParent = await fs.realpath(dirname(args[0]));
        if (actualParent.startsWith(redirected + '/')) redirectedWrites.push(actualParent);
        return fs.writeFile(...args);
      },
    }),
    (error) => error.code === 'FS_PATH',
  );
  assert.deepEqual(redirectedWrites, [], 'A refusal after writing data into an unrelated directory is too late.');
  assert.deepEqual(await fs.readdir(redirected), []);
});
