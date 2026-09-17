import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { assertBundledDependencies } from '../scripts/package-dependencies.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
test('the distributed application installs offline with an empty cache and its exact production dependency tree', async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), 'bpmn-weave-bundled-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const invoke = (args, cwd = temporary) => {
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const result =
      process.platform === 'win32'
        ? spawnSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-Command',
              '& ' + [npm, ...args].map(quote).join(' ') + '; exit $LASTEXITCODE',
            ],
            { cwd, encoding: 'utf8', timeout: 60_000 },
          )
        : spawnSync(npm, args, { cwd, encoding: 'utf8', timeout: 60_000 });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    return result.stdout;
  };
  const [packed] = JSON.parse(invoke(['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], root));
  const prefix = join(temporary, 'installation');
  invoke([
    'install',
    '--prefix',
    prefix,
    '--offline',
    '--cache',
    join(temporary, 'empty-cache'),
    '--ignore-scripts',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    join(temporary, packed.filename),
  ]);
  const packageRoot = join(prefix, 'node_modules/@ve250104/bpmn-weave');
  const lock = JSON.parse(await readFile(join(root, 'npm-shrinkwrap.json'), 'utf8'));
  assert.equal((await assertBundledDependencies(lock, packageRoot)).status, 'passed');
  const requireFromApp = createRequire(join(packageRoot, 'package.json'));
  const requireFromAjv = createRequire(requireFromApp.resolve('ajv/package.json'));
  assert.equal(requireFromAjv('fast-uri/package.json').version, '3.1.7', 'The observed fast-uri drift must not recur.');
  assert.ok(packed.size <= 20 * 1024 * 1024, 'The bundled application exceeds its compressed size budget.');
});
