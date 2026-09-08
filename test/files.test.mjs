import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareOutputs, commitOutputs, preservedOutputs } from '../dist/files.js';

test('a complete new Output Bundle is committed with no residual staging files', async (t) => {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'bpmn-weave-files-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const paths = ['process.bpmn', 'process.svg', 'process.quality.json'].map((name) => join(dir, name));
  const plan = await prepareOutputs(paths);
  await commitOutputs(plan, ['<model/>', '<svg/>', '{}']);
  assert.deepEqual(await Promise.all(paths.map((path) => fs.readFile(path, 'utf8'))), ['<model/>', '<svg/>', '{}']);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['process.bpmn', 'process.quality.json', 'process.svg']);
  assert.equal((await fs.stat(paths[0])).mode & 0o777, 0o600);
});

test('a handled replacement failure restores every prior artifact byte-for-byte', async (t) => {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'bpmn-weave-rollback-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const paths = ['process.bpmn', 'process.svg', 'process.quality.json'].map((name) => join(dir, name));
  const old = ['old XML', 'old SVG', 'old report'];
  await Promise.all(paths.map((path, index) => fs.writeFile(path, old[index])));
  const plan = await prepareOutputs(paths, { replace: true });
  let links = 0;
  await assert.rejects(
    commitOutputs(plan, ['new XML', 'new SVG', 'new report'], {
      ...fs,
      link: async (...args) => {
        if (++links === 2) throw Object.assign(new Error('injected output fault'), { code: 'EIO' });
        return fs.link(...args);
      },
    }),
    (error) => error.code === 'FS_IO',
  );
  assert.deepEqual(await Promise.all(paths.map((path) => fs.readFile(path, 'utf8'))), old);
  assert.equal((await fs.readdir(dir)).length, 3);
});

test('a pending bundle operation cannot be bypassed by omitting its optional Handoff on retry', async (t) => {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'bpmn-weave-pending-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const paths = ['process.bpmn', 'process.svg', 'process.quality.json'].map((name) => join(dir, name));
  const interrupted = await prepareOutputs([...paths, join(dir, 'process.openbpmn.json')]);
  await fs.mkdir(interrupted.stage);
  await assert.rejects(prepareOutputs(paths), (error) => error.code === 'FS_COLLISION');
});

test('catchable cancellation during replacement restores the previous complete bundle', async (t) => {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'bpmn-weave-cancel-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const paths = ['process.bpmn', 'process.svg'].map((name) => join(dir, name));
  await Promise.all(paths.map((path) => fs.writeFile(path, 'old')));
  const controller = new AbortController();
  const plan = await prepareOutputs(paths, { replace: true });
  let linked = false;
  await assert.rejects(
    commitOutputs(
      plan,
      ['new', 'new'],
      {
        ...fs,
        link: async (...args) => {
          await fs.link(...args);
          if (!linked) {
            linked = true;
            controller.abort();
          }
        },
      },
      { signal: controller.signal },
    ),
    (error) => error.code === 'DEPENDENCY_FAILURE',
  );
  assert.deepEqual(await Promise.all(paths.map((path) => fs.readFile(path, 'utf8'))), ['old', 'old']);
  assert.equal((await fs.readdir(dir)).length, 2);
});

test('an overlapping SVG-only operation cannot bypass an active bundle transaction', async (t) => {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'bpmn-weave-overlap-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const paths = ['process.bpmn', 'process.svg'].map((name) => join(dir, name));
  const plan = await prepareOutputs(paths);
  let checked = false;
  await commitOutputs(plan, ['<model/>', '<svg/>'], {
    ...fs,
    writeFile: async (...args) => {
      await fs.writeFile(...args);
      if (!checked) {
        checked = true;
        await assert.rejects(prepareOutputs([paths[1]]), (error) => error.code === 'FS_COLLISION');
      }
    },
  });
  assert.equal(checked, true);
  assert.equal((await fs.readdir(dir)).length, 2);
});

test('a handled cleanup failure rolls back before reporting failure', async (t) => {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'bpmn-weave-cleanup-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const paths = ['process.bpmn', 'process.svg'].map((name) => join(dir, name));
  await Promise.all(paths.map((path) => fs.writeFile(path, 'old')));
  const plan = await prepareOutputs(paths, { replace: true });
  let failed = false;
  await assert.rejects(
    commitOutputs(plan, ['new', 'new'], {
      ...fs,
      rm: async (...args) => {
        if (!failed) {
          failed = true;
          throw Object.assign(new Error('cleanup unavailable'), { code: 'EACCES' });
        }
        return fs.rm(...args);
      },
    }),
    (error) => error.code === 'CLEANUP_FAILED',
  );
  assert.deepEqual(await Promise.all(paths.map((path) => fs.readFile(path, 'utf8'))), ['old', 'old']);
});

test('symbolic links, input hardlinks, non-sibling paths, and case-equivalent destinations are refused', async (t) => {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'bpmn-weave-paths-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const input = join(dir, 'input.json');
  const hardlink = join(dir, 'linked.bpmn');
  const symlink = join(dir, 'redirected.svg');
  await fs.writeFile(input, 'retained input');
  await fs.link(input, hardlink);
  await fs.symlink(input, symlink);
  await fs.mkdir(join(dir, 'nested'));
  for (const [paths, options] of [
    [[hardlink], { inputPath: input, replace: true }],
    [[symlink], { replace: true }],
    [[join(dir, 'new.bpmn'), join(dir, 'nested', 'new.svg')], {}],
    [[join(dir, 'new.bpmn'), join(dir, 'NEW.BPMN')], {}],
  ])
    await assert.rejects(prepareOutputs(paths, options), (error) => error.code === 'FS_PATH');
  assert.equal(await fs.readFile(input, 'utf8'), 'retained input');
});

test('rollback never removes a concurrently changed output and claims only verified originals as preserved', async (t) => {
  const dir = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'bpmn-weave-recovery-')));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const paths = ['process.bpmn', 'process.svg'].map((name) => join(dir, name));
  await Promise.all(paths.map((path) => fs.writeFile(path, 'old')));
  const plan = await prepareOutputs(paths, { replace: true });
  let links = 0;
  await assert.rejects(
    commitOutputs(plan, ['new', 'new'], {
      ...fs,
      link: async (...args) => {
        if (++links === 2) {
          await fs.writeFile(paths[0], 'concurrent change');
          throw Object.assign(new Error('commit failure'), { code: 'EIO' });
        }
        return fs.link(...args);
      },
    }),
    (error) => error.code === 'CLEANUP_FAILED',
  );
  assert.equal(await fs.readFile(paths[0], 'utf8'), 'concurrent change');
  assert.equal(await fs.readFile(join(plan.stage, 'old-0'), 'utf8'), 'old');
  assert.deepEqual(await preservedOutputs(plan), [paths[1]]);
  await assert.rejects(prepareOutputs(paths, { replace: true }), (error) => error.code === 'FS_COLLISION');
});
