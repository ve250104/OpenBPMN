import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, realpath, rm, readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { offlineSmoke } from './test-offline.mjs';
import { assertInstalledDependencyLock } from './package-dependencies.mjs';
import { unzipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
assert.equal(process.versions.node.split('.')[0], '24', 'Package qualification requires Node 24.x.');
const artifacts = join(root, '.artifacts');
await mkdir(artifacts, { recursive: true });
const temporary = await realpath(await mkdtemp(join(tmpdir(), 'bpmn-weave-package-')));
const prefix = join(temporary, 'isolated install');
await mkdir(prefix);

function execute(command, args, options = {}) {
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    return execute(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '& ' + [command, ...args].map(quote).join(' ') + '; exit $LASTEXITCODE',
      ],
      options,
    );
  }
  const result = spawnSync(command, args, {
    cwd: temporary,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}
async function size(path) {
  const info = await stat(path);
  return info.isDirectory()
    ? (await Promise.all((await readdir(path)).map((name) => size(join(path, name))))).reduce(
        (sum, bytes) => sum + bytes,
        0,
      )
    : info.size;
}
try {
  const packed = execute(npm, ['pack', '--json', '--ignore-scripts', '--pack-destination', artifacts], { cwd: root });
  assert.equal(packed.status, 0, packed.stderr);
  const pack = JSON.parse(packed.stdout)[0];
  assert.ok(
    pack.files.every((file) =>
      /^(?:dist\/|assets\/|schemas\/|skills\/bpmn-weave\/|examples\/|docs\/(?:installation|modeling|commands|support|troubleshooting)\.md$|package\.json$|npm-shrinkwrap\.json$|README\.md$|LICENSE$|THIRD_PARTY_NOTICES\.md$)/.test(
        file.path,
      ),
    ),
    'Tarball contains a file outside the runtime allowlist.',
  );
  for (const required of [
    'npm-shrinkwrap.json',
    'dist/cli.js',
    'dist/xml-worker.js',
    'dist/layout-worker.js',
    'schemas/request.schema.json',
    'assets/runtime/manifest.json',
    'assets/xsd/BPMN20.xsd',
    'examples/invoice-review.json',
    'docs/installation.md',
    'docs/modeling.md',
    'docs/commands.md',
    'docs/support.md',
    'docs/troubleshooting.md',
    'skills/bpmn-weave/SKILL.md',
    'skills/bpmn-weave/version.json',
    'THIRD_PARTY_NOTICES.md',
    'LICENSE',
  ]) {
    assert.ok(
      pack.files.some((file) => file.path === required),
      'Missing packed runtime file: ' + required,
    );
  }
  const archive = join(artifacts, pack.filename);
  const started = performance.now();
  const installation = execute(npm, [
    'install',
    '--prefix',
    prefix,
    '--ignore-scripts',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
    archive,
  ]);
  assert.equal(installation.status, 0, installation.stderr);
  const installedInMs = Math.round(performance.now() - started);
  const packageRoot = join(prefix, 'node_modules', '@ve250104', 'bpmn-weave');
  const shrinkwrap = await readFile(join(root, 'npm-shrinkwrap.json'));
  assert.deepEqual(
    await readFile(join(packageRoot, 'npm-shrinkwrap.json')),
    shrinkwrap,
    'The installed package must carry the exact qualified dependency lock.',
  );
  const dependencyLockQualification = await assertInstalledDependencyLock(JSON.parse(shrinkwrap), packageRoot, prefix);
  const treeResult = execute(npm, ['ls', '--prefix', prefix, '--all', '--omit=dev', '--json']);
  assert.equal(treeResult.status, 0, treeResult.stderr);
  // Retain only public dependency identities, not absolute installation paths.
  function dependencyTree(dependencies) {
    return Object.fromEntries(
      Object.entries(dependencies ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => [
          name,
          {
            version: value.version,
            ...(value.dependencies ? { dependencies: dependencyTree(value.dependencies) } : {}),
          },
        ]),
    );
  }
  const installedDependencyTree = dependencyTree(JSON.parse(treeResult.stdout).dependencies);
  for (const file of pack.files.filter((file) => /^(?:docs\/.*|README|THIRD_PARTY_NOTICES)\.md$/.test(file.path))) {
    const path = join(packageRoot, file.path);
    for (const match of (await readFile(path, 'utf8')).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const link = match[1].split('#')[0];
      if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
      const target = resolve(dirname(path), decodeURIComponent(link));
      assert.ok(target.startsWith(packageRoot + sep), 'User documentation must not depend on the source checkout.');
      await stat(target).catch(() => {
        throw new Error('Missing installed documentation link in ' + file.path + ': ' + link);
      });
    }
  }
  const cli = join(packageRoot, 'dist', 'cli.js');
  assert.equal(await realpath(cli), cli, 'Installed CLI must not link back to the checkout.');
  const binary = join(prefix, 'node_modules', '.bin', 'bpmn-weave' + (process.platform === 'win32' ? '.cmd' : ''));
  const version = execute(binary, ['--version']);
  assert.equal(version.status, 0, version.stdout + version.stderr);
  assert.equal(version.stdout.trim(), pack.version);
  const skillArchive = JSON.parse(await readFile(join(artifacts, 'skill-archive.json'), 'utf8'));
  assert.equal(skillArchive.version, pack.version);
  const skillZip = await readFile(join(artifacts, skillArchive.archive));
  assert.equal(createHash('sha256').update(skillZip).digest('hex'), skillArchive.sha256);
  const skillFiles = unzipSync(skillZip);
  const packedSkillNames = pack.files
    .filter((file) => file.path.startsWith('skills/bpmn-weave/'))
    .map((file) => file.path.slice('skills/'.length))
    .sort();
  assert.deepEqual(
    Object.keys(skillFiles).sort(),
    packedSkillNames,
    'ZIP and installed package must include the same complete portable skill.',
  );
  for (const name of packedSkillNames)
    assert.deepEqual(
      Buffer.from(skillFiles[name]),
      await readFile(join(packageRoot, 'skills', name)),
      'The ZIP differs from the actual installed package: ' + name,
    );
  const outputDirectory = join(temporary, 'process review – München');
  await mkdir(outputDirectory);
  const stem = join(outputDirectory, 'invoice');
  const fixture = join(packageRoot, 'examples', 'invoice-review.json');
  const browserArgs = process.env.BPMN_WEAVE_BROWSER_EXECUTABLE
    ? ['--browser-executable', process.env.BPMN_WEAVE_BROWSER_EXECUTABLE]
    : [];
  const command = (args, expected = 0) => {
    const result = execute(binary, args);
    assert.equal(result.status, expected, result.stdout + result.stderr);
    assert.equal(result.stderr, '', 'Default diagnostics must not leak dependency output.');
    return JSON.parse(result.stdout);
  };
  const capabilities = command(['capabilities', ...browserArgs]);
  assert.equal(capabilities.signal, 'capabilities_reported');
  const generated = command(['generate', '--input', fixture, '--output', stem, ...browserArgs]);
  assert.equal(generated.signal, 'clean_export_ready');
  const bytes = await Promise.all(['.bpmn', '.svg', '.quality.json'].map((suffix) => readFile(stem + suffix)));
  assert.match(bytes[0].toString(), /id="M_review"/);
  assert.match(bytes[1].toString(), /data-element-id="M_review"/);
  assert.equal(JSON.parse(bytes[2]).export.outcome, 'clean');
  assert.equal(command(['validate', '--input', stem + '.bpmn']).signal, 'validation_completed');
  const separatelyRendered = join(outputDirectory, 'separate.svg');
  assert.equal(
    command(['render', '--input', stem + '.bpmn', '--output', separatelyRendered, ...browserArgs]).signal,
    'render_completed',
  );
  assert.deepEqual(await readFile(separatelyRendered), bytes[1]);
  assert.equal(
    command(['generate', '--input', fixture, '--output', stem, ...browserArgs], 4).signal,
    'generation_failed',
  );
  command(
    [
      'generate',
      '--input',
      fixture,
      '--output',
      stem,
      '--replace',
      '--browser-executable',
      join(temporary, 'missing-browser'),
    ],
    1,
  );
  assert.deepEqual(
    await Promise.all(['.bpmn', '.svg', '.quality.json'].map((suffix) => readFile(stem + suffix))),
    bytes,
    'Failed replacement must preserve the installed bundle.',
  );
  command(['generate', '--input', fixture, '--output', stem, '--unrecognized'], 3);
  assert.deepEqual((await readdir(outputDirectory)).sort(), [
    'invoice.bpmn',
    'invoice.quality.json',
    'invoice.svg',
    'separate.svg',
  ]);
  const handoffPath = join(outputDirectory, 'invoice.openbpmn.json');
  command(['generate', '--input', fixture, '--output', stem, '--replace', '--handoff', handoffPath, ...browserArgs]);
  const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
  assert.equal(handoff.lifecycleStatus, undefined);
  handoff.lifecycleStatus = 'Team review';
  handoff.reviewNotes = ['Human-selected status and continuation note.'];
  handoff.request.model.processes[0].nodes.find((node) => node.key === 'review').name = 'Check invoice';
  const resumeInput = join(temporary, 'resume.openbpmn.json');
  await writeFile(resumeInput, JSON.stringify(handoff));
  command([
    'generate',
    '--input',
    resumeInput,
    '--output',
    stem,
    '--replace',
    '--handoff',
    handoffPath,
    ...browserArgs,
  ]);
  const resumed = JSON.parse(await readFile(handoffPath, 'utf8'));
  assert.equal(resumed.lifecycleStatus, 'Team review');
  assert.deepEqual(resumed.reviewNotes, handoff.reviewNotes);
  assert.match(await readFile(stem + '.bpmn', 'utf8'), /id="M_review" name="Check invoice"/);
  command(['validate', '--input', stem + '.bpmn']);
  assert.deepEqual((await readdir(outputDirectory)).sort(), [
    'invoice.bpmn',
    'invoice.openbpmn.json',
    'invoice.quality.json',
    'invoice.svg',
    'separate.svg',
  ]);
  const compressedBytes = (await stat(archive)).size;
  const installedBytes = await size(join(prefix, 'node_modules'));
  assert.ok(compressedBytes <= 20 * 1024 * 1024);
  assert.ok(installedBytes <= 150 * 1024 * 1024);
  const offline = await offlineSmoke(cli, fixture, capabilities.capabilities.runtime.browser.executable);
  const evidence = {
    kind: 'development-package-smoke',
    version: pack.version,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    archive: pack.filename,
    sha256: createHash('sha256')
      .update(await readFile(archive))
      .digest('hex'),
    compressedBytes,
    installedBytes,
    installedInMs,
    commandsExercised: ['generate', 'validate', 'render', 'capabilities'],
    installedBinaryShim: 'passed',
    installedDocumentationLinks: 'passed',
    skillArchiveEquality: 'passed',
    refinementAndHandoff: 'passed',
    skillArchiveSha256: skillArchive.sha256,
    shrinkwrapSha256: createHash('sha256').update(shrinkwrap).digest('hex'),
    dependencyLockQualification,
    installedDependencyTreeSha256: createHash('sha256').update(JSON.stringify(installedDependencyTree)).digest('hex'),
    installedDependencyTree,
    networkIsolation: offline,
    fullReleaseQualified: false,
  };
  await writeFile(join(artifacts, 'package-smoke.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  assert.equal(dirname(temporary), await realpath(tmpdir()), 'Cleanup must target only the temporary test directory.');
  await rm(temporary, { recursive: true, force: true });
}
