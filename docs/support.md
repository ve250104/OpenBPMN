# Scope and verification status

Current version: `0.1.0-dev.0`, an unqualified development build. There is no finished product release yet. `capabilities` reports implemented concepts, schema/profile versions, browser discovery, and explicit compatibility verification status. A successful unit fixture does not qualify all combinations.

The target is the complete [Consulting Core 1.0.0](consulting-core-profile.md): design-time BPMN 2.0.2 Processes/Collaborations, tasks, routing, supported event placements, participants/lanes, subprocesses/calls/loops, data, and intentional documentation. General executable workflows, arbitrary BPMN semantic editing, vendor extensions, Choreographies, and Conversations are outside v0.

| Area | Current evidence |
| --- | --- |
| Local core | Automated development tests exercise real XML/XSD, layout, Viewer rendering, CLI outcomes, and file safety. Full acceptance is not yet complete. |
| Readability/scale | Qualification in progress; structural DI validity does not establish zero label/connector overlap or performance budgets. |
| Offline runtime | Browser background-request regression corrected; repeated macOS monitoring observed zero HTTP/TCP/UDP attempts. Network-isolated Linux execution and all-command/platform qualification remain open. |
| Platforms | Development exercised on macOS arm64 with Node 24 and installed Chrome. Required Linux, Windows 11, and full platform evidence remain unqualified. Windows Server CI is not Windows 11 evidence. |
| Host agents | One portable skill is authored for Codex CLI, Claude Code, and Copilot CLI. Real three-host workflow/transfer acceptance and maintainer review are not yet recorded. |
| Redistribution | The layout dependency’s missing MIT text is preserved from its exact upstream correction. Public redistribution of the unchanged OMG XSDs still needs its permission interpretation resolved; [primary-source findings](research/distribution-provenance.md). |

The local consumer-fit profiles are `sap-signavio-process-manager`, `celonis-analysis-conformance`, and `celonis-process-management`. Each starts **unverified** for actual tenant import/export. The narrow Celonis Analysis envelope does not reduce Consulting Core; richer diagrams can be valid BPMN while outside that consumer-fit envelope.

No official OMG certification, business-truth guarantee, customer deployment, measured ROI, executable automation, or generic SAP/Celonis compatibility is claimed. The [acceptance contract](acceptance-and-compatibility.md) fixes the release bar and separates automated, agent-assisted, human, host, platform, and tenant observations.
