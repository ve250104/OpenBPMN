import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, readdir, mkdir, lstat, readlink, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const manager = fileURLToPath(new URL('../dist/manage.js', import.meta.url));
const run = (args, home) => {
  const result = spawnSync(process.execPath, [manager, ...args, '--json', '--non-interactive'], {
    encoding: 'utf8',
    timeout: 10_000,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  return { ...result, body: JSON.parse(result.stdout || '{}') };
};

test('setup refuses an unverified distribution without changing existing user files', async () => {
  const home = await mkdtemp(join(tmpdir(), 'weave-install-'));
  try {
    const profile = join(home, '.profile');
    await writeFile(profile, 'export MY_SETTING=keep\n');
    const result = run(
      ['setup', '--bundle', join(home, 'missing'), '--prefix', join(home, 'install'), '--host', 'codex'],
      home,
    );
    assert.equal(result.status, 1);
    assert.equal(result.body.status, 'failed');
    assert.match(result.body.message, /distribution|manifest/i);
    assert.equal(await readFile(profile, 'utf8'), 'export MY_SETTING=keep\n');
    assert.deepEqual(await readdir(home), ['.profile']);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

// Small inert candidate: negative tests must refuse it before executing any payload.
async function candidate(directory) {
  const runtime = process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/bin/node';
  const contents = {
    'app/package.json': JSON.stringify({ name: '@ve250104/bpmn-weave', version: '0.1.0-dev.0' }),
    'app/dist/cli.js': 'throw new Error("This preflight fixture must never execute");\n',
    'app/dist/manage.js': 'throw new Error("This preflight fixture must never execute");\n',
    'app/skills/bpmn-weave/version.json': JSON.stringify({ toolVersion: '0.1.0-dev.0' }),
    [runtime]: 'Inert test runtime; never executable.\n',
  };
  const files = [];
  for (const [path, content] of Object.entries(contents)) {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), content);
    files.push({ path, bytes: Buffer.byteLength(content), sha256: createHash('sha256').update(content).digest('hex') });
  }
  const manifest = {
    schemaVersion: 1,
    version: '0.1.0-dev.0',
    platform: process.platform,
    arch: process.arch,
    nodeVersion: '24.19.0',
    runtimeExecutable: runtime,
    files,
  };
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

async function snapshot(directory, prefix = '') {
  const entries = {};
  for (const name of (await readdir(directory)).sort()) {
    const relative = prefix + name;
    const path = join(directory, name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) entries[relative] = { link: await readlink(path) };
    else if (info.isDirectory()) {
      entries[relative + '/'] = { mode: info.mode & 0o777 };
      Object.assign(entries, await snapshot(path, relative + '/'));
    } else
      entries[relative] = {
        mode: info.mode & 0o777,
        sha256: createHash('sha256')
          .update(await readFile(path))
          .digest('hex'),
      };
  }
  return entries;
}

test('noninteractive setup requires an explicit host and returns invalid usage without filesystem changes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'weave-install-'));
  try {
    await writeFile(join(home, '.profile'), 'export USER_SETTING=preserve\n');
    const before = await snapshot(home);
    const result = run(['setup', '--bundle', join(home, 'missing'), '--prefix', join(home, 'install')], home);
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.equal(result.body.status, 'failed');
    assert.match(result.body.message, /host/i);
    assert.deepEqual(await snapshot(home), before);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('management rejects options belonging to another operation instead of silently ignoring them', async () => {
  const home = await mkdtemp(join(tmpdir(), 'weave-install-'));
  try {
    await writeFile(join(home, 'keep.txt'), 'unrelated user material');
    const before = await snapshot(home);
    const result = run(['doctor', '--prefix', join(home, 'install'), '--bundle', join(home, 'candidate')], home);
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.equal(result.body.status, 'failed');
    assert.deepEqual(await snapshot(home), before);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('conflicting repeated installation prefixes are refused rather than selecting a different target', async () => {
  const home = await mkdtemp(join(tmpdir(), 'weave-install-'));
  try {
    await writeFile(join(home, 'keep.txt'), 'unrelated user material');
    const before = await snapshot(home);
    const result = run(['doctor', '--prefix', join(home, 'first'), '--prefix', join(home, 'second')], home);
    assert.equal(result.status, 3, result.stdout + result.stderr);
    assert.equal(result.body.status, 'failed');
    assert.deepEqual(await snapshot(home), before);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a candidate for another operating system is refused before installation and preserves the complete user tree', async () => {
  const home = await mkdtemp(join(tmpdir(), 'weave-install-'));
  try {
    const bundle = join(home, 'bundle');
    const manifest = await candidate(bundle);
    manifest.platform = process.platform === 'win32' ? 'linux' : 'win32';
    await writeFile(join(bundle, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(home, '.profile'), 'export USER_SETTING=preserve\n');
    const before = await snapshot(home);
    const result = run(['setup', '--bundle', bundle, '--prefix', join(home, 'install'), '--host', 'codex'], home);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.body.message, /platform|operating system/i);
    assert.deepEqual(await snapshot(home), before);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a symlinked payload directory cannot redirect installation reads or modify its target', async () => {
  const home = await mkdtemp(join(tmpdir(), 'weave-install-'));
  try {
    const bundle = join(home, 'bundle');
    await candidate(bundle);
    const outside = join(home, 'private-existing-directory');
    await mkdir(outside);
    await writeFile(join(outside, 'keep.txt'), 'private existing material must remain untouched');
    await rm(join(bundle, 'app', 'dist'), { recursive: true });
    await symlink(outside, join(bundle, 'app', 'dist'), 'junction');
    const before = await snapshot(home);
    const result = run(['setup', '--bundle', bundle, '--prefix', join(home, 'install'), '--host', 'codex'], home);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.body.message, /symbolic|non-ordinary|link/i);
    assert.deepEqual(await snapshot(home), before);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('a changed application payload fails inventory verification before skill registration or shell integration', async () => {
  const home = await mkdtemp(join(tmpdir(), 'weave-install-'));
  try {
    const bundle = join(home, 'bundle');
    await candidate(bundle);
    await writeFile(join(bundle, 'app', 'dist', 'cli.js'), 'altered payload\n');
    await writeFile(join(home, '.profile'), 'export USER_SETTING=preserve\n');
    const before = await snapshot(home);
    const result = run(['setup', '--bundle', bundle, '--prefix', join(home, 'install'), '--host', 'codex'], home);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.body.message, /checksum|inventory|integrity/i);
    assert.deepEqual(await snapshot(home), before);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('setup rejects traversal in a distribution inventory before reading or writing its payload', async () => {
  const home = await mkdtemp(join(tmpdir(), 'weave-install-'));
  try {
    const bundle = join(home, 'bundle');
    await mkdir(bundle);
    await writeFile(
      join(bundle, 'manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        version: '0.1.0-dev.0',
        platform: process.platform,
        arch: process.arch,
        nodeVersion: '24.19.0',
        runtimeExecutable: 'runtime/bin/node',
        files: [{ path: '../outside', sha256: 'a'.repeat(64), bytes: 0 }],
      }),
    );
    const result = run(['setup', '--bundle', bundle, '--prefix', join(home, 'install'), '--host', 'codex'], home);
    assert.equal(result.status, 1);
    assert.match(result.body.message, /unsafe.*inventory/i);
    assert.deepEqual((await readdir(home)).sort(), ['bundle']);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test('doctor explains an absent installation without creating state or searching user content', async () => {
  const home = await mkdtemp(join(tmpdir(), 'weave-install-'));
  try {
    const result = run(['doctor', '--prefix', join(home, 'install')], home);
    assert.equal(result.status, 1);
    assert.match(result.body.message, /No managed installation.*setup/i);
    assert.deepEqual(await readdir(home), []);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
