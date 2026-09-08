# Model and artifact architecture

This decision defines the interfaces for the lightweight OpenBPMN Core. The implementation will live in one TypeScript/Node package containing the CLI and internal modules. The four CLI commands from the [Agent Workflow](agent-workflow.md) remain the caller's contract. Internal types and adapters are private to the package until a demonstrated external consumer justifies a separate library interface.

## Representation ownership

| Representation | Owns | Does not own |
| --- | --- | --- |
| Structured Process Evidence | Complete semantic request, evidence references, questions, accepted decisions and omissions | XML, dependency objects, generated coordinates |
| Canonical Process Model | Selected process meaning, stable identities, scope, containment, and semantic references | Conversation history, evidence provenance, layout, quality findings |
| Evidence Links and review context | Support for modeled assertions, unresolved claims, contradictions, and accepted omissions | BPMN control flow or hidden instructions |
| Diagram Layout | Bounds, waypoints, label placement, and selected presentation keyed by model IDs | Responsibility, conditions, routing, or process outcomes |
| BPMN serialization representation | Typed BPMN elements, namespace and reference mechanics, DI assembly, XML | Authoritative process decisions or persistent state |

The Canonical Process Model is a normalized form of the semantic portion of the input, not a second, independently maintained business ontology. Input and canonical types share the supported concept vocabulary. Normalization validates explicit structure, preserves identities, resolves references, and applies documented meaning-neutral defaults. It does not interpret raw prose or guess missing business rules.

The input schema is versioned independently of the Consulting Core Profile. Unknown schema versions and unrecognized semantic fields produce findings; they are never silently dropped. The input must identify the chosen Process or Collaboration and its complete selected semantic content. The exact field declarations follow from this contract during specification and implementation.

The Host Agent sends the complete current input each time. There is no persistent model store, patch protocol, or second session manager. Any canonical model included in an optional Handoff File is reproducible from its structured input; disagreement is a finding requiring resolution, never an implicit choice of whichever copy is newer.

## Identity and evidence

Every input element has an explicit, unique, stable key. The Host Agent retains that key when renaming, moving, or correcting the same element and creates a new key for a new element. The Core derives valid XML IDs deterministically from these keys. IDs must not depend on labels, array positions, or coordinates. Duplicate keys and reference collisions are errors. Without a retained key, the Core cannot infer identity across independent stateless calls.

Evidence Links remain in transient review context and the separate Quality Report or explicitly requested Handoff File. They may associate an element or modeled assertion with a concise source reference, an agent inference, or an explicit Modeling Decision. The deterministic Core can check that supplied links resolve and report missing support; it cannot establish that an interview is true or that a paraphrase faithfully captures a document it never received. Source interpretation and semantic fidelity require the Host Agent and evaluation against reviewed evidence.

The Core does not generate numerical confidence, measured bottlenecks, savings, or automation feasibility from topology alone. Reporting these would require evidence and a separately specified method. A clean BPMN export contains process meaning and diagram data only, including intentional standard BPMN documentation when requested.

## Internal modules

| Module | Small interface | Hidden implementation and invariants |
| --- | --- | --- |
| Model preparation | Complete structured request → canonical model, review context, findings | Input schema, stable IDs, reference resolution, profile concepts, and meaning-neutral normalization |
| Model assessment | Model or parsed BPMN, available review context, optional layout → findings | BPMN semantic constraints, profile constraints, consulting heuristics, coverage of checks |
| BPMN interchange | Model plus optional layout → XML; explicit XML → parsed document and findings | `bpmn-moddle` objects, references, namespace ordering, serialization, safe parsing |
| Diagram production | Canonical model plus presentation choices → layout; final XML with DI → SVG | Layout adapter, renderer adapter, text measurement, coordinate conversion, deterministic formatting |
| Output handling | Prepared artifact bytes plus explicit destination and replacement authority → result envelope | Reads at CLI entry, staging, bundle replacement, temporary data, cleanup, and existing file-safety rules |

These are ordinary internal modules in one package. The Core assembles them and returns one result to callers. Tests cross the same interfaces as their callers; internal seams are used to exercise actual variation and injected failures. There is no registry of arbitrary plugins, independently published module hierarchy, or public rule-extension framework.

The canonical model is treated as immutable after preparation. Dependency libraries may mutate private copies inside an adapter. Geometry and rendering must never mutate process meaning. Filesystem reads happen at the CLI entry, and writes happen in output handling; computation otherwise returns values. A renderer that requires a local process or temporary assets owns and cleans up those resources explicitly under the same local trust contract.

## Generation sequence

1. Read the explicit input, enforce input bounds, and validate its schema.
2. Prepare the Canonical Process Model and separate review context.
3. Assess semantic references, legal placement, flow scope, profile requirements, and applicable consulting checks.
4. Lay out the selected presentation and verify geometry coverage, containment, waypoints, and labels.
5. Compile semantics and DI into BPMN XML; parse the exact bytes again and run the applicable schema and semantic checks.
6. Render the exact final BPMN XML and its DI into the SVG preview. Rendering must not run a different layout or edit the XML.
7. Aggregate all findings and determine the export outcome using the dedicated Clean Export and Quality Report contract.
8. Stage the requested artifacts and write them only through the existing Output Bundle safety contract.

