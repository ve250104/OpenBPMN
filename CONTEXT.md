# OpenBPMN

OpenBPMN is an open-source effort that turns operational evidence and conversation into reviewable BPMN 2.0 Process Models. It helps Process Consultants and Process Operators make process meaning explicit before documentation, redesign, or automation.

## Language

**Conversational Modeling**:
An iterative dialogue that turns natural-language process knowledge into a BPMN Process Model and refines it through discussion.
_Avoid_: One-shot generation, text-to-image

**BPMN Process Model**:
A portable BPMN 2.0 representation of a business process that includes both its process meaning and its visual layout for downstream use.
_Avoid_: Process Diagram, picture

**Design-Time Model**:
A BPMN Process Model intended for process analysis, documentation, review, and exchange rather than deployment to a workflow engine.
_Avoid_: Executable Process Model

**Process Diagram**:
The visual presentation of a BPMN Process Model for review and communication.
_Avoid_: BPMN Process Model when referring only to appearance

**Modeling Copilot**:
The agent role that elicits missing process knowledge, challenges ambiguity, and iteratively shapes a BPMN Process Model while the human owns the decisions.
_Avoid_: Generator

**Modeling Skill**:
The single model-invoked, host-portable front door for Conversational Modeling. It carries a short core workflow and progressively loads specialized consulting, BPMN, quality, and compatibility guidance when relevant.
_Avoid_: Command catalog, wizard, host-specific agent

**Quality Report**:
A companion assessment that makes model-validity findings, assumptions, and unresolved process questions visible to the Process Consultant.
_Avoid_: Hidden validation

**Clean Export**:
A BPMN Process Model that passes all blocking Model Validity checks and contains no OpenBPMN-specific notes, statuses, or tags. It may still have non-blocking consulting-quality findings in a separate Quality Report and carries no implied Lifecycle Status.
_Avoid_: Approved model, annotated export

**Snapshot Export**:
A human-requested, point-in-time representation of the currently confirmed model for sharing or clarification. It may have unresolved questions, explicitly approved omissions, or blocking profile findings, but never silently presents itself as a Clean Export.
_Avoid_: Draft status, failed Clean Export

**Consulting Core**:
The BPMN concepts needed across the large majority of process discovery, documentation, analysis, and handoff scenarios encountered by Process Consultants.
_Avoid_: Complete BPMN 2.0 coverage, percentage of specification elements

**Consulting Core Profile**:
A versioned, explicit contract listing the BPMN concepts and attributes OpenBPMN supports at its full quality bar. It is informed by OMG conformance subsets without implying an official conformance claim.
_Avoid_: Full BPMN support, informal subset

**Supported Concept**:
A BPMN concept OpenBPMN can create from Structured Process Evidence, preserve semantically, include in a complete Process Diagram, validate, and export predictably. Anything below that bar is explicitly unsupported.
_Avoid_: Parseable element, best-effort support

**Deferred Concept**:
A valid BPMN concept deliberately outside the current Consulting Core Profile. OpenBPMN identifies the gap explicitly and never silently substitutes another concept.
_Avoid_: Partial support, approximate support

**Model Validity**:
Whether a BPMN Process Model satisfies XML integrity, BPMN schema, semantic-reference, and applicable Consulting Core Profile constraints. Model Validity is separate from consulting quality and Lifecycle Status.
_Avoid_: Readiness, approval, completeness

**Local-First**:
An operating boundary in which OpenBPMN provides no hosted service and process content remains within the environment deliberately chosen by the user.
_Avoid_: Offline, hosted platform

**Lightweight Core**:
The product constraint that OpenBPMN remains a small local skill and deterministic CLI with no service, database, account, workspace initialization, custom permission system, policy engine, or audit store. Its usefulness comes from consulting quality and reliable BPMN artifacts rather than platform breadth.
_Avoid_: Process platform, security platform, full-scale application

**Process Consultant**:
A practitioner who elicits, challenges, structures, and communicates business processes for discovery, analysis, and delivery.
_Avoid_: End user

**Process Operator**:
A practitioner responsible for carrying out or improving a business process who contributes knowledge of its actual activities, decisions, exceptions, and handoffs.
_Avoid_: Workflow engine, Host Agent

**Consulting Modeling Practice**:
The disciplined translation of incomplete, ambiguous, or contradictory stakeholder evidence into a scoped, appropriately abstracted, readable, and reviewable BPMN Process Model. It covers modeling judgment beyond notation correctness.
_Avoid_: Elite diagram, BPMN syntax knowledge

**Agent Workflow**:
A session-first interaction in which a Host Agent helps create or refine a BPMN Process Model through a natural, guided conversation. It requires no workspace initialization or durable project state.
_Avoid_: Automated process, wizard

**Execute-Then-Review**:
The default interaction pattern in which the Host Agent interprets a user prompt, generates or updates the model, and presents the result for reaction. Pre-action confirmation is reserved for consequential ambiguity, unsupported approximation, or destructive file replacement.
_Avoid_: Approval gate, confirmation-first workflow

