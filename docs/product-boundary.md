# Product boundary

## Decision

OpenBPMN is a lightweight, Local-First bridge between a Host Agent's process-consulting conversation and a clean, portable BPMN 2.0 deliverable. The Host Agent discovers and confirms process meaning. The OpenBPMN Core turns that agreed meaning into deterministic artifacts. Downstream Modeling Tools provide the broader enterprise modeling environment.

OpenBPMN is not a hosted assistant, document-ingestion platform, graphical editor, enterprise process repository, or workflow-execution platform.

The primary product value is making operational evidence usable: Process Consultants and Process Operators can inspect responsibilities, decisions, exceptions, and handoffs, resolve conflicting accounts, and hand off a portable model. BPMN is the exchange format for this work. The completion and quality requirements are recorded in [Product direction and v0 release contract](product-direction.md).

## Responsibility split

| Responsibility | Owner | Boundary |
| --- | --- | --- |
| Read interviews, notes, PDFs, presentations, spreadsheets, and other source material | Host Agent | Interpret untrusted source material in the user's chosen agent environment. |
| Conduct the consulting dialogue | Host Agent | Elicit scope, participants, activities, events, decisions, exceptions, handoffs, assumptions, and missing information. The human confirms process decisions. |
| Normalize agreed meaning | Host Agent | Produce Structured Process Evidence; do not author BPMN XML. |
| Hold evidence, assumptions, questions, and review context during modeling | Host Agent Session State | Keep the normal experience session-first, with no workspace initialization or automatic sidecars. |
| Preserve a session for later continuation | Modeling Skill | Create one portable Handoff File only when the human explicitly requests it. |
| Own the canonical process representation | OpenBPMN Core | Accept structured, agent-independent input and apply stable identifiers. |
| Compile BPMN 2.0 | OpenBPMN Core | Map the canonical representation to deterministic, vendor-neutral BPMN XML. |
| Validate process and model quality | OpenBPMN Core | Produce stable machine-readable findings and a separate Quality Report. |
| Generate diagram interchange and previews | OpenBPMN Core | Create deterministic layout and a Read-Only Preview without offering graphical editing. |
| Export for downstream use | OpenBPMN Core | Produce a Clean Export at any time without OpenBPMN-specific notes, statuses, or tags. |
| Provide enterprise governance and collaboration | Downstream Modeling Tool | Own repositories, access control, approvals, collaboration, and lifecycle management. |
| Provide simulation, execution, and vendor-specific capabilities | Downstream Modeling Tool | Remain outside v0 and the vendor-neutral core contract. |
| Apply optional visual polish | Downstream Modeling Tool | May modify presentation after import; OpenBPMN does not attempt to replace the tool. |

## Product flow

```text
source material + human knowledge
               |
               v
Host Agent consulting dialogue
               |
               v
Session State -> ephemeral Structured Process Evidence
               |
               v
OpenBPMN Core: compile -> validate -> layout -> preview -> export
               |                         |
               v                         v
      separate Quality Report      clean BPMN 2.0
                                             |
                                             v
                         Signavio, Celonis, Camunda Modeler,
                         bpmn-js, CI, or another consumer
```

## V0 capabilities

The finished v0 must:

- support iterative natural-language-to-BPMN creation through a portable agent skill;
- expose a deterministic local CLI that remains useful without an AI agent;
- accept Structured Process Evidence rather than raw arbitrary documents;
- require no workspace initialization or durable state for a normal session;
- optionally emit one Handoff File when the user requests cross-session continuation;
- compile, validate, lay out, preview, and cleanly export a Design-Time Model;
- keep the Quality Report separate from BPMN XML;
- provide Compatibility Profiles, fixtures, and import tests for priority downstream consumers;
- use explicit user-selected paths, preview changes before replacement, require overwrite consent, and write files atomically;
- inherit Host-Native Authority instead of implementing a second permission or policy system; and
- make no hidden network requests, telemetry calls, or package downloads.

## Explicitly outside v0

- a standalone graphical BPMN editor or OpenBPMN chat application;
- a persistent OpenBPMN project workspace or automatic session sidecars;
- a hosted service, account system, remote process store, or maintainer-operated infrastructure;
- general-purpose extraction from arbitrary document formats;
- authenticated Signavio, Celonis, or other vendor API integrations;
- vendor-specific extensions in the canonical representation or Clean Export;
- enterprise repositories, governance, simulation, and workflow execution;
- reliable semantic import, conversational editing, or repair of arbitrary third-party BPMN; and
- treating a Read-Only Preview or generated `.bpmn` file as the consulting source of truth.

Existing BPMN may be validated or rendered when that can be done without promising semantic round-trip editing. Full import and refinement is a later product decision.

## Portability and safety invariants

1. The same Structured Process Evidence produces the same semantic BPMN model regardless of the Host Agent.
2. The CLI can compile and validate without an AI service.
3. A Clean Export contains only portable BPMN model and diagram data.
4. Agent-specific instructions remain thin adapters around one shared consulting and CLI contract.
5. Normal use is session-first; cross-session continuation is an explicit Handoff File operation.
6. Compatibility is demonstrated through tests and guidance, not vendor coupling in the core.
7. Process content stays within the environment deliberately chosen by the user.
8. OpenBPMN never silently overwrites a user artifact or performs undisclosed network activity.
9. Safety remains a small set of fixed local invariants, not a security platform.

## Deferred decisions

The [architecture decision](architecture.md) defines representation ownership and module interfaces. The Consulting Core Profile and Agent Workflow define the concept set and command contract. Exact diagnostic schemas, compatibility fixtures, prototype qualification, and release thresholds remain with their dedicated Wayfinder tickets.
