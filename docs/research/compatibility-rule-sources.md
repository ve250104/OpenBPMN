# Local compatibility rule sources

Checked 2026-09-08. Rules are version `1.0.0`; these observations justify a conservative local qualification envelope, not a tested tenant import or a certification. The source registry is exported as `COMPATIBILITY_RULES` in `src/compatibility.ts`. Runtime commands never fetch these URLs.

## SAP Signavio Process Manager

The first-party [Import/Export API reference](https://help.sap.com/docs/signavio-process-manager/sap-signavio-process-manager-api/import-export-api-reference) documents a BPMN 2.0 XML import route and `bpmn2_0_xml` export. The official [export overview](https://help.sap.com/docs/signavio-process-manager/user-guide/export-intro) also lists BPMN XML export. The local rule therefore checks self-contained supported BPMN, references, and complete DI; it does not invent an element-level vendor preservation matrix. Direct Help Portal rendering returned no text in this check; the official indexed reference supplied the endpoint descriptions. The previously cited user-guide PDF redirected to a missing-page route, so it is not treated as newly retrieved evidence.

[SAP KBA 3784158](https://userapps.support.sap.com/sap/support/knowledge/en/3784158) explains that differing third-party rendering does not establish a Signavio defect and that SAP Support does not analyze third-party/GenAI-generated file contents. This is a support limitation, not evidence that all standards-conforming third-party imports fail. Our outputs are neither SAP-certified nor covered by an inferred SAP support promise. Actual tenant import, visual inspection, and re-export remain necessary for a preservation claim.

## Celonis Analysis Conformance

The accessible [Celonis 4.7 Conformance Checker documentation](https://help.celonis.com/cpm47/en/conformance-checker) describes BPMN upload and identifies activities, connections, exclusive/parallel gateways, and start/end nodes as relevant to conformance calculation; other components, including annotations, are ignored. This is versioned legacy documentation. It does not establish every current cloud surface's behavior.

Our explicit conservative qualification choices are one Process, generic Tasks, Sequence Flows, Exclusive/Parallel Gateways, and None Start/End Events. Richer task subtypes, loops-as-markers, subprocesses, participants, data, and documentation receive target limitations; they are not removed or made invalid BPMN. The four authored fixtures cover straight-through, XOR, AND, and Sequence-Flow rework. Activity-name presence is checked locally; event-data dictionary alignment and conformance execution are separate, unrun observations.

## Celonis Process Management

The first-party [BPMN API page](https://developer.celonis.com/cpm/developer/rest-api/overview/bpmn-api) documents BPMN import/export but explicitly marks that API legacy and directs new integrations elsewhere. BPMN Weave ships no tenant API integration. This profile uses the rich portable-model prerequisites, not the narrow Analysis envelope. No eBPMN extension, governance semantics, tenant configuration, import operation, or round-trip preservation is inferred from the API documentation.

## Claim boundary

Local `fit: passed` means the selected versioned rules passed. `verification: unverified` and tenant `import/roundTrip: not_run` remain unchanged. Missing generic prerequisites produce `fit: not_run`; consumer limitations produce `fit: failed` without changing Consulting Core Clean eligibility. A real tenant observation must identify its product/surface/version, authorized operation, fixture/candidate hashes, visible/semantic losses, and evidence separately.
