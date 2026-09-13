# Command reference

`bpmn-weave --help` is the authoritative syntax/flag reference. Commands are non-interactive and default to one JSON envelope on stdout. `--human` selects a concise summary; `--debug` adds payload-minimized technical diagnostics to stderr.

```sh
bpmn-weave capabilities
bpmn-weave generate --input request.json --output purchase
bpmn-weave generate --input request.json --output purchase --export snapshot
bpmn-weave generate --input request.json --output purchase --replace --handoff purchase.openbpmn.json
bpmn-weave validate --input purchase.bpmn
bpmn-weave render --input purchase.bpmn --output purchase-preview.svg
```

Generation input is complete Structured Process Evidence or a Handoff; `--input -` reads UTF-8 JSON from stdin. Output is a stem, and the directory must already exist. A requested Handoff joins the bundle transaction at a distinct sibling path. The packaged [schemas](../schemas/) and repository [structured contract](https://github.com/ve250104/OpenBPMN/blob/wip/v0-implementation/docs/contracts.md) define every accepted field, limit, signal, check, and export outcome.

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
