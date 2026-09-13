# Comparison method and web-reference boundaries

Checked 2026-09-12. This note defines a development comparison, not a competitive benchmark or release qualification. The [recorded Codex pair](../../eval/discovery/codex-comparison-development.json) retains a prerequisite-blocked treatment rather than claiming a successful first-use comparison.

## Raw Codex versus BPMN Weave

Use two fresh sessions with the same public synthetic process source, initial prompt, configured model, host version, permissions, and available clarification facts. The intended treatment is the installed BPMN Weave package and portable Modeling Skill; the baseline receives neither. Record any other difference rather than silently treating the arms as identical.

Keep reviewer expectations, prior implementation conversation, generated answers, and hidden evaluation facts outside both sessions. Audit discovered instructions and tools for contamination. Use the exact archived development tarball and skill bytes, retaining their hashes and the actual model/settings where exposed.

Allow the same bounded interaction opportunity in both arms. Answer questions only from pre-authored clarification facts; do not coach either model toward the expected notation. Preserve original outputs, failed attempts, refusals, and follow-up messages. No maintainer XML repair or hidden editing of generated structured input.

Assess the resulting artifacts against the same independently authored process facts: required and invented meaning, ownership, exceptions, synchronization, and corrections. Report XML/XSD validity, semantic findings, visible content, readability, and successful artifact delivery separately. A rendered picture is not proof of correct process meaning. Distinguish agent-assisted assessment from actual human review, following the repository's [acceptance contract](../acceptance-and-compatibility.md).

Record elapsed time and exposed usage with prerequisites and interaction counts. A single paired case can reveal workflow friction or a reproducible defect, but cannot establish statistical superiority, general success rates, or whether a difference came specifically from the skill rather than the CLI. Retesting changed package bytes creates a new observation.

## What the web references establish

BPMN Sketch Miner is a text-driven sketching tool whose documented input follows a constrained, line-based syntax; it is not an equivalent untreated natural-language prompt interface. Its documentation explicitly notes that users learn syntax and may need layout adjustments. [Introduction](https://www.bpmn-sketch-miner.ai/doc/00-intro.html)

Repeated elements combine paths; `|` expresses parallel work and synchronization, while fragments express unequal parallel branches and other partial sequences. Role prefixes place tasks in lanes, with rules for inherited ownership. These are meaningful modeling choices supplied through syntax, not neutral transcription. [Gateways](https://www.bpmn-sketch-miner.ai/doc/03-gateways.html), [fragments](https://www.bpmn-sketch-miner.ai/doc/09-fragments.html), [pools and swimlanes](https://www.bpmn-sketch-miner.ai/doc/02-pools.html)

The Sketch Miner FAQ describes browser-side execution without a backend and advertises standard BPMN export for subsequent refinement. These are documented capabilities, not network-isolation or export results established by this comparison. [FAQ](https://www.bpmn-sketch-miner.ai/doc/11-faq.html)

Diagram Design supplies an agent-skill approach to editorial, self-contained HTML/SVG diagrams. It is useful inspiration for portable instructions and presentation discipline; its described output is not a BPMN interchange-validity oracle. No live Diagram Design comparison was run here. [Repository](https://github.com/cathrynlavery/diagram-design)

bpmn-js imports BPMN XML for browser viewing/editing and builds on bpmn-moddle and diagram-js. BPMN Weave uses its Viewer, so agreement with a bpmn-js-based view is shared-stack rendering evidence, not independent semantic or schema validation. [Upstream repository](https://github.com/bpmn-io/bpmn-js), [local architecture](../architecture.md)

## Dated browser observation

On 2026-09-12, an agent used the in-app browser without an account to enter a manually translated employee-offboarding Sketch Miner description. The translation added explicit completion events. The displayed view showed three lanes, parallel controls, exclusive equipment outcomes, and synchronization before HR closure; it showed no recovery loop. This records the supplied translation, not a limitation of Sketch Miner's expressiveness.

Clicking the export link produced no observable artifact in that session. Export remains unverified, not a demonstrated product defect. The screenshot remained in the conversation; no exported file or repository evidence capture is claimed. This manually prepared reference is outside the same-prompt paired experiment and cannot support a cross-product quality ranking.
