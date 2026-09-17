import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, delimiter, isAbsolute, join, resolve } from 'node:path';
import type { ResultEnvelope } from './model.js';
import {
  atomicWrite,
  copyInventory,
  destination,
  digestFile,
  digestText,
  distributionAt,
  exists,
  noLinks,
  removeEmpty,
  skillInventory,
  verifyFiles,
  type InventoryFile,
} from './installation-files.js';
import { launcherFiles, planPathIntegration, shadowedSkills, skillDirectory, type Host } from './installation-hosts.js';

export interface ManagementOptions {
  prefix: string;
  bundle?: string;
  host?: Host;
  project?: string;
  browser?: string;
  output?: string;
  recover?: boolean;
  signal?: AbortSignal;
}
export interface Check {
  name: string;
  status: 'pass' | 'fail' | 'not_verified';
  message: string;
}
export interface ManagementResult {
  schemaVersion: 1;
  operation: string;
  status: 'ready' | 'incomplete' | 'removed' | 'failed';
  message: string;
  prefix?: string;
  version?: string;
  checks: Check[];
  nextSteps: string[];
  artifacts?: string[];
  retained?: string[];
}
interface InstalledText {
  path: string;
  sha256: string;
}
interface ProfileBlock {
  path: string;
  block: string;
  created: boolean;
}
export interface InstallationState {
  schemaVersion: 1;
  id: string;
  version: string;
  release: string;
  manifestSha256: string;
  host: Host;
  home: string;
  project?: string;
  browser?: string;
  skill: { path: string; files: InventoryFile[] };
  launchers: InstalledText[];
  profiles: ProfileBlock[];
  windowsPathAdded: boolean;
  retired?: Array<{ release: string; manifestSha256: string }>;
}

export function defaultPrefix(): string {
  return process.platform === 'win32'
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'BPMNWeave')
    : join(homedir(), '.local', 'share', 'bpmn-weave');
}

function execute(runtime: string, script: string, args: string[], timeout = 60_000) {
  const { NODE_OPTIONS: _options, NODE_PATH: _path, ...env } = process.env;
  const result = spawnSync(runtime, [script, ...args], { encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, env });
  if (result.error) throw new Error('The private runtime could not complete its check: ' + result.error.message);
  return result;
}

export async function readState(prefix: string): Promise<InstallationState> {
  await noLinks(prefix);
  const state = JSON.parse(
    await readFile(join(prefix, 'installation.json'), 'utf8').catch(() => {
      throw new Error('No managed installation found. Run setup with an extracted platform archive.');
    }),
  ) as InstallationState;
  if (
    state.schemaVersion !== 1 ||
    !/^releases\/[a-f0-9-]+$/.test(state.release) ||
    !['codex', 'claude', 'copilot'].includes(state.host)
  )
    throw new Error('Unsupported installation metadata. Preserve this directory and rerun setup in a new prefix.');
  if (state.skill.path !== skillDirectory(state.host, state.home, state.project))
    throw new Error('Installation skill ownership metadata is inconsistent.');
  const expectedLaunchers = launcherFiles(
    prefix,
    join(prefix, state.release),
    process.platform === 'win32' ? 'runtime/node.exe' : 'runtime/bin/node',
  );
  if (
    JSON.stringify(state.launchers.map((file) => file.path).sort()) !==
    JSON.stringify(expectedLaunchers.map((file) => file.path).sort())
  )
    throw new Error('Installation launcher ownership metadata is inconsistent.');
  const allowedProfiles = planPathIntegration(state.home, prefix).map((profile) => profile.path);
  if (state.profiles.some((profile) => !allowedProfiles.includes(profile.path)))
    throw new Error('Installation profile ownership metadata is inconsistent.');
  return state;
}

export async function windowsPath(prefix: string, action: 'add' | 'remove' | 'contains'): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const script =
    "$p=[Environment]::GetEnvironmentVariable('Path','User'); $entry=$env:BPMN_WEAVE_BIN; $parts=@($p -split ';' | Where-Object { $_ }); " +
    (action === 'contains'
      ? "if ($parts -contains $entry) { Write-Output 'changed' } else { Write-Output 'absent' }"
      : action === 'add'
        ? "if ($parts -contains $entry) { Write-Output 'existing' } else { [Environment]::SetEnvironmentVariable('Path', (($parts + $entry) -join ';'), 'User'); Write-Output 'changed' }"
        : "[Environment]::SetEnvironmentVariable('Path', (($parts | Where-Object { $_ -ne $entry }) -join ';'), 'User'); Write-Output 'changed'");
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, BPMN_WEAVE_BIN: join(prefix, 'bin') },
  });
  if (result.status !== 0) throw new Error('Could not update the user PATH. Close other setup processes and retry.');
  return result.stdout.trim() === 'changed';
}

