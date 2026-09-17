import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { watch } from 'node:fs';
import { appendFile, cp, mkdir, mkdtemp, readFile, realpath, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const bundle = resolve(
  process.argv[2] ?? join(root, '.artifacts', `bpmn-weave-${version}-${process.platform}-${process.arch}`),
);
const manifest = JSON.parse(await readFile(join(bundle, 'manifest.json'), 'utf8'));
const runtime = join(bundle, manifest.runtimeExecutable);
const manager = join(bundle, 'app/dist/manage.js');
const home = await realpath(await mkdtemp(join(tmpdir(), 'bpmn-weave-lifecycle-')));
const prefix = join(home, 'Managed CLI – München');
const browser = join(home, 'missing-browser');
const env = { ...process.env, HOME: home, USERPROFILE: home, PATH: join(prefix, 'bin') + delimiter + process.env.PATH };
const common = ['--prefix', prefix, '--json', '--non-interactive'];
const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const state = () => json(join(prefix, 'installation.json'));
const exists = async (path) =>
  stat(path).then(
    () => true,
    () => false,
  );
const syntheticVersion = version.split(/[+-]/)[0] + '-qualification.fixture';
const syntheticBundle = join(home, 'synthetic version fixture');
const syntheticFiles = ['app/package.json', 'app/skills/bpmn-weave/version.json'];

async function inventorySyntheticFixture(fixtureManifest, changedFiles = syntheticFiles) {
  for (const path of changedFiles) {
    const content = await readFile(join(syntheticBundle, path));
    const file = fixtureManifest.files.find((entry) => entry.path === path);
    assert.ok(file, 'The real candidate must inventory each controlled fixture edit.');
    file.sha256 = createHash('sha256').update(content).digest('hex');
    file.bytes = content.length;
  }
  const applicationArchive = join(home, 'synthetic-application.tgz');
  const packed = spawnSync('tar', ['-czf', applicationArchive, '-C', syntheticBundle, 'app'], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  fixtureManifest.sizes.applicationArchiveBytes = (await stat(applicationArchive)).size;
  fixtureManifest.sizes.applicationBytes = fixtureManifest.files
    .filter((file) => file.path.startsWith('app/'))
    .reduce((sum, file) => sum + file.bytes, 0);
  const payloadBytes = fixtureManifest.files.reduce((sum, file) => sum + file.bytes, 0);
  let text;
  do {
    text = JSON.stringify(fixtureManifest, null, 2) + '\n';
    fixtureManifest.sizes.totalBytes = payloadBytes + Buffer.byteLength(text);
  } while (Buffer.byteLength(JSON.stringify(fixtureManifest, null, 2) + '\n') !== Buffer.byteLength(text));
  await writeFile(join(syntheticBundle, 'manifest.json'), JSON.stringify(fixtureManifest, null, 2) + '\n');
}

async function syntheticVersionFixture() {
  assert.notEqual(syntheticVersion, version);
  await cp(bundle, syntheticBundle, { recursive: true });
  const fixtureManifest = structuredClone(manifest);
  fixtureManifest.version = syntheticVersion;
  fixtureManifest.qualificationFixture = {
    kind: 'synthetic-version-migration',
    published: false,
    sourceVersion: version,
    modifiedPaths: syntheticFiles,
  };
  const pkg = await json(join(syntheticBundle, syntheticFiles[0]));
  const skill = await json(join(syntheticBundle, syntheticFiles[1]));
  pkg.version = syntheticVersion;
  skill.toolVersion = syntheticVersion;
  await writeFile(join(syntheticBundle, syntheticFiles[0]), JSON.stringify(pkg, null, 2) + '\n');
  await writeFile(join(syntheticBundle, syntheticFiles[1]), JSON.stringify(skill, null, 2) + '\n');
  await inventorySyntheticFixture(fixtureManifest);
  return fixtureManifest;
}

let exitedManagerPid;
function run(args, expected = 0) {
  const result = spawnSync(runtime, [manager, ...args, ...common], {
    cwd: home,
    env,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  exitedManagerPid = result.pid;
  return JSON.parse(result.stdout);
}
async function runnable(expected) {
  const current = await state();
  assert.equal(current.release, expected.release);
  const result = spawnSync(
    join(prefix, current.release, manifest.runtimeExecutable),
    [join(prefix, current.release, 'app/dist/cli.js'), 'capabilities'],
    { cwd: home, env, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).capabilities.runtime.supported, true);
  const cliVersion = spawnSync(
    join(prefix, current.release, manifest.runtimeExecutable),
    [join(prefix, current.release, 'app/dist/cli.js'), '--version'],
    { cwd: home, env, encoding: 'utf8' },
  );
  assert.equal(cliVersion.status, 0, cliVersion.stdout + cliVersion.stderr);
  assert.equal(cliVersion.stdout.trim(), expected.version);
  assert.equal(current.version, expected.version);
  assert.equal((await json(join(current.skill.path, 'version.json'))).toolVersion, current.version);
}

async function interruptUpdate(signal, boundary) {
  let stdout = '';
  let stderr = '';
  let sent = false;
  const child = spawn(runtime, [manager, 'update', '--bundle', bundle, '--browser-executable', browser, ...common], {
    cwd: home,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (part) => {
    stdout += part;
  });
  child.stderr.on('data', (part) => {
    stderr += part;
  });
  const target = boundary === 'replacement' ? dirname((await state()).skill.path) : prefix;
  const watcher = watch(target, async (_event, filename) => {
    if (!sent && (boundary === 'replacement' ? String(filename).includes('.previous-') : filename === 'pending.json')) {
      if (boundary === 'journal') {
        // A create notification may arrive before the journal write finishes.
        try {
          await json(join(prefix, 'pending.json'));
        } catch {
          return;
        }
      }
      if (sent) return;
      sent = true;
      child.kill(signal);
    }
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 120_000);
  const result = await new Promise((resolveExit, reject) => {
    child.on('error', reject);
    child.on('close', (code, endedBy) => resolveExit({ code, endedBy }));
  });
  clearTimeout(timer);
  watcher.close();
  assert.equal(sent, true, 'The observed replacement or journal boundary must trigger interruption.');
  assert.equal(stderr, '');
  return { ...result, result: stdout ? JSON.parse(stdout) : undefined };
}

async function qualifyHostPlacement(host, projectScope = false) {
  const selectedHome = await mkdtemp(join(home, host + '-placement-'));
  const selectedPrefix = join(selectedHome, 'managed-installation');
  const project = join(selectedHome, 'project');
  if (projectScope) await mkdir(project);
  const registration = projectScope
    ? join(project, '.github/skills/bpmn-weave')
    : join(selectedHome, host === 'claude' ? '.claude/skills/bpmn-weave' : '.copilot/skills/bpmn-weave');
  const selectedEnv = { ...process.env, HOME: selectedHome, USERPROFILE: selectedHome };
  const invoke = (args, expected) => {
    const result = spawnSync(runtime, [manager, ...args, '--prefix', selectedPrefix, '--json', '--non-interactive'], {
      cwd: selectedHome,
      env: selectedEnv,
      encoding: 'utf8',
      timeout: 120_000,
    });
    assert.equal(result.status, expected, result.stdout + result.stderr);
    assert.equal(result.stderr, '');
    return JSON.parse(result.stdout);
  };
  const installed = invoke(
    [
      'setup',
      '--bundle',
      bundle,
      '--host',
      host,
      '--browser-executable',
      browser,
      ...(projectScope ? ['--project', project] : []),
    ],
    1,
  );
  assert.equal(installed.status, 'incomplete');
  assert.equal(installed.checks.find((check) => check.name === 'host-session').status, 'not_verified');
  assert.equal((await json(join(selectedPrefix, 'installation.json'))).skill.path, registration);
  assert.equal((await json(join(registration, 'version.json'))).toolVersion, version);
  assert.equal(invoke(['uninstall'], 0).status, 'removed');
  assert.equal(await exists(registration), false);
  assert.equal(await exists(selectedPrefix), false);
}

try {
  await writeFile(join(home, '.profile'), 'export KEEP_ME=yes\n');
  const unrelated = join(home, '.agents/skills/unrelated');
  await mkdir(unrelated, { recursive: true });
  await writeFile(join(unrelated, 'keep.txt'), 'unrelated skill');
  await writeFile(join(home, 'user-model.bpmn'), '<user-process/>');
  const setup = run(['setup', '--bundle', bundle, '--host', 'codex', '--browser-executable', browser], 1);
  assert.equal(setup.status, 'incomplete');
  const initial = await state();
  await runnable(initial);

  // This is a controlled fixture version, not a claim about a published release.
  // Its production JS, dependencies, and official private Node remain unchanged.
  const fixtureManifest = await syntheticVersionFixture();
  const updated = run(['update', '--bundle', syntheticBundle, '--browser-executable', browser], 1);
  assert.equal(updated.status, 'incomplete');
  const active = await state();
  assert.notEqual(active.release, initial.release);
  assert.notEqual(active.version, initial.version);
  assert.equal(active.version, syntheticVersion);
  await runnable(active);

  const beforeMismatch = await readFile(join(prefix, 'installation.json'), 'utf8');
  const mismatchedSkill = await json(join(syntheticBundle, syntheticFiles[1]));
  mismatchedSkill.toolVersion = version;
  await writeFile(join(syntheticBundle, syntheticFiles[1]), JSON.stringify(mismatchedSkill, null, 2) + '\n');
  await inventorySyntheticFixture(fixtureManifest);
  const mismatch = run(['update', '--bundle', syntheticBundle], 1);
  assert.equal(mismatch.status, 'failed');
  assert.match(mismatch.message, /versions do not match/);
  assert.equal(await readFile(join(prefix, 'installation.json'), 'utf8'), beforeMismatch);
  await runnable(active);

  // All payload hashes and declared versions agree, but the real CLI process
  // cannot launch. Such an update must leave the working pair active.
  mismatchedSkill.toolVersion = syntheticVersion;
  await writeFile(join(syntheticBundle, syntheticFiles[1]), JSON.stringify(mismatchedSkill, null, 2) + '\n');
  const brokenCli = 'app/dist/cli.js';
  await writeFile(
    join(syntheticBundle, brokenCli),
    "#!/usr/bin/env node\nthrow new Error('Deliberately unlaunchable qualification CLI.');\n",
  );
  fixtureManifest.qualificationFixture.kind = 'synthetic-broken-cli';
  fixtureManifest.qualificationFixture.modifiedPaths = [...syntheticFiles, brokenCli];
  await inventorySyntheticFixture(fixtureManifest, [...syntheticFiles, brokenCli]);
  const brokenUpdate = run(['update', '--bundle', syntheticBundle, '--browser-executable', browser], 1);
  assert.equal(brokenUpdate.status, 'failed');
  assert.equal((await state()).release, active.release, 'A failed executable candidate must not become active.');
  assert.equal(await exists(join(prefix, 'pending.json')), false);
  await runnable(active);

  const browserProbe = spawnSync(
    runtime,
    [
      join(prefix, active.release, 'app/dist/cli.js'),
      'capabilities',
      ...(process.env.BPMN_WEAVE_BROWSER_EXECUTABLE
        ? ['--browser-executable', process.env.BPMN_WEAVE_BROWSER_EXECUTABLE]
        : []),
    ],
    { cwd: home, env, encoding: 'utf8' },
  );
  assert.equal(browserProbe.status, 0, browserProbe.stdout + browserProbe.stderr);
  const discoveredBrowser = JSON.parse(browserProbe.stdout).capabilities.runtime.browser;
  if (discoveredBrowser.available) {
    // Capabilities use the real CLI and actual discovered browser. Only the
    // candidate's generate entry is deliberately failed, before browser launch.
    const originalCli = await readFile(join(bundle, brokenCli), 'utf8');
    const rejectGenerate =
      "if (process.argv[2] === 'generate') { process.stdout.write(JSON.stringify({ report: { findings: [{ message: 'Deliberate qualification generation failure.' }] } }) + '\\n'); process.exit(4); }\n";
    await writeFile(
      join(syntheticBundle, brokenCli),
      '#!/usr/bin/env node\n' + rejectGenerate + originalCli.replace(/^#![^\n]*\n/, ''),
    );
    fixtureManifest.qualificationFixture.kind = 'synthetic-generation-failure';
    await inventorySyntheticFixture(fixtureManifest, [...syntheticFiles, brokenCli]);
    const failedGeneration = run(
      ['update', '--bundle', syntheticBundle, '--browser-executable', discoveredBrowser.executable],
      1,
    );
    assert.equal(failedGeneration.status, 'failed');
    assert.equal(
      (await state()).release,
      active.release,
      'A candidate failing an available generation check must not become active.',
    );
    assert.equal(await exists(join(prefix, 'pending.json')), false);
    await runnable(active);
  } else {
    console.log('Generation-failure rollback with a discovered browser was not verified: no browser is available.');
  }

  const skill = join(active.skill.path, 'SKILL.md');
  const originalSkill = await readFile(skill, 'utf8');
  await appendFile(skill, '\nUser customization.\n');
  const conflict = run(['update', '--bundle', bundle], 1);
  assert.equal(conflict.status, 'failed');
  assert.equal((await state()).release, active.release);
  assert.match(await readFile(skill, 'utf8'), /User customization/);
  await writeFile(skill, originalSkill);

  if (process.platform !== 'win32') {
    const handled = await interruptUpdate('SIGINT', 'replacement');
    assert.equal(handled.code, 1);
    assert.match(handled.result.message, /previous installation was restored/);
    assert.equal(await exists(join(prefix, 'pending.json')), false);
    await runnable(active);
    const abrupt = await interruptUpdate('SIGKILL', 'journal');
    assert.equal(abrupt.endedBy, 'SIGKILL');
    assert.equal(await exists(join(prefix, 'pending.json')), true);
    assert.equal(run(['doctor'], 1).status, 'failed');
    const recovered = run(['update', '--recover']);
    assert.equal(recovered.status, 'ready');
    await runnable(active);
  }

  await appendFile(skill, '\nPreserve this customization.\n');
  const unknownEmpty = join(active.skill.path, 'my-empty-folder');
  await mkdir(unknownEmpty);
  const removed = run(['uninstall']);
  assert.equal(removed.status, 'removed');
  assert.ok(removed.retained.includes(skill));
  const humanUninstall = spawnSync(runtime, [manager, 'uninstall', '--prefix', prefix, '--non-interactive'], {
    cwd: home,
    env,
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(humanUninstall.status, 0, humanUninstall.stdout + humanUninstall.stderr);
  assert.ok(
    humanUninstall.stdout.includes(skill),
    'Human uninstall output must identify the retained modified skill file.',
  );
  assert.match(await readFile(skill, 'utf8'), /Preserve this customization/);
  assert.equal(await exists(unknownEmpty), true);
  assert.equal(await readFile(join(home, 'user-model.bpmn'), 'utf8'), '<user-process/>');
  assert.equal(await readFile(join(unrelated, 'keep.txt'), 'utf8'), 'unrelated skill');
  assert.equal(await readFile(join(home, '.profile'), 'utf8'), 'export KEEP_ME=yes\n');
  for (const launcher of active.launchers) assert.equal(await exists(launcher.path), false);
  // Controlled interruption fixture: cleanup removed installation.json, but
  // the final journal unlink did not happen. Ownership data comes from this
  // actual distributed installation, not a fabricated release.
  const retainedState = await state();
  await rm(skill);
  await rmdir(unknownEmpty);
  await writeFile(
    join(prefix, 'pending.json'),
    JSON.stringify({ schemaVersion: 1, operation: 'uninstall', pid: exitedManagerPid, state: retainedState }),
  );
  await rm(join(prefix, 'installation.json'));
  const cleanupRecovery = run(['uninstall', '--recover']);
  assert.equal(cleanupRecovery.status, 'removed');
  assert.ok(
    !(await exists(prefix)) || cleanupRecovery.retained?.length,
    'Abrupt partial writes must be reported if safely retained.',
  );
  // The initial setup journal can exist before any manifest or target writes.
  // Reuse the recorded real setup plan to qualify this interruption boundary.
  await rm(prefix, { recursive: true, force: true });
  await mkdir(prefix);
  const abandonedPid = exitedManagerPid;
  const pendingSetup = { schemaVersion: 1, operation: 'setup', pid: process.pid, next: initial };
  await writeFile(join(prefix, 'pending.json'), JSON.stringify(pendingSetup));
  assert.match(run(['setup', '--recover'], 1).message, /still running/);
  pendingSetup.pid = abandonedPid;
  await writeFile(join(prefix, 'pending.json'), JSON.stringify(pendingSetup));
  assert.equal(run(['setup', '--recover']).status, 'removed');
  assert.equal(await exists(prefix), false);
  await qualifyHostPlacement('claude');
  await qualifyHostPlacement('copilot');
  await qualifyHostPlacement('copilot', true);
  console.log(
    'Distributed lifecycle: synthetic version-pair migration, mismatched-pair and conflict refusal, interruption recovery, preservation uninstall, and Claude/Copilot registration placement passed. Actual host sessions remain unverified.',
  );
} finally {
  await rm(home, { recursive: true, force: true });
}
