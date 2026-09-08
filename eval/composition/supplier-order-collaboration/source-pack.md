# Buyer supplier and carrier coordination — 40 nodes and 60 connectors

This is authored synthetic MIT-licensed test evidence. It represents no real organization, private interview, deployment, or measured outcome. The independently authored fact ledger in [expected.json](expected.json) is the detailed acceptance specification; [request.json](request.json) is the separately authored structured translation. Evidence Links refer to that specification, not to generated output.

Three ordered white-box pools; nested Buyer-team ownership; all 39 internal Sequence Flows and 21 inter-party Message Flows readable. Long return paths and inter-party edge crossings require review; they cannot pass merely because XML is valid.

- **Order through settlement:** The three separately owned processes coordinate via named Message Flows; none is replaced by cross-pool Sequence Flow. Generic activities express handling of the communications, not an executable wait promise.
- **Buyer quote rework:** The explicit default returns to clarification; a new quotation is reviewed before approval.
- **Supplier terms rework:** The supplier reworks quotation when order terms are not agreed; it does not proceed straight to shipment.

The paths are review walkthroughs, not an execution trace or claim of BPMN execution conformance. Human readability/fidelity review remains not run until separately recorded.
