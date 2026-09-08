# Downstream fit

The CLI generates vendor-neutral BPMN and DI, not a Signavio/Celonis integration. Consult `capabilities` for the available local compatibility profiles and their actual verification status. A profile’s existence does not establish tenant acceptance.

Use `validate --input <process.bpmn> --compatibility <profile-id>` for a local fit assessment. Keep BPMN validity and target fit separate; do not change the source file or remove meaning to fit a target.

| Profile | Qualification envelope |
| --- | --- |
| `sap-signavio-process-manager` | Standard Process Manager BPMN XML import. Generic validity/DI/same-file references are checked locally; actual import/re-export needs a tenant observation. Not Process Governance or execution. |
| `celonis-analysis-conformance` | Conservative single-process control flow: generic Tasks, None Start/End, Sequence Flows, Exclusive and Parallel Gateways. Other constructs are outside this local qualification envelope; import is distinct from event-data conformance execution. |
| `celonis-process-management` | Rich standard BPMN import/export on the named Process Management surface. Analysis results do not qualify this separate surface; eBPMN and governance metadata are not generated. |

Say “local fit passed; tenant import unverified” when that is the evidence. Actual tenant upload, account setup, or changes need the human’s separate authority. If a consumer cannot retain a construct, explain the specific loss and let the human choose a separately reviewed model; do not silently simplify the original.
