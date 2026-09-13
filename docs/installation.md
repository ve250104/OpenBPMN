# Installation

There is no published/qualified v0.1.0 yet. Use a locally built development archive; do not assume the planned npm package exists on the registry.

## CLI

Install Node.js 24.x and npm. Install Chrome or Edge yourself for generation/rendering. The package contains no browser, automatic browser downloader, native build toolchain, database, or hosted service. `validate` and `capabilities` are browser-independent.

From a source checkout:

```sh
npm ci --ignore-scripts
npm run build
npm pack --ignore-scripts
```

Install that exact generated archive in an isolated project or globally, according to your preference:

```sh
npm install --global ./ve250104-bpmn-weave-0.1.0-dev.0.tgz --ignore-scripts
bpmn-weave capabilities --json
```

For a project-local installation, omit `--global` and run `./node_modules/.bin/bpmn-weave` (Windows: `node_modules\.bin\bpmn-weave.cmd`). Ordinary modeling does not run `npx` or fetch a tool implicitly. Explicit npm installation may download runtime dependencies; runtime commands are separately qualified for offline use.

Verify `node --version` and `bpmn-weave capabilities` inside the agent's command shell, not just the terminal that started it. A login shell can reorder PATH and select another installed Node version. On macOS/Linux, an invocation-local override can select your existing Node 24 installation without changing global settings:

```sh
env PATH="/absolute/path/to/node-24/bin:$PATH" bpmn-weave capabilities
```

Replace the placeholder with the directory containing your actual Node 24 executable; use the same prefix for subsequent CLI commands if needed. This does not install Node or qualify an unsupported version.

`--browser-executable` accepts an absolute local executable path and takes precedence over discovery. macOS discovery checks Chrome/Edge applications; Linux checks documented executables on PATH; Windows checks local installed Chrome/Edge locations. Use `capabilities` to inspect the resolved path before modeling. A browser failure leaves the previous bundle intact.

## Portable modeling skill

After building, `skills/bpmn-weave/` is self-contained. Copy that one folder to the native skill directory of your selected CLI host, or extract the matching skill ZIP when available. Start/refresh the host session afterward.

| Host | Personal location | Project location |
| --- | --- | --- |
| Codex CLI | `~/.agents/skills/bpmn-weave/` | `.agents/skills/bpmn-weave/` |
| Claude Code | `~/.claude/skills/bpmn-weave/` | `.claude/skills/bpmn-weave/` |
| GitHub Copilot CLI | `~/.copilot/skills/bpmn-weave/` | `.github/skills/bpmn-weave/` |

For example, from the checkout, explicitly selecting Codex’s personal location:

```sh
skill_target="$HOME/.agents/skills/bpmn-weave"
test ! -e "$skill_target" && mkdir -p "$HOME/.agents/skills" && cp -R skills/bpmn-weave "$skill_target"
```

PowerShell equivalent:

```powershell
$skillTarget = Join-Path $HOME '.agents/skills/bpmn-weave'
if (Test-Path $skillTarget) { throw 'The named skill already exists; inspect it before an authorized upgrade.' }
New-Item -ItemType Directory -Force (Split-Path $skillTarget) | Out-Null
Copy-Item -Recurse -LiteralPath 'skills/bpmn-weave' -Destination $skillTarget
```

Select the corresponding directory for another host; the skill bytes are identical. Copying the skill is setup, not a new process workspace. Upgrade the matching CLI and named skill together, with explicit replacement authority. The package never rewrites unrelated host instructions or grants itself permissions.

These are the [selected host discovery routes](https://github.com/ve250104/OpenBPMN/blob/wip/v0-implementation/docs/release-plan.md#portable-modeling-skill-and-supported-host-agents), not a claim that every host/platform has passed acceptance. See [support status](support.md) before relying on a surface.
