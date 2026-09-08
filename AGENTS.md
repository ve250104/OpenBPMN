## Agent skills

For modeling a business process, interpreting process evidence, or continuing a Handoff, use the portable [BPMN Weave skill](skills/bpmn-weave/SKILL.md). Repository implementation work follows the build entry point below, not the modeling workflow.

### Build entry point

For implementation, read `docs/v0-spec.md`, then the current GitHub ticket and only the contracts it references. `docs/build-plan.md` indexes build tickets and their dependencies. A ticket's completion is an intermediate step; the full v0 release requires every acceptance gate. Do not treat the planning documents or runtime probe as an implemented product.

### Issue tracker

Use GitHub Issues for specifications and work tracking. Read `docs/agents/issue-tracker.md` before creating, reading, triaging, claiming, or resolving issues.

### Triage labels

Use the canonical triage-label mapping in `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. Read `docs/agents/domain.md`, the root `CONTEXT.md` when present, and relevant ADRs before working in a domain area.
