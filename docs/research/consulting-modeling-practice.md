# Consulting-grade BPMN modeling practice

## Research question

What should OpenBPMN learn from consultant-authored process-discovery and documentation practice when it translates incomplete, ambiguous, or contradictory stakeholder evidence into a scoped, appropriately abstracted, readable, and reviewable BPMN Process Model?

This report focuses on modeling judgment beyond notation correctness. It derives product implications for the Modeling Copilot, Structured Process Evidence, consulting-quality rules, evaluation, and fixtures. It does not change the Consulting Core Profile or define implementation architecture.

## Executive answer

A consulting-grade result is not a diagram produced from all available statements at once. It is the result of an explicit, revisable chain of decisions:

1. establish the purpose, audience, current-state or future-state perspective, start trigger, and intended end results;
2. identify the process owner, knowledgeable participants, reviewers, and a shared vocabulary;
3. capture the ordinary successful path at a deliberately coarse level;
4. assign one responsible participant to each unit of work and expose cross-participant handoffs;
5. add decision logic and business-relevant exceptions one scenario at a time;
6. decompose where a section has a distinct result, materially lower granularity, or excessive visual complexity;
7. apply business-facing names and a predictable visual reading order; and
8. walk stakeholders through the happy path, decision outcomes, handoffs, and material exception paths, recording corrections and unresolved disagreements.

