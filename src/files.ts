import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, basename, resolve, join } from 'node:path';
import { OperationError } from './diagnostics.js';

interface Fingerprint {
  ino: number;
  dev: number;
  hash: string;
  mode: number;
}
export interface OutputPlan {
  directory: string;
  directoryIdentity: { dev: number; ino: number };
  paths: string[];
  originals: (Fingerprint | undefined)[];
  stage: string;
  locks: string[];
}
type FileIO = Pick<typeof fs, 'rename' | 'link' | 'unlink' | 'writeFile' | 'mkdir' | 'rm'>;

async function assertDirectory(plan: OutputPlan): Promise<void> {
  const current = await fs.lstat(plan.directory);
  if (
    !current.isDirectory() ||
    current.isSymbolicLink() ||
    (await fs.realpath(plan.directory)) !== plan.directory ||
    current.dev !== plan.directoryIdentity.dev ||
    current.ino !== plan.directoryIdentity.ino
  ) {
    throw new OperationError(
      'FS_PATH',
      'filesystem',
      'The authorized output directory changed. No writes through the changed path are permitted.',
      4,
      'refused',
    );
  }
}

async function fingerprint(path: string): Promise<Fingerprint | undefined> {
  try {
    const stat = await fs.lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new OperationError(
        'FS_PATH',
        'filesystem',
        'Output destinations must be ordinary files, never symbolic links or directories.',
        4,
        'refused',
      );
    }
    return {
      ino: stat.ino,
      dev: stat.dev,
      hash: createHash('sha256')
        .update(await fs.readFile(path))
        .digest('hex'),
      mode: stat.mode,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Only claim preservation after observing the same original file, not from the preflight intent. */
export async function preservedOutputs(plan: OutputPlan): Promise<string[]> {
  const paths: string[] = [];
  for (let index = 0; index < plan.paths.length; index++) {
    if (!plan.originals[index]) continue;
    try {
      const current = await fingerprint(plan.paths[index]!);
      if (current?.hash === plan.originals[index]!.hash && current?.mode === plan.originals[index]!.mode)
        paths.push(plan.paths[index]!);
    } catch {
      /* An inaccessible or changed target cannot be claimed as preserved. */
    }
  }
  return paths;
}

export async function prepareOutputs(
  destinations: string[],
  options: { replace?: boolean; inputPath?: string } = {},
): Promise<OutputPlan> {
  if (!destinations.length)
    throw new OperationError('FS_PATH', 'filesystem', 'At least one explicit output is required.', 4, 'refused');
  const paths = destinations.map((path) => resolve(path));
  const directory = dirname(paths[0]!);
  if (
    paths.some((path) => dirname(path) !== directory) ||
    new Set(paths.map((path) => path.toLowerCase())).size !== paths.length
  ) {
    throw new OperationError(
      'FS_PATH',
      'filesystem',
      'Outputs must be distinct siblings in one directory.',
      4,
      'refused',
    );
  }
  try {
    if ((await fs.realpath(directory)) !== directory)
      throw new OperationError(
        'FS_PATH',
        'filesystem',
        'Use a canonical output directory without symbolic-link redirection.',
        4,
        'refused',
      );
    const originals = await Promise.all(paths.map(fingerprint));
    const directoryStat = await fs.lstat(directory);
    if (!directoryStat.isDirectory())
      throw new OperationError(
        'FS_PATH',
        'filesystem',
        'The output parent is no longer an ordinary directory.',
        4,
        'refused',
      );
    if (originals.some(Boolean) && !options.replace) {
      throw new OperationError(
        'FS_COLLISION',
        'filesystem',
        'An output already exists. Choose a new name or explicitly authorize replacement.',
        4,
        'refused',
      );
    }
    if (options.inputPath) {
      const input = await fs.realpath(options.inputPath);
      const stat = await fs.stat(input);
      if (
        paths.some(
          (path, index) =>
            path.toLowerCase() === input.toLowerCase() ||
            (originals[index]?.ino === stat.ino && originals[index]?.dev === stat.dev),
        )
      ) {
        throw new OperationError(
          'FS_PATH',
          'filesystem',
          'An output aliases the input. Choose distinct destinations.',
          4,
          'refused',
        );
      }
    }
    const identity = createHash('sha256').update(paths[0]!.toLowerCase()).digest('hex').slice(0, 20);
    const stage = join(directory, '.openbpmn-' + identity + '.stage');
    const locks = paths
      .map((path) =>
        join(
          directory,
          '.openbpmn-' + createHash('sha256').update(path.toLowerCase()).digest('hex').slice(0, 20) + '.lock',
        ),
      )
      .sort();
    for (const pending of [stage, ...locks]) {
      try {
        await fs.lstat(pending);
        throw new OperationError(
          'FS_COLLISION',
          'filesystem',
          'An unfinished operation exists for these destinations. Inspect the named staging manifest and recover retained originals before retrying: ' +
            pending,
          4,
          'refused',
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    return {
      directory,
      directoryIdentity: { dev: directoryStat.dev, ino: directoryStat.ino },
      paths,
      originals,
      stage,
      locks,
    };
  } catch (error) {
    if (error instanceof OperationError) throw error;
    throw new OperationError(
      'FS_IO',
      'filesystem',
      'The output directory or input cannot be inspected. Ensure the directory exists and is accessible.',
      4,
    );
  }
}

export async function commitOutputs(
  plan: OutputPlan,
  contents: string[],
  io: FileIO = fs,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  if (contents.length !== plan.paths.length) throw new Error('Output content count must match the preflight plan.');
  let staging = false;
  let recoverable = false;
  const produced: { path: string; fingerprint: Fingerprint }[] = [];
  const backups: number[] = [];
  const originalHandles = new Map<number, fs.FileHandle>();
  const acquired: string[] = [];
  const manifest = JSON.stringify({
    outputs: plan.paths.map((path, index) => ({
      name: basename(path),
      staged: 'new-' + index,
      backup: 'old-' + index,
    })),
  });
  const changedTarget = () =>
    new OperationError(
      'FS_COLLISION',
      'filesystem',
      'An output changed after preflight. No replacement was authorized for the changed file.',
      4,
      'refused',
    );
  const checkCancellation = () => {
    if (options.signal?.aborted)
      throw new OperationError(
        'DEPENDENCY_FAILURE',
        'runtime',
        'The output operation was interrupted; previous artifacts were restored.',
      );
  };
  try {
    checkCancellation();
    await assertDirectory(plan);
    for (const lock of plan.locks) {
      await assertDirectory(plan);
      try {
        await io.mkdir(lock, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST')
          throw new OperationError(
            'FS_COLLISION',
            'filesystem',
            'An overlapping output operation exists. Inspect the named lock before retrying: ' + lock,
            4,
            'refused',
          );
        throw error;
      }
      acquired.push(lock);
    }
    await assertDirectory(plan);
    await io.mkdir(plan.stage, { mode: 0o700 });
    staging = true;
    for (const lock of acquired) {
      await assertDirectory(plan);
      await io.writeFile(join(lock, 'stage'), basename(plan.stage), { flag: 'wx', mode: 0o600 });
    }
    await assertDirectory(plan);
    await io.writeFile(join(plan.stage, 'manifest.json'), manifest, { flag: 'wx', mode: 0o600 });
    for (let index = 0; index < contents.length; index++) {
      checkCancellation();
      await assertDirectory(plan);
      await io.writeFile(join(plan.stage, 'new-' + index), contents[index]!, { flag: 'wx', mode: 0o600 });
    }
    await assertDirectory(plan);
    for (let index = 0; index < plan.paths.length; index++) {
      if (JSON.stringify(await fingerprint(plan.paths[index]!)) !== JSON.stringify(plan.originals[index])) {
        throw changedTarget();
      }
    }
    for (let index = 0; index < plan.paths.length; index++) {
      const path = plan.paths[index]!;
      checkCancellation();
      await assertDirectory(plan);
      if (JSON.stringify(await fingerprint(path)) !== JSON.stringify(plan.originals[index])) throw changedTarget();
      if (plan.originals[index]) {
        await io.rename(path, join(plan.stage, 'old-' + index));
        backups.push(index);
        if (
          JSON.stringify(await fingerprint(join(plan.stage, 'old-' + index))) !== JSON.stringify(plan.originals[index])
        )
          throw changedTarget();
        originalHandles.set(index, await fs.open(join(plan.stage, 'old-' + index), 'r'));
      }
      const stagedIdentity = (await fingerprint(join(plan.stage, 'new-' + index)))!;
      await io.link(join(plan.stage, 'new-' + index), path);
      produced.push({ path, fingerprint: stagedIdentity });
      if (JSON.stringify(await fingerprint(path)) !== JSON.stringify(stagedIdentity)) throw changedTarget();
      checkCancellation();
    }
    for (const output of produced)
      if (JSON.stringify(await fingerprint(output.path)) !== JSON.stringify(output.fingerprint)) throw changedTarget();
    try {
      await assertDirectory(plan);
      await io.rm(plan.stage, { recursive: true });
      staging = false;
      for (const lock of acquired) await io.rm(lock, { recursive: true });
      acquired.length = 0;
    } catch {
      throw new OperationError(
        'CLEANUP_FAILED',
        'filesystem',
        'Output cleanup failed. Inspect residual staging or locks at: ' + plan.stage,
        4,
      );
    }
  } catch (error) {
    if (staging || acquired.length) {
      try {
        await assertDirectory(plan);
      } catch {
        recoverable = true;
        throw new OperationError(
          'FS_PATH',
          'filesystem',
          'The output directory moved or was redirected. Automatic recovery stopped to avoid unrelated writes; inspect the original directory and its surviving staging files.',
          4,
          'refused',
        );
      }
    }
    // An unlink removes a filename, not an open original. Keep handles until all finalization has succeeded.
    // Reconstruct only missing private backups; never replace a concurrently created recovery path.
    for (const [index, handle] of originalHandles) {
      try {
        if (await fingerprint(join(plan.stage, 'old-' + index))) continue;
        try {
          await fs.lstat(plan.stage);
        } catch (missing) {
          if ((missing as NodeJS.ErrnoException).code !== 'ENOENT') throw missing;
          await io.mkdir(plan.stage, { mode: 0o700 });
          staging = true;
          await io.writeFile(join(plan.stage, 'manifest.json'), manifest, { flag: 'wx', mode: 0o600 });
        }
        await io.writeFile(join(plan.stage, 'old-' + index), await handle.readFile(), {
          flag: 'wx',
          mode: plan.originals[index]!.mode & 0o777,
        });
      } catch {
        recoverable = true;
      }
    }
    for (const output of produced.reverse()) {
      try {
        const index = plan.paths.indexOf(output.path);
        if (plan.originals[index] && !(await fingerprint(join(plan.stage, 'old-' + index)))) {
          recoverable = true;
          continue;
        }
        if (JSON.stringify(await fingerprint(output.path)) !== JSON.stringify(output.fingerprint)) {
          recoverable = true;
        } else await io.unlink(output.path);
      } catch {
        recoverable = true;
      }
    }
    for (const index of backups.reverse()) {
      try {
        await io.link(join(plan.stage, 'old-' + index), plan.paths[index]!);
      } catch {
        recoverable = true;
      }
    }
    if (recoverable) {
      throw new OperationError(
        'CLEANUP_FAILED',
        'filesystem',
        'Automatic rollback could not finish; do not treat the destinations as a complete bundle. Inspect destinations and any surviving recovery files at ' +
          plan.stage +
          '. Recovery files may be incomplete; do not delete them.',
        4,
      );
    }
    if (error instanceof OperationError) throw error;
    throw new OperationError('FS_IO', 'filesystem', 'The output operation failed; no new bundle was committed.', 4);
  } finally {
    await Promise.allSettled([...originalHandles.values()].map((handle) => handle.close()));
    if (!recoverable) {
      try {
        if (staging || acquired.length) await assertDirectory(plan);
        if (staging) await io.rm(plan.stage, { recursive: true });
        for (const lock of acquired) await io.rm(lock, { recursive: true });
      } catch {
        // biome-ignore lint/correctness/noUnsafeFinally: Unresolved recovery files must supersede the initial failure so a retry cannot hide unsafe filesystem state.
        throw new OperationError(
          'CLEANUP_FAILED',
          'filesystem',
          'Staging cleanup failed. Inspect the named target staging directory before retrying: ' + plan.stage,
          4,
        );
      }
    }
  }
}
