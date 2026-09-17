import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  atomicWrite,
  copyInventory,
  destination,
  digestFile,
  digestText,
  distributionAt,
  exists,
  inventoryPath,
  listFiles,
  noLinks,
  skillInventory,
  verifyFiles,
  type Distribution,
  type InventoryFile,
} from './installation-files.js';
import { launcherFiles, planPathIntegration, skillDirectory } from './installation-hosts.js';
import {
  example,
  readState,
  verifyInstalled,
  windowsPath,
  type InstallationState,
  type ManagementOptions,
  type ManagementResult,
} from './installation.js';

type Release = { release: string; manifestSha256: string };
type UpdateJournal = {
  schemaVersion: 1;
  operation: 'update';
  pid: number;
  previous: InstallationState;
  next: InstallationState;
};
type UninstallJournal = { schemaVersion: 1; operation: 'uninstall'; pid: number; state: InstallationState };
type SetupJournal = { schemaVersion: 1; operation: 'setup'; pid: number; next: InstallationState };
const serialized = (value: unknown) => JSON.stringify(value, null, 2) + '\n';
const runtimeExecutable = () => (process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/bin/node');
const pendingPath = (prefix: string) => join(prefix, 'pending.json');
const skillStage = (state: InstallationState) => state.skill.path + '.stage-' + state.release.slice('releases/'.length);
const skillBackup = (state: InstallationState) =>
  state.skill.path + '.previous-' + state.release.slice('releases/'.length);

async function pruneOwnedDirectories(directory: string, files: InventoryFile[]): Promise<void> {
  const directories = new Set<string>();
  for (const file of files) {
    let path = dirname(file.path);
    while (path !== '.') {
      directories.add(path);
      path = dirname(path);
    }
  }
  for (const path of [...directories].sort((a, b) => b.length - a.length)) {
    const target = join(directory, path);
    await noLinks(target);
    await rmdir(target).catch((error: NodeJS.ErrnoException) => {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code ?? '')) throw error;
    });
  }
  await rmdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code ?? '')) throw error;
  });
}

function validInventory(files: InventoryFile[]): void {
  if (
    !Array.isArray(files) ||
    files.some(
      (file) =>
        !inventoryPath(file.path) ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0,
    )
  )
    throw new Error('Unsafe installation ownership inventory. Preserve this installation for manual recovery.');
  if (new Set(files.map((file) => file.path.toLowerCase())).size !== files.length)
    throw new Error('Duplicate installation ownership paths.');
}

async function ownedManifest(prefix: string, release: Release): Promise<Distribution> {
  validateRelease(release);
  const path = join(prefix, release.release, 'manifest.json');
  await noLinks(path);
  if ((await digestFile(path)) !== release.manifestSha256) throw new Error('Release manifest has changed: ' + path);
  const manifest = JSON.parse(await readFile(path, 'utf8')) as Distribution;
  validInventory(manifest.files);
  return manifest;
}

function validateRelease(release: Release): void {
  if (!/^releases\/[a-f0-9-]+$/.test(release.release) || !/^[a-f0-9]{64}$/.test(release.manifestSha256))
    throw new Error('Unsafe release ownership metadata.');
}

/** Never follow links or delete bytes that differ from the recorded ownership hash. */
async function removeOwned(path: string, sha256: string, retained: Set<string>): Promise<void> {
  try {
    if (!(await exists(path))) return;
    await noLinks(path);
    if (!(await lstat(path)).isFile() || (await digestFile(path)) !== sha256) {
      retained.add(path);
      return;
    }
    await rm(path);
  } catch {
    retained.add(path);
  }
}

async function removeInventory(directory: string, files: InventoryFile[], retained: Set<string>): Promise<void> {
  validInventory(files);
  if (!(await exists(directory))) return;
  try {
    await noLinks(directory);
  } catch {
    retained.add(directory);
    return;
  }
  for (const file of files) await removeOwned(join(directory, file.path), file.sha256, retained);
  await pruneOwnedDirectories(directory, files).catch(() => retained.add(directory));
  if (await exists(directory)) retained.add(directory);
}

