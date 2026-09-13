import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, sep } from 'node:path';

// Inspect installed manifests without loading dependency code or depending on
// package.json exports. npm may hoist a locked dependency above the CLI package.
export async function assertInstalledDependencyLock(lock, packageRoot, installRoot) {
  const boundary = (await realpath(installRoot)) + sep;
  const visited = new Set();
  function lockedDependency(owner, name) {
    while (true) {
      const key = `${owner ? owner + '/' : ''}node_modules/${name}`;
      if (lock.packages[key]) return key;
      if (!owner) return undefined;
      const parent = owner.lastIndexOf('/node_modules/');
      owner = parent < 0 ? '' : owner.slice(0, parent);
    }
  }
  async function installedDependency(owner, name) {
    for (const directory of createRequire(join(owner, 'package.json')).resolve.paths(name) ?? []) {
      if (!directory.startsWith(boundary)) continue;
      const candidate = join(directory, name);
      try {
        await readFile(join(candidate, 'package.json'));
        const resolved = await realpath(candidate);
        assert.ok(
          resolved.startsWith(boundary),
          `Installed dependency ${name} must remain inside the isolated install.`,
        );
        return resolved;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    return undefined;
  }
  async function visit(key, directory) {
    const pair = `${key}\0${directory}`;
    if (visited.has(pair)) return;
    visited.add(pair);
    const expected = lock.packages[key];
    const actual = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    assert.equal(
      actual.version,
      expected.version,
      `Installed version differs from the lock for ${key || actual.name}.`,
    );
    for (const name of Object.keys({
      ...expected.dependencies,
      ...expected.optionalDependencies,
      ...expected.peerDependencies,
    })) {
      const locked = lockedDependency(key, name);
      const installed = await installedDependency(directory, name);
      const optional =
        Object.hasOwn(expected.optionalDependencies ?? {}, name) ||
        (!Object.hasOwn(expected.dependencies ?? {}, name) && expected.peerDependenciesMeta?.[name]?.optional === true);
      if (!installed && optional) continue;
      assert.ok(locked !== undefined, `Runtime dependency ${name} must be recorded in the lock.`);
      assert.ok(installed, `Required runtime dependency ${name} is missing from the isolated install.`);
      await visit(locked, installed);
    }
  }
  await visit('', await realpath(packageRoot));
  return { status: 'passed', checkedPackagePlacements: visited.size };
}
