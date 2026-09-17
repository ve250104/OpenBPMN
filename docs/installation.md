# Installation

BPMN Weave is an unqualified development build (`0.1.0-dev.0`), not a published v0.1.0. These instructions use an explicitly supplied, extracted platform candidate. No release download URL or registry package is implied. See [support status](support.md) before relying on a platform or host.

## Primary setup

Have your chosen Codex CLI, Claude Code, or GitHub Copilot CLI already installed and authenticated, and install Chrome or Edge yourself. The platform bundle supplies a private Node 24 runtime, compiled CLI, production dependencies, assets, and the matching Modeling Skill. It needs no system Node/npm, source checkout, compiler, administrator privileges, or browser download.

Check the candidate's published hashes and extract the bundle for your operating system and architecture. From that extracted directory, choose your existing host (`codex`, `claude`, or `copilot`). For example, on macOS/Linux:

```sh
./setup.sh --host codex --prefix "$HOME/.local/share/bpmn-weave" --output "$HOME/bpmn-weave-example"
```

On Windows, from PowerShell:

```powershell
./setup.ps1 --host codex --prefix "$env:LOCALAPPDATA/BPMNWeave" --output "$env:USERPROFILE/bpmn-weave-example"
```

Setup shows its owned installation and skill locations. It installs the matched runtime/CLI/skill, checks the browser, and generates `example.bpmn`, `example.svg`, and `example.quality.json` in the chosen output directory. Existing output files are not overwritten. Omit `--output` to use a fresh temporary directory whose path is reported. Missing prerequisites leave a clear incomplete result with remediation, not a false readiness claim.

Rerunning setup with the identical candidate leaves the installation and existing outputs unchanged and verifies a fresh temporary example. A different candidate requires explicit `update`. To recover a reported interrupted operation, invoke the downloaded bundle's setup with `--recover --prefix` and the original installation directory. Recovery refuses to compete with a still-running operation and reports any modified files it preserves.

On POSIX shells, disclosed PATH blocks preserve existing profile contents. Setup may create `.profile`, `.bashrc`, and `.zshenv`; it updates `.bash_profile` or `.bash_login` only when they already exist, preserving Bash's startup-file precedence. Uninstall removes only the owned integration. POSIX installation prefixes containing a colon cannot be represented in PATH and are refused with remediation.

Use `--project /absolute/project/path` to select a supported project-local skill location explicitly. The application still lives in the selected prefix; the project is not a process workspace. Setup refuses ambiguous or conflicting registrations rather than deleting unrelated files. Unattended setup uses `--non-interactive` with explicit choices; `--json` selects machine-readable management output.

Close and reopen your command shell and refresh or restart the selected agent session when setup instructs you. Run the printed full path to `bpmn-weave-manage doctor` if command discovery is uncertain. On the POSIX prefix above:

```sh
"$HOME/.local/share/bpmn-weave/bin/bpmn-weave-manage" doctor --prefix "$HOME/.local/share/bpmn-weave"
```

Local checks and a generated example establish local installation behavior only. Doctor reports actual host discovery separately as unverified unless established through a real host session; a skill folder alone does not prove the agent loaded it. In your refreshed agent, ask:

> Use BPMN Weave to document our purchase approval process. Operations checks requests; the budget owner approves or rejects them. Show me the diagram and ask about any consequential gaps.

The agent should use the installed skill, generate real artifacts, and present their paths and preview. If it cannot discover the skill or launch the CLI, use [troubleshooting](troubleshooting.md). Required real-host acceptance remains separate from this local setup check.

## Check, update, or remove an installation

`bpmn-weave-manage` handles installation state; `bpmn-weave` handles process artifacts. Management results are separate from the Core's JSON envelope.

```sh
bpmn-weave-manage doctor --prefix "$HOME/.local/share/bpmn-weave"
bpmn-weave-manage update --prefix "$HOME/.local/share/bpmn-weave" --bundle /absolute/path/to/extracted-candidate
bpmn-weave-manage uninstall --prefix "$HOME/.local/share/bpmn-weave"
```

Use the corresponding Windows prefix or the full launcher path printed by setup. Updates require an explicitly downloaded/extracted candidate and verify its inventory before activation. There is no background update check. Runtime, application, and skill move together; handled update failures preserve the prior runnable pair. An interrupted installation is reported for recovery, not described as power-loss atomic.

Doctor runs offline. Normal modeling commands never install dependencies or update the product. Installation metadata records owned paths, hashes, versions, and host registrations only; it stores no interview content or session state. Uninstall preserves models, Handoffs, unrelated files, and modified files it cannot safely identify as owned. Read the reported retained paths rather than assuming every file was removed.

## Browser selection

Generation and rendering require installed Chrome or Edge; validation and capability inspection do not. `--browser-executable` selects an absolute local executable path when discovery fails. Use the same selection for setup/doctor and the relevant Core commands. The browser runs headlessly in a fresh temporary profile, not your browsing session. It is not bundled or silently installed.

## Advanced npm and contributor paths

The primary bundle avoids system Node and npm dependency resolution. Contributors can [build from source](https://github.com/ve250104/OpenBPMN/blob/main/CONTRIBUTING.md); advanced users can explicitly install the matching packed npm archive with Node 24.x, then install the canonical skill folder for their host. These routes remain subject to their own installed-artifact checks and are not a substitute for platform qualification.

```sh
npm install --global ./ve250104-bpmn-weave-0.1.0-dev.0.tgz --ignore-scripts
bpmn-weave capabilities --human
```

The archive must exist locally; do not assume the development version is published on npm. Verify Node 24 inside the agent's own shell on this secondary route. A login shell can select a different system Node. The primary bundle's launcher uses its private runtime instead.

| Host | Personal skill location | Project skill location |
| --- | --- | --- |
| Codex CLI | `~/.agents/skills/bpmn-weave/` | `.agents/skills/bpmn-weave/` |
| Claude Code | `~/.claude/skills/bpmn-weave/` | `.claude/skills/bpmn-weave/` |
| GitHub Copilot CLI | `~/.copilot/skills/bpmn-weave/` | `.github/skills/bpmn-weave/` |

The same canonical skill bytes belong to the same CLI version. Preserve existing skills and resolve conflicts explicitly; installing a skill does not grant filesystem, network, or account authority to the agent.