export async function example(
  prefix: string,
  state: InstallationState,
  browser: string | undefined,
  output?: string,
): Promise<{ checks: Check[]; artifacts: string[]; browserAvailable: boolean }> {
  const release = join(prefix, state.release);
  const manifest = JSON.parse(await readFile(join(release, 'manifest.json'), 'utf8'));
  const runtime = join(release, manifest.runtimeExecutable);
  const cli = join(release, 'app', 'dist', 'cli.js');
  const browserArgs = browser ? ['--browser-executable', browser] : [];
  const capabilities = execute(runtime, cli, ['capabilities', ...browserArgs]);
  if (capabilities.status !== 0)
    throw new Error('The installed CLI could not inspect its capabilities. Rerun setup from the verified archive.');
  const envelope = JSON.parse(capabilities.stdout);
  const checks: Check[] = [
    {
      name: 'runtime',
      status: envelope.capabilities.runtime.supported ? 'pass' : 'fail',
      message: `Private Node.js ${envelope.capabilities.runtime.nodeVersion}; required Node.js 24.`,
    },
  ];
  if (!envelope.capabilities.runtime.browser.available) {
    checks.push({
      name: 'browser',
      status: 'fail',
      message: 'Install Chrome or Edge, or rerun with --browser-executable and an absolute executable path.',
    });
    return { checks, artifacts: [], browserAvailable: false };
  }
  const directory = output
    ? await destination(output)
    : await mkdtemp(join(await destination(tmpdir()), 'bpmn-weave-example-'));
  await noLinks(directory);
  await mkdir(directory, { recursive: true });
  const generated = execute(runtime, cli, [
    'generate',
    '--input',
    join(release, 'app', 'examples', 'invoice-review.json'),
    '--output',
    join(directory, 'example'),
    ...browserArgs,
  ]);
  let result: ResultEnvelope;
  try {
    result = JSON.parse(generated.stdout);
  } catch {
    throw new Error('The installed example did not return a valid result. Rerun doctor.');
  }
  checks.push({
    name: 'browser',
    status: generated.status === 0 ? 'pass' : 'fail',
    message:
      generated.status === 0
        ? 'The installed browser launched with an isolated profile and rendered a real example.'
        : (result.report?.findings ?? []).map((finding: { message: string }) => finding.message).join(' ') ||
          'The example failed. Choose an empty output directory and a working installed browser.',
  });
  return {
    checks,
    browserAvailable: true,
    artifacts:
      generated.status === 0
        ? ['.bpmn', '.svg', '.quality.json'].map((suffix) => join(directory, 'example' + suffix))
        : [],
  };
}

