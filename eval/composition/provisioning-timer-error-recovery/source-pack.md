# Provisioning timer and error recovery

This is authored synthetic MIT-licensed test evidence. It represents no real organization, private interview, deployment, or measured outcome. The independently authored fact ledger in [expected.json](expected.json) is the detailed acceptance specification; [request.json](request.json) is the separately authored structured translation. Evidence Links refer to that specification, not to generated output.

Both boundaries touch only the provisioning task; the timer is dashed, the error solid, and the retry return remains distinguishable.

- **Normal provisioning:** Successful completion does not traverse recovery.
- **Slow provisioning:** The dashed timer boundary launches an update without cancelling provisioning.
- **Repair and retry:** The error interrupts provisioning; only an explicit safe-retry decision retries.
- **Unrecoverable failure:** The default exit throws the named provisioning error.

The paths are review walkthroughs, not an execution trace or claim of BPMN execution conformance. Human readability/fidelity review remains not run until separately recorded.
