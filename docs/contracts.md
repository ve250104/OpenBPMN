# Structured input, outputs, and export contract

This is the normative v0 protocol decision. Implement it as strict JSON Schema 2020-12 plus semantic validation; TypeScript types and examples must agree with that schema. The [Consulting Core Profile](consulting-core-profile.md) owns the supported notation and legal-placement contract. The schemas express data shape, not proof that process meaning is true.

## Structured Process Evidence

Required top-level fields are `schemaVersion: "1.0.0"`, `profileVersion: "1.0.0"`, and `model`. Optional fields are `evidence`, `decisions`, `issues`, `links`, `scenarios`, and `presentation`. Omitted collections mean empty arrays. Unknown fields, unknown enum values, duplicate JSON keys, unsupported versions, and nulls in place of omitted fields are rejected. There is no free-form extension dictionary.

Keys are case-sensitive strings matching `[A-Za-z][A-Za-z0-9_.-]{0,127}`. They are unique across the model and retained across revisions. References use those keys. The Core maps semantic keys to XML IDs as `M_` plus the unchanged key; generated objects use separate `D_` (DI) and `G_` (compiler-generated) namespaces with deterministic role suffixes. Labels and collection order never determine semantic identity.

Human labels and condition text are UTF-8 strings. Names are at most 500 characters; descriptions, intentional documentation, and paraphrases are at most 4,000 characters. Empty optional text is normalized to omission. No text is executed. V0 bounds one invocation at 5 MiB input, 2,000 semantic elements, nesting depth 16, and 5,000 evidence/context records in total. Refusal is explicit and does not silently truncate. These are fixed implementation bounds, not a user policy system.

### Semantic request

`model` has required `key`, `name`, `primaryRef`, and `processes`; optional `collaboration`, `declarations`, and intentional `documentation`. When a Collaboration is present, `primaryRef` must equal its key; otherwise it must reference a contained Process. Empty `processes` is legal only for a Collaboration consisting entirely of black-box participants. Additional contained Processes serve white-box participants or Call Activities; they are not silently merged into the primary process.

Serialization uses `targetNamespace: urn:process-model:<model.key>` and `isExecutable="false"` on contained Processes. `capacity` is a nonnegative integer; `unlimited` defaults true and conflicts with a finite capacity. A supplied finite capacity requires `unlimited: false`. These are design-time declarations, not execution configuration.

All semantic records have `key`, optional `name`, and optional intentional `documentation` unless a row defines different display text. Fields below marked `?` are optional. Lists default to empty. Conditional fields are legal only for their matching type. Each discriminator has a closed set of fields in the input schema.

| Record | Fields beyond the common fields |
| --- | --- |
| Process | `nodes[]`, `flows[]`, `lanes[]`, `artifacts[]`, `dataAssociations[]` |
| Node common | Required `type`, `containerRef` identifying its Process or embedded Subprocess |
| Activity | `type` = `task`, `userTask`, `manualTask`, `serviceTask`, `businessRuleTask`, `sendTask`, `receiveTask`, `scriptTask`, `subProcess`, or `callActivity`; optional `loop`, `defaultFlowRef`; optional `messageRef` on Send/Receive Tasks only; required `calledProcessRef` on Call Activity only |
| Gateway | `type` = `exclusiveGateway`, `parallelGateway`, `inclusiveGateway`, or `eventBasedGateway`; `defaultFlowRef?` on Exclusive/Inclusive only; Event-Based additionally permits `instantiate` (boolean, default false) and `eventGatewayType: Exclusive|Parallel` (default Exclusive) |
| Event | `type` = `startEvent`, `intermediateCatchEvent`, `intermediateThrowEvent`, `boundaryEvent`, or `endEvent`; required `event`; Boundary additionally requires `attachedToRef` and explicit boolean `interrupting` |
| Sequence Flow | `containerRef`, `sourceRef`, `targetRef`, optional `condition` text; its optional `name` is a visible label |
| Lane | `parentRef` to its Process, Subprocess, or parent Lane; `flowNodeRefs[]` |
| Collaboration | `participants[]`, `messageFlows[]`, and `artifacts[]` limited to standard documentation/group artifacts |
| Participant | `processRef?`; absence explicitly denotes a black-box pool |
| Message Flow | `sourceRef`, `targetRef`, `messageRef?`; endpoints identify participants or legal contained interaction nodes |
| Declaration | `type` = `message`, `signal`, `error`, `escalation`, `dataStore`, or `category`; Error/Escalation permit optional `code`; Data Store permits `capacity?` and `unlimited?`; Category requires `value` text |

