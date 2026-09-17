# BPMN Weave v0 implementation specification

Status: implementation-ready design, 2026-09-08. The owner delegated the remaining decisions and requires a finished, lean v0. This specification defines that product; it does not claim the product has been implemented or release-qualified.

## Problem Statement

People documenting or improving a business process must turn incomplete descriptions, differing stakeholder accounts, and operational knowledge into a model they can discuss and use. A plausible diagram can hide invented routing, unclear ownership, lost exceptions, or invalid interchange. Existing agent conversations can help interpret evidence, but the resulting artifact needs dependable BPMN semantics, readable presentation, and transparent limitations.

## Solution

BPMN Weave is one portable Modeling Skill and a deterministic local CLI. A Process Consultant or Process Operator describes the process in an existing Host Agent, reviews and corrects it naturally, and receives a portable BPMN file, SVG preview, and separate Quality Report. The complete agreed scope ships as v0.1.0 with working installation, focused documentation, reproducible checks, and precise support claims.

## User Stories

1. As a Process Operator, I want to describe how work happens in ordinary language so that I can document a process without writing XML.
2. As a Process Consultant, I want to provide local interviews or notes so that discovery starts from the evidence I already have.
3. As a Process Consultant, I want meaningful follow-up questions so that consequential ambiguity is settled without a rigid questionnaire.
4. As a Process Operator, I want an early faithful view of the currently expressible process so that I can react to something concrete.
5. As a Process Consultant, I want conflicting accounts and policy-versus-practice differences preserved so that a plausible model does not conceal disagreement.
6. As a Process Consultant, I want evidence references and Modeling Decisions linked to assertions so that I can explain why the model says what it says.
7. As a Process Operator, I want to correct names, responsibility, branches, and activities through conversation so that the model can evolve naturally.
8. As a Process Consultant, I want stable element identities during refinement so that changes remain understandable.
9. As a Process Consultant, I want participants, nested lanes, and message handoffs so that collaboration is represented correctly.
10. As a Process Consultant, I want supported decisions, synchronization, and event-based routing so that alternatives and concurrent work retain their meaning.
11. As a Process Consultant, I want the supported event families and legal boundary behavior so that triggers, delays, interruptions, and exceptions are explicit.
12. As a Process Consultant, I want subprocesses, same-file calls, and loop/multi-instance behavior so that decomposition does not hide meaning or break portability.
13. As a Process Operator, I want data artifacts and intentional process documentation so that information and explanatory context are visible where useful.
14. As a reviewer, I want readable diagrams showing all declared presentations so that I can inspect the process without repairing the layout.
15. As a user, I want a valid incomplete Snapshot Export so that I can share the current model before every process question is answered.
16. As a user, I want Clean Export eligibility explained separately from approval so that the tool does not assign my lifecycle labels.
17. As an expert, I want an explicitly requested invalid artifact in distinct files so that I can inspect defects without overwriting a valid bundle.
18. As a user, I want clear errors and preservation of previous output so that failed generation or refused replacement does not destroy my work.
19. As a user, I want optional cross-session Handoff so that I can continue in another supported Host Agent without keeping a project workspace.
20. As a power user, I want generation from complete structured input so that the Core remains useful without an AI account.
21. As a power user, I want to validate or render existing BPMN so that I can inspect artifacts without assuming semantic import or repair.
22. As an agent integrator, I want versioned inputs, results, and capability reporting so that tooling can react reliably to outcomes.
23. As a user, I want local execution with explicit prerequisites so that modeling adds no hosted service or hidden downloads.
24. As a user, I want installation and operation verified on the declared platforms and Host Agent surfaces so that the quickstart works beyond the maintainer's checkout.
25. As a downstream consumer, I want target-specific compatibility findings and evidence so that an untested vendor claim is never mistaken for a verified import.
26. As a contributor, I want a clean repository, canonical instructions, meaningful tests, and small reviewable changes so that I can maintain the product without reverse-engineering the planning history.
27. As a prospective user, I want honest examples, release notes, licensing, and support limits so that I can judge whether the tool fits my work.

## Implementation Decisions

