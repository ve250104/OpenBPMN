# Evidence-led process discovery

Use this when interpreting source material or making modeling choices. These are judgment aids, not mandatory interview phases.

## Frame the view

Identify the business object/case, trigger, business results, audience, and perspective. Separate what happens today from what policy prescribes and from a proposed future state. If the perspective changes control flow, ask which view is wanted; a human decision choosing one view does not erase the contrary evidence.

Choose a boundary that produces a useful result: “handle a purchase request through acceptance or rejection,” not an unbounded list of everything Finance does. Describe excluded variants explicitly when they matter. Model one consistent level of action per scope; a subprocess can own a coherent result at the next level. System screens and clicks belong only when operational instructions are the purpose.

## Translate claims, not sentences

Extract candidate activities, actors, inputs/outputs, conditions, timings, and outcomes. One sentence can contain several claims; several interview sentences can describe one activity. Preserve a short source locator and a concise paraphrase, never a transcript dump.

Use activity labels as business actions with objects (“Check supplier details”). Name outcomes as states (“Supplier approved”), conditions as distinguishable criteria, and participants/lanes as responsible parties. Preserve specialized business vocabulary; clarify ambiguous synonyms before merging distinct activities. Cosmetic naming improvements do not create approval gates.

For each consequential assertion, record an Evidence Link to a source or explicit Modeling Decision. Label agent interpretation as inference. Unsupported ownership, routing, and outcome guesses are consequential even when conventional in the industry.

## Establish flow and responsibility

Start with a supported ordinary path, then add the variants that change business outcomes, obligations, handoffs, or material exceptions. Ask what happens after rejection, missing information, timeout, or a failed external response only where relevant to the described process. Avoid an exhaustive catalog of theoretical exceptions.

Distinguish sequence from coincidence: activities mentioned together are not necessarily parallel. Distinguish an independent counterparty from another internal team. Record responsibility at the activity level; if unknown, keep a review issue instead of assigning a convenient role. A system involved in a step is not automatically its accountable owner.

For a decision, establish the deciding fact, who/what evaluates it when material, branch conditions, and the destinations. Treat “otherwise” as a default only when its business meaning is confirmed. For repeated work, distinguish a retry loop from independent instances, and distinguish a waiting event from work performed by a person or service.

## Handle disagreement and missing detail

Keep conflicting claims side by side with their evidence IDs. Ask a question that reveals the resulting modeling choice: “Should this view show the policy’s two approvals or the team’s current single approval?” Do not vote by number of sources or infer authority from job title alone.

Record the answer as a Modeling Decision and resolve the linked issue; retain the original conflict history. An explicitly accepted omission documents a scope choice, not proof that the omitted requirement was implemented. Never substitute a supported gateway for an unsupported one without a human decision that the substitute expresses the intended meaning.

## Playback for a useful review

Walk one concrete case through trigger, work, handoffs, branches, and business result. Then select material alternate paths, such as rejection and rework, timeout and escalation, or partial completion. Check that parallel branches rejoin as intended, messages have a responsible counterparty, and a subprocess boundary neither loses nor invents a result.

Capture corrections as changes to the same model, retaining unaffected keys and support links. Explain semantic changes rather than XML mechanics. Do not infer savings, bottlenecks, automation feasibility, or compliance from topology alone.
