# OpenBPMN

OpenBPMN is an open-source effort for conversational creation of BPMN 2.0 Process Models. It serves Agent Workflows while presenting process-consulting expertise as its primary professional identity.

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

**Quality Report**:
A companion assessment that makes model-validity findings, assumptions, and unresolved process questions visible to the Process Consultant.
_Avoid_: Hidden validation

**Clean Export**:
A BPMN Process Model that can be exported at any point without OpenBPMN-specific notes, statuses, or tags embedded in it. Any Quality Report remains a separate companion artifact.
_Avoid_: Annotated export

**Consulting Core**:
The BPMN concepts needed across the large majority of process discovery, documentation, analysis, and handoff scenarios encountered by Process Consultants.
_Avoid_: Complete BPMN 2.0 coverage, percentage of specification elements

**Local-First**:
An operating boundary in which OpenBPMN provides no hosted service and process content remains within the environment deliberately chosen by the user.
_Avoid_: Offline, hosted platform

**Process Consultant**:
A practitioner who elicits, challenges, structures, and communicates business processes. Process consultants are OpenBPMN's primary professional audience.
_Avoid_: End user

**Agent Workflow**:
An automated or human-guided interaction in which an AI coding agent helps create or refine a BPMN Process Model.
_Avoid_: Automated process

**Agent-Native Experience**:
Conversational Modeling performed inside a user's existing agent environment, without requiring a standalone OpenBPMN application.
_Avoid_: OpenBPMN editor

**Host Agent**:
The user-chosen AI environment, such as Claude Code, Codex, or Copilot, that conducts the consulting dialogue, interprets source material, identifies gaps, and confirms assumptions. It hands Structured Process Evidence to OpenBPMN rather than authoring BPMN XML directly.
_Avoid_: OpenBPMN runtime, BPMN generator

**Structured Process Evidence**:
Agent-independent input that records the agreed process scope, participants, activities, events, decisions, exceptions, handoffs, assumptions, and relevant source references. A Host Agent derives it from natural language and source material before OpenBPMN compiles a model.
_Avoid_: Prompt, raw document, BPMN XML

**OpenBPMN Core**:
The local, deterministic capability that owns the canonical process representation and compiles, validates, lays out, previews, and cleanly exports a BPMN Process Model. It remains usable and testable through a CLI without a Host Agent.
_Avoid_: Host Agent, standalone editor, hosted platform

**Downstream Modeling Tool**:
An external tool, such as SAP Signavio, Celonis, or Camunda Modeler, that imports a Clean Export and owns enterprise governance, collaboration, repositories, simulation, execution, or optional visual polishing.
_Avoid_: OpenBPMN dependency, OpenBPMN user interface

**Working State**:
Local, structured companion data that preserves process evidence, assumptions, unresolved questions, and review status between Agent Workflow sessions. Working State stays outside a Clean Export.
_Avoid_: BPMN extension data, chat history

**Read-Only Preview**:
A locally generated SVG or HTML presentation used to inspect a BPMN Process Model without becoming a graphical modeling environment.
_Avoid_: Editor, source of truth

**Compatibility Profile**:
A documented and tested interpretation of a Downstream Modeling Tool's BPMN import expectations. It verifies a Clean Export without introducing vendor-specific data into the OpenBPMN Core.
_Avoid_: Vendor integration, deployment profile