async function removeRelease(
  prefix: string,
  release: Release,
  retained: Set<string>,
  keepManifest = false,
): Promise<void> {
  validateRelease(release);
  const directory = join(prefix, release.release);
  if (!(await exists(directory))) return;
  let manifest: Distribution;
  try {
    manifest = await ownedManifest(prefix, release);
  } catch {
    // An interrupted setup may have made only this empty release directory.
    await noLinks(directory);
    await rmdir(directory).catch(() => {});
    if (!(await exists(directory))) return;
    retained.add(directory);
    return;
  }
  await removeInventory(directory, manifest.files, retained);
  // Keep the inventory when any bytes remain, allowing safe subsequent cleanup.
  const entries = await readdir(directory).catch(() => []);
  if (entries.length === 1 && entries[0] === 'manifest.json') {
    retained.delete(directory);
    if (!keepManifest) {
      await removeOwned(join(directory, 'manifest.json'), release.manifestSha256, retained);
      await pruneOwnedDirectories(directory, manifest.files).catch(() => retained.add(directory));
    }
  }
}

async function validateOwnedState(prefix: string, state: InstallationState, cleanup = false): Promise<void> {
  if (
    !['codex', 'claude', 'copilot'].includes(state.host) ||
    state.skill.path !== skillDirectory(state.host, state.home, state.project)
  )
    throw new Error('Skill ownership path is inconsistent.');
  validInventory(state.skill.files);
  validateRelease(state);
  for (const release of state.retired ?? []) validateRelease(release);
  if (!cleanup || (await exists(join(prefix, state.release, 'manifest.json')))) {
    const manifest = await ownedManifest(prefix, state);
    const skill = skillInventory(manifest);
    if (serialized(state.skill.files) !== serialized(skill))
      throw new Error('Skill ownership inventory differs from the verified release.');
  }
  const launchers = launcherFiles(prefix, join(prefix, state.release), runtimeExecutable()).map((file) => ({
    path: file.path,
    sha256: digestText(file.content),
  }));
  if (serialized(state.launchers) !== serialized(launchers))
    throw new Error('Launcher ownership hashes differ from the managed release.');
  const profiles = planPathIntegration(state.home, prefix);
  if (
    state.profiles.some(
      (profile) => !profiles.some((expected) => expected.path === profile.path && expected.block === profile.block),
    )
  )
    throw new Error('Profile ownership metadata differs from the managed PATH block.');
}

async function matches(directory: string, inventory: InventoryFile[]): Promise<boolean> {
  try {
    await verifyFiles(directory, inventory);
    return true;
  } catch {
    return false;
  }
}

async function matchesSubset(directory: string, inventory: InventoryFile[]): Promise<boolean> {
  try {
    await noLinks(directory);
    const names = await listFiles(directory);
    const present = inventory.filter((file) => names.includes(file.path));
    await verifyFiles(directory, present);
    return true;
  } catch {
    return false;
  }
}

async function rollbackUpdate(prefix: string, journal: UpdateJournal): Promise<string[]> {
  const { previous, next } = journal;
  await validateOwnedState(prefix, previous);
  await distributionAt(join(prefix, previous.release));
  const backup = skillBackup(next);
  const stage = skillStage(next);
  if ((await exists(backup)) && !(await matchesSubset(backup, previous.skill.files)))
    throw new Error('Previous skill backup was modified; preserve it for manual recovery: ' + backup);
  if (
    (await exists(previous.skill.path)) &&
    !(await matches(previous.skill.path, previous.skill.files)) &&
    !(await matches(previous.skill.path, next.skill.files))
  )
    throw new Error('The active skill was modified during update; preserve it before recovery: ' + previous.skill.path);
  for (const launcher of previous.launchers) {
    await noLinks(launcher.path);
    if (await exists(launcher.path)) {
      const hash = await digestFile(launcher.path);
      if (hash !== launcher.sha256 && hash !== next.launchers.find((file) => file.path === launcher.path)?.sha256)
        throw new Error('A launcher was modified during update; preserve it before recovery: ' + launcher.path);
    }
  }
  const retained = new Set<string>();
  if (await exists(backup)) {
    // Cleanup may have been interrupted after commit. Recreate any missing
    // unchanged backup files from the immutable previous release before restore.
    await copyInventory(join(prefix, previous.release, 'app/skills/openbpmn'), backup, previous.skill.files);
    await verifyFiles(backup, previous.skill.files);
    if (await exists(previous.skill.path)) {
      await removeInventory(
        previous.skill.path,
        (await matches(previous.skill.path, previous.skill.files)) ? previous.skill.files : next.skill.files,
        retained,
      );
      if (await exists(previous.skill.path)) throw new Error('Could not remove staged skill safely. Retry --recover.');
    }
    await rename(backup, previous.skill.path);
  } else if (!(await matches(previous.skill.path, previous.skill.files))) {
    if (await exists(previous.skill.path)) {
      await removeInventory(previous.skill.path, next.skill.files, retained);
      if (await exists(previous.skill.path))
        throw new Error('Could not restore previous skill safely. Retry --recover.');
    }
    await copyInventory(
      join(prefix, previous.release, 'app/skills/openbpmn'),
      previous.skill.path,
      previous.skill.files,
    );
  }
  for (const launcher of launcherFiles(prefix, join(prefix, previous.release), runtimeExecutable()))
    await atomicWrite(launcher.path, launcher.content, launcher.mode);
  await removeInventory(stage, next.skill.files, retained);
  await removeRelease(prefix, next, retained);
  const restored = {
    ...previous,
    retired: [
      ...(previous.retired ?? []),
      ...((await exists(join(prefix, next.release)))
        ? [{ release: next.release, manifestSha256: next.manifestSha256 }]
        : []),
    ],
  };
  await atomicWrite(join(prefix, 'installation.json'), serialized(restored));
  await rm(pendingPath(prefix));
  return [...retained];
}

