# Operational workflow context: primary-source research

Accessed: 2026-09-08. Scope: public descriptions of operational discovery and their relevance to a small, independent OpenBPMN capability. This note records evidence and design inferences; it does not change an approved product contract.

The owner subsequently clarified the delivery requirement: a finished, usable v0. The demonstration suggestions below describe evaluation and explanatory examples only. They are superseded as a delivery recommendation by the [v0 release contract](../product-direction.md).

## Verified public facts

Ontora is listed in Y Combinator's Spring 2026 cohort, also labelled P26. YC identifies Leon Iwanowitsch as Founder/CEO, Maximilian Arnold as Founder/COO, and David Korn as Founder/CTO. [YC company profile](https://www.ycombinator.com/companies/ontora)

Ontora describes a workflow in which AI agents interview employees, extract processes, decision rules, tools, handoffs, and operational knowledge, and supply structured context to AI agents and automations. Its company-authored YC launch addresses mid-market organizations with 200–2,000 employees and PE/VC firms seeking operational improvements across portfolio companies. [YC company profile and launch](https://www.ycombinator.com/companies/ontora)

The official product site presents three stages: individual conversations with follow-up questions; synthesis connecting transcripts with company systems and artifacts; and leadership outputs comprising insights, process maps, and a prioritized roadmap. Examples concern cycle-time delays, sales approvals, finance handoffs, and adoption gaps. The site identifies Leon Johannes Iwanowitsch as Co-Founder and CEO. These are product descriptions, not independently measured performance results. [Ontora product site](https://ontora.com/)

Leon publicly describes uncertainty about which processes merit automation as a customer problem. That supports a discovery-before-automation interpretation of the company's positioning, but does not establish its technical architecture. [Leon Iwanowitsch's first-party post](https://www.linkedin.com/posts/leon-j-iwanowitsch_aitransformation-aistrategy-activity-7460043970249887744-Jlqn)

Maximilian publicly emphasizes customers' need for an explicit picture of existing operational knowledge and implementation outcomes. This is a founder's account of customer conversations, not a representative market study. [Maximilian Arnold's first-party post](https://www.linkedin.com/posts/arnold-max_were-nowhere-near-ai-agents-replacing-jobs-activity-7460412795042570240-MrBt)

## Implications for OpenBPMN — design inferences

A useful adjacent capability is the translation of process evidence into a reviewable, portable BPMN Process Model. The public workflows above suggest value in capturing ownership, handoffs, decision rules, and exceptions accurately. They do not establish demand for any specific BPMN integration.

The smallest convincing demonstration would take one synthetic operational scenario through a complete cycle:

1. Provide a short account with multiple participants, an approval decision, an exception, and one consequential ambiguity.
2. Use the Modeling Copilot to elicit the missing meaning and make a human Modeling Decision visible.
3. Generate a BPMN Process Model, Read-Only Preview, and Quality Report.
4. Correct a handoff or routing rule conversationally and show the corresponding model change.
5. Open the export in an independently tested Downstream Modeling Tool.

The distinguishing quality should be evidence fidelity and usable artifacts. A beautiful diagram alone cannot demonstrate that the operational account was understood. A reproducible example should show which evidence supports its activities and routing, which uncertainties remain, and whether the model preserves the agreed meaning. Relevant references belong in Structured Process Evidence and the companion Quality Report under the existing data-minimization contract; they do not justify adding OpenBPMN metadata to Clean Export.

This wedge fits the existing Lightweight Core: a Modeling Skill and deterministic local capability can demonstrate the entire cycle. Continuous interviewing, organization-wide synthesis, a knowledge platform, automated opportunity scoring, and execution infrastructure would require separate product decisions and are unnecessary to demonstrate this capability.

## Limits

- The inspected sources do not establish whether Ontora uses BPMN, accepts BPMN exports, exposes a public integration API, or wants an OpenBPMN integration. No partnership or endorsement is implied.
- Company performance, speed, customer, and financial claims were not independently audited. They should not become OpenBPMN benchmarks.
- Public product language can change. LinkedIn's relative dates are not treated as exact publication dates.
- Synthetic demonstrations must be labelled as such. Operational benefits, time savings, and ROI must not be presented as measured outcomes without actual evidence.
