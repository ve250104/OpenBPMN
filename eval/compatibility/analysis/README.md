# Celonis Analysis qualification pack

These four MIT-licensed authored synthetic cases contain no private interview or event data. `manifest.json` records the independently specified activity names and control-flow edges. They qualify only the conservative `celonis-analysis-conformance` envelope, not Celonis Process Management, current-cloud functionality, eBPMN, or actual conformance calculations.

| Fixture | Intended observation |
| --- | --- |
| `straight-through` | Register, review, and complete in order. |
| `xor` | Review then choose exactly one approved/rejected route. |
| `and` | Run both checks and join before completion. |
| `rework` | Clarify missing information and return to review; complete information exits. |

The fixtures intentionally omit pools/lanes and rich data/documentation constructs. Their ownership advisories are expected for this explicitly selected small control-flow view, not evidence of real process discovery. Conditional branch text remains in BPMN and in the preview; no downstream expression-execution claim follows.

## Reproduce a candidate pack

Use the distributed candidate with Node 24 and its documented installed-browser prerequisite. Create a new empty destination directory, then run each fixture; do not add `--replace` unless you intend to replace those exact generated files.

```sh
bpmn-weave generate --input eval/compatibility/analysis/straight-through.json --output <new-directory>/straight-through
bpmn-weave generate --input eval/compatibility/analysis/xor.json --output <new-directory>/xor
bpmn-weave generate --input eval/compatibility/analysis/and.json --output <new-directory>/and
bpmn-weave generate --input eval/compatibility/analysis/rework.json --output <new-directory>/rework
bpmn-weave validate --input <new-directory>/straight-through.bpmn --compatibility celonis-analysis-conformance
```

Repeat the named validation for every BPMN. Preserve each actual generated BPMN, SVG, Quality Report, JSON validation result, source fixture, and manifest together. Record candidate commit **and package hash**, tool/Node/browser/OS versions, command, and SHA-256 of every artifact. `test/compatibility.test.ts` independently compares generated activity names and Sequence Flow endpoints with the manifest. The release run must additionally preserve condition/default wording and inspect every SVG label/marker/connector.

On 2026-09-08 the development checkout generated all four complete bundles through the real CLI into ignored `.artifacts/compatibility/analysis/`; all four returned `clean_export_ready`. Node was 24.14.0; Chrome was 152.0.7977.76. This was an **uncommitted development smoke run**, not the final distributed-candidate qualification. Its artifact hashes are in `development-observation.json`. Regenerate and record final hashes after the candidate is fixed; do not relabel this smoke run as release evidence.

## Authorized tenant observation

No tenant import has been performed. If the owner explicitly authorizes a test, identify the exact Analysis/Conformance surface and version, then import each generated BPMN as a new disposable model. Do not overwrite a user's model. Record import options and visible warnings; compare every activity name, start/end, route, gateway direction, and rework path against the manifest and original preview. A successful upload alone does not demonstrate preservation.

If re-export is available, save the unmodified export and hash it. Compare types, routes, names, conditions/defaults, and complete visible DI. Allow namespace-prefix and serialization-order differences, documented defaults, and consistent ID renaming with an explicit element correspondence. Record every lost/changed construct and any vendor-added content. Do not manually repair the imported model before measuring preservation.

Record import, visual preservation, semantic preservation, and round trip separately. An unavailable operation stays `not_run`; a lossy import cannot become `verified` because the UI accepted it. Event-data dictionary matching and launching conformance analysis require separate explicit scope and suitable synthetic event data. Follow the tenant owner's cleanup instructions after the observation.

Rich Signavio Process Manager and Celonis Process Management qualification use the eight composition cases from the complete-profile release corpus, not these four narrowed fixtures. The [acceptance contract](../../../docs/acceptance-and-compatibility.md) defines those required packs and the [source note](../../../docs/research/compatibility-rule-sources.md) explains product/version and support limitations.
