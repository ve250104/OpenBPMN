# BPMN Weave

Turn process descriptions and conversations into reviewable BPMN 2.0 models.

BPMN Weave is designed to work inside an existing agent session: describe how work happens, clarify the important gaps, and refine the result through discussion. One portable Modeling Skill works with a small deterministic local CLI. The output is a standards-based BPMN file, a readable SVG preview, and a separate Quality Report.

## Status

The v0 design is complete; implementation is next. There is no installable product release yet. The target is a finished, usable v0.1.0 covering the complete agreed scope—not a demo or a partial-profile showcase.

- [Implementation specification](docs/v0-spec.md)
- [Build tickets and sequence](docs/build-plan.md)
- [Supported BPMN scope](docs/consulting-core-profile.md)
- [Acceptance and compatibility requirements](docs/acceptance-and-compatibility.md)
- [Runtime selection and measured feasibility evidence](docs/runtime-toolchain.md)

## Product boundary

The Host Agent handles the conversation and process evidence. The local Core owns model compilation, validation, layout, and export. No hosted service, account, database, project workspace, or graphical editor is provided.

Process questions and quality findings stay outside the BPMN file. Users can request an incomplete, structurally valid snapshot for discussion; the tool does not assign approval or lifecycle status. The planned CLI also validates and renders existing BPMN without implying semantic import or repair.

The required agent surfaces are Codex CLI, Claude Code, and GitHub Copilot CLI. SAP Signavio and distinct Celonis workflows have explicit qualification profiles; no verified vendor-import claim is made before the corresponding test.

## Project

The repository keeps its original OpenBPMN URL; the public product name is BPMN Weave. The [release plan](docs/release-plan.md) defines packaging, prerequisites, attribution, and maintenance.

Inspired by [bpmn-js](https://github.com/bpmn-io/bpmn-js) and the agent-first workflow of [diagram-design](https://github.com/cathrynlavery/diagram-design). Project-authored material uses the [MIT license](LICENSE); third-party components retain their own terms.
