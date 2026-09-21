# OpenBPMN

Turn process descriptions and conversations into reviewable BPMN 2.0 models.

OpenBPMN helps process consultants document responsibilities, decisions, exceptions, and handoffs inside an existing agent session. Describe how work happens, clarify the important gaps, and correct the result through discussion. You receive a BPMN file, an SVG preview, and a separate Quality Report.

**Prerelease: `0.1.0-dev.0`.** There is no public release yet. Platform, host, readability, and downstream compatibility limitations are listed in [support status](docs/support.md).

## See the result

![Synthetic purchase approval model with three responsibility lanes and a correction loop](examples/purchase-approval.svg)

[Walk through a clarification and responsibility correction](docs/modeling.md#an-authored-example) · [Example BPMN](examples/purchase-approval.bpmn) · [Quality Report](examples/purchase-approval.quality.json)

The walkthrough is authored synthetic material, with actual CLI outputs before and after a correction. It is not a client engagement or a recorded agent conversation.

## Get started

OpenBPMN runs inside Codex CLI, Claude Code, or GitHub Copilot CLI and uses an installed Chrome or Edge for previews. Its platform bundle includes a private runtime and the matching modeling skill; you do not need to install Node or npm separately.

No public release download is available yet. If you have been supplied a prerelease bundle, follow [Installation](docs/installation.md), then refresh your agent session and ask:

> Use OpenBPMN to document our purchase approval process. Operations checks submitted requests and sends complete requests to the budget owner. Approved requests become purchase orders; rejected requests end. Show me the diagram and ask about any consequential gaps.

Review the preview and correct it naturally: “The budget owner sends the purchase order; Operations only prepares it.” Ask for a Handoff to continue in a new session.

[Installation](docs/installation.md) · [Modeling guide](docs/modeling.md) · [Commands](docs/commands.md) · [Troubleshooting](docs/troubleshooting.md)

## Scope

OpenBPMN produces design-time process models for documentation, analysis, and discussion. It validates and renders existing BPMN, but does not import arbitrary BPMN for conversational editing or execute workflows. See the [supported BPMN reference](https://github.com/ve250104/OpenBPMN/blob/main/docs/consulting-core-profile.md).

The local CLI compiles, validates, lays out, and exports process artifacts. Your chosen agent handles the conversation and may send content to its own provider. OpenBPMN provides no hosted service, account, database, or graphical editor. Read [data and file safety](https://github.com/ve250104/OpenBPMN/blob/main/docs/local-trust-and-file-safety.md) before supplying sensitive material.

Process questions and quality findings stay outside the BPMN file. Technical validity does not establish business truth or human approval.

## Local evaluation corpus

The versioned pilot under `eval/corpus/` contains 24 independent process families. Case inputs and reviewer-only assertion ledgers are separate; public-source licenses, transformations, partitions, variants, applicability, and artifact hashes are recorded in each `case.json` contract. Variants declare the sources they replace and the assertions that stay stable or change. The case, reviewer, and run schemas require scoped evidence and auditable agent/human review records. Technical notation fixtures elsewhere under `eval/` are not counted as process families.

Run the lightweight local workflow without GitHub Actions:

```sh
npm run eval:corpus -- validate --json
npm run eval:corpus -- prepare --case pmo-customer-order --output /canonical/empty/output/directory --json
npm run eval:corpus -- assess --run /canonical/run.json --output /canonical/assessment.json --json
npm run eval:corpus -- compare --baseline /canonical/baseline.json --candidate /canonical/candidate.json --output /canonical/comparison.json --json
```

Preparation limits the staged directory to the selected task and inputs, but reports `not_isolated` unless a host actually prevents access to reviewer files. Unrun, unsupported, blocked, failed, and partial attempts remain distinct in assessment and comparison records.

## License and feedback

Project-authored material uses the [MIT license](LICENSE). [Third-party notices](THIRD_PARTY_NOTICES.md) preserve dependency terms and describe the unresolved permission question for distributing the bundled OMG schemas.

Report problems through [GitHub Issues](https://github.com/ve250104/OpenBPMN/issues) using a small synthetic example. Use [private reporting](https://github.com/ve250104/OpenBPMN/security/advisories/new) for vulnerabilities.

Built with [bpmn-js](https://github.com/bpmn-io/bpmn-js), with conversational workflow inspiration from [diagram-design](https://github.com/cathrynlavery/diagram-design).