This is a logical ordering, not a requirement for one public operation per stage. A layout library that takes XML rather than the canonical model can serialize a private intermediate document inside its adapter. The adapter returns geometry keyed by the existing IDs; any semantic changes in library output cause a finding and prevent accepting that layout. OpenBPMN then serializes the authoritative model with the accepted geometry.

Expected input, semantic, profile, geometry, and external-document limitations return structured findings. Unexpected defects or unanticipated dependency failures become the established internal-failure result once at the Core interface. A dependency's raw stack or diagnostic payload never becomes a public finding schema. Failed prerequisites are reported as checks not run; skipped checks cannot contribute to a claim that validation passed.

Artifact eligibility, finding taxonomy, and incomplete-model behavior belong to [Define Clean Export and Quality Report behavior](https://github.com/ve250104/OpenBPMN/issues/8). This architecture must preserve that ticket's distinction between a valid but incomplete snapshot, a Clean Export, and an explicitly requested Invalid Expert Export. It does not authorize bypassing a blocked validity check or publishing a partial normal bundle.

## Validation depth

Parsing with `bpmn-moddle` is not XSD validation. Model assessment must distinguish input-schema checks, XML/BPMN schema validation, semantic-reference checks, profile checks, diagram checks, and consulting heuristics. Use the official BPMN 2.0.2 schemas shipped locally with an explicitly packaged validator. Qualify that validator's runtime, schema support, and distribution cost in the diagram prototype; no remote validator or system utility may be assumed present.

Checks include legal event placement, unresolved references, Sequence Flow scope including embedded subprocess containment, Message Flow participant relationships, and required DI. Policy-versus-practice conflicts and missing process evidence remain separate from BPMN validity. A quality finding can be accurate while the model is technically valid.

`validate` parses an explicitly supplied BPMN file and assesses the original document without first forcing it through the narrower canonical input schema. Unsupported elements must remain visible as findings rather than disappearing during normalization. When source evidence is absent, the report must say that evidence-dependent consulting checks were not run.

`render` uses the supplied DI and does not repair, lay out, or rewrite an external BPMN file. Missing DI, unsupported visible elements, or rendering failure are reported. Validating or rendering a file provides no semantic import or round-trip editing promise.

## Layout and rendering choices

Layout and rendering are internal seams because the dependency and runtime tradeoffs are still material. Keep their interfaces explicit, with one selected production adapter for each in a release. Users should not have to choose an engine for ordinary generation.

The default presentation is left-to-right with deterministic participant/lane ordering, readable labels, explicit subprocess presentation, and orthogonal connections where feasible. Diagram choices live beside the semantic request. The MVP does not accept freehand coordinate edits or infer that a visual ordering changes control flow. The prototype will qualify complex supported concepts and layouts with concrete fixtures.

Adopt `bpmn-moddle` for BPMN interchange behind the owned interface. Evaluate a specifically pinned published `bpmn-auto-layout` artifact behind the layout seam. Do not treat current repository documentation as proof of the published artifact's behavior, runtime floor, bundled files, or support for the full Consulting Core Profile. Adoption requires the actual artifact's positive and negative fixtures, notices, and footprint to be inspected.

Prefer a renderer that can meet the supported notation and visual quality requirements with a lightweight local installation. A browser-free implementation is a desired property, not established feasibility. `bpmn-js` Viewer in a local headless browser is a concrete reference route for visual checks, but it adds a browser runtime. The diagram prototype must choose and demonstrate the production rendering route, its actual installation footprint, and complete SVG behavior before packaging is settled. No production invocation may install or download a browser implicitly.

`bpmn-js` remains outside canonical semantics. A `bpmn-js-headless` name is not evidence of SVG support. Likewise, a custom SVG renderer would own real notation, label, and geometry work across the supported profile; it is not a trivial formatter. If no candidate meets both the agreed footprint and quality bar, the prototype must explicitly revisit that tradeoff rather than silently weakening either claim.

See the [artifact pipeline research](research/artifact-pipeline-primary-sources.md) for the dependency observations that make this qualification necessary. Exact package versions, rendering runtime, and XSD validator are acceptance outcomes of the already-planned diagram prototype, not additional architecture frameworks to build.

## Determinism and verification

For identical complete input, tool/profile/adapter versions, and presentation settings, canonical semantics, IDs, XML, DI, and machine-readable findings must be reproducible. Time, randomness, host conversation state, and machine-specific paths must not influence process artifacts. Preserve explicit input order where it expresses a presentation preference; use a stable order otherwise.

SVG structure should be reproducible under the qualified renderer configuration. Pixel-identical screenshots across arbitrary fonts, browsers, and operating systems are not promised. The prototype must fix font metrics and rendering conditions for visual comparisons and separately assess readability in a downstream viewer.

The implementation evidence must exercise:

- Stable identities after label and ownership edits, and deterministic repeated runs.
- Evidence Links surviving refinement in the report without leaking into BPMN metadata.
- No semantic changes introduced by layout or rendering.
- Parse-back and schema checks on the exact exported bytes.
- The diagram and XML expressing the same branches, events, handoffs, and labels.
- Expected failures returning findings and unrun checks being explicit.
- External BPMN validation retaining unsupported-feature findings.
- An injected layout, render, or write failure preserving the prior Output Bundle.

Exact corpus, visual tolerances, runtime budgets, and acceptance thresholds remain with their evaluation and prototype tickets. The demonstrator must satisfy the concrete [product direction](product-direction.md) as well as notation checks.
