# Build checkpoint

Updated 2026-09-13. The implementation has been merged to `main`; the earlier WIP branch is no longer the public entry point. This is a development build, not a finished release or package publication. Build parent: GitHub issue #19; no build ticket has been closed by this hardening pass. The observations below retain their original archive/run boundaries; the [review follow-up](research/review-remediation-2026-09-13.md) records subsequent fixes and verification separately.

The owner authorized the earlier public WIP checkpoint with the documented OMG schema-redistribution uncertainty retained. That does not resolve the permission interpretation or satisfy the release gate.

## Implemented and exercised

- All four CLI commands, strict schemas, full compiler record families, local official XSD validation, owned layout, and actual Viewer SVG rendering. The portable skill supports guided creation, refinement, requested snapshots, and explicit Handoffs without a product workspace or forced lifecycle status.
- Expert SVG preservation is now verified after the transaction or handled failure. Four regressions cover concurrent edits/deletion, unchanged previews, and sibling-output refusal.
- An exact recovered request from the real Codex test exposed model documentation on an XSD-illegal Definitions child. The compiler now preserves it as separate standard documentation on the primary Process/Collaboration, alongside that subject's own text. Three CLI regressions cover both subject kinds, duplicate text, XML characters, call-target documentation, and unchanged Handoff input. No schema or validation gate was weakened.
- Dense handoff routing retains every Message Flow while avoiding duplicate upstream routing. Activity/Participant endpoints and collapsed-subprocess source/target endpoints are covered below and above the ten-flow adapter threshold. Original semantic references are preserved. The unchanged 250-node/500-connector correctness case passes in isolation.
- The profile matrix maps 142 requirements to 117 named tests, with no empty supported visual mappings. Twenty-one independently authored slices cover 23 former visual gaps. Exact semantics, visible sets, labels, and native symbols supplement eight composition oracles. This is not the complete independently-oracled notation corpus.
- Installed packages now include five focused user guides with checked local links. Packaging tests exercise the executable shim, all four commands, refinement/Handoff, and ZIP/package skill equality. The regenerated public purchase example has an exact reproduction regression and agent visual inspection; no human approval is implied.
- Supplemental native Debian ARM64/Chromium tests exposed browser configuration/font-cache residue outside the disposable profile. Child-only XDG locations fixed it. Success and launch-failure regressions pass. The installed rerun passed all four commands with networking denied, zero network attempts, and zero retained filesystem changes. Chromium's namespace and Seccomp-BPF sandboxes remained enabled. This does not qualify supported Ubuntu x64 or Windows.

## Development evidence

Ignored `.artifacts/` retains failed and successful observations; these different archives are not one release candidate.

- `linux-installed-offline-32d351a12ecd.json`: network isolation passed; retention failed on crash-report settings/font caches.
- `linux-installed-offline-3641210eb80f.json`: corrected runtime passed isolation and retention. Archive SHA-256: `3641210eb80f542e6c955a3324e3e6d635208bb8e0f008c0fa398f9642b1cd84`.
- AMD64 Chrome under QEMU failed before rendering; preserved separately, never counted as native evidence.
- Final serialized full-suite run, including the three documentation regressions: **256/256 passed, zero skipped**, in 114.03 seconds; largest scale test 44.65 seconds for two layouts/two renders. The earlier parallel run passed 252/253 and reached the unchanged 30-second per-layout limit during competing browser work. An awake isolated replay measured one layout at 21.369 seconds. Serializing test files resolved oversubscription without changing the runtime budget, fixtures, or assertions. A separate host-suspended run is invalid for latency measurement. Both failed and successful observations remain recorded.
- Formatting, strict TypeScript, reference checks, focused tests, and packaged installation passed at the recorded checkpoints. No twenty-sample p95 qualification or final candidate-bound corpus run has completed.
- Latest macOS package smoke passed all four installed commands, user-guide links, skill equality, refinement/Handoff, and zero monitored network attempts. Development tarball SHA-256: `8db59a3cb3ac7c05f1f5670158bcb6275644153195b5a2ca944499c506f2b638`; 538,796 compressed bytes. It includes the documentation fix; the isolated Linux result above remains bound to its own archive.
- The [actual Codex pair](../eval/discovery/codex-comparison-development.json) completed with identical held-out source/prompt/settings and no hidden oracle. Raw Codex delivered three artifacts; independent XSD passed but actual Viewer rendering failed the overlapping-label check. The installed-skill arm delivered no bundle because its login shell selected Node 25. The same installed CLI passes capabilities with an invocation-local existing Node 24 prefix; this is setup recovery, not a successful agent creation. Exactly two model creation runs, no followups. Original artifacts, hashes, usage, and failures are retained. See [comparison boundaries](research/comparison-method.md).
- A separately labelled replay recovered the exact model-authored JSON without executing its recorded commands or altering fields. The frozen engine failed XSD; after the compiler correction, the same request exported all three files with all nine machine checks passing in 1.10 seconds. Artifacts: `.artifacts/documentation-replay.zdM5FQ/`. This is engine-only evidence, not a successful original host session. Agent visual inspection found unnecessary gateway detours/counter-directional approaches despite machine checks passing; readability is not qualified.

## Next work

1. Preserve serialized full-suite scheduling and keep future reference measurements free of competing work or host sleep. Do not increase product timeouts or reduce scale fixtures to obtain a pass.
2. Run a future fresh Codex creation with Node 24 verified inside the actual command shell, preserving the failed first-use observation. Do not substitute a post-run CLI replay for successful agent-host qualification. One paired case cannot establish general superiority.
   Prioritize the recovered offboarding model's gateway-routing readability as a regression-driven improvement, preserving facts, labels, and existing scale budgets. Both generated descriptions retain departure timing and the equipment register mostly as task text; independently review whether the intended consulting detail is sufficient.
3. Run the ten-run composition/new-variant corpus on frozen bytes, then complete independent fixture-level oracles for older notation families. The earlier 80/80 composition batch predates later changes and is development evidence only.
4. Collect twenty-run reference latency and aggregate-memory samples with `scripts/performance.mjs` and no competing test work. Single timings are not p95 qualification.
5. Complete Claude Code/Copilot workflows, cross-host Handoffs, supported native Ubuntu/Windows observations, and maintainer visual/new-user review. Mac/Codex evidence does not waive these.
6. Resolve OMG schema redistribution before packaged release; see [distribution provenance](research/distribution-provenance.md). No external licensing outreach was performed.
7. Bind the final clean commit, package/skill hashes, and every required observation through the strict release-evidence checker before calling v0 finished.

## Environment and boundaries

Use Node 24.14.0; system Node 25 is outside support. macOS Chrome observed: 152.0.7977.83. Fresh Codex sessions retain the user's configured model. Login-shell PATH precedence can select system Node despite a parent Node 24 prefix; record setup friction without changing global configuration.

Canonical skill: `skills/bpmn-weave/`. Build scripts refresh copied schemas/example/version/license. Runtime snapshots, model transcripts, screenshots, and machine logs remain ignored artifacts. No private CV/client material belongs in product artifacts.

Only disposable task-owned Linux containers and unusable task-owned image/cache layers were removed; unrelated containers were unchanged. No browser sandbox was disabled. No automation, registry publication, release, or new task for later work was created.