`model.declarations` is one list. `loop` is exactly one of: `{kind: "standard", condition, testBefore?}`, where condition is text and `testBefore` defaults false; or `{kind: "multiInstance", sequential}`, where `sequential` is an explicit boolean. Collection expressions, executable scripts, connectors, and vendor task configuration remain outside the profile. Activity looping is represented semantically and visually; implementation must enforce the BPMN activity-type restrictions.

`event` is a tagged record. `kind` is `none`, `message`, `timer`, `conditional`, `signal`, `error`, `escalation`, `terminate`, or `link`. Message/Signal require a `ref` to a matching named declaration. Error/Escalation require the matching named `ref` when throwing; Boundary catch definitions may omit `ref` to express a catch-all where BPMN permits it. Timer requires exactly one of `timeDate`, `timeDuration`, or `timeCycle` as nonempty text; the compiler preserves the supplied design-time expression and does not invent a schedule. Conditional requires nonempty `condition`. Link requires `name`, with matching same-scope catch/throw names and at most one catch; the compiler derives stable definition references. None/Terminate add no fields. Legal event positions, catching/throwing behavior, and interruption rules come from the profile and BPMN; an otherwise supported kind in an illegal position is invalid. Event-Based Gateway instantiation and exclusive/parallel behavior are semantic choices: parallel instantiation requires `instantiate: true`, an instantiating gateway has no incoming Sequence Flow, and all outgoing targets must satisfy the applicable event-based rules.

All Process elements remain in flat lists; `containerRef` expresses nesting. A Subprocess does not duplicate its children in another payload. Containment must be acyclic. Sequence Flow endpoints have the same flow scope, including embedded subprocess scope; no cross-scope shortcuts are invented. Boundary Event and attached Activity share a containing flow scope. Lane membership must resolve to the same flow scope; a Flow Node belongs to at most one leaf Lane, and ancestor membership is derived. The default Flow must be an outgoing Flow of its owner with no competing condition. IDs remain stable when a node moves or is renamed; an illegal move fails semantic validation.

### Data and intentional documentation

| Artifact type | Required or conditional fields |
| --- | --- |
| `dataObject` | `containerRef`, optional boolean `isCollection` (default false) |
| `dataObjectReference` | `containerRef`, `dataObjectRef`, optional `state` |
| `dataStoreReference` | `containerRef`, `dataStoreRef`, optional `state` |
| `dataInput`, `dataOutput` | `ownerRef` to a legal Process, Activity, or Event; optional boolean `isCollection` (default false) |
| `textAnnotation` | `containerRef`, required `text` instead of `name` |
| `group` | `containerRef`, `categoryRef`, nonempty `memberRefs[]` used for geometry; membership does not imply control flow |
| `association` | `containerRef`, `sourceRef`, `targetRef`, optional `direction` = `none` (default), `one`, or `both` |

A Data Association has `key`, `direction: "input" | "output"`, `ownerRef`, nonempty `sourceRefs[]`, and `targetRef`. Its legal owner, sources, and target are checked separately from its JSON shape. The compiler emits standard Activity/Process `ioSpecification` and deterministic input/output sets as required for the supplied IO declarations; Events use their BPMN-defined input/output placement. It does not serialize a generic Association where a Data Association is required. No transformation, assignment expression, or vendor data mapping is inferred.

