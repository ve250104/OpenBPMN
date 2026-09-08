# Modeling through conversation

Describe the process you want to document and the result you need. You can supply a local interview, notes, or a previously requested `.openbpmn.json` Handoff. The host handles interpretation; the local CLI turns the current structured request into artifacts.

You should receive a useful early diagram when the available facts support one. When a missing fact would change responsibility, routing, or an outcome, the agent asks a focused question. Otherwise, correct the preview naturally: “Finance owns this check,” “Add the rejection route,” or “Rename that step.” Unchanged elements retain their identities.

The standard bundle contains:

- `.bpmn`: process meaning plus diagram geometry, without tool-specific findings or lifecycle tags.
- `.svg`: a read-only preview with embedded fonts and panels for relevant subprocess/called-process detail.
- `.quality.json`: technical checks, advisories, evidence references, and unresolved questions.

“Export a snapshot now” shares the currently expressible, structurally valid model with limitations in its separate report. Clean eligibility is technical, not approval or a promise that an interview is correct. The human alone decides labels such as draft, approved, or final.

“Update this process” authorizes replacing its named bundle; a general modeling request does not. Failed updates preserve prior output under the documented handled-failure guarantee. A previous preview is identified as unchanged, never presented as the new result.

Ask explicitly for a Handoff to continue in a fresh session or another host. It contains the structured request and concise review context, not your transcript or original documents. Ordinary conversation has no automatic persistent sidecar. Read [the skill](../skills/bpmn-weave/SKILL.md) for the maintained agent workflow and [the protocol](contracts.md) for machine details.

Supplied `.bpmn` files can be validated and rendered with their existing geometry. V0 does not import arbitrary BPMN for conversational editing, repair a vendor file, or promise engine execution.
