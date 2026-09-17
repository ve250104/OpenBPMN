# Supported BPMN reference

OpenBPMN uses the **Consulting Core 1.0.0** profile for design-time BPMN 2.0.2 Processes and Collaborations. Task and event types describe process meaning; they do not configure or execute a workflow engine. Choreographies and Conversations are outside the profile.

The profile version is separate from the application version. This reference describes the notation scope and constraints; OpenBPMN remains a prerelease with the limitations listed in [support status](support.md). It does not claim official OMG conformance or certification.

Run `openbpmn capabilities` to inspect the profile recognized by your installed version. Supported concepts are represented, validated, laid out, and exported within the constraints below. Deferred concepts are outside the profile and reported explicitly. An illegal placement or relationship is invalid even when its individual element types are supported.

## Supported concept matrix

### Definitions, processes, and collaborations

| Concept | BPMN representation | v1 constraints |
| --- | --- | --- |
| Definitions | `definitions` | One self-contained definitions document with an explicit target namespace and deterministic namespace declarations. |
| Process | `process` | Design-time process; no engine deployment promise. Processes referenced by a Call Activity remain in the same file. |
| Collaboration | `collaboration` | Contains participants and Message Flows; one collaboration is the primary exported subject. |
| White-box Pool | `participant` with `processRef` | References a process contained in the same file. |
| Black-box Pool | `participant` without `processRef` | May participate through Message Flows but exposes no internal flow. |
| Lane and nested Lane | `laneSet`, `lane`, nested `childLaneSet` | Flow-node membership is explicit and visually contained by the matching lane. |

### Activities

| Concept | BPMN representation | v1 constraints |
| --- | --- | --- |
| Generic Task | `task` | Design-time activity without a more specific classification. |
| User Task | `userTask` | Human-system interaction classification only. |
| Manual Task | `manualTask` | Human activity outside workflow-system execution. |
| Service Task | `serviceTask` | Automated-service classification without connector or deployment configuration. |
| Business Rule Task | `businessRuleTask` | Rule-evaluation classification without engine-specific rule bindings. |
| Send Task | `sendTask` | Communication classification; may reference a named Message. |
| Receive Task | `receiveTask` | Communication classification; may reference a named Message. |
| Script Task | `scriptTask` | Design-time classification; OpenBPMN does not execute scripts or require executable code. |
| Embedded Subprocess | `subProcess` | Expanded and collapsed presentations are supported; contained flow remains semantically present in either presentation. |
| Call Activity | `callActivity` | Must resolve to a callable Process contained in the same self-contained file. |
| Standard Loop | `standardLoopCharacteristics` | Marker and semantics are serialized and rendered. |
| Sequential Multi-Instance | `multiInstanceLoopCharacteristics` | `isSequential=true`; executable collection configuration is outside the profile. |
| Parallel Multi-Instance | `multiInstanceLoopCharacteristics` | `isSequential=false`; executable collection configuration is outside the profile. |

### Gateways and control flow

| Concept | BPMN representation | v1 constraints |
| --- | --- | --- |
| Exclusive Gateway | `exclusiveGateway` | Splitting decisions use labeled conditions; an optional default references an outgoing Sequence Flow. |
| Parallel Gateway | `parallelGateway` | Represents unconditional synchronization or parallelization; conditional outgoing flows are invalid. |
| Inclusive Gateway | `inclusiveGateway` | Outgoing alternatives use explicit conditions; an optional default is supported. |
| Event-Based Gateway | `eventBasedGateway` | Outgoing targets and event behavior must satisfy BPMN event-based routing constraints. |
| Sequence Flow | `sequenceFlow` | Remains within one Process; source and target references resolve to legal Flow Nodes. |
| Conditional Sequence Flow | `sequenceFlow` with `conditionExpression` | Used only where BPMN permits a condition. Human-readable condition wording is retained without engine expression bindings. |
| Default Sequence Flow | `default` reference plus `sequenceFlow` | The default Flow is an outgoing Flow of the owning Activity or Gateway and carries no competing condition. |

### Events

Support applies only in placements permitted by BPMN 2.0.2. A supported event definition in an illegal position is **Invalid**, not Deferred.

| Event definition | Supported placements in v1 | Key constraints |
| --- | --- | --- |
| None | Start Event, End Event | Used for ordinary entry and completion. |
| Message | Start, Intermediate Catch/Throw, Boundary, End | Catching and throwing direction is explicit; named Message references resolve. |
| Timer | Start, Intermediate Catch, Boundary | Exactly one timer form is present; no throwing Timer Event. |
| Conditional | Start, Intermediate Catch, Boundary | Represents a stated business condition, not engine-specific code. |
| Signal | Start, Intermediate Catch/Throw, Boundary, End | Named Signal references resolve and broadcast semantics remain explicit. |
| Error | Boundary Catch, End Throw | Error references resolve; Boundary use is attached to an Activity. |
| Escalation | Intermediate Throw, Boundary Catch, End Throw | Escalation references resolve and interruption behavior is explicit where applicable. |
| Terminate | End Event | Terminates the enclosing Process or Subprocess scope according to BPMN semantics. |
| Link | Intermediate Catch/Throw | Used as a same-level visual continuation; links do not cross Process or Subprocess scope. |

Boundary Events support interrupting and non-interrupting behavior wherever the selected event definition legally permits it. Event Subprocess Start Events remain Deferred even when their event definition is otherwise listed above.

### Collaboration, data, and documentation

