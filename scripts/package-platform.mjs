import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { zipSync } from 'fflate';
import { assertBundledDependencies } from './package-dependencies.mjs';

// An explicit maintainer build is the only download operation in this module.
// Checksums are pinned from https://nodejs.org/dist/v24.19.0/SHASUMS256.txt.
const nodeVersion = '24.19.0';
const runtimes = {
  'darwin-arm64': {
    archive: 'node-v24.19.0-darwin-arm64.tar.gz',
    sha256: '8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d',
  },
  'linux-x64': {
    archive: 'node-v24.19.0-linux-x64.tar.gz',
    sha256: 'f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4',
  },
  'win32-x64': {
    archive: 'node-v24.19.0-win-x64.zip',
    sha256: '57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73',
  },
};
const root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({
  options: {
    platform: { type: 'string', default: process.platform },
    arch: { type: 'string', default: process.arch },
    'runtime-dir': { type: 'string' },
    replace: { type: 'boolean', default: false },
  },
});
const target = values.platform + '-' + values.arch;
const runtime = runtimes[target];
assert.ok(runtime, 'Unsupported platform. Build darwin-arm64, linux-x64, or win32-x64.');
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(root, 'npm-shrinkwrap.json'), 'utf8'));
const artifacts = join(root, '.artifacts');
await mkdir(artifacts, { recursive: true });
const name = `openbpmn-${pkg.version}-${target}`;
const destination = join(artifacts, name);
const archiveDestination = destination + '.zip';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
if (!values.replace)
  assert.ok(
    !(await exists(destination)) && !(await exists(archiveDestination)),
    'Candidate exists; use --replace to rebuild it.',
  );

function execute(command, args, cwd = root) {
  if (process.platform === 'win32' && /\.cmd$/i.test(command)) {
    const quote = (value) => "'" + value.replaceAll("'", "''") + "'";
    return execute(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '& ' + [command, ...args].map(quote).join(' ') + '; exit $LASTEXITCODE',
      ],
      cwd,
    );
  }
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 180_000, maxBuffer: 32 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr ?? result.stdout);
  return result.stdout;
}
async function inventory(directory, prefix = '') {
  const entries = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    assert.ok(!entry.isSymbolicLink(), 'Platform payloads must contain ordinary files, never symbolic links.');
    const path = join(directory, entry.name),
      name = prefix + entry.name;
    if (entry.isDirectory()) entries.push(...(await inventory(path, name + '/')));
    else {
      assert.ok(entry.isFile(), 'Platform payloads must contain ordinary files only.');
      const bytes = await readFile(path);
      entries.push({ path: name, sha256: digest(bytes), bytes: bytes.length, mode: (await lstat(path)).mode & 0o777 });
    }
  }
  return entries;
}

