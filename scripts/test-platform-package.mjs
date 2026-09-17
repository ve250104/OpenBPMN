import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createRequire } from 'node:module';
import { assertInstalledDependencyLock } from './package-dependencies.mjs';

const { values } = parseArgs({ options: { bundle: { type: 'string' } } });
assert.ok(values.bundle, 'Select the actual extracted candidate with --bundle.');
const directory = resolve(values.bundle);
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
assert.equal(
  manifest.sizes.totalBytes,
  manifest.files.reduce((total, file) => total + file.bytes, 0) + (await lstat(join(directory, 'manifest.json'))).size,
  'Total installed bytes must include distribution metadata.',
);
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.platform, process.platform);
assert.equal(manifest.arch, process.arch);
const seen = new Set();
async function inspect(path, prefix = '') {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = prefix + entry.name;
    assert.ok(!entry.isSymbolicLink(), 'Distributed files must not be symbolic links.');
    if (entry.isDirectory()) await inspect(join(path, entry.name), name + '/');
    else if (name !== 'manifest.json') seen.add(name);
  }
}
await inspect(directory);
assert.deepEqual([...seen].sort(), manifest.files.map((entry) => entry.path).sort());
for (const file of manifest.files) {
  assert.ok(!file.path.startsWith('/') && !file.path.split('/').includes('..'));
  const path = join(directory, file.path);
  const bytes = await readFile(path);
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
  if (process.platform !== 'win32') assert.equal((await lstat(path)).mode & 0o777, file.mode, file.path);
}
const node = join(directory, manifest.runtimeExecutable);
const version = spawnSync(node, ['--version'], { encoding: 'utf8' });
assert.equal(version.status, 0, version.stderr);
assert.equal(version.stdout.trim(), 'v' + manifest.nodeVersion);
const app = join(directory, 'app');
const capabilities = spawnSync(node, [join(app, 'dist/cli.js'), 'capabilities'], {
  cwd: directory,
  env: { ...process.env, PATH: '' },
  encoding: 'utf8',
});
assert.equal(capabilities.status, 0, capabilities.stderr);
assert.equal(JSON.parse(capabilities.stdout).capabilities.runtime.supported, true);
assert.equal(
  JSON.parse(await readFile(join(app, 'skills/bpmn-weave/version.json'), 'utf8')).toolVersion,
  manifest.version,
);
const lock = JSON.parse(await readFile(join(app, 'npm-shrinkwrap.json'), 'utf8'));
await assertInstalledDependencyLock(lock, app, app);
const require = createRequire(join(app, 'package.json'));
const fromAjv = createRequire(require.resolve('ajv/package.json'));
assert.equal(fromAjv('fast-uri/package.json').version, '3.1.7');
assert.ok(manifest.sizes.applicationArchiveBytes <= 20 * 1024 * 1024);
assert.ok(manifest.sizes.applicationBytes <= 150 * 1024 * 1024);
console.log(
  JSON.stringify({
    status: 'passed',
    bundle: directory,
    version: manifest.version,
    files: seen.size,
    sizes: manifest.sizes,
  }),
);