Explicit declaration records are preserved in XML even when unused; the report may identify redundant input as advisory. No declaration is silently pruned. Process meaning and evidence must never be altered merely to please a renderer.

### Evidence and review context

| Collection | Exact record fields |
| --- | --- |
| `evidence` | `key`, `source` display label, `summary` paraphrase; optional `locator` display reference |
| `decisions` | `key`, `description`, `elementRefs[]`, `evidenceRefs[]`, optional `historicalElementRefs[]`; decisions represent explicit human choices |
| `issues` | `key`, `kind: question | conflict | unsupportedRequirement`, `description`, `elementRefs[]`, `evidenceRefs[]`, required boolean `affectsMeaning`; unsupported requirements additionally require `concept`; optional `resolution: {decisionRef, kind: resolved|acceptedOmission}` and `historicalElementRefs[]` |
| `links` | `elementRef`, `assertion` paraphrase, `basis: evidence | inference | decision`, `supportRefs[]`; evidence/inference references are evidence keys, decision references are decision keys; inference may have empty support |
| `scenarios` | `key`, `name`, `startRef`, `steps[]` of element keys, `expectedOutcome`; optional `evidenceRefs[]` |

An issue's typed `resolution` is the only resolution direction. It names the explicit human decision and distinguishes a substantive resolution from an accepted omission; it cannot erase the issue or its reported limitation. An unsupported requirement's `concept` identifies the BPMN local name or `namespaceURI#localName` concerned. Declaring an accepted omission affects the selected scope, never the support matrix. Only active unresolved issues influence clarification and profile checks.

Evidence, decision, issue, and scenario keys are unique within each collection; reference fields determine the target collection and never use ambiguous name lookup. All current `elementRefs`, link `elementRef`, scenario steps, and semantic references resolve to current model keys. When an element is removed, retained decisions and resolved issues may move its reference to `historicalElementRefs`; those keys need not resolve now and are reserved against reuse in the current request. Active issues cannot point only at deleted elements: resolve them through a decision or attach them to the current scope. This preserves relevant review history without retaining a second model. The Core validates links and reports missing support. A Host Agent evaluates sources; the deterministic Core cannot authenticate claims or infer human approval from source text.

`presentation` accepts only `direction: "leftToRight"`, optional `participantOrder[]`, optional `laneOrder[]`, and optional `subprocesses[]` records `{elementRef, expanded}`. Every provided ordering is a duplicate-free subset of matching keys; omitted members follow input order. Subprocesses default collapsed; expansion is a presentation choice and never deletes contained semantics. The primary plane matches `primaryRef`; secondary planes cover hidden subprocess contents and called Processes. The SVG output is one self-contained sheet with clearly labelled separate panels for the primary and secondary diagrams, not an omission of hidden semantics. Standards DI in the BPMN retains the distinct planes.

### Handoff File

A Handoff File contains `handoffVersion: "1.0.0"`, the complete `request`, optional `lifecycleStatus` text selected by the human, optional `reviewNotes[]` paraphrases, and optional `lastReport` in the report format below. It contains no transcript, credentials, source files, inferred approval, or extra authoritative model copy. The canonical model is reproduced from `request.model`. Findings in `lastReport` are historical and are recalculated when generating again.

## CLI choices

The executable name is defined in the [release plan](release-plan.md). All commands are non-interactive. Default output is a single JSON envelope on stdout, diagnostics on stderr; `--json` explicitly selects that default, and `--human` replaces stdout with a concise human summary. Combining the two is invalid usage. `--help` and `--version` are standard options, not extra commands. `--browser-executable <absolute-path>` is accepted by `generate`, `render`, and `capabilities`; it overrides the documented installed-browser discovery. It is never taken from process evidence or a Handoff File. `--debug` enables data-minimized technical diagnostics on stderr only.