export async function setup(options: ManagementOptions): Promise<ManagementResult> {
  if (!options.bundle) throw new Error('Select an extracted platform archive with --bundle.');
  if (!options.host) throw new Error('Select your existing Host Agent with --host codex, claude, or copilot.');
  const bundle = await destination(options.bundle);
  const manifest = await distributionAt(bundle);
  const prefix = await destination(options.prefix);
  if (await exists(join(prefix, 'pending.json')))
    throw new Error(
      'An incomplete installation operation needs recovery. Run setup --recover with this prefix before retrying.',
    );
  if (await exists(join(prefix, 'installation.json'))) {
    const current = await readState(prefix);
    if (current.host !== options.host || (options.project && (await destination(options.project)) !== current.project))
      throw new Error(
        'This installation uses a different host or scope. Preserve it and choose another prefix or uninstall it explicitly first.',
      );
    if (current.manifestSha256 !== (await digestFile(join(bundle, 'manifest.json'))))
      throw new Error(
        'This is a different distribution candidate. Use update --bundle to move the CLI and skill together.',
      );
    await verifyInstalled(prefix, current);
    // An idempotent rerun never overwrites the first example or changes ownership.
    return setupReport(prefix, current, await example(prefix, current, options.browser ?? current.browser), true);
  }
  if ((await exists(prefix)) && (await readdir(prefix)).length)
    throw new Error(
      'The installation prefix is not empty. Use update for a managed installation or choose an empty prefix.',
    );
  const home = await destination(homedir());
  const project = options.project ? await destination(options.project) : undefined;
  const skillPath = skillDirectory(options.host, home, project);
  await noLinks(skillPath);
  if (await exists(skillPath))
    throw new Error(
      'An unowned Modeling Skill already exists at ' +
        skillPath +
        '. Preserve it and choose another installation scope.',
    );
  const shadows = await shadowedSkills(options.host, home, project, process.cwd());
  if (shadows.length)
    throw new Error(
      'Another Modeling Skill may shadow this installation: ' +
        shadows.join(', ') +
        '. Resolve the conflict before setup.',
    );
  const state: InstallationState = {
    schemaVersion: 1,
    id: randomUUID(),
    version: manifest.version,
    release: 'releases/' + randomUUID(),
    manifestSha256: await digestFile(join(bundle, 'manifest.json')),
    host: options.host,
    home,
    ...(project ? { project } : {}),
    ...(options.browser ? { browser: options.browser } : {}),
    skill: {
      path: skillPath,
      files: skillInventory(manifest),
    },
    launchers: [],
    profiles: [],
    windowsPathAdded: false,
  };
  const createdPrefix = !(await exists(prefix));
  const release = join(prefix, state.release);
  const plannedLaunchers = launcherFiles(prefix, release, manifest.runtimeExecutable);
  state.launchers = plannedLaunchers.map((launcher) => ({ path: launcher.path, sha256: digestText(launcher.content) }));
  const plannedProfiles: Array<ProfileBlock & { before: string; mode: number }> = [];
  for (const profile of planPathIntegration(home, prefix)) {
    await noLinks(profile.path);
    const created = !(await exists(profile.path));
    if (created && ['.bash_profile', '.bash_login'].includes(basename(profile.path))) continue;
    const before = created ? '' : await readFile(profile.path, 'utf8');
    if (before.includes(profile.block)) continue;
    const mode = created ? 0o644 : (await lstat(profile.path)).mode & 0o777;
    plannedProfiles.push({ ...profile, created, before, mode });
    state.profiles.push({ ...profile, created });
  }
  state.windowsPathAdded = process.platform === 'win32' && !(await windowsPath(prefix, 'contains'));
  const undo: Array<() => Promise<void>> = [];
  let journalOwned = false;
  try {
    options.signal?.throwIfAborted();
    await mkdir(prefix, { recursive: true, mode: 0o700 });
    await writeFile(
      join(prefix, 'pending.json'),
      JSON.stringify({ schemaVersion: 1, operation: 'setup', pid: process.pid, next: state }),
      { flag: 'wx', mode: 0o600 },
    );
    journalOwned = true;
    undo.push(() => rm(release, { recursive: true, force: true }));
    await atomicWrite(join(release, 'manifest.json'), await readFile(join(bundle, 'manifest.json'), 'utf8'));
    await copyInventory(bundle, release, manifest.files);
    await distributionAt(release);
    options.signal?.throwIfAborted();
    undo.push(() => rm(skillPath, { recursive: true, force: true }));
    await copyInventory(join(release, 'app/skills/bpmn-weave'), skillPath, state.skill.files);
    for (const launcher of plannedLaunchers) {
      options.signal?.throwIfAborted();
      if (await exists(launcher.path)) throw new Error('An unowned launcher already exists: ' + launcher.path);
      await atomicWrite(launcher.path, launcher.content, launcher.mode);
      undo.push(() => rm(launcher.path, { force: true }));
    }
    for (const profile of plannedProfiles) {
      options.signal?.throwIfAborted();
      const { created, before, mode } = profile;
      const after = before + profile.block;
      await atomicWrite(profile.path, after, mode);
      undo.push(async () => {
        if ((await digestFile(profile.path)) === digestText(after)) {
          if (created) await rm(profile.path);
          else await atomicWrite(profile.path, before, mode);
        }
      });
    }
    if (state.windowsPathAdded) {
      undo.push(async () => {
        await windowsPath(prefix, 'remove');
      });
      await windowsPath(prefix, 'add');
    }
    options.signal?.throwIfAborted();
    await atomicWrite(join(prefix, 'installation.json'), JSON.stringify(state, null, 2) + '\n');
    await rm(join(prefix, 'pending.json'));
  } catch (error) {
    if (!journalOwned) throw error;
    const failures: string[] = [];
    for (const rollback of undo.reverse()) await rollback().catch(() => failures.push('rollback'));
    if (failures.length)
      throw new Error(
        'Setup was interrupted and recovery could not finish. Preserve the installation and run setup --recover with the same prefix.',
      );
    await rm(join(prefix, 'pending.json'), { force: true });
    if (createdPrefix) await removeEmpty(prefix).catch(() => {});
    throw error;
  }
  const verification = await example(prefix, state, options.browser, options.output);
  return setupReport(prefix, state, verification);
}