- **Product scope:** implement the complete Consulting Core 1.0.0 and existing session-first workflow. Small size comes from a local skill and CLI; a partial-profile showcase is not a release.
- **Representation:** retain one OpenBPMN-owned Canonical Process Model derived from the structured semantic request. Evidence/review context and presentation are separate. No library object graph or chat state becomes authoritative process meaning.
- **Protocol:** use the closed versioned record shapes, stable reference rules, CLI options, export table, and report check applicability in the structured contract. Encode them as JSON schemas and behavioral tests. The Handoff preserves one semantic request, not two competing model copies.
- **Runtime:** one TypeScript package on Node 24.x. The exact selected moddle, layout, Viewer, Puppeteer Core, WASM validator, and font versions are pinned in the toolchain decision and lockfile.
- **Layout:** the owned adapter accepts initial alpha-library geometry, checks semantic preservation and coverage, and completes supported geometry such as Data Input/Output. Every supported visible element is accounted for.
- **Rendering:** the packaged bpmn-js Viewer runs in an installed local Chrome/Edge with a fresh temporary profile, packaged fonts, network restrictions, and stable SVG identifier normalization. A self-contained SVG sheet includes primary and secondary diagram panels. No browser is bundled or downloaded implicitly.
- **Validation:** the packaged official BPMN schemas and local WASM validator perform XSD checks. Separate semantic/profile/DI rules and consulting/evidence findings prevent a successful parse from standing in for complete validation.
- **Export:** valid snapshots can retain declared questions and profile limitations in the separate report; clean output requires all applicable validity checks. Expert output has explicit flags and distinct destinations. Failures preserve prior output under the documented handled-failure guarantee.
- **Agent behavior:** implement one progressive Modeling Skill with shared examples and references. Local Codex CLI, Claude Code, and Copilot CLI are the required surfaces; host-specific discovery contains no duplicate consulting method.
- **Downstream support:** implement separate Signavio Process Manager, Celonis Analysis Conformance, and Celonis Process Management fit profiles. Local qualification packs are required; actual tenant checks govern verified vendor claims and are never fabricated when access is unavailable.
- **Public identity:** use BPMN Weave, executable/skill `bpmn-weave`, package `@ve250104/bpmn-weave`, and first finished product version 0.1.0. Keep the existing repository URL and format identifiers stable.
- **Distribution:** the primary platform bundle includes a private pinned Node 24 runtime, inventoried production dependencies, CLI/assets, and matching canonical skill, with explicit setup/doctor/update/uninstall. No system Node/npm or checkout is required. Secondary npm tarballs and skill ZIPs agree with the same build. Checksums, measured footprint, support status, and concise documentation travel with candidate evidence; installation success does not qualify a release.
- **Repository quality:** use a small understandable structure, one authoritative source for each contract, useful errors, runnable examples, targeted tests, and actual license/provenance records. Keep historical planning out of normal user setup and runtime context.

## Testing Decisions

The highest test seam is the installed CLI: complete input and explicit options produce inspectable artifacts and one result envelope. Core tests use the same result/semantic contracts; internal adapter tests focus on real failure injection and library-specific behavior rather than implementation structure.

The acceptance contract defines every required check, fixture family, review criterion, and threshold. In particular:

- Map every supported concept, placement, and attribute rule to positive and negative evidence, including invalid and Deferred families.
- Compare independent expected semantic projections with input, serialized XML, and laid-out output. A production compiler cannot generate its own answer key.
- Validate exact exported XML with the official XSD set and explicit semantic/profile checks; require complete DI and all-panel rendering.
- Use eight composition cases, six discovery cases with held-out examples, adversarial inputs, and repeatable 25/100/250-node scale cases.
- Require deterministic XML/SVG and findings in pinned environments, stable retained identities across edits, and meaningful visual/readability checks.
- Test every documented command, flag combination, exit class, file-safety invariant, and optional Handoff path, including interruption limitations.
- Install the actual packed artifact on the required platform matrix and run the documented workflow outside the source checkout. Verify footprint and runtime budgets.
- Run the real Modeling Skill on all three declared Host Agent surfaces and perform the specified cross-host Handoff transfers. Record actual human review separately from agent-assisted checks.
- Keep tenant observations distinct from local consumer-fit rules. Unavailable access is unverified, never a pass or a blanket compatibility claim.

The repository now has development tests and installed-artifact checks. The historical runtime-selection harness provides feasibility evidence and regression seeds; neither it nor passing development tests substitutes for complete profile, security, host, performance, or release qualification.

## Out of Scope

- Hosted processing, accounts, database, service, or a persistent process workspace.
- A standalone chat application or full graphical BPMN editor.
- General document ingestion, arbitrary third-party BPMN semantic import/repair, and engine deployment.
- Vendor API integration, organizational knowledge platform, automatic ROI scoring, or automation execution.
- Public plugin framework, separately published SDK, and duplicated host-specific workflows.
- Claiming release completion from prototypes, synthetic examples, unrun checks, or an unfinished concept matrix.

## Further Notes

The detailed decisions each have one home:

| Read when | Canonical contract |
| --- | --- |
| Establishing completion and product scope | [V0 release contract](product-direction.md) and [product boundary](product-boundary.md) |
| Selecting notation, placement, and supported concepts | [Consulting Core Profile](consulting-core-profile.md) |
| Implementing structured input, flags, reports, export, or Handoff | [Protocol contract](contracts.md) |
| Implementing semantics, layout, rendering, or validation | [Architecture](architecture.md) and [selected runtime](runtime-toolchain.md) |
| Implementing conversation and host behavior | [Agent Workflow](agent-workflow.md) and [release plan](release-plan.md) |
| Implementing output safety and local operation | [Local trust contract](local-trust-and-file-safety.md) |
| Creating tests or determining release readiness | [Acceptance and compatibility](acceptance-and-compatibility.md) |
| Shipping, documenting, or maintaining the product | [Release plan](release-plan.md) |

Build tickets are complete behavioral slices through these contracts. Their sequence is an implementation strategy, not a reduction of the v0 deliverable. The release remains open until all required implementation and qualification tickets are complete.
