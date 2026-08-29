# Inspiration boundaries for OpenBPMN

_Research snapshot: 2026-08-29. Upstream sources are pinned to the commits linked below unless the link is explicitly a live GitHub search._

## Decision

OpenBPMN should be a **conversational BPMN modeling copilot with a deterministic local compiler**, not another graphical editor and not a generic diagram generator.

The strongest reusable boundary is:

```text
agent host + consulting skill
        ↓ process evidence / decisions
canonical process model
        ↓
deterministic BPMN compiler + quality rules
        ↓
vendor-neutral .bpmn + separate quality report
        ↓
optional layout / preview / downstream-tool adapters
```

Use `bpmn-moddle` as the leading candidate for standards-aware BPMN object/XML handling. Evaluate `bpmn-auto-layout` behind a replaceable layout adapter. Use `bpmn-js` only as an optional browser preview or compatibility-test adapter unless a later decision introduces a visual editor. Borrow `diagram-design`'s progressive-disclosure, quality-gate, and multi-host packaging patterns, but do not copy its hand-authored SVG output model or its large visual taxonomy.

OpenBPMN's current public name should be reconsidered before promotion: an active, established project already presents itself as **Open BPMN**, operates `open-bpmn.org`, and occupies the graphical-modeling-platform position. The differentiating position is the **local, agent-native process-consulting copilot**, not “an open BPMN editor.”

## What each inspiration actually is

### `bpmn-js`: a web viewer/modeler assembled from separable services