function setupReport(
  prefix: string,
  state: InstallationState,
  verification: { checks: Check[]; artifacts: string[] },
  repeated = false,
): ManagementResult {
  const checks: Check[] = [
    {
      name: 'installation',
      status: 'pass',
      message: 'Verified CLI, private runtime, and matching Modeling Skill installed.',
    },
    ...verification.checks,
    {
      name: 'host-session',
      status: 'not_verified',
      message: 'Skill registration is installed; discovery by an actual Host Agent session has not been verified.',
    },
  ];
  return {
    schemaVersion: 1,
    operation: 'setup',
    status: checks.some((check) => check.status === 'fail') ? 'incomplete' : 'ready',
    message: repeated
      ? 'The identical installation was left unchanged. Existing outputs were preserved; verification used a fresh temporary example.'
      : 'Local installation completed. Actual Host Agent discovery and release qualification remain separate.',
    prefix,
    version: state.version,
    checks,
    artifacts: verification.artifacts,
    nextSteps: [
      'Open a new login shell and restart the selected Host Agent so it can discover the skill and command.',
      'In your agent, ask: Use bpmn-weave to help me describe and review our invoice approval process.',
      'Run bpmn-weave-manage doctor to check local installation health.',
    ],
  };
}

export async function verifyInstalled(prefix: string, state: InstallationState): Promise<void> {
  const release = join(prefix, state.release);
  if ((await digestFile(join(release, 'manifest.json'))) !== state.manifestSha256)
    throw new Error(
      'Installed distribution manifest changed. Preserve modified files and restore a verified distribution.',
    );
  await distributionAt(release);
  await verifyFiles(state.skill.path, state.skill.files);
  for (const launcher of state.launchers) {
    await noLinks(launcher.path);
    if ((await digestFile(launcher.path)) !== launcher.sha256)
      throw new Error('Installed launcher was modified: ' + launcher.path);
    if (process.platform !== 'win32')
      await access(launcher.path, constants.X_OK).catch(() => {
        throw new Error('Installed launcher is not executable. Restore its execute permission: ' + launcher.path);
      });
  }
}

export async function doctor(options: ManagementOptions): Promise<ManagementResult> {
  const prefix = await destination(options.prefix);
  if (await exists(join(prefix, 'pending.json')))
    throw new Error(
      'An interrupted installation operation needs recovery. Run setup --recover --prefix with the same installation directory.',
    );
  const state = await readState(prefix);
  const checks: Check[] = [];
  let verified = false;
  try {
    await verifyInstalled(prefix, state);
    checks.push({
      name: 'installation',
      status: 'pass',
      message: `CLI ${state.version}, canonical skill, private runtime, assets, and launchers match the recorded distribution.`,
    });
    verified = true;
  } catch (error) {
    checks.push({
      name: 'installation',
      status: 'fail',
      message: error instanceof Error ? error.message : 'Installation integrity check failed.',
    });
  }
  const binary = process.platform === 'win32' ? 'bpmn-weave.cmd' : 'bpmn-weave';
  let resolved: string | undefined;
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(isAbsolute)) {
    const candidate = join(directory, binary);
    if (await exists(candidate)) {
      resolved = resolve(candidate);
      break;
    }
  }
  checks.push({
    name: 'shell-path',
    status: resolved === join(prefix, 'bin', binary) ? 'pass' : 'fail',
    message:
      resolved === join(prefix, 'bin', binary)
        ? 'This shell resolves bpmn-weave to the managed launcher.'
        : 'This shell does not resolve the managed launcher first. Open a new login shell, restart the Host Agent, or invoke the launcher at ' +
          join(prefix, 'bin', binary) +
          '.',
  });
  const shadows = await shadowedSkills(state.host, state.home, state.project, process.cwd());
  checks.push({
    name: 'skill-registration',
    status: shadows.length ? 'fail' : 'pass',
    message: shadows.length
      ? 'Competing skill registrations: ' + shadows.join(', ')
      : 'Canonical skill installed at ' + state.skill.path,
  });
  if (verified) {
    const temporary = await mkdtemp(join(await destination(tmpdir()), 'bpmn-weave-doctor-'));
    try {
      const tested = await example(prefix, state, options.browser ?? state.browser, temporary);
      checks.push(...tested.checks);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }
  checks.push({
    name: 'host-session',
    status: 'not_verified',
    message:
      'An actual Host Agent session has not been observed by this local diagnostic. Refresh the host and invoke the skill to verify discovery.',
  });
  const failed = checks.some((check) => check.status === 'fail');
  return {
    schemaVersion: 1,
    operation: 'doctor',
    status: failed ? 'incomplete' : 'ready',
    prefix,
    version: state.version,
    message: failed
      ? 'Local installation needs attention.'
      : 'Requested local installation checks passed; actual Host Agent discovery and release qualification remain separate.',
    checks,
    nextSteps: failed
      ? ['Resolve the failed checks and rerun bpmn-weave-manage doctor.']
      : ['Ask the selected Host Agent to use bpmn-weave to model a process.'],
  };
}