**Agent-Native Experience**:
Conversational Modeling performed inside a user's existing agent environment, without requiring a standalone OpenBPMN application.
_Avoid_: OpenBPMN editor

**Host Agent**:
The user-chosen AI environment, such as Claude Code, Codex, or Copilot, that conducts the consulting dialogue, interprets source material, identifies gaps, and confirms assumptions. It hands Structured Process Evidence to OpenBPMN rather than authoring BPMN XML directly.
_Avoid_: OpenBPMN runtime, BPMN generator

**Host-Native Authority**:
The filesystem scope, approval prompts, and sandbox enforced by the user's chosen Host Agent. OpenBPMN operates within that authority and never requests, assumes, or grants broader access of its own.
_Avoid_: OpenBPMN permission system, universal sandbox

**Structured Process Evidence**:
Agent-independent input that records the agreed process scope, participants, activities, events, decisions, exceptions, handoffs, assumptions, and relevant source references. A Host Agent derives it from natural language and source material before OpenBPMN compiles a model.
_Avoid_: Prompt, raw document, BPMN XML

**Canonical Process Model**:
The normalized representation of the selected process meaning and stable element identities, independent of its diagram presentation and the conversation that established it.
_Avoid_: Process Diagram, Session State, BPMN XML

**Evidence Link**:
A traceable association between a modeled assertion and the process evidence or Modeling Decision supporting it. An Evidence Link communicates support or uncertainty without becoming part of the process meaning itself.
_Avoid_: Proof of truth, confidence score, BPMN Association

**Untrusted Process Evidence**:
Source material interpreted only as information about a process. Commands, prompts, scripts, links, and tool requests found inside it carry no authority to direct the Host Agent or OpenBPMN.
_Avoid_: Agent instruction, executable input

**Data-Minimized Artifact**:
An artifact that contains only the paraphrased evidence, display references, findings, and decisions needed for its purpose, excluding original source files, unnecessary passages, credentials, and detected secrets.
_Avoid_: Source archive, transcript

**OpenBPMN Core**:
The local, deterministic capability that owns the canonical process representation and compiles, validates, lays out, previews, and cleanly exports a BPMN Process Model. It remains usable and testable through a CLI without a Host Agent.
_Avoid_: Host Agent, standalone editor, hosted platform

**Downstream Modeling Tool**:
An external tool, such as SAP Signavio, Celonis, or Camunda Modeler, that imports a Clean Export and owns enterprise governance, collaboration, repositories, simulation, execution, or optional visual polishing.
_Avoid_: OpenBPMN dependency, OpenBPMN user interface

**Session State**:
Temporary process evidence, decisions, conflicts, assumptions, and review context held within the current Host Agent session. OpenBPMN does not require it to persist after the session ends.
_Avoid_: Workspace, repository state

**Modeling Decision**:
An explicit human choice that settles consequential process meaning such as scope, perspective, responsibility, routing, exception behavior, decomposition, or an accepted omission. It remains distinct from agent inference.
_Avoid_: Agent decision, implicit assumption

**Handoff File**:
An optional, explicitly requested portable snapshot of Session State used to continue work in another session or Host Agent. It is never created automatically and is separate from a Clean Export.
_Avoid_: Required sidecar, workspace

**Output Bundle**:
The three sibling deliverables produced by normal generation: a BPMN Process Model (`.bpmn`), a Read-Only Preview (`.svg`), and a machine-readable Quality Report (`.quality.json`). It contains no persistent Session State.
_Avoid_: Workspace, project database

**Bundle Replacement**:
A target-specific, human-authorized update that stages and validates an entire new Output Bundle before replacing an existing one. Routine model corrections may authorize replacement through natural language; the CLI never infers that authority from a filename collision.
_Avoid_: Implicit overwrite, per-file update

**Invalid Expert Export**:
An explicitly requested, separately named BPMN artifact that preserves known validation failures for expert inspection. It never replaces a valid Output Bundle or qualifies as a Clean Export.
_Avoid_: Snapshot Export, forced Clean Export

**Lifecycle Status**:
An optional, human-owned classification such as draft, working version, or approved. OpenBPMN neither infers nor requires a Lifecycle Status, and it does not embed one in a Clean Export.
_Avoid_: Quality finding, agent-assigned status

**Intentional Process Documentation**:
Human-approved explanatory content modeled with standard BPMN Text Annotations, Groups, and Associations because it communicates process meaning. It is distinct from OpenBPMN assumptions, warnings, provenance, and Lifecycle Status.
_Avoid_: Quality Report content, agent note

**Read-Only Preview**:
A locally generated SVG or HTML presentation used to inspect a BPMN Process Model without becoming a graphical modeling environment.
_Avoid_: Editor, source of truth

**Compatibility Profile**:
A documented and tested interpretation of a Downstream Modeling Tool's BPMN import expectations. It verifies a Clean Export without introducing vendor-specific data into the OpenBPMN Core.
_Avoid_: Vendor integration, deployment profile