| Command | Options |
| --- | --- |
| `generate` | `--input <json-or-handoff-path>` or `--input -` for stdin (required); `--output <path-stem>` (required); `--export auto|clean|snapshot` (default auto); optional `--replace`, `--handoff <path>`, `--expert-invalid` |
| `validate` | `--input <bpmn-path>` (required); optional `--compatibility sap-signavio-process-manager|celonis-analysis-conformance|celonis-process-management`; no file writes |
| `render` | `--input <bpmn-path>` and `--output <svg-path>` (required); optional `--replace`; reads supplied DI without layout or repair |
| `capabilities` | No process input; reports versions, supported profile, schema versions, runtime/browser availability, bounds, and defined compatibility profiles |

`--expert-invalid` is allowed only with `generate --export snapshot` and applies to that invocation. Normal naming is `<stem>.bpmn`, `<stem>.svg`, and `<stem>.quality.json`; expert naming is `<stem>.invalid.bpmn`, `<stem>.invalid.quality.json`, and an optional `<stem>.invalid.svg`. A requested Handoff File has exactly the named path. Replacement authority applies only to explicit destinations. Render and validation never become implicit imports into Session State.

For combined `generate --handoff`, the Handoff is a distinct sibling of the output bundle. Canonical preflight rejects aliasing among input, output, and Handoff paths, including links and case-equivalent names on the destination filesystem. It joins the same staged write and handled-failure rollback. `--replace` covers every explicitly named output; the Host Agent passes it only when the user's instruction covers those destinations. A Handoff in a different directory is written separately by the Host Agent on explicit request, without adding a stateful CLI command. The separate operation does not claim bundle transactionality.

Normal user requests go through the Modeling Skill; it supplies paths and flags. The Host Agent carries the user's replacement authority and requests a snapshot when they want the currently expressible model despite outstanding questions. CLI switches are not a user-facing questionnaire.

## Export decision table

Structural validity means XML integrity, BPMN schema, semantic references and placement, and complete valid DI. Profile findings are separately evaluated against the selected current scope; unresolved Deferred requirements can remain outside the retained, structurally valid model and in the report.

| Request and result | Artifacts and signal | Exit |
| --- | --- | --- |
| Auto; structurally valid, all blocking profile checks pass, no consequential unresolved meaning | Normal bundle; `clean_export_ready` even with consulting advisories | 0 |
| Explicit clean; all applicable structural, profile, and consequential-meaning checks pass | Normal bundle; `clean_export_ready` | 0 |
| Explicit snapshot; structurally valid, including a supported retained model with unresolved questions, declared omissions, or profile limitations | Normal bundle; `snapshot_ready`; report states whether Clean Export criteria also pass | 0 |
| Auto or clean; unresolved conflict/question affects the meaning of the proposed change | No new bundle; `clarification_needed`; report through envelope, previous bundle preserved | 2 |
| Auto or clean; blocking structural/profile finding | No new bundle; `generation_failed`; report through envelope, previous bundle preserved | 2 |
| Snapshot; current model fails structural validity | No normal bundle; `generation_failed`; report through envelope | 2 |
| Snapshot plus explicit expert option; safe parse/serialization possible but validation fails | Distinct expert files; `invalid_exported`; findings and override explicit; SVG only if safe and renderable | 2 |
| Snapshot plus explicit expert option; all Model Validity checks pass | No artifact; usage refusal explains that the expert option is unnecessary and a normal snapshot is available; actual passed checks remain in the report | 3 |
| Malformed/bounds-exceeding input | No artifact; `generation_failed` for generate, otherwise `operation_failed`; malformed input is never bypassed by expert option | 3 |
| Missing runtime or unexpected implementation/dependency failure | No normal artifacts; `generation_failed` for generate, otherwise `operation_failed` | 1 |
| Filesystem, collision, traversal, or symlink refusal | No new artifacts; failure envelope and prior artifacts preserved | 4 |