const temporary = await mkdtemp(join(artifacts, '.platform-stage-'));
const payload = join(temporary, name);
let retainRecovery = false;
try {
  await mkdir(payload);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const [packed] = JSON.parse(execute(npm, ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary]));
  assert.ok(packed.size <= 20 * 1024 * 1024, 'The bundled application archive exceeds 20 MiB.');
  const app = join(payload, 'app');
  await mkdir(app);
  execute('tar', ['-xf', join(temporary, packed.filename), '-C', app, '--strip-components=1']);
  const dependencies = (await assertBundledDependencies(lock, app)).dependencies;
  for (const file of ['dist/cli.js', 'dist/manage.js', 'skills/openbpmn/version.json'])
    assert.ok((await lstat(join(app, file))).isFile(), 'Missing built application file: ' + file);
  assert.equal(JSON.parse(await readFile(join(app, 'skills/openbpmn/version.json'), 'utf8')).toolVersion, pkg.version);

  const cache = join(artifacts, 'runtime-cache');
  await mkdir(cache, { recursive: true });
  const nodeArchive = join(cache, runtime.archive);
  const url = `https://nodejs.org/dist/v${nodeVersion}/${runtime.archive}`;
  if (!(await exists(nodeArchive))) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000), redirect: 'error' });
    assert.ok(response.ok, 'Official Node runtime download failed: ' + response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(digest(bytes), runtime.sha256, 'Official Node archive checksum differs from the pinned release.');
    const pending = join(temporary, runtime.archive);
    await writeFile(pending, bytes, { flag: 'wx' });
    await rename(pending, nodeArchive);
  }
  assert.equal(
    digest(await readFile(nodeArchive)),
    runtime.sha256,
    'Cached Node archive checksum differs from the pinned release.',
  );
  const extracted = join(temporary, 'official-runtime');
  await mkdir(extracted);
  execute('tar', ['-xf', nodeArchive, '-C', extracted]);
  const official = join(extracted, runtime.archive.replace(/\.(tar\.gz|zip)$/, ''));
  const executable = values.platform === 'win32' ? 'node.exe' : 'bin/node';
  const runtimeDirectory = join(payload, 'runtime');
  await mkdir(values.platform === 'win32' ? runtimeDirectory : join(runtimeDirectory, 'bin'), { recursive: true });
  for (const file of [executable, 'LICENSE']) {
    const officialBytes = await readFile(join(official, file));
    // A local optimization never substitutes an arbitrary executable for the official payload.
    const source = values['runtime-dir'] ? join(resolve(values['runtime-dir']), file) : join(official, file);
    assert.ok(
      (await lstat(source)).isFile() && !(await lstat(source)).isSymbolicLink(),
      'Runtime sources must be ordinary files.',
    );
    assert.equal(
      digest(await readFile(source)),
      digest(officialBytes),
      'Local runtime does not match the pinned official payload: ' + file,
    );
    await copyFile(source, join(runtimeDirectory, file));
    await chmod(join(runtimeDirectory, file), file === executable ? 0o755 : 0o644);
  }
  for (const file of ['setup.sh', 'setup.ps1']) {
    await copyFile(join(root, 'scripts', file), join(payload, file));
    await chmod(join(payload, file), file.endsWith('.sh') ? 0o755 : 0o644);
  }
  const files = await inventory(payload);
  const applicationBytes = files
    .filter((file) => file.path.startsWith('app/'))
    .reduce((total, file) => total + file.bytes, 0);
  const runtimeBytes = files
    .filter((file) => file.path.startsWith('runtime/'))
    .reduce((total, file) => total + file.bytes, 0);
  assert.ok(applicationBytes <= 150 * 1024 * 1024, 'Installed application exceeds 150 MiB.');
  const manifest = {
    schemaVersion: 1,
    version: pkg.version,
    platform: values.platform,
    arch: values.arch,
    nodeVersion,
    runtimeExecutable: 'runtime/' + executable,
    files,
    sourceCommit: execute('git', ['rev-parse', 'HEAD']).trim(),
    sourceDirty: execute('git', ['status', '--porcelain']).trim() !== '',
    dependencies,
    sizes: {
      applicationBytes,
      runtimeBytes,
      totalBytes: files.reduce((total, file) => total + file.bytes, 0),
      applicationArchiveBytes: packed.size,
    },
    nodeArchive: { url, sha256: runtime.sha256 },
  };
  const payloadBytes = manifest.sizes.totalBytes;
  let manifestText;
  do {
    manifestText = JSON.stringify(manifest, null, 2) + '\n';
    manifest.sizes.totalBytes = payloadBytes + Buffer.byteLength(manifestText);
  } while (manifestText !== JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(payload, 'manifest.json'), manifestText);
  const zipped = {};
  for (const file of [...files, { path: 'manifest.json', mode: 0o644 }])
    zipped[name + '/' + file.path] = [
      await readFile(join(payload, file.path)),
      { mtime: new Date(2000, 0, 1), os: 3, attrs: (0o100000 | file.mode) << 16 },
    ];
  const zip = zipSync(zipped, { level: 9 });
  const candidateZip = join(temporary, name + '.zip');
  await writeFile(candidateZip, zip);
  // Only developer artifacts are replaced, and only after the new candidate is complete.
  const backup = join(temporary, 'previous');
  const archiveBackup = join(temporary, 'previous.zip');
  const hadDirectory = await exists(destination),
    hadArchive = await exists(archiveDestination);
  let movedDirectory = false,
    movedArchive = false,
    placedDirectory = false,
    placedArchive = false;
  try {
    if (hadDirectory) {
      await rename(destination, backup);
      movedDirectory = true;
    }
    if (hadArchive) {
      await rename(archiveDestination, archiveBackup);
      movedArchive = true;
    }
    await rename(payload, destination);
    placedDirectory = true;
    await rename(candidateZip, archiveDestination);
    placedArchive = true;
  } catch (error) {
    try {
      if (placedDirectory) await rm(destination, { recursive: true, force: true });
      if (placedArchive) await rm(archiveDestination);
      if (movedDirectory) await rename(backup, destination);
      if (movedArchive) await rename(archiveBackup, archiveDestination);
    } catch {
      retainRecovery = true;
      throw new Error('Candidate replacement recovery is incomplete; preserve and inspect ' + temporary, {
        cause: error,
      });
    }
    throw error;
  }
  const evidence = {
    bundle: destination,
    archive: archiveDestination,
    archiveBytes: zip.length,
    archiveSha256: digest(zip),
    ...manifest.sizes,
    nodeVersion,
  };
  await writeFile(destination + '.archive.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  if (!retainRecovery) await rm(temporary, { recursive: true, force: true });
}
