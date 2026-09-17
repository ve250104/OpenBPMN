# Scope and verification status

OpenBPMN `0.1.0-dev.0` is a prerelease. No public release is available yet. `openbpmn capabilities` reports recognized notation, schema/profile versions, browser discovery, and downstream compatibility status for the installed version.

The [Consulting Core profile](https://github.com/ve250104/OpenBPMN/blob/main/docs/consulting-core-profile.md) covers design-time BPMN Processes and Collaborations: tasks, gateways, supported events, pools and lanes, subprocesses, calls, loops, and data. Executable workflows, arbitrary BPMN semantic editing, vendor extensions, Choreographies, and Conversations are outside its scope.

| Area | Current status |
| --- | --- |
| Installation | Platform bundles contain a private runtime, application, and matching skill. Use only a bundle supplied for your operating system and architecture; there is no public release download yet. |
| Platforms | Used on macOS arm64. Full Linux and Windows 11 support remains unverified; Windows Server checks do not establish Windows 11 support. |
| Agent hosts | A portable skill is provided for Codex CLI, Claude Code, and GitHub Copilot CLI. Real workflows and transfers across all three hosts remain unverified. |
| Diagrams and scale | Generated examples are available. Readability and performance across the complete notation profile and larger combinations remain unverified. |
| Offline operation | The CLI uses local resources and makes no telemetry or update requests. Complete network-isolated behavior across supported platforms remains unverified. The agent provider has its own network and privacy behavior. |
| Demonstration | The purchase-approval walkthrough is synthetic, with generated before/after artifacts. It is not evidence of a client deployment, human usability study, or productivity improvement. |
| Redistribution | The permission interpretation for public distribution of the bundled OMG schemas remains unresolved. See [third-party notices](../THIRD_PARTY_NOTICES.md). |

Local consumer-fit profiles are available for `sap-signavio-process-manager`, `celonis-analysis-conformance`, and `celonis-process-management`. All remain **unverified for actual tenant import/export**. Passing a local profile check does not establish compatibility with a particular product version or account. The narrower Celonis Analysis profile does not reduce the BPMN concepts supported by OpenBPMN itself.

No official OMG certification, business-truth guarantee, measured ROI, or general SAP/Celonis compatibility is claimed. Review the generated model and its Quality Report before relying on them.