`bpmn-js` describes itself as a browser library to view and edit BPMN 2.0. It explicitly builds on `bpmn-moddle` for BPMN XML and `diagram-js` for rendering/editing, rather than treating XML, semantics, rendering, and interaction as one concern ([README](https://github.com/bpmn-io/bpmn-js/blob/bdbabd1c2531a95edc9d9b18f0080929849bc286/README.md#L5-L18), [related projects](https://github.com/bpmn-io/bpmn-js/blob/bdbabd1c2531a95edc9d9b18f0080929849bc286/README.md#L70-L77)).

Its code exposes progressively larger compositions: a viewer, navigation, and then a modeler with interaction and modeling modules. Consumers may inject or replace services through `additionalModules` ([modeler extension surface](https://github.com/bpmn-io/bpmn-js/blob/bdbabd1c2531a95edc9d9b18f0080929849bc286/lib/Modeler.js#L66-L127), [module composition](https://github.com/bpmn-io/bpmn-js/blob/bdbabd1c2531a95edc9d9b18f0080929849bc286/lib/Modeler.js#L157-L207)). Its import/export lifecycle also separates parsing, rendering, XML serialization, and SVG serialization, with hooks and warnings around those stages ([XML import](https://github.com/bpmn-io/bpmn-js/blob/bdbabd1c2531a95edc9d9b18f0080929849bc286/lib/BaseViewer.js#L220-L300), [XML export](https://github.com/bpmn-io/bpmn-js/blob/bdbabd1c2531a95edc9d9b18f0080929849bc286/lib/BaseViewer.js#L394-L466), [module injection](https://github.com/bpmn-io/bpmn-js/blob/bdbabd1c2531a95edc9d9b18f0080929849bc286/lib/BaseViewer.js#L730-L750)).

**Lesson:** copy the _seams_, not the product shape. Parsing/serialization, semantic mutation, layout, rendering, and interaction should be separately testable. A full browser modeler would add a DOM, interaction stack, styling, and editor UX that the MVP explicitly does not need.

### `diagram-design`: an agent-native, progressively disclosed design system

`diagram-design` is primarily an agent skill that produces self-contained HTML/SVG rather than an application. Its core skill selects a semantic pattern first and a layout grammar second, then loads only the chosen reference; this keeps behavior separate from visual form and avoids loading the whole design system into every interaction ([skill overview and selection](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/skills/diagram-design/SKILL.md#L1-L22), [semantic-pattern routing](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/skills/diagram-design/SKILL.md#L69-L93)). It asks the agent to state the chosen type, size, and cuts before drawing ([confirmation gate](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/skills/diagram-design/SKILL.md#L151-L154)) and supplies explicit complexity budgets and a pre-output checklist ([budgets](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/skills/diagram-design/SKILL.md#L370-L408), [quality gate](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/skills/diagram-design/SKILL.md#L444-L499)).

The project also keeps one skill implementation behind thin native manifests for multiple agent hosts. Its ADR explicitly rejects copying the skill into host-specific directories because that would create multiple sources of truth ([multi-host ADR](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/docs/adr/0008-native-host-manifests-share-one-plugin-root.md#L5-L17)); the Codex manifest points its `skills` field at that shared root ([Codex manifest](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/.codex-plugin/plugin.json#L1-L43)).

**Lesson:** OpenBPMN should ship a small, trigger-rich front door and load BPMN modeling references and rules only when relevant. Claude Code, Codex, Copilot-like hosts, and future MCP/CLI integrations should all call the same core and share one canonical set of consulting instructions.

## Recommended architectural seams

| Seam | Responsibility | Boundary rule | Inspiration |
| --- | --- | --- | --- |
| **Consulting interaction** | Elicit scope, actors, responsibilities, events, decisions, exceptions, handoffs, assumptions, and approval through rounds | Produces structured process evidence and decisions; never hand-writes XML | `diagram-design`'s plan-before-draw and progressive references |
| **Canonical process model** | Hold the agent-independent meaning of the process and stable identities across revisions | No vendor extensions, coordinates, presentation state, or agent-host state | `diagram-design`'s separation of behavior from layout; `bpmn-js`'s semantic/DI separation |
| **BPMN compiler** | Map the canonical model deterministically to BPMN 2.0 semantic elements and serialize clean XML | No LLM-generated raw XML in the trusted output path | `bpmn-moddle` |
| **Quality engine** | Return structural, BPMN-semantic, and consulting-quality findings with machine-readable codes | Findings are a separate companion artifact; export remains clean and available at any time | `bpmn-js` warnings/lifecycle plus `diagram-design`'s explicit quality gates |
| **Layout adapter** | Add or regenerate BPMN Diagram Interchange (DI) | Replaceable and deterministic; it cannot change process meaning | `bpmn-auto-layout` |
| **Preview adapter** | Render a reviewable diagram and perform visual smoke checks | Optional browser concern; never required to create valid `.bpmn` | `bpmn-js` Viewer/BaseViewer |
| **Interoperability profiles** | Test vendor-neutral output against named downstream consumers | Tests and compatibility guidance, not vendor-specific data in the core model | `bpmn-js` moddle-extension seam, used only later if a profile is justified |
| **Agent-host adapters** | Expose the same workflow to Codex, Claude Code, and equivalents | Thin manifests/instructions call one shared core | `diagram-design` multi-host packaging |

This split keeps the package useful without any agent: the CLI/core can compile, validate, lay out, and inspect structured input. The agent skill adds the consultative behavior. That is important for reliability, testability, and CV positioning: the project demonstrates both process-modeling judgment and sound open-source boundaries.

## Reuse recommendations

### Adopt or evaluate directly

1. **`bpmn-moddle` — adopt as the first implementation candidate.** Its public API reads and writes BPMN 2.0 in Node.js and browsers, creates typed BPMN elements, returns warnings/references/IDs, and serializes the resulting object tree ([usage](https://github.com/bpmn-io/bpmn-moddle/blob/84dca5154e815139e12bb9d8f5edfb72b817ed0e/README.md#L5-L44)). It is standard MIT-licensed ([license](https://github.com/bpmn-io/bpmn-moddle/blob/84dca5154e815139e12bb9d8f5edfb72b817ed0e/LICENSE#L1-L21)). Keep an OpenBPMN-owned compiler interface around it so the domain model is not the library's object graph.

2. **`bpmn-auto-layout` — evaluate behind an adapter, do not bake it into the public model.** Its API accepts BPMN XML, generates complete DI for processes and collaborations, returns warnings, supports Node/browser usage, and offers a CLI ([README](https://github.com/bpmn-io/bpmn-auto-layout/blob/5bd1a8cb69c4fb663401c08f92f217bf89cf9520/README.md#L1-L49)). Its documented contract prioritizes valid geometry and narrative, discards existing coordinates, and uses BPMN declaration order for byte-identical output ([layout contract](https://github.com/bpmn-io/bpmn-auto-layout/blob/5bd1a8cb69c4fb663401c08f92f217bf89cf9520/docs/LAYOUT.md#L1-L20)). That fits generation well. However, the inspected version is `2.0.0-alpha.2`, requires Node 22.12+, and its repository snapshot declares MIT in the README/package metadata but contains no root `LICENSE` file ([package metadata](https://github.com/bpmn-io/bpmn-auto-layout/blob/5bd1a8cb69c4fb663401c08f92f217bf89cf9520/package.json)). Before adoption, verify the published package's license payload, pin the version, and run OpenBPMN's own fixture/compatibility suite.

3. **`bpmn-js` — use as an optional dependency or test tool, not the core.** Its Viewer can import BPMN XML and surface warnings, and BaseViewer can serialize XML and SVG; that makes it useful for previews and browser smoke tests. The full modeler composes many editing modules, which is unnecessary weight for an agent-native MVP ([modeler module list](https://github.com/bpmn-io/bpmn-js/blob/bdbabd1c2531a95edc9d9b18f0080929849bc286/lib/Modeler.js#L157-L207)).

4. **`diagram-design` — reuse patterns; copy source only deliberately.** Its MIT license permits reuse if the copyright and permission notice accompany substantial copied portions ([license](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/LICENSE#L1-L20)). OpenBPMN likely needs none of its SVG templates or icon assets. If any code, prose, or assets are copied, preserve attribution and carry forward the relevant third-party notices; `diagram-design` models this with a dedicated provenance file ([third-party licenses](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/THIRD_PARTY_LICENSES.md#L1-L43)).

### Licensing constraints

- `bpmn-js` is **not plain MIT in practice**: its license adds a condition that the source responsible for the bpmn.io watermark must not be removed or changed and that the watermark remain visible in websites/applications ([license](https://github.com/bpmn-io/bpmn-js/blob/bdbabd1c2531a95edc9d9b18f0080929849bc286/LICENSE#L1-L23)). Any distributed preview based on it must retain the watermark and notices. Do not vendor or modify it casually; record the exact package and license in third-party notices.
- `bpmn-moddle` is a cleaner core dependency because its repository carries the standard MIT grant and has no rendering watermark condition.
- A repository-level `THIRD_PARTY_LICENSES.md` or `NOTICE` should record direct dependencies, copied material, upstream commit/version, license, and use location. Automate license checks, but do not treat a package-manager `license` string as equivalent to inspecting the shipped license text.
- These are engineering recommendations, not legal clearance. A maintainer should review licenses and the final product name before the first public release.

## Interaction patterns to borrow

1. **Rounds, not one shot.** Establish a minimum viable process scope, produce an early model, critique it, and iterate. Do not delay export, but keep unresolved quality findings outside the clean `.bpmn` file.
2. **Declare the modeling contract before compilation.** Surface audience, process boundary, desired level of detail, participant/lane assumptions, and downstream target. This is the BPMN equivalent of `diagram-design`'s format/size/detail/audience dials ([output dials](https://github.com/cathrynlavery/diagram-design/blob/ac490fd1ac4b4014100f93e729cb4ad198700bd4/skills/diagram-design/SKILL.md#L542-L553)).
3. **Separate semantic choice from visual layout.** The conversation decides process meaning; deterministic tooling decides XML and DI. Layout must never silently invent or remove a BPMN element.
4. **Return structured findings.** Every compile/layout/quality phase should return stable codes, human explanations, and element IDs. `bpmn-auto-layout` already distinguishes fatal errors from non-fatal warnings and verifies emitted DI coverage ([input and validation](https://github.com/bpmn-io/bpmn-auto-layout/blob/5bd1a8cb69c4fb663401c08f92f217bf89cf9520/docs/LAYOUT.md#L52-L74)).
5. **Progressive disclosure for agents.** Keep the entry skill small. Put BPMN element guidance, consulting question banks, quality rules, downstream profiles, and examples in referenced files selected by the current need.
6. **One canonical implementation across hosts.** Manifests should describe/install the same package and skill; they should not fork OpenBPMN behavior by host.
7. **Adversarial fixtures and golden artifacts.** Treat each generated `.bpmn`, quality report, and rendered preview as a testable artifact. Pair schema/semantic assertions with import smoke tests and visual review rather than relying on prose instructions alone.

## What OpenBPMN should deliberately avoid copying

- **Do not build `bpmn-js` again.** A palette, properties panel, drag/drop canvas, keyboard system, and rich manual modeler would erase the lightweight agent-native boundary and compete where mature tools already exist.
- **Do not let a browser renderer become the domain model.** `bpmn-js` has useful extension seams, but its service graph and DI/canvas objects should remain behind a preview adapter.
- **Do not ask the language model to emit final XML directly.** The agent should propose structured process meaning; deterministic code should assign IDs, create references, serialize XML, generate DI, and report failures.
- **Do not copy `diagram-design`'s visual grammar.** Hand-authored inline SVG, a 39-type taxonomy, branding profiles, and editorial diagram constraints solve a different problem. BPMN notation and interchange fidelity outrank bespoke styling.
- **Do not create one giant BPMN skill.** Large taxonomies and all rules in a single always-loaded file waste context and make behavior harder to test. Use a small router plus targeted references.
- **Do not embed review metadata in exported BPMN.** The Quality Report, discussion state, and agent trace stay beside the clean model, consistent with export-at-any-time.
- **Do not lead with “AI diagram generator.”** It sounds like a commodity one-shot visual tool and obscures the consulting contribution. Lead with process discovery, modeling quality, iterative challenge, and downstream-ready BPMN.
- **Do not claim universal BPMN conformance or vendor compatibility.** Publish a consulting-core conformance matrix and evidence from downstream import tests.
- **Do not duplicate skills per agent host.** Thin host adapters should point to a single skill/core release.

## Name and positioning landscape

GitHub's case-insensitive repository-name search for `OpenBPMN` returned only `ve250104/OpenBPMN` at the time of research ([live exact-name query](https://api.github.com/search/repositories?q=OpenBPMN+in:name)). That does **not** make the name clear.

The adjacent spelling is already established: [`imixs/open-bpmn`](https://github.com/imixs/open-bpmn) was created in 2022, had 137 stars in the inspected GitHub metadata, was actively updated in August 2026, operates `open-bpmn.org`, and calls itself “Open BPMN” ([GitHub repository metadata](https://api.github.com/repos/imixs/open-bpmn)). Its scope is a graphical BPMN 2.0 modeling platform for analysts, architects, and developers, built on Eclipse GLSP with a metamodel, server, and client ([project README](https://github.com/imixs/open-bpmn/blob/c3004010b3a656f4e74c4218b8c46341ab7a93fb/README.md)). A broader GitHub name search also returns its integrations and similarly named repositories ([live broader query](https://api.github.com/search/repositories?q=Open-BPMN+in:name)).

Consequences:

- Search, spoken-word, and visual confusion is likely because punctuation and casing do little to distinguish “OpenBPMN” from “Open BPMN.”
- Positioning as an open graphical BPMN editor would collide directly with the established project.
- Before publishing packages, a website, or a CV campaign, run a wider clearance check across package registries, domains, organizations, and relevant trademarks. GitHub search is only a repository-landscape check.
- Prefer a distinct brand/subtitle whose name carries the differentiator: conversational process discovery, consulting quality, and agent-native BPMN. Renaming is cheapest now.

## Positioning recommendation

Use a claim such as:

> A local-first, agent-native BPMN modeling copilot that turns iterative process discovery into clean, vendor-neutral BPMN 2.0 and an explicit quality assessment.

That makes the consulting story primary:

- it elicits and challenges process knowledge rather than merely drawing;
- it demonstrates BPMN semantics, model quality, and interoperability judgment;
- it produces an auditable business artifact for Signavio, Celonis, documentation, or later implementation;
- it remains small because existing libraries handle XML, DI, and preview concerns behind narrow adapters.

## Follow-on decisions this research unlocks

1. Select and name the canonical process model between conversation and BPMN XML.
2. Define the consulting interaction state machine and what is required before the first draft.
3. Decide the compiler/quality public API and stable error taxonomy.
4. Prototype `bpmn-moddle` plus a pinned `bpmn-auto-layout` on representative consulting-core fixtures.
5. Decide whether MVP preview uses `bpmn-js`, another renderer, or only downstream-tool imports.
6. Choose a distinct public project/package name before significant adoption work.

## Source snapshot

- `bpmn-io/bpmn-js` at [`bdbabd1`](https://github.com/bpmn-io/bpmn-js/tree/bdbabd1c2531a95edc9d9b18f0080929849bc286)
- `bpmn-io/bpmn-moddle` at [`84dca51`](https://github.com/bpmn-io/bpmn-moddle/tree/84dca5154e815139e12bb9d8f5edfb72b817ed0e)
- `bpmn-io/bpmn-auto-layout` at [`5bd1a8c`](https://github.com/bpmn-io/bpmn-auto-layout/tree/5bd1a8cb69c4fb663401c08f92f217bf89cf9520)
- `cathrynlavery/diagram-design` at [`ac490fd`](https://github.com/cathrynlavery/diagram-design/tree/ac490fd1ac4b4014100f93e729cb4ad198700bd4)
- `imixs/open-bpmn` at [`c300401`](https://github.com/imixs/open-bpmn/tree/c3004010b3a656f4e74c4218b8c46341ab7a93fb)
