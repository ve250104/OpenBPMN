# Choose notation by business meaning

This tool produces design-time BPMN 2.0.2 Processes and Collaborations. Task classification is not connector configuration or executable deployment. Refer to the shipped schemas for exact fields; the CLI enforces placement and reference rules.

| Meaning | Representation and boundary |
| --- | --- |
| Work | Generic, User, Manual, Service, Business Rule, Send, Receive, or Script Task. Select a subtype only when the evidence warrants it. |
| One alternative | Exclusive Gateway; stated mutually exclusive conditions and an optional actual default. |
| Several selected alternatives | Inclusive Gateway with explicit conditions, with a matching join when the chosen branches must synchronize. |
| All branches | Parallel Gateway, unconditional outgoing flows; join only the required concurrently active branches. |
| First arriving event | Event-Based Gateway with legal catching-event/Receive Task targets. The trigger, not a data condition on the flow, selects the path. |
| Responsibility | Lanes inside a participant’s process; nested lanes refine responsibility without changing sequence. Independent counterparties use different pools. |
| Communication | Message Flow across participants, with named Message declarations where needed. Sequence Flow never crosses pools or subprocess boundaries. |
| Embedded detail | A Subprocess owns a same-scope internal flow. Expanded and collapsed views preserve that meaning; collapsed contents appear in a separate preview panel. |
| Reused process | Call Activity referencing a same-file Process, not a flattened copy. |
| Repetition | Standard Loop with stated condition; sequential/parallel Multi-Instance only for independent instances with that ordering. |
| Persistent information | Data Store and reference. Transient information uses Data Object/Reference. Data associations do not control execution order. |
| Intentional explanation | Text Annotation, Category-backed Group, or Association, only as requested process content. |

Event definitions and placements:

| Definition | Supported placements |
| --- | --- |
| None | Start, End. |
| Message | Start, Intermediate Catch/Throw, Boundary, End. |
| Timer | Start, Intermediate Catch, Boundary; exactly one date/duration/cycle. |
| Conditional | Start, Intermediate Catch, Boundary, with the actual business condition. |
| Signal | Start, Intermediate Catch/Throw, Boundary, End; broadcast differs from addressed Message. |
| Error | Interrupting Boundary Catch, End Throw. |
| Escalation | Intermediate Throw, Boundary Catch, End Throw; interruption remains explicit where legal. |
| Terminate | End; terminates the enclosing scope, not merely this path. |
| Link | Intermediate Catch/Throw as same-scope continuation, not a cross-pool message. |

A Boundary Event is attached to an Activity and its interrupting flag changes meaning. Keep ordinary completion separate from timeout/error handling. The CLI rejects an illegal placement even when the event definition itself is supported.

Data Input/Output attached internally to an Activity or Event may be semantic supporting structure without a standalone glyph; the association docks on its owner. Process-level visible inputs/outputs receive glyphs. Multiple data sources require transformation semantics and are outside this profile; do not split them into different associations as an unapproved semantic rewrite.

Deferred concepts include Event/Ad Hoc Subprocesses, Transactions, compensation/cancel/multiple events, Complex Gateways, Choreography/Conversation, formal resources/correlations/interfaces/operations/item schemas, execution bindings and mappings, and vendor extensions. Record a required deferred concept as an unresolved `unsupportedRequirement` issue. Discuss an explicitly modeled alternative only with the human; never relabel or drop the requirement to obtain a clean result.
