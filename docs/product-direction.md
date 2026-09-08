# Product direction and demonstration brief

OpenBPMN turns messy operational evidence into a process model people can inspect, challenge, and use. Its first audience includes process consultants, operators, and teams discovering what to document, improve, or automate. A portable BPMN artifact is the practical deliverable; faithful process understanding is the product value.

This direction sharpens the existing lightweight Modeling Copilot. The normal experience remains one Modeling Skill in an existing Host Agent, a local deterministic CLI, and the existing three-file Output Bundle.

## Demonstrate one real problem well

Use the existing [synthetic automotive AR discovery pack](../eval/fixtures/automotive-ar-discovery/source-pack.md). Narrow the opening demonstration to billing and self-billing across the two units; use the rest of the pack for follow-up scenarios and evaluation.

The demonstration should show this sequence:

1. The user supplies the synthetic accounts of the process and asks for the current state.
2. The agent identifies a material difference: North leaves deliveries unbilled until a self-bill arrives; South issues invoices first. It also surfaces the disagreement between the official process and reported practice.
3. A focused user response settles how to represent the selected scope and unit differences. Where a choice is still unresolved, the agent retains it as a question rather than inventing a common process.
4. The CLI produces a readable BPMN diagram, a portable BPMN file, and a separate report whose findings refer back to concise evidence identifiers.
5. The user corrects one responsibility or branch. The model updates with stable element identities and the change is explained.
6. The user exports at the current point. Technical limitations appear in the report; personal lifecycle labels are never imposed.

The walkthrough must label the inputs as synthetic and any scripted human clarification as part of the demonstration. It must not describe the fixture as a customer deployment or imply that the sources were verified against real operations.

## What excellent quality means here

| Dimension | Visible evidence |
| --- | --- |
| Faithfulness | Modeled activities, branches, and responsibilities can be traced to supplied evidence or explicit Modeling Decisions. |
| Judgment | Conflicting accounts, missing rules, and policy-versus-practice differences remain visible. The agent asks the consequential question. |
| Usefulness | A reviewer can follow the chosen scope, handoffs, conditions, and outcomes and make a correction through conversation. |
| Notation | Exported semantics and references pass the applicable checks; the diagram uses the same model and DI as the BPMN file. |
| Presentation | Labels remain readable, ownership is visually clear, and the selected scenarios can be followed without manually repairing the layout. |
| Reliability | Repeated deterministic runs agree; a failed update preserves the last successful bundle. |
| Portability | Named downstream checks state exactly which artifacts, versions, and operations passed. |
| Honest evidence | Evaluation distinguishes synthetic demonstrations, human review, measured performance, and actual user experience. |

These are acceptance dimensions, not measured results. The evaluation ticket will define the exact thresholds and review procedure. A syntactically valid diagram does not prove fidelity to the evidence, and reported waiting or manual work does not by itself establish a measured bottleneck or return on automation.

## Scope and release discipline

First prove the complete evidence-to-artifact loop on a narrow process. Then broaden fixture coverage against the agreed Consulting Core Profile. The first demonstrator must explicitly name the concepts it exercises; it is not evidence of support for every concept promised by Consulting Core 1.0.0.

The existing profile remains the target contract. If the diagram prototype shows that its breadth cannot meet the lightweight installation and quality requirements, record that concrete conflict before changing the release scope. A dependency that parses an element does not establish layout, rendering, semantic validity, or downstream support for it.

Keep automation opportunities as review hypotheses grounded in the same evidence. Do not add an automation engine, ROI dashboard, continuous interview platform, organizational knowledge graph, or company-specific connector to demonstrate this use case.

## Adjacent product context

Public workflow-discovery products illustrate a relevant operational-discovery workflow. The [primary-source research note](research/workflow-context-primary-sources.md) describes one such example and its limits. Adjacency supports a product hypothesis; it does not establish an integration, endorsement, customer requirement, or another company's internal use of BPMN.

Public positioning, final branding, licensing, release packaging, and measured acceptance thresholds remain with their existing decision tickets.
