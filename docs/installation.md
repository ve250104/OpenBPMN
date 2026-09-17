# Installation

OpenBPMN `0.1.0-dev.0` is a prerelease with no public release download yet. These instructions apply to a supplied platform bundle. Check [support status](support.md) before relying on a platform or host.

## Set up

Have Codex CLI, Claude Code, or GitHub Copilot CLI installed and signed in, plus Chrome or Edge for diagram previews. The OpenBPMN bundle includes its own runtime and matching modeling skill. It does not install an agent or browser and needs no separate Node/npm installation or administrator privileges.

Verify the supplied archive's checksum and extract the bundle for your operating system and architecture. From the extracted directory, choose your host: `codex`, `claude`, or `copilot`.

On macOS or Linux:

```sh
./setup.sh --host codex --prefix "$HOME/.local/share/openbpmn" --output "$HOME/openbpmn-example"
```

On Windows, from PowerShell:

```powershell
./setup.ps1 --host codex --prefix "$env:LOCALAPPDATA/OpenBPMN" --output "$env:USERPROFILE/openbpmn-example"
```

Setup reports its installation and skill locations, checks prerequisites, and generates `example.bpmn`, `example.svg`, and `example.quality.json`. It does not overwrite existing output files. Omit `--output` to use a new temporary directory whose path is printed. An incomplete result explains what needs attention.

Close and reopen your shell, then refresh or restart the selected agent session. Ask:

> Use OpenBPMN to document our purchase approval process. Operations checks requests; the budget owner approves or rejects them. Show me the diagram and ask about any consequential gaps.

The agent should load the skill, generate files, and show their paths and preview. A successful local setup does not prove that a running agent has discovered the skill. See [troubleshooting](troubleshooting.md) if it cannot find the skill or command.

## Moving from an older preview

Before installing this preview over an older preview, finish or recover any pending operation with that version's original bundle or manager, then uninstall it using that same version. Keep your process files and Handoffs. Use a fresh setup for the new preview; automatic updates across changed installation identities are not supported. Do not run both previews against the same output files.

## Check, update, or uninstall

```sh
openbpmn-manage doctor
openbpmn-manage update --bundle /absolute/path/to/extracted-bundle
openbpmn-manage uninstall
```

The installed launcher remembers its installation directory. If command discovery fails, use the full launcher path printed by setup. For the macOS/Linux location above:

```sh
"$HOME/.local/share/openbpmn/bin/openbpmn-manage" doctor
```

Doctor checks the local installation and browser without downloading anything. Updates use a separately obtained, verified bundle; there is no automatic update check. The runtime, CLI, and skill are updated together. Handled update failures preserve the previous runnable installation.

Uninstall preserves models, Handoffs, unrelated files, and modified installation files it cannot safely remove. Review any retained paths in its output.

Rerunning setup with the same bundle preserves the installation and verifies a new temporary example. A different bundle requires `update`. For an interrupted operation, follow the reported recovery command using the original installation directory; recovery does not compete with a still-running operation.

## Browser and skill locations

Generation and rendering need Chrome or Edge; validation and capability inspection do not. Pass `--browser-executable /absolute/path/to/browser` when automatic discovery fails. The browser runs headlessly in a fresh temporary profile, separate from your browsing session.

| Host | Personal skill location | Project skill location |
| --- | --- | --- |
| Codex CLI | `~/.agents/skills/openbpmn/` | `.agents/skills/openbpmn/` |
| Claude Code | `~/.claude/skills/openbpmn/` | `.claude/skills/openbpmn/` |
| GitHub Copilot CLI | `~/.copilot/skills/openbpmn/` | `.github/skills/openbpmn/` |

Use `--project /absolute/project/path` during setup for a project-local skill. The application remains in its installation directory. Conflicting registrations are reported and preserved for you to resolve.

On macOS/Linux, setup adds a marked PATH block while preserving existing shell settings. It may create `.profile`, `.bashrc`, and `.zshenv`; it changes `.bash_profile` or `.bash_login` only if they already exist. Installation paths containing a colon are refused. Uninstall removes only the integration it owns.

For scripted use, `--non-interactive` requires explicit choices and `--json` selects structured output. See the [command reference](commands.md) for management options and [data and file safety](https://github.com/ve250104/OpenBPMN/blob/main/docs/local-trust-and-file-safety.md) for the installation boundary.
