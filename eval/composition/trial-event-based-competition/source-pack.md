# Event-based competition between acceptance and timeout

This is authored synthetic MIT-licensed test evidence. It represents no real organization, private interview, deployment, or measured outcome. The independently authored fact ledger in [expected.json](expected.json) is the detailed acceptance specification; [request.json](request.json) is the separately authored structured translation. Evidence Links refer to that specification, not to generated output.

Native event-based gateway branches to distinct Message and Timer Catch Events; neither branch is a condition/default flow.

- **Acceptance wins:** The Message Catch wins the race and the trial is activated.
- **Timeout wins:** The Timer Catch wins; no activation occurs.
- **Late acceptance:** The competing acceptance catch is no longer active after expiry wins; no second branch is invented.

The paths are review walkthroughs, not an execution trace or claim of BPMN execution conformance. Human readability/fidelity review remains not run until separately recorded.
