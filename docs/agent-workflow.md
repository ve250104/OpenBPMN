# Agent Workflow and artifact contract

## Decision

OpenBPMN provides a session-first, plug-and-play Modeling Skill inside the user's existing Host Agent. The user describes a process, supplies local evidence, or resumes from an explicitly saved Handoff File. The skill guides the conversation naturally, sends an ephemeral structured draft to the deterministic CLI, and returns an Output Bundle for review.

There is no OpenBPMN application, workspace initialization, required sidecar, project database, or persistent agent service. Continuing normally means continuing the current Codex, Claude Code, Copilot, or equivalent conversation.

## Experience principles

1. **Natural language first.** Users describe the outcome they need; the Modeling Skill operates the CLI for them.
2. **Free guided.** Consulting phases guide agent behavior without becoming a wizard, questionnaire, or visible progress tracker.
3. **Execute-Then-Review.** A user prompt normally produces a model update and preview before further questions.
4. **Session-first.** Session State lives in the Host Agent context and disappears with it unless the user requests a Handoff File.
5. **Artifacts over ceremony.** Normal generation produces three useful deliverables without setting up a project structure.
6. **Human authority.** The human reacts to and corrects the model and alone assigns Lifecycle Status.
7. **Deterministic boundary.** The Host Agent interprets evidence; the CLI owns compilation, validation, layout, rendering, and safe file output.

## Entry points

The MVP supports three entry paths:

| Entry | Behavior |
| --- | --- |
| Conversational request | Begin from a natural-language process description and refine through dialogue. |
| Local evidence | The Host Agent reads user-selected interviews, notes, documents, or tables as untrusted source material and begins from that evidence. |
| Handoff File | Load an explicitly saved session snapshot and continue from its evidence, decisions, conflicts, draft, and review history. |

Validating or rendering an existing `.bpmn` file is a separate deterministic operation. Conversational semantic import, repair, and round-trip editing of arbitrary third-party BPMN remain outside the MVP.

## Modeling Skill design

OpenBPMN ships one model-invoked Modeling Skill as the conversational front door. Its description should name distinct trigger branches, including requests to:

- model or document a business process;
- turn interviews, notes, or a description into BPMN;
- refine a process through discussion;
- create a downstream-ready BPMN diagram; or
- continue from an OpenBPMN Handoff File.

The skill remains short. It contains the common interaction recipe and checkable completion criteria. Branch-specific reference lives behind context pointers so the agent loads only what the current request needs:

| Reference branch | Loaded when |
| --- | --- |
| Consulting discovery | Scope, evidence, responsibility, ambiguity, conflict, or stakeholder review needs guidance. |
| Consulting Core Profile | A semantic concept must be selected, rejected, or explained. |
| Quality rules | The model is challenged, reviewed, validated, or prepared for export. |
| Compatibility profiles | The user names Signavio, Celonis, or another downstream consumer. |
| Examples and fixtures | The agent needs a concrete pattern or evaluation case. |

One canonical skill source defines behavior. Host-specific manifests and instruction files are thin discovery pointers, not duplicated workflows. `AGENTS.md` and `CLAUDE.md` route relevant requests to the Modeling Skill; they do not restate its method.

## Internal consulting loop

The Modeling Skill uses nine internal phases. They are adaptive and may be revisited; they are never presented as a mandatory sequence to the user.

| Phase | Agent behavior | Completion criterion |
| --- | --- | --- |
| Orient | Identify purpose, audience, and current-state, future-state, policy, or comparison perspective. | The intended use and perspective are known or explicitly recorded as consequential ambiguity. |
| Bound | Establish trigger, results, inclusions, exclusions, variants, and useful abstraction level. | A coherent initial process boundary can be modeled. |
| Map | Propose the ordinary successful path at a deliberately useful level. | A connected happy path reaches an explicit business result. |
| Assign | Identify responsible actors and material handoffs. | Every modeled activity has a responsible participant or an explicit finding. |
| Branch | Add decisions and material exceptions incrementally. | Every currently selected scenario has understandable outcomes or explicit gaps. |
| Challenge | Surface contradictions, unsupported inference, vague naming, mixed granularity, and missing outcomes. | Consequential uncertainty is preserved rather than silently modeled as fact. |
| Preview | Generate the current model and show the Process Diagram. | A new Output Bundle or a precise generation failure exists. |
| Playback | Walk the happy path and selected alternatives when deeper review is useful. | Reviewed scenarios and corrections are captured in Session State. |
| Export | Communicate technical readiness and file locations. | The user receives a completion signal without an inferred Lifecycle Status. |

