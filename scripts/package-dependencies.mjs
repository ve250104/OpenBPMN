import assert from 'node:assert/strict';
import { readFile, realpath, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';

// Inspect installed manifests without loading dependency code or depending on
// package.json exports. npm may hoist a locked dependency above the CLI package.
export async function assertInstalledDependencyLock(lock, packageRoot, installRoot) {
  packageRoot = await realpath(packageRoot);
  const boundary = (await realpath(installRoot)) + sep;
  const visited = new Set();
  const dependencies = new Map();
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
    if (key)
      dependencies.set(directory, {
        name: actual.name ?? key.split('node_modules/').at(-1),
        version: actual.version,
        path: relative(packageRoot, directory).split(sep).join('/'),
        ...(expected.integrity ? { integrity: expected.integrity } : {}),
      });
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
  return {
    status: 'passed',
    checkedPackagePlacements: visited.size,
    dependencies: [...dependencies.values()].sort((a, b) => (a.path < b.path ? -1 : 1)),
  };
}

/** The primary payload must be complete inside app/, without unqualified development packages. */
export async function assertBundledDependencies(lock, packageRoot) {
  const result = await assertInstalledDependencyLock(lock, packageRoot, packageRoot);
  const qualified = new Set(result.dependencies.map((dependency) => dependency.path));
  async function inspect(owner, prefix = '') {
    let entries;
    try {
      entries = await readdir(join(owner, 'node_modules'), { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      assert.ok(!entry.isSymbolicLink(), 'Bundled packages must not contain module symlinks.');
      // npm creates executable shims after installation; these are not package placements.
      // The platform archive separately inventories every file and forbids all symlinks.
      if (entry.name === '.bin' && entry.isDirectory()) continue;
      assert.ok(
        entry.isDirectory() && !entry.name.startsWith('.'),
        'Unexpected entry in bundled node_modules: ' + entry.name,
      );
      const paths = entry.name.startsWith('@')
        ? (await readdir(join(owner, 'node_modules', entry.name))).map((name) => entry.name + '/' + name)
        : [entry.name];
      for (const name of paths) {
        const path = prefix + 'node_modules/' + name;
        assert.ok(qualified.has(path), 'Unqualified package in application payload: ' + path);
        assert.ok(!lock.packages[path]?.dev, 'Development dependency in application payload: ' + path);
        await inspect(join(owner, 'node_modules', name), path + '/');
      }
    }
  }
  await inspect(packageRoot);
  return result;
}
