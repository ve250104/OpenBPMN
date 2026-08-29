# BPMN and downstream interoperability baseline

Research date: 2026-08-29
Decision ticket: [Establish the BPMN and downstream interoperability baseline](https://github.com/ve250104/OpenBPMN/issues/6)

## Decision in brief

OpenBPMN should make a narrow, testable promise: every exported `.bpmn` file is a self-contained, vendor-neutral BPMN 2.0.2 XML document containing both the semantic model and complete BPMN Diagram Interchange (BPMN DI) layout for the diagram it presents. The default profile should be called the **OpenBPMN Consulting Core**, not “full BPMN conformance.” It should cover the OMG Analytic modeling subset plus additional constructs common in consulting, and publish an element-by-element conformance matrix.

Compatibility with SAP Signavio or Celonis must be a separate, versioned consumer profile backed by import fixtures and product smoke tests. Official documentation confirms BPMN import/export capabilities, but it does not establish lossless support for every BPMN construct. “Schema-valid,” “semantically coherent,” “has portable layout,” and “imports into product X” are therefore four different checks.

Quality state, open questions, and assumptions should remain in a separate quality report. They should not be embedded as vendor extensions, tags, or incidental text annotations in the `.bpmn` file. A user may export at any stage, but every export should still be structurally valid.

## What the BPMN standard establishes

### XML is the interchange contract

BPMN 2.0.2 defines four different conformance types: Process Modeling, Process Execution, BPEL Process Execution, and Choreography Modeling. For OpenBPMN's design-time purpose, **Process Modeling Conformance** is the relevant family; support for execution semantics is not implied. The standard also defines Descriptive, Analytic, and Common Executable subclasses as alternatives to full Process Modeling Conformance. Descriptive targets high-level analyst modeling, while Analytic contains Descriptive plus roughly half of the full modeling constructs and remains focused on visible elements and minimal supporting data ([OMG BPMN 2.0.2, clauses 2.1–2.2](https://www.omg.org/spec/BPMN/2.0.2/PDF)).

For XSD interchange, the root of every file must be `bpmn:definitions`, each file must declare a `targetNamespace`, and a multi-file package must be self-contained through explicit imports. References use IDs within a file and qualified names when they can span files ([OMG BPMN 2.0.2, clauses 15.2–15.3](https://www.omg.org/spec/BPMN/2.0.2/PDF)). OMG publishes the normative `BPMN20.xsd`, `Semantic.xsd`, `BPMNDI.xsd`, `DI.xsd`, and `DC.xsd` artifacts alongside the specification ([OMG normative machine-readable artifacts](https://www.omg.org/spec/BPMN/2.0.2)).

The specification deliberately permits interchange of incomplete draft models by expecting importers to tolerate missing XSD-required attributes or lower-bound elements. That tolerance is useful for iterative modeling, but it is not a suitable success criterion for OpenBPMN's downstream-ready exports ([OMG BPMN 2.0.2, clause 15.1](https://www.omg.org/spec/BPMN/2.0.2/PDF)). OpenBPMN should generate complete, schema-valid files even when the underlying discovery conversation is incomplete; unresolved business questions belong in the sidecar quality report.

### Semantic model and diagram layout are both required

BPMN DI exists specifically to exchange a diagram's laid-out shapes and edges between tools. It does not preserve tool-specific layout intelligence or normative color semantics, and it does not itself establish syntactic or semantic correctness. Rendering requires both the BPMN semantic model and its BPMN DI instance ([OMG BPMN 2.0.2, clause 12.1](https://www.omg.org/spec/BPMN/2.0.2/PDF)).

A serialized diagram consists of a `BPMNDiagram` containing a `BPMNPlane` with `BPMNShape` and `BPMNEdge` elements. The plane, shapes, and edges reference semantic BPMN elements through `bpmnElement`; shape bounds, edge waypoints, optional label bounds, expansion state, orientation, and element ordering convey the portable visual snapshot. The exporting tool must order diagram elements so the desired z-order can be rendered ([OMG BPMN 2.0.2, clauses 12.2–12.3](https://www.omg.org/spec/BPMN/2.0.2/PDF)).

The standard allows a diagram to depict only part of a model and allows a file package to contain multiple diagrams. For a simple consultant-facing artifact, OpenBPMN should choose a stricter convention: one self-contained `.bpmn` file per exported process/collaboration, one primary diagram, and DI for every semantic element intended to be visible. This is an OpenBPMN portability rule, not an OMG requirement.

### “90% of consulting cases” should be a profile, not a conformance claim

Full Process Modeling Conformance covers process and collaboration constructs including every task, gateway and event type, embedded subprocesses, call activities, participants and lanes, sequence and message flows, data objects, groups, annotations, associations, conversations, correlations, and activity markers. A tool may claim an OMG conformance subclass only if it supports all elements and listed attributes in that subclass ([OMG BPMN 2.0.2, clause 2.2.2](https://www.omg.org/spec/BPMN/2.0.2/PDF)).

The Consulting Core should therefore use three explicit levels:

| Level | Meaning | Initial scope |
| --- | --- | --- |
| Required | Generated, laid out, validated, and regression-tested | OMG Analytic subset: participants/pools, lanes, ordinary/user/service/send/receive tasks, embedded subprocesses, call activities, exclusive/parallel/inclusive/event-based gateways, unconditional/conditional/default sequence flows, message flows, common start/intermediate/boundary/end events, data objects/stores, groups, text annotations, and associations |
| Common-plus | Included where consulting scenarios frequently need it, with the same quality bar | manual, business-rule and script tasks; collapsed/expanded subprocess presentation; interrupting and non-interrupting boundary cases; loop and multi-instance markers; intentional process documentation |
| Deferred/declared | Parsed or rejected explicitly, never silently approximated | uncommon event combinations, complex gateways, transactions/compensation depth, choreography/conversation authoring, and engine-specific execution metadata until individually implemented |

This matrix should become executable fixtures. Unsupported constructs must produce a precise diagnostic. OpenBPMN should not silently downgrade one BPMN construct into another.

## SAP Signavio findings

### SAP Signavio Process Manager is a plausible primary import target

SAP documents BPMN 2.0 XML as a platform-independent interchange format and allows Process Manager to export business process, conversation, and choreography diagrams. Export options include language, view, and whether linked subprocesses are included; translations of custom attributes are not exported ([SAP Signavio Process Manager: Export a BPMN Diagram as XML](https://help.sap.com/docs/signavio-process-manager/user-guide/export-bpmn2-xml)).

The Process Manager UI accepts a `.bpmn` XML file that complies with the BPMN 2.0 XML standard, and an import can create models or update the processes and subprocesses of an existing model. Availability depends on workspace settings ([SAP Signavio Process Manager: Import a BPMN 2.0 XML Diagram](https://help.sap.com/docs/signavio-process-manager/user-guide/import-bpmn2-xml?locale=en-US)). The first-party REST API separately exposes BPMN 2.0 XML import through `POST /bpmn2_0-import` and export using the `bpmn2_0_xml` representation ([SAP Signavio Process Manager API reference](https://help.sap.com/docs/signavio-process-manager/sap-signavio-process-manager-api/import-export-api-reference?locale=en-US)). SAP also states that the REST API can check BPMN 2.0 diagram syntax, although API access depends on the customer's contract ([SAP Signavio Process Manager: API access](https://help.sap.com/docs/signavio-process-manager/workspace-admin-guide/fa6b8c856dad1014a4730ff5fb2ca89e.html)).

These sources establish an import/export path, but not a complete public matrix of every accepted element, attribute, extension, or DI edge case. Consequently, “Signavio compatible” must mean **a named set of OpenBPMN fixtures imports successfully into a stated Process Manager version/tenant and retains the expected semantic elements and usable layout**. A successful HTTP response or parser acceptance alone is insufficient; the imported model should be inspected or re-exported and compared semantically.

SAP Signavio Process Governance must not be used as a proxy for Process Manager compatibility. Its separate BPMN workflow importer supports only a reduced list and explicitly removes unsupported constructs such as message events ([SAP Signavio Process Governance: BPMN Import](https://help.sap.com/docs/signavio-process-governance/user-guide/bpmn-import)). OpenBPMN's initial claim should concern design-time import into Process Manager, not executable workflow conversion in Process Governance.

## Celonis findings

“Celonis” names more than one relevant surface, and their contracts differ.

The Celonis Analysis Conformance Checker accepts an uploaded `.bpmn` file that conforms to BPMN 2.0, but its documented interpretation is intentionally small: activities, connections, gateways, and start/end nodes; other elements such as annotations are ignored. It can save the edited model back as `.bpmn` or to the process repository. The same documentation says this Analysis feature has been maintenance-only since 2025-08-01 ([Celonis: Analysis – Conformance Checker](https://docs.celonis.com/en/analysis---conformance-checker.html)). This is evidence for a useful process-mining subset, not for lossless interchange of a rich consulting diagram.

Celonis Process Management documentation advertises BPMN 2.0 modeling, a distinct extended BPMN (`eBPMN`) capability, semantic validation, and BPMN 2.0 diagram import/export. Its role matrix assigns BPMN import/export to administrators ([Celonis Process Management: User Roles by Feature](https://docs.celonis.com/en/user-roles-by-feature.html)). The public first-party material found for this investigation does not define a complete BPMN XML/DI preservation matrix. Extended BPMN features should therefore be treated as vendor-specific and excluded from the vendor-neutral default.

OpenBPMN should define two separate candidate consumer profiles until tenant testing settles them:

- **Celonis Analysis Conformance**: preserve the process-control-flow core that the checker documents—activities, sequence connections, gateways, and start/end events. Richer consulting content may coexist in the file, but OpenBPMN must not promise that this surface uses or preserves it.
- **Celonis Process Management**: a richer design-time candidate profile, initially marked “verification required.” Claim compatibility only after administrator-led import and semantic/layout round-trip tests on an accessible tenant.

## Required validation pipeline

Each export should pass the following gates in order:

1. **XML integrity** — well-formed UTF-8 XML with deterministic serialization, stable unique IDs, declared namespaces, and no dangling XML references.
2. **OMG schema validation** — validate against the complete official BPMN 2.0.2 XSD set, including BPMN DI, DC, and DI. Do not use a locally invented reduced schema.
3. **BPMN model validation** — enforce normative cross-element and semantic constraints that XSD cannot prove: valid source/target kinds, sequence-flow containment, message-flow participant boundaries, gateway defaults and conditions, event-definition rules, subprocess boundaries, and semantic-to-DI references. BPMN DI explicitly does not establish semantic correctness, so passing XSD/DI checks is not enough.
4. **Diagram completeness and usability** — every intended visible node has a referenced shape with positive bounds; every intended visible connector has a referenced edge and useful waypoints; labels do not collide materially; pools/lanes contain their flow nodes visually; and deterministic layout is readable at consulting scale.
5. **Consulting-quality rules** — clear verb–object activity names, explicit process start/end, named participants and responsibilities, labeled decisions/conditions, modeled handoffs and relevant exceptions, no disconnected elements, and complexity warnings. These are OpenBPMN rules, not claims about the OMG schema.
6. **Consumer-profile tests** — import representative fixtures into each named downstream surface, visually inspect them, and where possible re-export and compare the semantic graph and DI coverage. Record product/version/date and known losses.

Validation must return structured findings separately from the `.bpmn` artifact. Export remains available at any conversation stage, but an invalid file is never reported as a successful export. Draft or unresolved consulting findings do not become hidden extensions in the model.

## Interoperability fixture set

A compact fixture corpus can prove the baseline without becoming a full application:

1. Single-pool straight-through process with start, tasks, gateway, conditions, and end.
2. Cross-functional process with lanes and responsibility handoffs.
3. Two-participant collaboration with message flows and message events.
4. Exception process with timer/error boundary events and recovery paths.
5. Nested process with expanded and collapsed subprocess representations and call activity.
6. Data-aware process with data objects/stores, associations, and annotations used as intentional process content.
7. Celonis conformance subset containing only activities, connections, gateways, and start/end nodes.
8. Negative fixtures for dangling references, illegal cross-pool sequence flows, missing DI, invalid DI references, and unsupported constructs.

For each positive fixture, retain the source `.bpmn`, a canonical semantic-graph snapshot, a rendered image, XSD/model validation results, and downstream import observations. Round-trip comparison should ignore harmless serialization differences while detecting removed or changed semantic elements and missing diagram coverage.

## Implications for the MVP specification

- Define the canonical internal model independently of XML serialization and layout, then generate semantics and BPMN DI together.
- Target BPMN 2.0.2 design-time interchange, not engine deployment or execution conformance.
- Name and version the OpenBPMN Consulting Core. Publish its supported-element/attribute matrix and never call it full BPMN conformance unless the complete normative criteria are met.
- Start from the OMG Analytic subset, add the consulting-common constructs listed above, and make unsupported concepts explicit.
- Use one clean, self-contained, vendor-neutral `.bpmn` file as the primary artifact. Avoid vendor extensions in the default profile.
- Keep the quality report as a separate artifact; do not encode workflow status, assumptions, or warnings in vendor tags or incidental annotations.
- Treat SAP Signavio Process Manager as the first rich design-time smoke-test target.
- Split Celonis into explicit product surfaces. Use the documented Celonis Analysis subset for control-flow compatibility; keep richer Celonis Process Management compatibility provisional until tested with administrator access.
- Do not require SAP or Celonis credentials for the local core or its normal test suite. Tenant-based interoperability checks should be optional release qualification.

## Primary sources

- Object Management Group, [Business Process Model and Notation (BPMN), Version 2.0.2](https://www.omg.org/spec/BPMN/2.0.2/PDF).
- Object Management Group, [BPMN 2.0.2 specification page and normative machine-readable artifacts](https://www.omg.org/spec/BPMN/2.0.2).
- SAP, [Import a BPMN 2.0 XML Diagram](https://help.sap.com/docs/signavio-process-manager/user-guide/import-bpmn2-xml?locale=en-US).
- SAP, [Export a BPMN Diagram as XML](https://help.sap.com/docs/signavio-process-manager/user-guide/export-bpmn2-xml).
- SAP, [Signavio Process Manager Import/Export API reference](https://help.sap.com/docs/signavio-process-manager/sap-signavio-process-manager-api/import-export-api-reference?locale=en-US).
- SAP, [API Access to SAP Signavio Process Manager](https://help.sap.com/docs/signavio-process-manager/workspace-admin-guide/fa6b8c856dad1014a4730ff5fb2ca89e.html).
- SAP, [Signavio Process Governance BPMN Import](https://help.sap.com/docs/signavio-process-governance/user-guide/bpmn-import).
- Celonis, [Analysis – Conformance Checker](https://docs.celonis.com/en/analysis---conformance-checker.html).
- Celonis, [User Roles by Feature](https://docs.celonis.com/en/user-roles-by-feature.html).