Not every phase must finish before the first preview. The skill generates as soon as a coherent happy path exists and improves the model through reaction.

## Execute-Then-Review

The default loop is:

```text
user prompt
    -> Host Agent interprets current evidence
    -> CLI generates or updates the Output Bundle
    -> Host Agent shows preview, change summary, and key findings
    -> user reacts or stops
```

Pre-generation clarification is exceptional. The agent pauses only when:

- materially contradictory evidence allows consequentially different models;
- a required interpretation would invent scope, ownership, routing, exception behavior, or a business result;
- a Deferred Concept would require an approximation; or
- a requested write would replace an existing file without explicit authority.

Otherwise the agent produces the best evidence-supported update immediately. It may label an inference in Session State and the Quality Report, but it does not force confirmation for routine informational modeling changes.

## Session State

Session State is conceptual state held in the current Host Agent conversation. It should be sufficient to generate the next complete Structured Process Evidence payload and includes, as relevant:

- purpose, audience, perspective, boundary, and abstraction level;
- canonical vocabulary and aliases;
- process evidence and source references;
- current activities, participants, flows, decisions, events, and decomposition;
- evidence-backed assertions and agent inferences;
- unresolved questions and contradictory claims;
- explicit human Modeling Decisions and accepted omissions;
- current quality findings; and
- review scenarios and feedback.

Session State is not automatically written to disk and is not a portability promise. Losing the Host Agent session loses this context unless the user requested a Handoff File.

## Structured input transport

Each generation is stateless from the CLI's perspective. The Modeling Skill sends a complete Structured Process Evidence payload through standard input or an agent-managed temporary file. Temporary inputs are removed after the operation.

The payload is the current complete semantic request, not a conversational delta. There is no stateful `update` command and the CLI never relies on chat history.

## Output Bundle

Normal generation creates three sibling deliverables:

| Artifact | Purpose |
| --- | --- |
| `<process>.bpmn` | Vendor-neutral BPMN 2.0.2 Process Model and complete BPMN DI. |
| `<process>.svg` | Read-Only Preview for immediate visual review and sharing. |
| `<process>.quality.json` | Machine-readable Model Validity, consulting-quality findings, unresolved questions, and export outcome. |

The Host Agent summarizes the consequential findings in conversation rather than dumping the full Quality Report.

If the user does not provide an output path, the skill derives a safe filename from the process name in the current working directory. A collision never causes an implicit overwrite: the agent selects a new filename or obtains a target-specific replacement instruction. A natural-language request to update or replace that named process is sufficient authority; the skill passes it to the CLI explicitly and does not add a second confirmation prompt. Bundle Replacement stages and validates all three artifacts before touching the previous bundle and restores the previous bundle if replacement fails.

No Output Bundle file contains persistent Session State or an inferred Lifecycle Status. The `.bpmn` remains free of OpenBPMN-specific quality and review metadata.

## Handoff File

On explicit request, the skill creates `<process>.openbpmn.json`. It contains:

- the complete Structured Process Evidence payload;
- accepted Modeling Decisions and omissions;
- unresolved questions and conflicts;
- the current canonical semantic draft;
- relevant quality findings; and
- named review scenarios and feedback.

It excludes the chat transcript and is not created, updated, or required during normal use. Another supported Host Agent can load it as a new session entry point. The Handoff File is the only MVP promise for cross-session semantic continuation.

## CLI contract

Natural language is the normal interface. The CLI is the stable deterministic boundary for the Modeling Skill, power users, CI, and future adapters.

