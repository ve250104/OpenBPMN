# Command reference

`bpmn-weave --help` is the authoritative syntax/flag reference for the four Core commands. They are non-interactive and default to one JSON envelope on stdout. `--human` selects a concise summary; `--debug` adds payload-minimized technical diagnostics to stderr.

```sh
bpmn-weave capabilities
bpmn-weave generate --input request.json --output purchase
bpmn-weave generate --input request.json --output purchase --export snapshot
bpmn-weave generate --input request.json --output purchase --replace --handoff purchase.openbpmn.json
bpmn-weave validate --input purchase.bpmn
bpmn-weave render --input purchase.bpmn --output purchase-preview.svg
```

Generation input is complete Structured Process Evidence or a Handoff; `--input -` reads UTF-8 JSON from stdin. Output is a stem, and the directory must already exist. A requested Handoff joins the bundle transaction at a distinct sibling path. The packaged [schemas](../schemas/) and repository [structured contract](https://github.com/ve250104/OpenBPMN/blob/main/docs/contracts.md) define every accepted field, limit, signal, check, and export outcome.

Validation changes nothing. Rendering reads the supplied DI and writes only the named SVG; it does not lay out, repair, or rewrite XML. Optional consumer-fit rules on validation are separate from core validity and actual tenant observations.

| Exit | Interpretation |
| --- | --- |
| 0 | Completed operation; inspect the signal to distinguish snapshot, clean export, validation, rendering, or capabilities. |
| 1 | Internal or dependency failure. |
| 2 | Model/profile limitation, validation findings, or an explicitly completed invalid expert export. |
| 3 | Invalid options, malformed input, or input bounds/safety refusal. |
| 4 | Filesystem access, collision, or output-safety refusal. |

An expert request uses `--export snapshot --expert-invalid` for that invocation only. It creates distinct `.invalid.bpmn`/`.invalid.quality.json` and optionally `.invalid.svg`; it never replaces normal output or means clean readiness. If Model Validity passes, the unnecessary expert flag is refused and a normal snapshot is available.

JSON results enumerate produced/preserved artifacts and individually assessed checks. A skipped check has a reason, not an implied pass. For interpretation and recovery, see [troubleshooting](troubleshooting.md).

## Installation management

The platform bundle supplies `bpmn-weave-manage`. The extracted `setup.sh` or `setup.ps1` bootstraps its private runtime; see [Installation](installation.md) for the primary route and current release status.

```sh
bpmn-weave-manage setup --bundle /absolute/extracted-candidate --host codex --prefix /absolute/install-prefix --output /absolute/example-directory
bpmn-weave-manage doctor --prefix /absolute/install-prefix
bpmn-weave-manage update --prefix /absolute/install-prefix --bundle /absolute/extracted-candidate
bpmn-weave-manage uninstall --prefix /absolute/install-prefix
```

Setup selects `codex`, `claude`, or `copilot`. `--project` selects the explicit project skill scope; `--browser-executable` selects the installed local browser. `--non-interactive` requires explicit choices instead of prompts. `--json` selects management output rather than a Core result envelope. The installed management launcher supplies its owned prefix; an explicit prefix identifies the installation when invoking the management entry point directly.

Management distinguishes `ready`, `incomplete`, `removed`, and `failed`. Per-check results distinguish `pass`, `fail`, and `not_verified`; actual host discovery is not inferred from filesystem placement. Failed requested checks return nonzero. Doctor is offline; update reads an explicitly supplied candidate and does not silently look for a newer release. Management never treats an installation check as release qualification or process approval.

Management JSON uses `schemaVersion: 1` with `operation`, `status`, `message`, `checks`, and `nextSteps`. Successful installation checks also identify `prefix` and `version`; `artifacts` lists example outputs, and `retained` lists paths intentionally preserved during cleanup. Exit 0 means the requested local operation completed, exit 1 means failed or incomplete checks, and exit 3 means invalid usage. A `removed` result can include retained modified or locked files: inspect that list. Human output is the default. `--help` prints usage rather than a management envelope.

Use `setup --recover`, `update --recover`, or `uninstall --recover` with the original prefix when an incomplete operation is reported. Recovery rolls an interrupted update back to its previous matched CLI and skill. The manager refuses unrelated flags and conflicting repeated prefixes instead of silently selecting another installation.