An explicit snapshot may share the faithfully retained model without settling every question. It never authorizes invented routing or silent approximation. An accepted omission allows the now-selected model to qualify as clean if all applicable checks pass; the limitation and decision remain in the report. The Core never changes lifecycle labels to communicate an export outcome.

For a failed generation there is no newly written preview. The Host Agent can show the previous successful preview, explicitly identify that it was preserved, and discuss the returned report. To preserve new unresolved session evidence, it can independently write an explicitly requested Handoff File under the same file-safety rules. There is no hidden CLI preview-from-chat capability. This resolves the earlier profile wording about returning a preview on failure without allowing partial replacement bundles.

Successful `validate`, `render`, and `capabilities` use `validation_completed`, `render_completed`, and `capabilities_reported` respectively. Validation exits 2 for blocking checks and 0 otherwise; validation with unavailable required checks cannot pass. Render exits 2 for invalid/missing DI or unsupported visible content, 1 for dependency failures, 3 for malformed input, and 4 for file refusal. Informational nonvisual limitations may be reported without pretending they have been validated. The expert option is not accepted by either command.

The complete `signal` enum is `clean_export_ready`, `snapshot_ready`, `clarification_needed`, `generation_failed`, `invalid_exported`, `validation_completed`, `render_completed`, `capabilities_reported`, and `operation_failed`. Every unsuccessful non-generate operation uses `operation_failed`, except completed validation that reports defects. All failed generate paths, including expert-option misuse and filesystem refusal, use `generation_failed` unless the table explicitly specifies another signal. `status` is `completed` for successfully produced artifacts, capability inspection, and completed validation (including exit 2 findings); `refused` for clarification, validation-based export/render refusal, usage/input rejection, or file-safety refusal; and `failed` for missing dependencies, unexpected failures, or filesystem IO errors. `invalid_exported` is a completed expert operation with exit 2, never ordinary success.

## Result envelope and Quality Report

Every JSON result has `resultVersion: "1.0.0"`, `command`, `toolVersion`, `profileVersion`, `status: completed|refused|failed`, `signal`, `exitCode`, `artifacts[]`, and `report`. Artifact records have `kind: bpmn|svg|quality|handoff`, `path`, and `state: produced|preserved`. Capability results additionally have `capabilities`; other commands omit that field. When an input cannot be inspected, produce a minimal report with checks not run rather than echoing the payload. `status` describes command execution, while report checks describe validity; validation can complete and exit 2 because it found defects.

A Quality Report has `reportVersion: "1.0.0"`, `toolVersion`, `profileVersion`, optional `modelKey`, `export: {requested, outcome, cleanEligible, expertOverride}`, `checks[]`, `findings[]`, and `context`. `requested` is `auto|clean|snapshot|none`; `outcome` is `clean|snapshot|invalid|none`. `cleanEligible` is boolean and follows the required-check rules below. `expertOverride` is boolean and identifies an applied override, not a refused option. `context` contains data-minimized `evidence`, `decisions`, `issues`, and `links` using the above shapes, not the semantic model or chat history. It is evidence for interpreting this assessment, not persistent Session State.

Each check has `id`, `status: passed|failed|not_run|not_applicable`, and `findingRefs[]`; `reason` is required for the last two statuses. Check IDs are `input`, `xml`, `xsd`, `semantics`, `profile`, `di`, `render`, `evidence`, and `consulting`, with an optional named `compatibility:<profile>` check. The report records assessed capabilities even when they cannot affect that command; external XML has no source-evidence assessment. Rendering is required for a normal bundle; a renderer's presence is not proof of all semantic checks. Available checks are recorded individually and never replaced with one opaque quality score.