| Command | Contract | Mutates files |
| --- | --- | --- |
| `generate` | Consume complete Structured Process Evidence; compile, validate, lay out, render, and write an Output Bundle. May additionally write a requested Handoff File. | Yes, only at explicit output paths |
| `validate` | Inspect a `.bpmn` file and return Model Validity plus quality findings. | No |
| `render` | Render a `.bpmn` file to an SVG Read-Only Preview. | Only the named SVG output |
| `capabilities` | Return tool version, supported Consulting Core Profile, input/output formats, and available compatibility profiles. | No |

All commands:

- accept explicit input and output paths, with `generate` also accepting structured input on standard input;
- support a structured JSON result envelope;
- use stable finding codes and documented exit-code classes;
- keep machine result data separate from human-readable diagnostics;
- are non-interactive;
- perform no network activity, telemetry, or implicit package installation; and
- never overwrite an existing artifact without explicit authority.

The CLI relies on Host-Native Authority for filesystem permissions. It does not implement a second sandbox or interactive permission layer. An explicit replace option carries target-specific authority from the Modeling Skill; an invalid-export option applies to one invocation and is never remembered.

The stable exit-code classes are:

| Exit | Meaning |
| --- | --- |
| `0` | The requested operation completed; the result envelope distinguishes Snapshot from Clean readiness. |
| `1` | Unexpected internal or dependency failure. |
| `2` | Blocking Model Validity or profile findings prevented the requested clean result. |
| `3` | Invalid command usage or malformed structured input. |
| `4` | A filesystem or overwrite safety rule refused the operation. |

Exact finding codes and the full Quality Report schema belong to the dedicated quality-contract decision.

On failure, the CLI returns Quality Report content through the structured result envelope, removes staged and temporary files, and leaves the destination unchanged. A first-run failure creates no destination artifacts.

An Invalid Expert Export uses distinct `.invalid.bpmn` and `.invalid.quality.json` names and may add `.invalid.svg` only when rendering succeeds. It never replaces a valid Output Bundle and never yields `clean_export_ready`.

## Result envelope and completion signals

Every command returns a JSON envelope with at least:

- tool and profile versions;
- one completion signal;
- artifact paths produced or preserved;
- counts of blocking and advisory findings;
- stable finding references; and
- whether any explicit override or omission affected the result.

The Agent Workflow communicates four technical outcomes:

| Signal | Meaning |
| --- | --- |
| `snapshot_ready` | An Output Bundle exists, with blocking or unresolved findings declared separately. |
| `clean_export_ready` | Every blocking Model Validity check passes. |
| `clarification_needed` | Consequential ambiguity prevents a trustworthy update; the current successful bundle is preserved. |
| `generation_failed` | Deterministic tooling could not produce the requested artifacts; partial replacement files do not remain. |

These signals describe technical workflow outcomes. They never mean draft, complete, reviewed, approved, or production-ready.

## Agent response contract

After a material generation, the Modeling Skill presents:

1. the Read-Only Preview;
2. clickable paths to the Output Bundle;
3. a concise summary of semantic additions, changes, and removals;
4. the completion signal;
5. the most consequential blocking or advisory findings; and
6. at most a few highest-impact questions that would materially improve the model.

The skill does not expose internal phase tracking or require the user to answer every question. It stops after presenting the result and continues only when the user responds or requests deeper review. The human may stop, share, or export at any time.

## Cross-host promise

Codex, Claude Code, Copilot, and future supported Host Agents use the same:

- consulting loop and decision boundaries;
- Structured Process Evidence and Handoff File contracts;
- CLI capabilities and result envelope;
- Output Bundle and completion signals;
- safety constraints; and
- progressively disclosed source guidance.

OpenBPMN does not promise identical language, identical follow-up questions, identical permission prompts, or support in every surface offered by each vendor. Deterministic compilation and validation establish equivalence where it matters.

## Deferred

- automatic persistent workspaces or sidecar state;
- general conversational import and repair of arbitrary BPMN;
- a stateful update daemon;
- an MCP dependency in the MVP;
- a standalone chat or graphical editing application; and
- host-specific forks of the consulting method.

A later local stdio MCP adapter may expose the same four operations over the same core after the CLI contract is stable.

The local trust and file rules are specified in [Local trust, consent, and file safety](local-trust-and-file-safety.md).