| Concept | BPMN representation | v1 constraints |
| --- | --- | --- |
| Message Flow | `messageFlow` | Connects different participants; never connects elements within one participant. |
| Named Message | `message` and reference | Used by Message Events, Send/Receive Tasks, or Message Flows without vendor payload schemas. |
| Data Object | `dataObject`, `dataObjectReference` | Represents information used or produced by the process. |
| Data Input/Output | `dataInput`, `dataOutput` | Design-time information semantics only; no engine mapping promise. |
| Data Store | `dataStore`, `dataStoreReference` | Represents persistent information independently of a vendor repository. |
| Data Association | `dataInputAssociation`, `dataOutputAssociation` | Connects data to Activities or Events where BPMN permits it. |
| Text Annotation | `textAnnotation` | Contains Intentional Process Documentation approved by the human. |
| Group | `group` with Category references | Organizes related visible elements without changing control flow. |
| Association | `association` | Connects annotations and artifacts without implying Sequence or Message Flow. |

OpenBPMN assumptions, provenance, validation findings, Lifecycle Status, and review workflow never become Text Annotations or vendor extension data automatically.

## Deferred matrix

The following are valid BPMN concepts but outside Consulting Core 1.0.0:

- Event Subprocesses;
- Ad Hoc Subprocesses;
- Transactions;
- compensation activities and Compensation Events;
- Cancel Events;
- Multiple and Parallel Multiple Events;
- Complex Gateways;
- Choreography and Conversation models;
- choreography tasks and call choreographies;
- formal Resources and resource-role assignment;
- Correlations and correlation subscriptions;
- Interfaces and Operations;
- formal item definitions and external data schemas;
- engine-specific task configuration, expressions, connectors, listeners, deployment metadata, and input/output mappings; and
- vendor extensions, including Celonis eBPMN or execution-engine namespaces.

When a Deferred Concept is required, OpenBPMN returns a stable diagnostic, retains the requirement in the conversation and the Quality Report, and explains supported alternatives. It may use an alternative only after explicit human approval. It never silently removes, downgrades, or substitutes the concept. An explicitly requested Handoff File preserves the requirement for a later session.

## Model constraints

Every generated artifact follows these profile rules:

1. One self-contained `.bpmn` file represents one primary Process or Collaboration.
2. A Collaboration file may contain multiple Processes when its participants or Call Activities reference them.
3. The file contains one primary `BPMNDiagram` and a `BPMNPlane` for its primary Process or Collaboration.
4. Every intended visible semantic element has matching BPMN DI; every visible connector has useful waypoints.
5. IDs are stable, unique XML identifiers. Every semantic and DI reference resolves.
6. Sequence Flows remain within the same Process or embedded Subprocess flow scope. Message Flows cross participant boundaries.
7. Processes are design-time models and carry no implied executability.
8. BPMN standard documentation content is allowed only when intentionally approved as process meaning.
9. OpenBPMN metadata, quality findings, assumptions, and Lifecycle Status remain in companion artifacts.
10. Unsupported requirements remain visible in the conversation and the Quality Report even when omitted from a Snapshot Export.

## Snapshot and Clean Export behavior

OpenBPMN separates artifact availability from readiness or approval.

### Snapshot Export

A human may request a Snapshot Export at any point for sharing or clarification. It captures the currently confirmed model and may have:

- unresolved process questions;
- non-blocking consulting-quality findings;
- blocking profile findings;
- explicitly approved omissions of Deferred Concepts; or
- a human-selected Lifecycle Status held outside the BPMN file.

OpenBPMN makes the snapshot well-formed, schema-valid, and semantically valid whenever technically possible. Its Quality Report declares every limitation. “Snapshot” describes the artifact operation, not a forced draft or working status.

If structurally valid BPMN cannot be produced, OpenBPMN returns the Quality Report through the result envelope and preserves the previous Output Bundle. The Host Agent may show the preserved preview and identify it as unchanged; no new partial normal bundle or preview-from-chat is implied. The human may explicitly request a Handoff File. Invalid `.bpmn` output requires the explicit expert option and distinct artifact names defined in the [command reference](commands.md); it is never called a Clean Export.

### Clean Export

A Clean Export:

- passes XML integrity and BPMN 2.0.2 schema validation;
- passes normative reference and semantic constraints;
- uses only Supported Concepts in legal placements;
- includes complete BPMN DI for its primary Process Diagram;
- contains no OpenBPMN-specific notes, statuses, tags, or vendor extensions; and
- remains eligible even when non-blocking consulting-quality findings exist.

A Clean Export does not imply that the human considers the model complete, approved, production-ready, or governed. Those are human or Downstream Modeling Tool decisions.

## Validity versus consulting quality

Blocking Model Validity findings and advisory consulting-quality findings are separate.

| Finding class | Examples | Default export effect |
| --- | --- | --- |
| XML/BPMN validity | Malformed references, illegal Flow relationships, invalid event placement, missing required semantic data | Blocks Clean Export |
| Profile validity | Deferred Concept required without an approved omission, incomplete DI, unresolved Call Activity reference | Blocks Clean Export |
| Consulting quality | Vague task names, unclear ownership, missing exception detail, avoidable complexity | Reported; does not block Clean Export by default |
| Human governance | Draft, working version, reviewed, approved | Never inferred; does not determine technical export validity |

See the [command reference](commands.md) for export options and exit codes, and the [protocol reference](../skills/openbpmn/references/protocol.md) for Quality Report fields and completion signals.
