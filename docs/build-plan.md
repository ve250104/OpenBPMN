# Build plan

The [finished-v0 implementation parent](https://github.com/ve250104/OpenBPMN/issues/19) owns release completion. This index points to canonical GitHub acceptance criteria; it is not a second task tracker. Read the [specification](v0-spec.md) first, then the selected ticket and its referenced contracts.

At the planning handoff, all build tickets are unimplemented; GitHub holds their current status. Work any ticket whose native blockers are complete. The initial frontier is [#20](https://github.com/ve250104/OpenBPMN/issues/20). Intermediate slices are development checkpoints, never substitutes for the complete v0.1.0 scope.

| Ticket | End-to-end slice | Blocked by |
| --- | --- | --- |
| [#20](https://github.com/ve250104/OpenBPMN/issues/20) | Generate an installable basic Process Model and Output Bundle | None |
| [#21](https://github.com/ve250104/OpenBPMN/issues/21) | Refine and export evidence-linked models with safe replacement and Handoff | [#20](https://github.com/ve250104/OpenBPMN/issues/20) |
| [#22](https://github.com/ve250104/OpenBPMN/issues/22) | Model decisions and parallel or inclusive work without changing routing meaning | [#20](https://github.com/ve250104/OpenBPMN/issues/20) |
| [#23](https://github.com/ve250104/OpenBPMN/issues/23) | Show responsibility and inter-participant handoffs in collaborations | [#20](https://github.com/ve250104/OpenBPMN/issues/20) |
| [#24](https://github.com/ve250104/OpenBPMN/issues/24) | Model task specializations, subprocesses, calls, and repeated work | [#22](https://github.com/ve250104/OpenBPMN/issues/22), [#23](https://github.com/ve250104/OpenBPMN/issues/23) |
| [#25](https://github.com/ve250104/OpenBPMN/issues/25) | Represent triggers, waits, and event-based competition | [#22](https://github.com/ve250104/OpenBPMN/issues/22), [#23](https://github.com/ve250104/OpenBPMN/issues/23) |
| [#26](https://github.com/ve250104/OpenBPMN/issues/26) | Preserve scoped exception, termination, and link-event behavior | [#24](https://github.com/ve250104/OpenBPMN/issues/24), [#25](https://github.com/ve250104/OpenBPMN/issues/25) |
| [#27](https://github.com/ve250104/OpenBPMN/issues/27) | Include data dependencies and intentional process documentation | [#24](https://github.com/ve250104/OpenBPMN/issues/24), [#25](https://github.com/ve250104/OpenBPMN/issues/25) |
| [#28](https://github.com/ve250104/OpenBPMN/issues/28) | Validate and render supplied BPMN without importing or repairing it | [#21](https://github.com/ve250104/OpenBPMN/issues/21), [#26](https://github.com/ve250104/OpenBPMN/issues/26), [#27](https://github.com/ve250104/OpenBPMN/issues/27) |
| [#29](https://github.com/ve250104/OpenBPMN/issues/29) | Guide real process discovery and refinement through one portable Modeling Skill | [#28](https://github.com/ve250104/OpenBPMN/issues/28) |
| [#30](https://github.com/ve250104/OpenBPMN/issues/30) | Qualify complete-profile composition, readability, determinism, and scale | [#28](https://github.com/ve250104/OpenBPMN/issues/28) |
| [#31](https://github.com/ve250104/OpenBPMN/issues/31) | Report downstream fit and provide reproducible vendor qualification packs | [#30](https://github.com/ve250104/OpenBPMN/issues/30) |
| [#32](https://github.com/ve250104/OpenBPMN/issues/32) | Deliver a clean, documented distribution candidate outside the source checkout | [#29](https://github.com/ve250104/OpenBPMN/issues/29), [#31](https://github.com/ve250104/OpenBPMN/issues/31) |
| [#33](https://github.com/ve250104/OpenBPMN/issues/33) | Verify actual host sessions, cross-host Handoff, and human usability | [#32](https://github.com/ve250104/OpenBPMN/issues/32) |
| [#34](https://github.com/ve250104/OpenBPMN/issues/34) | Complete and verify the finished v0.1.0 release | [#33](https://github.com/ve250104/OpenBPMN/issues/33) |

Most tickets are `ready-for-agent`. [#33](https://github.com/ve250104/OpenBPMN/issues/33) is `ready-for-human` because it includes actual maintainer review and real host/platform observations; an agent may prepare and assist but cannot invent those results. Native dependencies, rather than the label alone, determine readiness.

## Completion boundary

The [Wayfinder map](https://github.com/ve250104/OpenBPMN/issues/1) closes the design decisions. The runtime-selection harness demonstrates a narrow dependency path and exposes known adapter work; it does not establish complete support. The implementation parent stays open until the delivered distribution meets every required [acceptance gate](acceptance-and-compatibility.md).

Candidate hashes tie tests and observations to the exact release. Missing dependency redistribution evidence, required host/platform access, human review, or a failing supported case keeps release qualification open. Optional unavailable vendor-tenant checks stay explicitly unverified; they do not become blanket compatibility claims.
