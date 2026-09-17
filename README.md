# BPMN Weave

Turn process descriptions and conversations into reviewable BPMN 2.0 models.

BPMN Weave helps process consultants document responsibilities, decisions, exceptions, and handoffs inside an existing agent session. Describe how work happens, clarify the important gaps, and correct the result through discussion. You receive a BPMN file, an SVG preview, and a separate Quality Report.

## Status

Development build: `0.1.0-dev.0`. The CLI and portable skill are being implemented and tested; **v0.1.0 is not released or qualified yet**. Full-profile readability, offline/platform qualification, and real host/human acceptance remain release gates. A successful example is not evidence that those gates passed.

- [Build progress](https://github.com/ve250104/OpenBPMN/issues/19)
- [Scope and verification status](docs/support.md)

## See the result

![Synthetic purchase approval model with three responsibility lanes and a correction loop](examples/purchase-approval.svg)

[Walk through a clarification and responsibility correction](docs/modeling.md#an-authored-example) · [Example BPMN](examples/purchase-approval.bpmn) · [Quality Report](examples/purchase-approval.quality.json)

This is an authored synthetic example under MIT, not a client engagement or recorded agent conversation. The linked walkthrough shows actual CLI outputs before and after a correction.

## Set up, then describe your process

The primary development setup uses an extracted platform bundle containing a private Node 24 runtime, the CLI, production dependencies, and the matching Modeling Skill. You need an existing Codex CLI, Claude Code, or GitHub Copilot CLI installation and an installed Chrome or Edge. You do not need system Node/npm or a source checkout for that bundle.

**No qualified public release is available yet.** Use an explicitly supplied development candidate and follow [Installation](docs/installation.md); do not assume an unpublished download or npm package exists. Setup selects your host, checks the local runtime/browser, and creates an example bundle. Local setup success does not establish real-host or platform release qualification.

After refreshing your agent session, start with:

> Use BPMN Weave to document our purchase approval process. Operations checks submitted requests and sends complete requests to the budget owner. Approved requests become purchase orders; rejected requests end. Show me the diagram and ask about any consequential gaps.

Review the SVG and correct it naturally: “The budget owner sends the purchase order; Operations only prepares it.” Ask explicitly for a Handoff if you want to continue in a new session. Normal modeling needs no process workspace or fixed interview questionnaire.

[Installation](docs/installation.md) · [Modeling guide](docs/modeling.md) · [Command reference](docs/commands.md) · [Troubleshooting](docs/troubleshooting.md)

## Product boundary

The Host Agent handles the conversation and process evidence. The local Core owns model compilation, validation, layout, and export. No hosted service, account, database, project workspace, or graphical editor is provided.

Process questions and quality findings stay outside the BPMN file. Users can request an incomplete, structurally valid snapshot for discussion; the tool does not assign approval or lifecycle status. The CLI also validates and renders existing BPMN without implying semantic import or repair.

The required agent surfaces are Codex CLI, Claude Code, and GitHub Copilot CLI.

## Project

The repository keeps its original OpenBPMN URL; the public product name is BPMN Weave. [Contributing](https://github.com/ve250104/OpenBPMN/blob/main/CONTRIBUTING.md) covers source builds and development; the [architecture](https://github.com/ve250104/OpenBPMN/blob/main/docs/architecture.md) and [build plan](https://github.com/ve250104/OpenBPMN/blob/main/docs/build-plan.md) explain the implementation contracts.

Inspired by [bpmn-js](https://github.com/bpmn-io/bpmn-js) and the agent-first workflow of [diagram-design](https://github.com/cathrynlavery/diagram-design). Project-authored material uses the [MIT license](LICENSE); [third-party notices](THIRD_PARTY_NOTICES.md) retain dependency terms and identify unresolved redistribution gates.
