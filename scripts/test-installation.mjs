import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmod, mkdtemp, realpath, readFile, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { offlineSmoke } from './test-offline.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const candidate = resolve(
  process.argv[2] ?? join(root, '.artifacts', `openbpmn-${version}-${process.platform}-${process.arch}`),
);
const home = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-install-')));
const extracted = join(home, 'extracted');
await mkdir(extracted);
const unpacked = spawnSync('tar', ['-xf', candidate + '.zip', '-C', extracted], { encoding: 'utf8' });
assert.equal(unpacked.status, 0, unpacked.stdout + unpacked.stderr);
const bundle = join(extracted, basename(candidate));
const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
const runtime = join(bundle, manifest.runtimeExecutable);
const manager = join(bundle, 'app', 'dist', 'manage.js');
const prefix = join(home, 'OpenBPMN – München');
const output = join(home, 'first example');
const browser = process.env.OPENBPMN_BROWSER_EXECUTABLE;
const browserArgs = browser ? ['--browser-executable', browser] : [];
const env = { ...process.env, HOME: home, USERPROFILE: home };
function bootstrap(args) {
  const command =
    process.platform === 'win32'
      ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : join(bundle, 'setup.sh');
  const bootstrapArgs =
    process.platform === 'win32'
      ? ['-NoProfile', '-NonInteractive', '-File', join(bundle, 'setup.ps1'), ...args]
      : args;
  return spawnSync(command, bootstrapArgs, {
    cwd: home,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      ...env,
      PATH: process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32') : '',
      NODE_OPTIONS: '--require=/definitely-missing-openbpmn-qualification-hook',
      NODE_PATH: '/definitely-missing-node-path',
    },
  });
}
function run(args, expected = 0, entry = manager, node = runtime) {
  const result = spawnSync(node, [entry, ...args, '--prefix', prefix, '--json', '--non-interactive'], {
    cwd: home,
    env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stdout + result.stderr);
  assert.equal(result.stderr, '', 'Management returns one result without leaking subprocess diagnostics.');
  return JSON.parse(result.stdout);
}
try {
  const help = bootstrap(['--help']);
  assert.equal(help.status, 0, help.stdout + help.stderr);
  assert.match(help.stdout, /installation management/);
  await writeFile(join(home, '.profile'), 'export KEEP_MY_SETTING=yes\n');
  await mkdir(output);
  const setupStarted = performance.now();
  const first = bootstrap([
    '--host',
    'codex',
    '--output',
    output,
    '--prefix',
    prefix,
    '--json',
    '--non-interactive',
    ...browserArgs,
  ]);
  const setupElapsedMs = Math.round(performance.now() - setupStarted);
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const result = JSON.parse(first.stdout);
  assert.equal(result.status, 'ready');
  assert.equal(result.checks.find((check) => check.name === 'host-session').status, 'not_verified');
  const xml = await readFile(join(output, 'example.bpmn'), 'utf8');
  assert.match(xml, /id="M_review"/);
  assert.match(await readFile(join(output, 'example.svg'), 'utf8'), /data-element-id="M_review"/);
  assert.equal(JSON.parse(await readFile(join(output, 'example.quality.json'), 'utf8')).export.outcome, 'clean');
  assert.equal(
    JSON.parse(await readFile(join(home, '.agents', 'skills', 'openbpmn', 'version.json'), 'utf8')).toolVersion,
    version,
  );
  assert.match(await readFile(join(home, '.profile'), 'utf8'), /export KEEP_MY_SETTING=yes/);
  const state = JSON.parse(await readFile(join(prefix, 'installation.json'), 'utf8'));
  const installedManager = join(prefix, state.release, 'app/dist/manage.js');
  const installedRuntime = join(prefix, state.release, manifest.runtimeExecutable);
  let shell;
  if (process.platform === 'win32') {
    shell = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$env:PATH=[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User'); openbpmn capabilities",
      ],
      { encoding: 'utf8', env: { ...env, NODE_OPTIONS: '--require=/definitely-missing-openbpmn-qualification-hook' } },
    );
  } else {
    const fakeBin = join(home, 'another-node');
    await mkdir(fakeBin);
    await writeFile(join(fakeBin, 'node'), '#!/bin/sh\nexit 97\n');
    await chmod(join(fakeBin, 'node'), 0o755);
    shell = spawnSync(process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash', ['-lc', 'openbpmn capabilities'], {
      encoding: 'utf8',
      env: {
        ...env,
        ZDOTDIR: home,
        PATH: fakeBin,
        NODE_OPTIONS: '--require=/definitely-missing-openbpmn-qualification-hook',
      },
    });
  }
  assert.equal(shell.status, 0, shell.stdout + shell.stderr);
  assert.equal(JSON.parse(shell.stdout).capabilities.runtime.nodeVersion, manifest.nodeVersion);
  env.PATH = join(prefix, 'bin') + delimiter + env.PATH;
  if (process.platform !== 'win32') {
    const launcher = join(prefix, 'bin', 'openbpmn');
    await chmod(launcher, 0o644);
    try {
      const brokenLauncher = run(['doctor', ...browserArgs], 1, installedManager, installedRuntime);
      assert.equal(brokenLauncher.status, 'incomplete');
      assert.equal(brokenLauncher.checks.find((check) => check.name === 'installation').status, 'fail');
      assert.match(brokenLauncher.checks.find((check) => check.name === 'installation').message, /executable/);
    } finally {
      await chmod(launcher, 0o755);
    }
  }
  const doctor = run(['doctor', ...browserArgs], 0, installedManager, installedRuntime);
  assert.equal(doctor.status, 'ready');
  assert.equal(doctor.checks.find((check) => check.name === 'host-session').status, 'not_verified');
  const profileBefore = await readFile(join(home, '.profile'));
  const stateBefore = await readFile(join(prefix, 'installation.json'));
  const repeated = run(['setup', '--bundle', bundle, '--host', 'codex', '--output', output, ...browserArgs]);
  assert.equal(repeated.status, 'ready');
  assert.deepEqual(await readFile(join(prefix, 'installation.json')), stateBefore);
  assert.deepEqual(await readFile(join(home, '.profile')), profileBefore);
  assert.equal(await readFile(join(output, 'example.bpmn'), 'utf8'), xml);
  const capabilities = JSON.parse(shell.stdout).capabilities;
  const offline = await offlineSmoke(
    join(prefix, state.release, 'app/dist/cli.js'),
    join(prefix, state.release, 'app/examples/invoice-review.json'),
    browser ?? capabilities.runtime.browser.executable,
    { manager: installedManager, prefix, runtime: installedRuntime },
  );
  const evidence = {
    kind: 'development-installation-smoke',
    date: new Date().toISOString(),
    version,
    platform: process.platform,
    architecture: process.arch,
    node: manifest.nodeVersion,
    sourceCommit: manifest.sourceCommit,
    sourceDirty: manifest.sourceDirty,
    archiveSha256: createHash('sha256')
      .update(await readFile(candidate + '.zip'))
      .digest('hex'),
    manifestSha256: createHash('sha256')
      .update(await readFile(join(bundle, 'manifest.json')))
      .digest('hex'),
    extractedArchive: true,
    bootstrapWithoutSystemNode: true,
    freshShellAndPrivateRuntime: true,
    matchedSkill: true,
    realExample: true,
    setupElapsedMs,
    doctor: true,
    idempotentSetup: true,
    networkIsolation: offline,
    actualHostSessions: 'not_run',
    nativeWindows11: 'not_run',
    fullReleaseQualified: false,
  };
  await writeFile(join(root, '.artifacts', 'installation-smoke.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (
    await stat(join(prefix, 'installation.json')).then(
      () => true,
      () => false,
    )
  ) {
    const cleanup = run(['uninstall']);
    assert.equal(cleanup.status, 'removed');
    assert.equal(cleanup.retained, undefined, 'Qualification must clean its owned installation and integration.');
  }
  await rm(home, { recursive: true, force: true });
}