The sources support that sequence, but not a universal mechanical formula. IBM's discovery guidance starts with boundaries, owners and subject-matter experts, a first-pass happy path, and later revisions; its current product documentation explicitly treats the discovery map as a brainstorming/interview artifact before a detailed diagram. Camunda's first-party guidance similarly starts with the desired result, trigger, and always-required activities before introducing problems incrementally. IBM then uses scenario playback for stakeholder review. [IBM Redbooks, *Process and Decision Discovery Best Practices using IBM Blueworks Live*, Chapter 3](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf), [IBM, “Creating discovery maps”](https://www.ibm.com/docs/en/blueworks-live?topic=process-discovery-maps), [Camunda, “Modeling beyond the happy path”](https://docs.camunda.io/docs/components/best-practices/modeling/modeling-beyond-the-happy-path/), [IBM, “Getting started with process blueprints”](https://www.ibm.com/docs/en/blueworks-live?topic=started-getting-process-blueprints)

For OpenBPMN, this means that evidence, inference, and human decision must stay distinguishable. The Modeling Copilot may propose a model interpretation, but it must not silently choose between conflicting accounts, invent a missing owner or condition, or mistake an official procedure for observed current practice. It should produce a useful Snapshot Export from confirmed knowledge while keeping unresolved material questions visible in Working State and the Quality Report.

## Keep three kinds of rule separate

### 1. Normative BPMN requirements

Normative rules define whether a representation means what BPMN says it means. The OMG specification defines a Process as a graph of activities, events, gateways, and Sequence Flows; a Participant represents a business entity or role in a Collaboration; Lanes organize or categorize activities but their meaning is chosen by the modeler; and Message Flows connect separate Pools, not objects inside one Pool. These are semantic constraints, not advice about how a consultant should discover the process. [OMG, BPMN 2.0.2, §§9.3, 10.1, 10.7](https://www.omg.org/spec/BPMN/2.0.2/PDF/)

The same specification permits Processes at levels ranging from enterprise-wide to a single person's work. BPMN therefore does not select the useful abstraction level for a given engagement; the Process Consultant must do so. BPMN also excludes organizational models, functional decompositions, strategy, data models, and business-rules models from its scope, even though those inputs can inform a Process Model. [OMG, BPMN 2.0.2, §§2.2 and 10.1](https://www.omg.org/spec/BPMN/2.0.2/PDF/)

### 2. Consulting-practice heuristics

Heuristics improve discovery, stakeholder alignment, and communication, but they are contextual and should normally create advisory findings rather than Model Validity failures. Examples include starting with the happy path, using a verb-plus-object activity name, reviewing complexity after roughly seven peer elements, and playing back named scenarios. IBM presents these as discovery and design practices, not BPMN requirements. [IBM Redbooks, Chapters 3, 8, and 10](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf)

### 3. Tool-vendor conventions

Vendor guidance is useful evidence of mature modeling practice, but it is not automatically universal. Camunda recommends left-to-right flow, explicit split/join gateways, symmetric blocks, minimal crossings, and sometimes separate pools instead of lanes. SAP Signavio groups conventions under notation, labeling, process structure, and layout, while explicitly saying its rules are a starting point that organizations should adapt to their context. OpenBPMN should therefore adopt the intent—readability and consistency—without turning every vendor preference into a fixed invariant. [Camunda, “Creating readable process models”](https://docs.camunda.io/docs/components/best-practices/modeling/creating-readable-process-models/), [SAP Signavio, “Modeling Convention Rules for BPMN 2.0”](https://help.sap.com/docs/signavio-process-manager/workspace-admin-guide/modeling-convention-rules-for-bpmn-2-0)

## A consultant's translation loop

The following loop is the research synthesis recommended for OpenBPMN. “Evidence basis” reports what the sources establish. “OpenBPMN inference” is a product implication derived from those sources rather than a claim that a standard mandates the behavior.

| Stage | Evidence basis | OpenBPMN inference |
| --- | --- | --- |
| 1. Frame the engagement | IBM begins discovery by identifying process start and end points to focus the effort. Camunda begins with the desired end result and then the trigger. SAP supports audience-specific views, demonstrating that useful content depends on who will read it. [IBM Redbooks, Chapter 3](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf), [Camunda happy-path guidance](https://docs.camunda.io/docs/components/best-practices/modeling/modeling-beyond-the-happy-path/), [SAP Signavio, “Create views”](https://help.sap.com/docs/signavio-process-manager/user-guide/create-views) | Ask for purpose, audience, current/future-state perspective, start trigger, successful and unsuccessful end results, included/excluded work, and required variants before asking for detailed steps. Do not infer these from a process name. |
| 2. Establish authority and vocabulary | IBM distinguishes the accountable business owner from experts who perform or know the work and says the owner has the final say when viewpoints differ. IBM also exposes a shared glossary; SAP's AI input guidance asks for stable role/entity names and warns against switching synonyms. [IBM Redbooks, Chapter 3](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf), [IBM Blueworks Live overview](https://www.ibm.com/docs/en/blueworks-live?topic=blueworks-live-overview), [SAP Signavio, “Tips for Text Input to Create a Model”](https://help.sap.com/docs/signavio-process-manager/user-guide/tips-for-text-prompt-to-generate-diagram) | Record who supplied each claim, who can decide disputed meaning, which people must review it, and the canonical name plus aliases for every role, system, business object, and process. Lack of an identified decision authority is itself an unresolved question. |
| 3. Capture a coarse happy path | IBM's discovery map intentionally omits gateways and exceptions at first and accepts that activity order and milestones can change. It warns that beginning too deeply can derail analysis. Camunda recommends defining the result, trigger, and activities always needed to reach that result before adding problems. [IBM Redbooks, Chapter 3](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf), [IBM, “Creating discovery maps”](https://www.ibm.com/docs/en/blueworks-live?topic=process-discovery-maps), [Camunda happy-path guidance](https://docs.camunda.io/docs/components/best-practices/modeling/modeling-beyond-the-happy-path/) | Build a provisional semantic outline before selecting detailed BPMN constructs. Mark order, milestones, and granularity as proposed until confirmed. Ask for the common successful case before asking an exhaustive exception questionnaire. |
| 4. Add responsibility and handoffs | IBM treats the responsible participant as essential detail and distinguishes responsibility, accountability, consulted experts, and informed stakeholders. Its SIPOC-oriented fields separately capture suppliers, inputs, outputs, and customers. BPMN gives precise semantics to Participants, Lanes, Sequence Flows, and Message Flows but leaves Lane categorization to the modeler. [IBM Redbooks, Chapter 3](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf), [OMG BPMN 2.0.2, §§9.3 and 10.7](https://www.omg.org/spec/BPMN/2.0.2/PDF/) | Require one responsible role or system for each modeled activity. Preserve accountability separately because a lane does not express RACI. At each ownership change, ask what is handed over, by what interaction, and what evidence tells the receiver to proceed; then choose Lane or Pool/Message Flow according to BPMN semantics and the intended collaboration boundary. |
| 5. Add decisions and exceptions | Camunda recommends adding one selected problem at a time: identify the business concern, undesired result, and affected point or scope before choosing a gateway, boundary event, or other technique. It distinguishes business-relevant problems from technical noise. IBM supports separate happy-path and exception-path playbacks. [Camunda happy-path guidance](https://docs.camunda.io/docs/components/best-practices/modeling/modeling-beyond-the-happy-path/), [IBM, “Creating playbacks”](https://www.ibm.com/docs/en/blueworks-live?topic=playbacks-creating) | For every decision, capture the question, mutually understandable outcomes, conditions, default behavior, and downstream result. For every exception, capture what happens, where it can happen, whether ordinary work stops, the response, and the resulting state. Unsupported or unknown details remain explicit rather than being approximated. |
| 6. Decompose deliberately | APQC distinguishes category, process group, process, activity, and task, but warns that its hierarchy is not a flow model and is not consistently leveled. IBM recommends starting at a macro level when understanding is weak and considering decomposition when peer elements become numerous; it distinguishes reusable linked processes from process-specific subprocesses. SAP uses high-level process hierarchies linked to detailed BPMN diagrams. [APQC, “Introduction to the Process Classification Framework”](https://www.apqc.org/sites/default/files/files/PCF%20Collateral/Intro%20to%20PCF%20-%20FINAL.pdf), [IBM Redbooks, Chapters 3 and 10](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf), [SAP Signavio, “Process Hierarchies”](https://help.sap.com/docs/signavio-process-manager/user-guide/fa7140c06dad1014a4730ff5fb2ca89e.html) | Do not equate hierarchy labels with proven granularity. Split a section when it has a separately nameable result, is reused, switches to materially finer detail, or makes the parent unreadable. Treat numeric limits such as IBM's “rule of seven” as review prompts, not universal failures. |
| 7. Name and lay out for business readers | Camunda recommends business-facing names: object and verb for tasks, business state for events, questions and answer-like outgoing conditions for data-based gateways. It recommends left-to-right placement, explicit readable gateway blocks, few crossings, and a visually straight happy path. SAP has parallel rules for consistent verb-led activity names, meaningful gateway names, direction, spacing, intersections, and element sizes. [Camunda naming guidance](https://docs.camunda.io/docs/components/best-practices/modeling/naming-bpmn-elements/), [Camunda readability guidance](https://docs.camunda.io/docs/components/best-practices/modeling/creating-readable-process-models/), [SAP Signavio modeling conventions](https://help.sap.com/docs/signavio-process-manager/workspace-admin-guide/modeling-convention-rules-for-bpmn-2-0) | Generate concise business labels, then challenge broad verbs such as “handle” or “process.” Keep the primary reading direction consistent; place the happy path on the simplest line; group matching branches; minimize crossings and backward flows; and avoid using size or color as undocumented semantics. Layout findings remain advisory unless DI is missing or malformed. |
| 8. Validate by scenario | IBM's playback walks a selected connected path step by step and explicitly supports separate happy and exception scenarios for stakeholder review. IBM warns that generated process diagrams must be reviewed against how the process actually works. [IBM playback tutorial](https://www.ibm.com/docs/en/blueworks-live?topic=started-getting-process-blueprints), [IBM, “Generating process diagrams from text with AI”](https://www.ibm.com/docs/en/blueworks-live?topic=blueprints-generating-process-diagrams-from-text-ai) | Ask reviewers to validate named scenarios rather than merely approve a static picture. Record who reviewed which path, corrections, unresolved comments, and the human's decision. A generated model must never be treated as validated because it renders or passes BPMN checks. |

## Handling incomplete, ambiguous, and contradictory evidence

The sources normalize iteration: IBM describes the discovery map as a first draft whose milestones, activity order, and level of detail may change through repeated discussion; current IBM AI documentation explicitly requires human review of generated models. SAP advises explicit and consistent roles/entities rather than asking AI to guess. [IBM Redbooks, Chapter 3](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf), [IBM AI generation guidance](https://www.ibm.com/docs/en/blueworks-live?topic=blueprints-generating-process-diagrams-from-text-ai), [SAP AI input guidance](https://help.sap.com/docs/signavio-process-manager/user-guide/tips-for-text-prompt-to-generate-diagram)

OpenBPMN should operationalize that evidence as follows. These are project recommendations inferred from the sources:

### Incomplete evidence

- Model only the confirmed part of the process.
- Distinguish `unknown`, `not applicable`, `out of scope`, and `intentionally omitted`; they have different consulting meanings.
- Ask first about gaps that can change the process boundary, participant structure, branch semantics, or a material outcome.
- Permit lower-priority details to remain unresolved in a Snapshot Export with visible Quality Report findings.
- Do not create a generic activity such as “Handle exception” merely to hide an unknown path.

### Ambiguous evidence

- Preserve the original or paraphrased claim and its source reference before normalizing terminology.
- Offer a specific interpretation and explain what would change in the model if it is wrong.
- Resolve aliases separately from responsibilities: “manager” and “supervisor” may be synonyms, or they may be different roles.
- Ask for observable triggers, results, and handoff artifacts instead of abstract questions such as “What is the gateway?”
- Treat vague frequency words—usually, sometimes, normally—as signals to ask whether they imply a modeled branch and what condition selects it.

### Contradictory evidence

- Keep every materially different claim; do not let later sources silently overwrite earlier ones.
- Classify the disagreement, for example `observed-practice-versus-policy`, `unit-variant`, `role-disagreement`, `order-disagreement`, or `condition-disagreement`.
- Ask whether the target is current state, intended future state, policy/control design, or a comparison. An official document can be authoritative for policy while interviews are authoritative for observed current practice.
- Route the conflict to the named human decision authority. IBM's distinction between business owners and experts supports this separation of decision rights from operational knowledge. [IBM Redbooks, Chapter 3](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf)
- Record the chosen representation, alternatives rejected, approver, and rationale. Until then, show the conflict in Working State and the Quality Report.

## Modeling Copilot interaction contract

The Modeling Copilot should behave as a facilitator with a progressively disclosed interview, not as an XML generator.

### Recommended conversation phases

1. **Orient:** restate the modeling purpose and identify whether the request is current state, future state, policy, or comparison.
2. **Bound:** propose start trigger, end results, inclusions, exclusions, audience, and abstraction level; obtain confirmation.
3. **Map:** propose a concise happy-path outline with tentative milestones and names.
4. **Assign:** resolve the responsible actor for each activity and clarify every cross-actor handoff.
5. **Branch:** cover decision outcomes, then material exceptions, one scenario at a time.
6. **Challenge:** surface contradictions, vague verbs, mixed granularity, unsupported inferences, and missing business outcomes.
7. **Preview:** generate a Process Diagram and a compact change summary without claiming approval.
8. **Playback:** walk the happy path and representative alternative paths; capture reviewer corrections.
9. **Export:** offer Snapshot Export at any time and Clean Export when Model Validity passes, keeping Lifecycle Status human-owned.

### Question priority

Questions should be ordered by expected effect on the model:

1. boundary or perspective;
2. participant/pool structure;
3. happy-path ordering and end result;
4. decision or exception semantics;
5. decomposition;
6. terminology and layout polish;
7. optional operational metadata.

The copilot should batch independent questions, explain why a material question matters, and avoid asking for details already supported consistently by the evidence. If a human explicitly accepts an assumption or omission, preserve that decision rather than asking again in every session.

## Structured Process Evidence implications

Structured Process Evidence needs to preserve consulting meaning before BPMN compilation. The following is a minimum conceptual payload, not a final serialization schema.

| Area | Required evidence |
| --- | --- |
| Engagement | Modeling purpose; audience; current-state/future-state/policy/comparison perspective; requested output; human Lifecycle Status only if supplied. |
| Scope | Process name; business objective; start trigger; successful and unsuccessful end results; included and excluded work; parent context; intended abstraction level; named variants. |
| Stakeholders | Process owner/decision authority; operational experts; participants; reviewers; source identity and date where known. |
| Vocabulary | Canonical term; aliases; definition; evidence references; unresolved alias conflicts. |
| Activities | Stable identifier; business-facing name; responsible actor; purpose/result; order constraints; inputs, outputs, systems, and evidence references; confirmation state. |
| Decisions | Business question; outgoing outcomes/conditions; default or otherwise path; evidence; unresolved completeness. |
| Events and exceptions | Trigger; affected activity or scope; interrupting effect in business terms; response; resulting state; frequency/priority if known. |
| Handoffs | Sender; receiver; message or business object; channel if relevant; trigger to proceed; acknowledgement or completion evidence if relevant. |
| Decomposition | Parent/child relationship; subprocess result; reuse intent; reason for decomposition; level consistency notes. |
| Evidence ledger | Source; paraphrased claim; evidence type (observed, reported, policy, inferred); confidence/confirmation state; linked model assertions. |
| Conflicts and decisions | Competing claims; conflict class; affected model elements; decision authority; chosen representation; rationale; status. |
| Review | Named scenarios; selected paths; reviewer; feedback; changes; accepted omissions; unresolved comments. |

Every model assertion that materially changes scope, ownership, ordering, a branch, or an outcome should trace either to evidence or to an explicit human Modeling Decision. This is the most important defense against fluent invention.

## Candidate consulting-quality rules

These are candidates for the later Quality Report decision. Except where an underlying BPMN/Profile rule is also violated, they should be advisory and configurable. A suggested severity indicates default consulting significance, not Model Validity.

| Candidate code | Default | Finding |
| --- | --- | --- |
| `CQ-SCOPE-001` | high | Modeling purpose or current/future/policy perspective is not stated. |
| `CQ-SCOPE-002` | high | Start trigger or intended business end result is missing or ambiguous. |
| `CQ-SCOPE-003` | medium | Included and excluded work are not distinguishable at a disputed boundary. |
| `CQ-EVIDENCE-001` | high | A material model assertion has no evidence reference or explicit human decision. |
| `CQ-EVIDENCE-002` | high | Contradictory evidence affecting scope, responsibility, order, condition, or outcome was silently collapsed. |
| `CQ-EVIDENCE-003` | medium | An inference is presented as reported or confirmed practice. |
| `CQ-RESP-001` | high | An activity lacks one clear responsible participant. |
| `CQ-RESP-002` | medium | Accountability is being inferred from lane placement. |
| `CQ-HANDOFF-001` | high | A change of responsible participant lacks the transferred message/object or continuation trigger. |
| `CQ-FLOW-001` | high | A decision lacks a business question or understandable outgoing conditions. |
| `CQ-FLOW-002` | medium | A material outcome has no path to an explicit end state. |
| `CQ-EXCEPTION-001` | medium | A reported material exception lacks an occurrence point/scope, response, or resulting state. |
| `CQ-EXCEPTION-002` | medium | Technical detail clutters a Design-Time Model without changing business work or outcome. |
| `CQ-NAME-001` | medium | An activity uses a vague verb such as “handle,” “manage,” or “process” without describing the business action and object. |
| `CQ-NAME-002` | medium | A role, system, or object is named inconsistently without an accepted alias. |
| `CQ-LEVEL-001` | medium | Peer activities are at materially different levels of detail without a decomposition decision. |
| `CQ-LEVEL-002` | low | A dense section should be reviewed for subprocess decomposition; the threshold is heuristic, not universal. |
| `CQ-READ-001` | medium | Avoidable crossings, backward flows, or distant connectors make the path difficult to follow. |
| `CQ-READ-002` | low | The happy path is not visually distinguishable by placement. |
| `CQ-READ-003` | low | Size or color appears to carry undocumented meaning. |
| `CQ-REVIEW-001` | high | No stakeholder has reviewed the happy-path scenario. |
| `CQ-REVIEW-002` | medium | A material decision, handoff, or exception path has not been exercised in a named review scenario. |

The rules should include evidence and remediation, not merely a score. For example, `CQ-HANDOFF-001` should name the two participants and activities, show what evidence is present, and ask what information or signal crosses the boundary.

## Evaluation rubric

Evaluate the consulting result independently from XML/BPMN validity. Score each dimension from 0 to 2 using an answer key that identifies acceptable variants.

| Dimension | 0 | 1 | 2 |
| --- | --- | --- | --- |
| Scope and perspective | Missing or materially wrong | Mostly bounded; one consequential ambiguity | Purpose, perspective, trigger, results, inclusions, and exclusions are explicit and evidence-aligned |
| Evidence fidelity | Invents or silently resolves material claims | Preserves most evidence but loses some provenance/uncertainty | Material assertions trace to evidence or explicit human decisions; conflicts remain visible |
| Abstraction and decomposition | Mixed levels obscure the process | Usable with localized granularity problems | Consistent level with justified subprocess boundaries |
| Responsibility and handoffs | Material ownership is wrong or absent | Actors are mostly correct; handoff details incomplete | Every activity has a clear actor and material handoffs expose sender, receiver, and transferred meaning |
| Happy path and outcomes | Ordinary path or result is materially wrong | Main path present with minor ambiguity | Confirmed ordinary path connects trigger to explicit business result |
| Decisions and exceptions | Important branch invented or omitted | Major branches present; some conditions/results weak | Conditions, alternatives, affected scopes, responses, and end states match confirmed evidence |
| Naming and vocabulary | Labels obscure or contradict evidence | Mostly readable with inconsistent/vague terms | Concise business-facing names and stable canonical terms/aliases |
| Diagram readability | Flow is difficult to trace | Readable with avoidable crossings/density | Consistent direction, visible happy path, grouped branches, minimal crossing, appropriate decomposition |
| Stakeholder reviewability | Cannot explain what remains uncertain | Quality findings exist but scenarios/decisions are incomplete | Named review scenarios, unresolved questions, assumptions, and changes are explicit |

### Critical failures

Regardless of total score, an evaluation should fail consulting acceptance if the result:

- invents a material process boundary, owner, condition, exception response, or end result;
- silently chooses one side of a material contradiction;
- conflates current practice, official policy, and intended future state;
- omits a known participant variant the request explicitly requires; or
- claims stakeholder approval or readiness that the human did not provide.

For deterministic evaluation, compare a semantic graph and evidence-decision ledger before comparing layout. Layout should be scored with tolerances and structural features, not pixel identity.

## Representative fixture plan

The existing automotive AR source pack is unusually suitable because it includes unit variants, current-practice versus official-policy conflicts, unclear escalation conditions, local workarounds, multiple handoffs, and a disputed process boundary. It should be expanded through answer keys and staged conversation states, not rewritten into a single ideal narrative.

### Automotive AR fixture states

1. **Initial intake:** only the consultant request; expected behavior is to establish perspective, trigger, results, units, and audience.
2. **Happy-path evidence:** North and South workshop sources; expected behavior is to preserve unit variants and propose a coarse common/variant structure without inventing the self-billing trigger.
3. **Policy conflict:** add the official group process; expected behavior is to classify observed-practice-versus-policy contradictions and ask which perspective(s) to model.
4. **Responsibility challenge:** add the billing specialist source; expected behavior is to distinguish operational knowledge, access control, commercial accountability, and unresolved error ownership.
5. **Snapshot before resolution:** allow a valid Snapshot Export with explicit open questions and no fabricated escalation thresholds.
6. **Human decision pack:** provide controlled answers choosing one shared collaboration or two linked processes, current-state precedence, and selected escalation rules; expected behavior is a repeatable model update with a decision ledger.
7. **Playback review:** exercise ordinary invoice, North self-billing, South self-billing, tooling rejection, payment matching, quantity dispute, collection escalation, month-end close, and doubtful-receivable handoff scenarios.

### Additional minimal fixtures

- **Synonym ambiguity:** “manager,” “supervisor,” and “unit lead” may be one role or three; tests vocabulary clarification.
- **Conflicting order:** two experts reverse the same pair of activities; tests conflict preservation and decision routing.
- **Mixed granularity:** one branch contains department-level phases while another contains keystrokes; tests abstraction challenge and decomposition.
- **Cross-organization handoff:** internal team, customer, and external vendor exchange messages; tests Pool/Lane reasoning and handoff evidence.
- **Exception triage:** many reported technical incidents but only two change business work or outcome; tests materiality and incremental exception modeling.
- **Layout stress:** one semantic model with deliberately crossed/backward flows; tests readability findings without changing meaning.

Each fixture should include: source evidence, staged human answers, allowed modeling alternatives, forbidden inventions, expected open questions, expected consulting findings, expected scenario paths, semantic assertions, and a human-readable rationale.

## Implications for upcoming Wayfinder decisions

- **Prototype the iterative Modeling Copilot lifecycle:** prototype the nine conversation phases above and test whether question ordering feels like consulting rather than form filling.
- **Choose the Agent Workflow and artifact contract:** make the evidence ledger, conflict records, Modeling Decisions, and review scenarios durable across Host Agents.
- **Define Clean Export and Quality Report behavior:** separate normative Model Validity from contextual consulting-quality rules; findings need evidence, affected elements, and a concrete clarification prompt.
- **Define the evaluation corpus and acceptance thresholds:** score semantic fidelity and uncertainty handling before diagram aesthetics; use critical failures to catch fluent invention.
- **Prototype representative Consulting Core diagrams:** create several accepted variants where the source genuinely permits them, and validate paths with playback-style scenarios.

## Source limitations

- The [OMG BPMN 2.0.2 specification](https://www.omg.org/spec/BPMN/2.0.2/PDF/) is authoritative for notation semantics but intentionally does not prescribe a process-discovery method, stakeholder facilitation, or one correct abstraction level.
- The [IBM Redbook](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf) is a detailed first-party method guide written in 2014 around Blueworks Live and IBM BPM. Its discovery sequence and role distinctions are directly relevant, but numeric complexity limits and product-specific fields are heuristics, not standards. Current IBM documentation was used to confirm that discovery maps and scenario playback remain part of the product method.
- [Camunda's best-practice documentation](https://docs.camunda.io/docs/components/best-practices/modeling/creating-readable-process-models/) is first-party and unusually explicit about naming, layout, happy paths, and exceptions. It is influenced by executable-process concerns; recommendations such as preferring pools over lanes or avoiding retry behavior should not be copied blindly into a design-time consulting profile.
- [SAP Signavio's modeling conventions](https://help.sap.com/docs/signavio-process-manager/workspace-admin-guide/modeling-convention-rules-for-bpmn-2-0) are first-party downstream-tool guidance. SAP itself describes them as an adaptable starting point, so they establish useful convention categories rather than universal thresholds.
- [APQC's Process Classification Framework introduction](https://www.apqc.org/sites/default/files/files/PCF%20Collateral/Intro%20to%20PCF%20-%20FINAL.pdf) is authoritative for that hierarchy, not for BPMN flow modeling. APQC explicitly says the PCF is not a process map and is not consistently leveled; it should inform vocabulary and decomposition discussion, not dictate BPMN granularity.
- No accessible primary source establishes a universal definition of an “elite” consultant-authored BPMN diagram or statistically validated thresholds for element count, crossings, or review coverage. This report therefore converts convergent first-party guidance into explicit OpenBPMN hypotheses that should be tested in prototypes and evaluations rather than advertised as settled industry law.

## Sources reviewed

- [Object Management Group — BPMN 2.0.2 specification and machine-readable artifacts](https://www.omg.org/spec/BPMN/2.0.2)
- [IBM Redbooks — *Process and Decision Discovery Best Practices using IBM Blueworks Live*](https://www.redbooks.ibm.com/redpapers/pdfs/redp5111.pdf)
- [IBM Blueworks Live — Creating discovery maps](https://www.ibm.com/docs/en/blueworks-live?topic=process-discovery-maps)
- [IBM Blueworks Live — Getting started with process blueprints and stakeholder playback](https://www.ibm.com/docs/en/blueworks-live?topic=started-getting-process-blueprints)
- [IBM Blueworks Live — Creating playbacks](https://www.ibm.com/docs/en/blueworks-live?topic=playbacks-creating)
- [IBM Blueworks Live — Generating process diagrams from text with AI](https://www.ibm.com/docs/en/blueworks-live?topic=blueprints-generating-process-diagrams-from-text-ai)
- [Camunda — Creating readable process models](https://docs.camunda.io/docs/components/best-practices/modeling/creating-readable-process-models/)
- [Camunda — Naming BPMN elements](https://docs.camunda.io/docs/components/best-practices/modeling/naming-bpmn-elements/)
- [Camunda — Modeling beyond the happy path](https://docs.camunda.io/docs/components/best-practices/modeling/modeling-beyond-the-happy-path/)
- [SAP Signavio — Modeling convention rules for BPMN 2.0](https://help.sap.com/docs/signavio-process-manager/workspace-admin-guide/modeling-convention-rules-for-bpmn-2-0)
- [SAP Signavio — Tips for text input to create a model](https://help.sap.com/docs/signavio-process-manager/user-guide/tips-for-text-prompt-to-generate-diagram)
- [SAP Signavio — Process hierarchies](https://help.sap.com/docs/signavio-process-manager/user-guide/fa7140c06dad1014a4730ff5fb2ca89e.html)
- [APQC — Introduction to the Process Classification Framework](https://www.apqc.org/sites/default/files/files/PCF%20Collateral/Intro%20to%20PCF%20-%20FINAL.pdf)