async function readJournal(prefix: string): Promise<UpdateJournal | UninstallJournal | SetupJournal> {
  const path = pendingPath(prefix);
  await noLinks(path);
  const journal = JSON.parse(await readFile(path, 'utf8')) as UpdateJournal | UninstallJournal | SetupJournal;
  if (
    journal.schemaVersion !== 1 ||
    !['update', 'uninstall', 'setup'].includes(journal.operation) ||
    !Number.isSafeInteger(journal.pid) ||
    journal.pid < 1
  )
    throw new Error(
      'This incomplete setup cannot be recovered automatically. Preserve its files and use a new installation prefix.',
    );
  if (journal.pid !== process.pid) {
    try {
      process.kill(journal.pid, 0);
      throw new Error('Another installation operation is still running. Wait for it to exit before recovery.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  if (journal.operation === 'setup') return journal;
  if (journal.operation === 'uninstall' && !(await exists(join(prefix, 'installation.json')))) {
    await validateOwnedState(prefix, journal.state, true);
    return journal;
  }
  const state = await readState(prefix);
  if (journal.operation === 'uninstall') {
    if (serialized(journal.state) !== serialized(state))
      throw new Error('Uninstall journal differs from installation metadata. Preserve both files for manual recovery.');
  } else {
    if (serialized(state) !== serialized(journal.previous) && serialized(state) !== serialized(journal.next))
      throw new Error('Update journal differs from installation metadata. Preserve both files for manual recovery.');
    const { previous, next } = journal;
    if (
      next.id !== previous.id ||
      next.host !== previous.host ||
      next.home !== previous.home ||
      next.project !== previous.project ||
      next.skill.path !== previous.skill.path ||
      next.release === previous.release ||
      !/^releases\/[a-f0-9-]+$/.test(next.release)
    )
      throw new Error('Update journal contains inconsistent ownership paths.');
    validInventory(next.skill.files);
    const expected = launcherFiles(prefix, join(prefix, next.release), runtimeExecutable()).map((file) => ({
      path: file.path,
      sha256: digestText(file.content),
    }));
    if (serialized(next.launchers) !== serialized(expected))
      throw new Error('Update journal launcher metadata is inconsistent.');
  }
  return journal;
}

export async function recover(options: ManagementOptions): Promise<ManagementResult> {
  const prefix = await destination(options.prefix);
  if (!(await exists(pendingPath(prefix))))
    return {
      schemaVersion: 1,
      operation: 'recover',
      status: 'ready',
      prefix,
      message: 'No incomplete operation was found.',
      checks: [],
      nextSteps: [],
    };
  const journal = await readJournal(prefix);
  if (journal.operation === 'uninstall') return removeInstallation(prefix, journal.state);
  if (journal.operation === 'setup') return removeInstallation(prefix, journal.next, true);
  // Even when state committed before an abrupt interruption, restore the previous
  // pair. This gives recovery one conservative, explicit outcome.
  const retained = await rollbackUpdate(prefix, journal);
  return {
    schemaVersion: 1,
    operation: 'recover',
    status: 'ready',
    prefix,
    version: journal.previous.version,
    message: 'The previous matched CLI, runtime, and skill were restored.',
    checks: [{ name: 'recovery', status: 'pass', message: 'Incomplete update rolled back.' }],
    nextSteps: ['Run doctor, then retry the explicit update when ready.'],
    ...(retained.length ? { retained } : {}),
  };
}

export async function update(options: ManagementOptions): Promise<ManagementResult> {
  const prefix = await destination(options.prefix);
  if (await exists(pendingPath(prefix))) {
    if (options.recover) return recover(options);
    throw new Error(
      'An incomplete installation operation was detected. Run update --recover before changing this installation.',
    );
  }
  if (!options.bundle) throw new Error('Select an extracted platform archive with --bundle.');
  const previous = await readState(prefix);
  await validateOwnedState(prefix, previous);
  await verifyInstalled(prefix, previous);
  const bundle = await destination(options.bundle);
  const manifest = await distributionAt(bundle);
  const next: InstallationState = {
    ...previous,
    version: manifest.version,
    release: 'releases/' + randomUUID(),
    manifestSha256: await digestFile(join(bundle, 'manifest.json')),
    ...(options.browser ? { browser: options.browser } : {}),
    skill: {
      path: previous.skill.path,
      files: skillInventory(manifest),
    },
    retired: [...(previous.retired ?? []), { release: previous.release, manifestSha256: previous.manifestSha256 }],
  };
  const release = join(prefix, next.release);
  const stage = skillStage(next);
  const backup = skillBackup(next);
  next.launchers = launcherFiles(prefix, release, manifest.runtimeExecutable).map((file) => ({
    path: file.path,
    sha256: digestText(file.content),
  }));
  if ((await exists(stage)) || (await exists(backup)))
    throw new Error('An unowned update staging directory already exists. Preserve it before retrying.');
  const journal: UpdateJournal = { schemaVersion: 1, operation: 'update', pid: process.pid, previous, next };
  await writeFile(pendingPath(prefix), serialized(journal), { flag: 'wx', mode: 0o600 });
  const checkpoint = () => options.signal?.throwIfAborted();
  const retained = new Set<string>();
  const olderRetained = new Set<string>();
  let verification: Awaited<ReturnType<typeof example>>;
  try {
    if (serialized(await readState(prefix)) !== serialized(previous))
      throw new Error('Installation changed while acquiring the update lock.');
    await mkdir(release, { recursive: true, mode: 0o700 });
    await atomicWrite(join(release, 'manifest.json'), await readFile(join(bundle, 'manifest.json'), 'utf8'));
    await copyInventory(bundle, release, manifest.files);
    await distributionAt(release);
    checkpoint();
    // Inventory proves which bytes were supplied; execution proves they work.
    // Keep the previous pair active until all available staged checks succeed.
    verification = await example(prefix, next, next.browser, options.output);
    const failures = verification.checks.filter(
      (check) => check.status === 'fail' && (check.name !== 'browser' || verification.browserAvailable),
    );
    if (failures.length)
      throw new Error('Staged update verification failed: ' + failures.map((check) => check.message).join(' '));
    checkpoint();
    for (const retired of previous.retired ?? []) await removeRelease(prefix, retired, olderRetained);
    next.retired = [
      ...(previous.retired ?? []).filter((retired) => olderRetained.has(join(prefix, retired.release))),
      { release: previous.release, manifestSha256: previous.manifestSha256 },
    ];
    await atomicWrite(pendingPath(prefix), serialized(journal));
    checkpoint();
    await copyInventory(join(release, 'app/skills/openbpmn'), stage, next.skill.files);
    await verifyFiles(stage, next.skill.files);
    await verifyInstalled(prefix, previous);
    checkpoint();
    await rename(previous.skill.path, backup);
    checkpoint();
    await rename(stage, next.skill.path);
    for (const launcher of launcherFiles(prefix, release, manifest.runtimeExecutable)) {
      checkpoint();
      await atomicWrite(launcher.path, launcher.content, launcher.mode);
    }
    checkpoint();
    await atomicWrite(join(prefix, 'installation.json'), serialized(next));
    checkpoint();
    await removeInventory(backup, previous.skill.files, retained);
    if (retained.size) throw new Error('Previous skill backup cleanup could not finish.');
    checkpoint();
    await rm(pendingPath(prefix));
  } catch (error) {
    try {
      await rollbackUpdate(prefix, journal);
    } catch (recoveryError) {
      throw new Error(
        `Update failed; recovery is still required. Run update --recover. ${String(error)} ${String(recoveryError)}`,
      );
    }
    throw new Error('Update failed; the previous installation was restored. ' + String(error));
  }
  for (const path of olderRetained) retained.add(path);
  return {
    schemaVersion: 1,
    operation: 'update',
    status: verification.checks.some((check) => check.status === 'fail') ? 'incomplete' : 'ready',
    prefix,
    version: next.version,
    message: 'The matched CLI, private runtime, and Modeling Skill were updated.',
    checks: verification.checks,
    artifacts: verification.artifacts,
    nextSteps: [
      'Restart the selected Host Agent to discover the updated skill.',
      'Run openbpmn-manage doctor to check the installation.',
    ],
    ...(retained.size ? { retained: [...retained] } : {}),
  };
}

async function removeInstallation(
  prefix: string,
  state: InstallationState,
  interruptedSetup = false,
): Promise<ManagementResult> {
  await validateOwnedState(prefix, state, true);
  const installationHash = (await exists(join(prefix, 'installation.json')))
    ? await digestFile(join(prefix, 'installation.json'))
    : undefined;
  const retained = new Set<string>();
  await removeInventory(state.skill.path, state.skill.files, retained);
  for (const launcher of state.launchers) await removeOwned(launcher.path, launcher.sha256, retained);
  for (const profile of state.profiles) {
    try {
      if (!(await exists(profile.path))) continue;
      await noLinks(profile.path);
      const before = await readFile(profile.path, 'utf8');
      if (!before.includes(profile.block)) {
        if (before.includes('# >>> OpenBPMN ' + prefix)) retained.add(profile.path);
        continue;
      }
      if (before.split(profile.block).length !== 2) {
        retained.add(profile.path);
        continue;
      }
      const after = before.replace(profile.block, '');
      if (profile.created && after === '') await removeOwned(profile.path, digestText(before), retained);
      else await atomicWrite(profile.path, after, (await lstat(profile.path)).mode & 0o777);
    } catch {
      retained.add(profile.path);
    }
  }
  if (state.windowsPathAdded) {
    try {
      await windowsPath(prefix, 'remove');
    } catch {
      retained.add('Windows user PATH: ' + join(prefix, 'bin'));
    }
  }
  const releases = [...(state.retired ?? []), state];
  for (const release of releases) await removeRelease(prefix, release, retained, true);
  await pruneOwnedDirectories(join(prefix, 'bin'), []).catch(() => retained.add(join(prefix, 'bin')));
  if (!retained.size) {
    for (const release of releases)
      await removeOwned(join(prefix, release.release, 'manifest.json'), release.manifestSha256, retained);
    if (!retained.size && installationHash)
      await removeOwned(join(prefix, 'installation.json'), installationHash, retained);
  }
  if (!retained.size) {
    await rm(pendingPath(prefix));
    await pruneOwnedDirectories(
      join(prefix, 'releases'),
      releases.map((release) => ({
        path: release.release.slice('releases/'.length) + '/manifest.json',
        sha256: release.manifestSha256,
        bytes: 0,
      })),
    ).catch(() => retained.add(join(prefix, 'releases')));
    await pruneOwnedDirectories(prefix, []).catch(() => retained.add(prefix));
    if (await exists(prefix)) retained.add(prefix);
  } else if (interruptedSetup || !installationHash) {
    retained.add(pendingPath(prefix));
  } else {
    await rm(pendingPath(prefix));
    retained.add(join(prefix, 'installation.json'));
  }
  return {
    schemaVersion: 1,
    operation: 'uninstall',
    status: 'removed',
    prefix,
    version: state.version,
    message: retained.size
      ? 'Owned, unchanged files were removed. Modified, unowned, or currently locked paths were preserved.'
      : 'Owned installation files and integration were removed.',
    checks: [],
    nextSteps: retained.size
      ? [
          'Review retained paths. On Windows, close the running private runtime before retrying cleanup from the extracted bundle.',
        ]
      : [],
    ...(retained.size ? { retained: [...retained].sort() } : {}),
  };
}

export async function uninstall(options: ManagementOptions): Promise<ManagementResult> {
  const prefix = await destination(options.prefix);
  if (await exists(pendingPath(prefix))) {
    if (options.recover) return recover(options);
    throw new Error(
      'An incomplete installation operation was detected. Run uninstall --recover before removing this installation.',
    );
  }
  const state = await readState(prefix);
  await validateOwnedState(prefix, state, true);
  const journal: UninstallJournal = { schemaVersion: 1, operation: 'uninstall', pid: process.pid, state };
  await writeFile(pendingPath(prefix), serialized(journal), { flag: 'wx', mode: 0o600 });
  return removeInstallation(prefix, state);
}
