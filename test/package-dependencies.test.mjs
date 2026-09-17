import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { assertInstalledDependencyLock } from '../scripts/package-dependencies.mjs';

async function fixture(t, manifests) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-dependency-lock-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, manifest] of Object.entries(manifests)) {
    await mkdir(join(root, path), { recursive: true });
    await writeFile(join(root, path, 'package.json'), JSON.stringify(manifest));
  }
  return root;
}

test('package qualification rejects a runtime version that satisfies its range but differs from the lock', async (t) => {
  const root = await fixture(t, {
    'node_modules/app': { name: 'app', version: '1.0.0' },
    'node_modules/dependency': { name: 'dependency', version: '1.1.0' },
  });
  const lock = {
    packages: {
      '': { name: 'app', version: '1.0.0', dependencies: { dependency: '^1.0.0' } },
      'node_modules/dependency': { version: '1.0.0' },
    },
  };
  await assert.rejects(
    assertInstalledDependencyLock(lock, join(root, 'node_modules/app'), root),
    /version.*dependency/,
  );
});

test('package qualification checks installed optional dependencies but permits absent platform dependencies', async (t) => {
  const root = await fixture(t, {
    'node_modules/app': { name: 'app', version: '1.0.0' },
    'node_modules/native-addon': { name: 'native-addon', version: '2.0.0' },
  });
  const lock = {
    packages: {
      '': {
        name: 'app',
        version: '1.0.0',
        optionalDependencies: { 'native-addon': '^1.0.0', 'other-platform': '1.0.0' },
      },
      'node_modules/native-addon': { version: '1.0.0', optional: true },
      'node_modules/other-platform': { version: '1.0.0', optional: true, os: ['win32'] },
    },
  };
  await assert.rejects(
    assertInstalledDependencyLock(lock, join(root, 'node_modules/app'), root),
    /version.*native-addon/,
  );
  await writeFile(
    join(root, 'node_modules/native-addon/package.json'),
    JSON.stringify({ name: 'native-addon', version: '1.0.0' }),
  );
  assert.equal((await assertInstalledDependencyLock(lock, join(root, 'node_modules/app'), root)).status, 'passed');
});

test('package qualification checks required peers while omitting unavailable optional peers', async (t) => {
  const root = await fixture(t, { 'node_modules/app': { name: 'app', version: '1.0.0' } });
  const lock = {
    packages: {
      '': {
        name: 'app',
        version: '1.0.0',
        peerDependencies: { host: '^1.0.0', acceleration: '*' },
        peerDependenciesMeta: { acceleration: { optional: true } },
      },
      'node_modules/host': { version: '1.0.0' },
    },
  };
  await assert.rejects(
    assertInstalledDependencyLock(lock, join(root, 'node_modules/app'), root),
    /Required.*host.*missing/,
  );
  await mkdir(join(root, 'node_modules/host'));
  await writeFile(join(root, 'node_modules/host/package.json'), JSON.stringify({ name: 'host', version: '1.0.0' }));
  assert.equal((await assertInstalledDependencyLock(lock, join(root, 'node_modules/app'), root)).status, 'passed');
});

test('package qualification follows hoisted and nested dependency versions instead of accepting a global version set', async (t) => {
  const root = await fixture(t, {
    'node_modules/@scope/app': { name: '@scope/app', version: '1.0.0' },
    'node_modules/left': { name: 'left', version: '1.0.0' },
    'node_modules/right': { name: 'right', version: '1.0.0' },
    'node_modules/shared': { name: 'shared', version: '1.0.0' },
    'node_modules/right/node_modules/shared': { name: 'shared', version: '2.0.0' },
  });
  const lock = {
    packages: {
      '': { name: '@scope/app', version: '1.0.0', dependencies: { left: '1.0.0', right: '1.0.0' } },
      'node_modules/left': { version: '1.0.0', dependencies: { shared: '^1.0.0' } },
      'node_modules/right': { version: '1.0.0', dependencies: { shared: '^2.0.0' } },
      'node_modules/shared': { version: '1.0.0' },
      'node_modules/right/node_modules/shared': { version: '2.0.0' },
    },
  };
  const packageRoot = join(root, 'node_modules/@scope/app');
  assert.equal((await assertInstalledDependencyLock(lock, packageRoot, root)).checkedPackagePlacements, 5);
  await writeFile(
    join(root, 'node_modules/right/node_modules/shared/package.json'),
    JSON.stringify({ name: 'shared', version: '1.0.0' }),
  );
  await assert.rejects(assertInstalledDependencyLock(lock, packageRoot, root), /version.*right\/node_modules\/shared/);
});
