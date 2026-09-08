# Product direction and v0 release contract

OpenBPMN turns messy operational evidence into a process model people can inspect, challenge, and use. Its audience includes process consultants, operators, and teams discovering what to document, improve, or automate. A portable BPMN artifact is the practical deliverable; faithful process understanding is the product value.

The deliverable is a finished, usable v0. A user must be able to install it, model their own process, refine it through conversation, and obtain reliable artifacts without help from the maintainer. The intended impression is well rounded, thought through, practical, clean, lean, and good.

## Scope and completion

V0 implements the agreed product boundary, Agent Workflow, Consulting Core Profile, and local trust contract. This includes:

- The portable Modeling Skill and its documented, verified Host Agent entry points.
- Conversational creation and refinement from process descriptions or local evidence, and optional continuation through a Handoff File.
- All four CLI commands: `generate`, `validate`, `render`, and `capabilities`.
- The complete Consulting Core 1.0.0 Supported concept matrix, including semantic, validation, DI, rendering, and positive/negative fixture coverage.
- Reliable BPMN files, readable SVG previews, and separate machine-readable Quality Reports.
- The agreed Snapshot, Clean, and Invalid Expert Export behavior, stable identities during refinement, and human ownership of lifecycle labels.
- Predictable input handling, file replacement, failure preservation, and local operation.
- Downstream qualification and precise compatibility documentation for the agreed target profiles.
- A versioned, installable distribution with documentation, examples, licenses and notices, automated checks, and a practical contribution workflow.

The small size comes from the local skill-and-CLI product boundary. Completion within that scope is required. Existing exclusions, including a hosted platform, full graphical editor, and arbitrary third-party semantic import and repair, remain explicit.

V0 is finished when supported paths work end to end, the release acceptance suite passes, installation works from the distributed artifact in a clean supported environment, and documentation matches actual behavior. Required paths cannot depend on stubs, scripted answers, manually repaired output, undocumented setup, or a maintainer operating the tool.

A narrow successful example, partial-profile implementation, proof of concept, or prototype is not the deliverable. Development can proceed incrementally; those intermediate checkpoints do not count as v0 completion. Layout, rendering, validation, and packaging difficulties must be resolved within the agreed requirements. They do not authorize silently dropping required concepts or making required artifacts optional. A required capability that remains unproved or fails its checks leaves v0 unfinished.

## Repository and product standard

- A clear README explains the problem, intended user, installation, one working example, and the actual scope. It makes implemented behavior easy to distinguish from future ideas.
- A new user can complete the documented workflow without studying internal planning documents.
- The repository has a small, understandable structure, one canonical source for each instruction or contract, consistent terminology, and discoverable tests.
- Every shipped command, option, dependency, abstraction, and document has a concrete purpose in the supported workflow. Speculative extensions and duplicated host logic do not earn a place.
- Examples illustrate the released product. The tool also works on process inputs independent of those examples.
- Errors explain the problem and a useful next step; success messages and previews make the result easy to inspect.
- Documentation and release claims are precise. Tests establish supported behavior, and compatibility claims cite actual checks.
- Historical research and planning remain available without dominating the user-facing entry point or being shipped as required runtime context.

## Quality evidence

| Dimension | Required evidence |
| --- | --- |
| Faithfulness | Activities, branches, and responsibilities trace to supplied evidence or explicit Modeling Decisions. |
| Judgment | Conflicting accounts, missing rules, and policy-versus-practice differences remain visible. Clarification focuses on consequential choices. |
| Usefulness | A user can model their own process, understand its handoffs and outcomes, and make corrections through conversation. |
| Notation and coverage | Every Supported Concept meets the agreed semantic, validation, DI, and rendering contract across representative cases. |
| Presentation | Labels are readable, responsibility is clear, and users can follow supported scenarios without repairing generated layout. |
| Reliability | Repeated deterministic runs agree; invalid input and failures behave predictably; unsuccessful replacement preserves the previous bundle. |
| Installation | The distributed version completes the documented workflow in each supported environment. |
| Portability | Named downstream checks identify the artifact, product/version, operation, result, and any loss. Unavailable checks remain unverified. |
| Honest evidence | Synthetic fixtures, human review, measured performance, and actual user experience are separately identified. |

These are release requirements, not claims that the current repository already meets them. The [acceptance contract](acceptance-and-compatibility.md) defines exact thresholds and qualification procedures. XML validity alone cannot establish evidence fidelity; topology alone cannot establish measured bottlenecks, savings, or automation feasibility.

## Examples and evaluation

The existing [synthetic automotive AR discovery pack](../eval/fixtures/automotive-ar-discovery/source-pack.md) is one regression and documentation case. It exercises different unit practices, policy-versus-practice conflicts, meaningful clarification, correction, and export. It is not the product scope or completion criterion.

The release corpus must also cover supported notation, exceptional paths, invalid requests, collaborations, subprocesses, and data/documentation artifacts. End-to-end cases independent of the introductory example must prevent hardcoded fixture behavior from satisfying acceptance.

Synthetic inputs and authored clarifications must be identified. Do not describe fixtures as customer deployments or imply that the accounts were verified against real operations. A walkthrough or recording may explain the finished product; it cannot replace that product.

## Product context and planning

The [primary-source research note](research/workflow-context-primary-sources.md) describes an adjacent operational-discovery workflow and the limits of that comparison. It establishes no integration, endorsement, customer requirement, or another company's internal use of BPMN.

The Wayfinder destination is the [implementation-ready specification](v0-spec.md) for this finished v0. Completing the map alone does not complete the product. The [release plan](release-plan.md) settles public positioning, branding, licensing, and packaging; the [acceptance contract](acceptance-and-compatibility.md) settles qualification thresholds. Execution and release evidence remain build work.