For `generate`, Clean eligibility requires passed `input`, `xml`, `xsd`, `semantics`, `profile`, and `di` checks plus no unresolved consequential-meaning finding. A normal bundle additionally requires successful `render`. For `validate`, it requires passed `xml`, `xsd`, `semantics`, `profile`, and `di`; structured-input, evidence, and rendering checks are not applicable. `render` assesses safe XML and DI/rendering only, so its unrun full validity checks leave Clean eligibility false. `capabilities` has no model and always has Clean eligibility false. Consulting advisories do not affect eligibility. A named consumer-fit failure leaves core Clean eligibility unchanged but makes the requested compatibility validation exit 2. Actual tenant observations are separate from local fit and are never inferred from this check.

A finding has `id`, `code`, `category`, `severity: error|warning|info`, `blocksClean`, `message`, `remediation`, `elementRefs[]`, `evidenceRefs[]`, and optional `inputPointer` using JSON Pointer. Categories are `input`, `xml`, `semantic`, `profile`, `diagram`, `evidence`, `consulting`, `runtime`, and `filesystem`. Messages are data-minimized. Finding IDs derive deterministically from code plus sorted affected references/pointer and a stable rule-instance discriminator; wording changes do not create new identities. Sort by category, code, and ID. Counts in summaries are derived from findings, not a competing truth.

| Stable code family | Meaning |
| --- | --- |
| `INPUT_SCHEMA`, `INPUT_VERSION`, `INPUT_LIMIT`, `KEY_DUPLICATE` | Structured contract failures |
| `XML_PARSE`, `XML_UNSAFE`, `BPMN_XSD`, `REF_MISSING` | XML, schema, and reference failures |
| `FLOW_SCOPE`, `EVENT_PLACEMENT`, `DEFAULT_FLOW`, `DATA_RELATION` | Normative relationship/placement failures |
| `PROFILE_DEFERRED`, `PROFILE_EXTENSION` | Unsupported concepts or namespaces |
| `DI_MISSING`, `DI_INVALID`, `RENDER_UNSUPPORTED` | Diagram coverage, geometry, or rendering gaps |
| `EVIDENCE_CONFLICT`, `EVIDENCE_GAP`, `DECLARED_OMISSION` | Evidence limitations and explicitly accepted omissions |
| `QUALITY_NAMING`, `QUALITY_OWNERSHIP`, `QUALITY_OUTCOME`, `QUALITY_COMPLEXITY` | Advisory consulting checks |
| `CHECK_NOT_RUN`, `RUNTIME_MISSING`, `DEPENDENCY_FAILURE` | Missing assessment or runtime capability |
| `FS_COLLISION`, `FS_PATH`, `FS_IO`, `CLEANUP_FAILED` | File and cleanup outcomes |
| `SECRET_REDACTED`, `INTERNAL_FAILURE` | Redaction and unexpected failures |

Code families are stable; additional specific codes are permitted only with documented meaning and tests. `blocksClean` is determined by the rule and applicable command, not by an agent's label or arbitrary severity override. XML/semantic/DI failures block, profile gaps block unless the required omission was explicitly accepted, and ordinary consulting advisories do not block. Evidence conflicts that require a process choice drive clarification rather than being resolved by a numeric confidence score.

The JSON report omits timestamps, environment-dependent runtime timings, raw stack traces, and absolute source paths. Artifact paths appear only in the result envelope. No source URLs are fetched. Retained user content is paraphrased and secret-minimized per the [local trust contract](local-trust-and-file-safety.md).

## Versioning and ownership

Schema/report/handoff version 1.0.0 and Consulting Core 1.0.0 are independent of product v0.1.0. Required-field, meaning, or compatibility-breaking changes increment the relevant major version; additive optional fields require a minor version and explicit reader support. The implementation must reject versions it does not implement instead of assuming forward compatibility.

The input schema is the canonical machine shape once implemented. The Core owns rule outcomes; the Host Agent owns consulting interpretation; the human owns Modeling Decisions. Regression tests enforce this contract through CLI/Core results and artifacts, including invalid combinations and failed prerequisites. The [OMG BPMN 2.0.2 specification and normative schemas](https://www.omg.org/spec/BPMN/2.0.2/) govern BPMN legality; this document defines the narrower input and workflow choices.
