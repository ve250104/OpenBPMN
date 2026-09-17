import { createReadStream } from 'node:fs';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  writeFile,
} from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

export interface InventoryFile {
  path: string;
  sha256: string;
  bytes: number;
  mode?: number;
}

export interface Distribution {
  schemaVersion: 1;
  version: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  runtimeExecutable: string;
  files: InventoryFile[];
}

export function skillInventory(manifest: Distribution): InventoryFile[] {
  const prefix = 'app/skills/openbpmn/';
  return manifest.files
    .filter((file) => file.path.startsWith(prefix))
    .map((file) => ({ ...file, path: file.path.slice(prefix.length) }));
}

export function inventoryPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.length > 0 &&
    !path.includes('\\') &&
    !path.includes(':') &&
    [...path].every((character) => character.charCodeAt(0) > 31) &&
    path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

export async function distributionAt(directory: string): Promise<Distribution> {
  await noLinks(directory);
  const text = await readFile(join(directory, 'manifest.json'), 'utf8').catch(() => {
    throw new Error('Distribution manifest could not be read. Select an extracted OpenBPMN platform archive.');
  });
  const manifest = JSON.parse(text) as Distribution;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.files.length)
    throw new Error('Unsupported distribution manifest. Download a complete platform archive.');
  if (
    manifest.files.some(
      (file) =>
        !inventoryPath(file.path) ||
        !/^[a-f0-9]{64}$/.test(file.sha256) ||
        !Number.isSafeInteger(file.bytes) ||
        file.bytes < 0,
    )
  )
    throw new Error('Unsafe distribution inventory. Download the original platform archive again.');
  if (
    manifest.platform !== process.platform ||
    manifest.arch !== process.arch ||
    !/^24\.\d+\.\d+$/.test(manifest.nodeVersion)
  )
    throw new Error(
      'Distribution platform or runtime does not match this computer. Download the correct platform archive.',
    );
  if (
    !/^[\w.+-]+$/.test(manifest.version) ||
    !['runtime/bin/node', 'runtime/node.exe'].includes(manifest.runtimeExecutable)
  )
    throw new Error('Unsafe distribution version or runtime executable.');
  const names = manifest.files.map((file) => file.path);
  if (new Set(names.map((name) => name.toLowerCase())).size !== names.length)
    throw new Error('Duplicate distribution inventory paths.');
  for (const required of [
    'app/package.json',
    'app/dist/cli.js',
    'app/dist/manage.js',
    'app/skills/openbpmn/version.json',
    manifest.runtimeExecutable,
  ])
    if (!names.includes(required)) throw new Error('Incomplete distribution inventory: ' + required);
  await verifyFiles(directory, manifest.files, ['manifest.json']);
  const pkg = JSON.parse(await readFile(join(directory, 'app/package.json'), 'utf8'));
  const skill = JSON.parse(await readFile(join(directory, 'app/skills/openbpmn/version.json'), 'utf8'));
  if (pkg.name !== '@ve250104/openbpmn' || pkg.version !== manifest.version || skill.toolVersion !== manifest.version)
    throw new Error('CLI and Modeling Skill versions do not match the distribution manifest.');
  return manifest;
}

export async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function noLinks(path: string): Promise<void> {
  let cursor = resolve(path);
  while (true) {
    if (await exists(cursor)) {
      const info = await lstat(cursor);
      if (info.isSymbolicLink()) throw new Error('Refusing a symbolic link in an installation path: ' + cursor);
    }
    const parent = dirname(cursor);
    if (parent === cursor) return;
    cursor = parent;
  }
}

// Resolve operating-system aliases (for example macOS /var) before creating a
// destination, but never follow a symlink at the selected destination itself.
export async function destination(path: string): Promise<string> {
  const absolute = resolve(path);
  if (await exists(absolute)) {
    if ((await lstat(absolute)).isSymbolicLink()) throw new Error('Refusing a symbolic-link destination: ' + absolute);
    return realpath(absolute);
  }
  const parent = dirname(absolute);
  return join(await destination(parent), absolute.slice(parent.length).replace(/^[/\\]/, ''));
}

export async function digestFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const data of createReadStream(path)) hash.update(data);
  return hash.digest('hex');
}
export const digestText = (text: string) => createHash('sha256').update(text).digest('hex');

export async function listFiles(directory: string, prefix = ''): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
      throw new Error('Refusing non-ordinary installation file: ' + name);
    if (entry.isDirectory()) result.push(...(await listFiles(join(directory, entry.name), name + '/')));
    else result.push(name);
  }
  return result.sort();
}

export async function verifyFiles(directory: string, files: InventoryFile[], extra: string[] = []): Promise<void> {
  await noLinks(directory);
  const expected = [...files.map((file) => file.path), ...extra].sort();
  if (JSON.stringify(await listFiles(directory)) !== JSON.stringify(expected))
    throw new Error('Installation contains missing or unowned files: ' + directory);
  for (const file of files) {
    const path = join(directory, file.path);
    const info = await lstat(path);
    if (!info.isFile() || info.size !== file.bytes || (await digestFile(path)) !== file.sha256)
      throw new Error('Installation file checksum differs: ' + file.path);
  }
}

export async function copyInventory(source: string, target: string, files: InventoryFile[]): Promise<void> {
  await noLinks(target);
  for (const file of files) {
    const output = join(target, file.path);
    await mkdir(dirname(output), { recursive: true, mode: 0o700 });
    await copyFile(join(source, file.path), output);
    await chmod(output, file.mode === undefined ? 0o644 : file.mode & 0o777);
  }
}

export async function atomicWrite(path: string, text: string, mode = 0o600): Promise<void> {
  await noLinks(path);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const pending = path + '.pending-' + randomUUID();
  try {
    await writeFile(pending, text, { flag: 'wx', mode });
    await rename(pending, path);
  } finally {
    await rm(pending, { force: true });
  }
}

export async function removeEmpty(directory: string): Promise<void> {
  if (!(await exists(directory))) return;
  for (const entry of await readdir(directory, { withFileTypes: true }))
    if (entry.isDirectory() && !entry.isSymbolicLink()) await removeEmpty(join(directory, entry.name));
  await rmdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST') throw error;
  });
}
