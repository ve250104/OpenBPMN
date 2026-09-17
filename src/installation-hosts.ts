import { lstat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, win32 } from 'node:path';

export type Host = 'codex' | 'claude' | 'copilot';

const locations: Record<Host, { personal: string; project: string }> = {
  codex: { personal: '.agents', project: '.agents' },
  claude: { personal: '.claude', project: '.claude' },
  copilot: { personal: '.copilot', project: '.github' },
};

export function skillDirectory(host: Host, home: string, project?: string): string {
  return join(resolve(project ?? home), locations[host][project ? 'project' : 'personal'], 'skills', 'openbpmn');
}

/** Inspect known discovery locations only; never recursively search a user's files. */
export async function shadowedSkills(
  host: Host,
  home: string,
  project: string | undefined,
  cwd: string,
): Promise<string[]> {
  const selected = skillDirectory(host, home, project);
  const candidates = new Set([skillDirectory(host, home)]);
  for (const start of new Set([resolve(cwd), ...(project ? [resolve(project)] : [])])) {
    let directory = start;
    while (true) {
      candidates.add(skillDirectory(host, home, directory));
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  const identity = (path: string) => (process.platform === 'win32' ? path.toLowerCase() : path);
  const competing: string[] = [];
  for (const candidate of candidates) {
    if (identity(candidate) === identity(selected)) continue;
    try {
      await lstat(candidate);
      competing.push(candidate);
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
  }
  return competing.sort();
}

function singleLine(value: string): string {
  if (/[\r\n\0]/.test(value)) throw new Error('Installation paths cannot contain newlines or NUL.');
  return value;
}

const sh = (value: string) => `'${singleLine(value).replaceAll("'", "'\\''")}'`;
const ps = (value: string) => `'${singleLine(value).replaceAll("'", "''")}'`;
const cmd = (value: string) => {
  if (singleLine(value).includes('"')) throw new Error('Windows installation paths cannot contain double quotes.');
  return value.replaceAll('%', '%%');
};

export function launcherFiles(
  prefix: string,
  releaseDir: string,
  runtimeExecutable: string,
  platform: NodeJS.Platform = process.platform,
): Array<{ path: string; content: string; mode: number }> {
  const path = platform === 'win32' ? win32 : { join, dirname, isAbsolute };
  const bin = path.join(prefix, 'bin');
  const runtime = path.isAbsolute(runtimeExecutable) ? runtimeExecutable : path.join(releaseDir, runtimeExecutable);
  const runtimeDirectory = path.dirname(runtime);
  return ['openbpmn', 'openbpmn-manage'].flatMap((name) => {
    const management = name === 'openbpmn-manage';
    const entry = path.join(releaseDir, 'app', 'dist', management ? 'manage.js' : 'cli.js');
    if (platform !== 'win32') {
      return [
        {
          path: path.join(bin, name),
          mode: 0o755,
          content: `#!/bin/sh\nunset NODE_OPTIONS NODE_PATH\nPATH=${sh(runtimeDirectory)}:${sh(bin)}:"\${PATH-}"\nexport PATH\nexec ${sh(runtime)} ${sh(entry)}${management ? ` --prefix ${sh(prefix)}` : ''} "$@"\n`,
        },
      ];
    }
    const fixed = management ? ` --prefix "${cmd(prefix)}"` : '';
    const psFixed = management ? ` '--prefix' ${ps(prefix)}` : '';
    return [
      {
        path: path.join(bin, name + '.cmd'),
        mode: 0o755,
        content: `@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "NODE_OPTIONS="\r\nset "NODE_PATH="\r\nset "PATH=${cmd(runtimeDirectory)};${cmd(bin)};%PATH%"\r\n"${cmd(runtime)}" "${cmd(entry)}"${fixed} %*\r\nexit /b %errorlevel%\r\n`,
      },
      {
        path: path.join(bin, name + '.ps1'),
        mode: 0o755,
        content: `$openbpmnOldPath = $env:PATH\n$openbpmnOldNodeOptions = $env:NODE_OPTIONS\n$openbpmnOldNodePath = $env:NODE_PATH\n$openbpmnOldErrorAction = $ErrorActionPreference\n$openbpmnExit = 1\ntry {\n  $ErrorActionPreference = 'Stop'\n  $env:NODE_OPTIONS = $null\n  $env:NODE_PATH = $null\n  $env:PATH = ${ps(runtimeDirectory + ';' + bin + ';')} + $openbpmnOldPath\n  & ${ps(runtime)} ${ps(entry)}${psFixed} @args\n  $openbpmnExit = $LASTEXITCODE\n} finally {\n  $env:PATH = $openbpmnOldPath\n  $env:NODE_OPTIONS = $openbpmnOldNodeOptions\n  $env:NODE_PATH = $openbpmnOldNodePath\n  $ErrorActionPreference = $openbpmnOldErrorAction\n}\nexit $openbpmnExit\n`,
      },
    ];
  });
}

/** Plans owned POSIX shell blocks; the installer owns collision checks and writes. */
export function planPathIntegration(home: string, prefix: string): Array<{ path: string; block: string }> {
  if (process.platform === 'win32') return [];
  const bin = join(prefix, 'bin');
  if (bin.includes(':')) throw new Error('POSIX PATH integration cannot represent a colon in the installation path.');
  const marker = singleLine(prefix);
  const block = `\n# >>> OpenBPMN ${marker} >>>\ncase ":\${PATH-}:" in\n  *${sh(':' + bin + ':')}*) ;;\n  *) export PATH=${sh(bin)}:"\${PATH-}" ;;\nesac\n# <<< OpenBPMN ${marker} <<<\n`;
  return ['.profile', '.bash_profile', '.bash_login', '.bashrc', '.zshenv'].map((name) => ({
    path: join(home, name),
    block,
  }));
}
