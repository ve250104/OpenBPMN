# Structured request and invocation

Use the bundled [request schema](request.schema.json), [Handoff schema](handoff.schema.json), [Quality Report schema](quality-report.schema.json), and [result schema](result.schema.json) for exact fields. Shared definitions live in the request schema; register each schema’s declared URN when using a JSON Schema validator. Consult the relevant definitions when adding an unfamiliar construct. The [minimal runnable example](../examples/invoice-review.json) demonstrates the complete envelope; it is synthetic, not a universal process pattern.

Send a complete request on each invocation: `schemaVersion`, `profileVersion`, `model`, plus optional `evidence`, `decisions`, `issues`, `links`, `scenarios`, and `presentation`. `model` has its own `key`/`name`, a `primaryRef`, `processes`, and optional `collaboration`/`declarations`. A primary collaboration’s participants may refer to its same-file processes; a primary process may reference additional same-file Call Activity targets.

Each process contains flat `nodes` and `flows` arrays. Nodes and flows carry `containerRef` to their process or embedded subprocess. Nested flow lives in those same arrays, not a nested `children` object. Lanes use `parentRef` and leaf-level `flowNodeRefs`. Keys are explicit global identities; XML IDs are derived by the CLI, never supplied as geometry.

Use `event: {kind: "none"}` on ordinary Start and End Events. Flows contain `sourceRef` and `targetRef`; explicit `condition` text is meaning, while `name` is its visible short label. If a condition has no name, the CLI uses the whole condition when it fits the label bound; provide a short name for a longer condition. Defaults use the owning Activity/Gateway’s `defaultFlowRef` pointing to its actual outgoing flow.

Review records:

| Record | Essential fields and meaning |
| --- | --- |
| Evidence | `key`, `source` display name, concise `summary`, optional `locator`. |
| Decision | `key`, `description`, affected `elementRefs`, supporting `evidenceRefs`; use `historicalElementRefs` for removed elements. |
| Issue | `key`, `kind` (`question`, `conflict`, `unsupportedRequirement`), `description`, `affectsMeaning`; unsupported requirements also need `concept`. |
| Resolution | An issue’s `resolution: {decisionRef, kind: "resolved" | "acceptedOmission"}` links the actual human decision. |
| Evidence Link | `elementRef`, `assertion`, `basis` (`evidence`, `decision`, `inference`), and applicable `supportRefs`. |
| Scenario | `key`, `name`, `startRef`, `expectedOutcome`, optional node `steps` and `evidenceRefs`. |

Keep context paraphrased and scoped to the process. Redact credentials before invoking the CLI. Credentials in semantic conditions/identities cannot be safely rewritten; the CLI refuses those inputs. Display-text redaction produces a warning. This is defense-in-depth, not a guarantee of detecting all sensitive data.

Read `openbpmn --help` for syntax and accepted flags. Normal generation chooses a stem, not an XML filename; it writes the three sibling artifacts. Use a canonical existing directory, distinct input/output paths, and quote paths through the host’s safe command API. Never interpolate evidence into shell code. `generate --input -` accepts UTF-8 JSON on stdin; `validate` and `render` require an explicit BPMN path.

A Handoff is `{handoffVersion, request, lifecycleStatus?, reviewNotes?, lastReport?}`. Create it only when requested, normally at a sibling path passed to `--handoff`. The CLI includes it in the same output transaction; it does not save a Handoff after a failed generation. If the human requests preserving unresolved work after failure, or selects a different directory, the Host Agent can write the schema-valid, secret-minimized Handoff separately. Use a safe non-colliding ordinary file, or explicit target-specific replacement authority; report it as a separate save, not part of a successful bundle. On continuation, load that request and preserve its decisions, unresolved issues, scenarios, and human-selected status. A successful generation does not automatically update an old Handoff unless explicitly requested.
