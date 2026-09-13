# Review remediation — 2026-09-13

Follow-up to the [full code review](full-code-and-repository-review-2026-09-13.md) and [repository readiness review](open-source-readiness-review-2026-09-13.md). Implementation baseline: `108fda08f263051b0aff15bd5337057079e65da3`, the then-current `main`. The dated reviews remain historical observations, not descriptions of today's settings. This pass fixes their actionable findings; it does not qualify a finished v0, publish a package, or resolve the existing legal/host/human acceptance gates.

## Standards fixes

- Credential-bearing unsupported-concept identities now trigger a safe input refusal before any report, snapshot, or Handoff is published. They are not redacted into a different semantic identity. Public CLI regressions cover normal generation, requested snapshots, and Handoffs; historical report context is also covered. Synthetic credentials only.
- Renderer cleanup failures now identify the exact residual private directory in a controlled diagnostic. A real filesystem-boundary failure verifies the path is actionable without exposing the dependency error or private file contents; the test restores the filesystem function and removes only its own temporary directory.

## Spec fixes

- XML Schema boolean forms keep their standard meaning in both inspection and Viewer rendering. A private namespace-aware, descriptor-typed lexical view handles the dependency parser limitation. XML/XSD checks still inspect the original bytes, and source files and supplied DI are not rewritten. [W3C boolean definition](https://www.w3.org/TR/xmlschema-2/#boolean).
- Supplied gateway directions are checked against their actual incoming/outgoing cardinalities, including Converging, Diverging, and Mixed. Unspecified remains legal under its own rule; the projection no longer silently drops a contradictory declaration. [OMG BPMN 2.0.2 §10.6.1](https://www.omg.org/spec/BPMN/2.0.2/PDF#page=319).
- DI checks use each plane's semantic scope and visible containment, rather than allowing another plane's shapes to satisfy coverage. Wrong-plane, incomplete repeated-view, misplaced-lane/pool, collapsed-content, and cross-plane explicit endpoint cases have public CLI counterexamples. Existing shared-process pools, subprocess/call panels, Group views, and Process/Activity IO remain covered by the unchanged rendering suite.

Integration exposed an additional existing router defect: the stricter DI checks caught Sequence Flows leaving their own pools in the 100- and 250-node fixtures. In the 100-node case two routes used `y=132` while their pool began at `y=160`. The router now constrains Sequence Flow candidates to the source-declared Process pool and visible enclosing SubProcess bounds. Lanes remain crossable, and Message Flows retain cross-pool routing. Scale tests independently compare every waypoint with the pool selected from the authored request, before invoking the product DI validator. No process facts, scale limits, or timeouts were changed, and containment checks were not relaxed.

## Cross-platform SVG gate

A fresh native Debian ARM64/Chromium reproduction recovered a concrete difference: 23 horizontal `tspan x` values, maximum delta `0.0005035400390625` SVG units. All other SVG bytes, and the complete BPMN and Quality Report, were identical. Diagnostic pairs are retained under ignored `.artifacts/svg-ci-repro.0ozOfq/`.

The published-example comparator allows at most `0.001` SVG units only for numeric `tspan x` values. Labels, wrapping, vertical placement, fonts, IDs, shapes, routes, symbols, markers, and all other bytes stay exact. Fifteen mutation counterexamples reject meaningful changes. Two fresh generations in the same environment must still produce byte-identical BPMN, SVG, and Quality Reports. Original Linux test: red; corrected test: green on native Linux and macOS. Golden files and production geometry were not changed. Future failures retain full artifact pairs, and CI records the browser/Node/OS versions.

The historical hosted CI log truncates the SVG tail, so its exact difference is not retrospectively proved. No paid rerun was triggered. The user's GitHub Actions billing restriction remains external; no new hosted run is claimed green.

## Dependency and repository hardening

- Ajv moves from exact pin `8.17.1` to `8.18.0`, the maintainer's patched release for GHSA-2g4f-4pwh-qvx6. Generated notices stay consistent. Production-only and complete audits after the change: zero reported advisories. Comparing the old lock with the shrinkwrap confirms only Ajv and the root pin changed. The old version's documented exploit prerequisite (`$data`) was not enabled in this project. [Maintainer release](https://github.com/ajv-validator/ajv/releases/tag/v8.18.0).
- The CLI uses one canonical, publishable `npm-shrinkwrap.json`, replacing the development-only `package-lock.json`. Installed-package checks require the exact lock bytes and record both the lock hash and the actual installed dependency tree alongside the archive hash. No duplicate lockfile or install lifecycle hook is added. This is an application CLI, the intended use case for [npm shrinkwrap](https://docs.npmjs.com/cli/v11/commands/npm-shrinkwrap/).
- GitHub API read-back confirms private vulnerability reporting enabled, Dependabot alerts enabled (HTTP 204), and security updates enabled/not paused. The private report URL reaches GitHub's sign-in flow; no report was submitted and notification delivery or the signed-in form was not tested. SECURITY.md now gives the real private link, without an invented response SLA. Monthly npm/Actions update configuration is committed without auto-merge.
- `main` now requires the `linux` check from GitHub Actions (app ID 15368), an up-to-date branch, pull requests, and resolved review conversations. Force pushes and deletion are blocked. Zero mandatory independent approvals avoids a single-maintainer deadlock. Administrator bypass is explicitly retained while CI is billing-blocked; a bypass is not evidence of a successful hosted run. Configuration was read back after applying it. [GitHub protection behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
- README entry points and the build checkpoint now reflect merged `main`. GitHub About description/topics are populated, and a minimal synthetic-reproduction bug template is added. No website, new application layer, or governance framework is introduced.

## Verification and remaining boundaries

Implementation commit: `b83c48f`. Focused regressions were run as each fix was made. Tests use Node 24.14.0 and installed Chrome 152.0.7977.83 on macOS arm64 unless explicitly labelled otherwise.

- Fresh `npm ci --ignore-scripts --no-audit --no-fund`, build, and static checks passed; YAML syntax checks and `git diff --check` passed.
- Focused suites passed: supplied semantics/lexical view 6/6, DI CLI 6/6, browser lifecycle/cleanup 4/4, existing rendering 27/27, package-lock verification 4/4, SVG comparator 16/16, review/credential refusal 10/10. All eight existing composition layouts remained DI-clean. These overlap the later full suite and are not added to its count.
- Installed archive smoke passed all four executable commands, user-guide links, ZIP/package skill equality, safe replacement, refinement/Handoff, and 38 exact locked package placements. Archive SHA-256 `8846b046c510b81bc21c6743be1aff0dc67fbb92a408029c8cf127de46528c5d`; 550,815 compressed bytes and 30,716,694 installed bytes. Skill ZIP SHA-256 `79ac71f83b8c9fb45c1f60f819f1bd0a01027c03b2c6e08729f87e83122ad29c`. Shrinkwrap SHA-256 `36a6df0f61c6148ee8b79b244098bca7df2ae46d16167c91ca3a607c6b247825`. The retained package evidence also contains the actual dependency tree and its hash.
- Mac command monitoring observed zero Node/browser network attempts. OS-level network isolation was **not run** for this new archive; the earlier Linux-isolated archive remains a separate observation. Neither is a fully qualified release candidate.

## Independent Standards review

No findings in `108fda08...b83c48f`. Every changed file/hunk was inspected against the documented repository rules and the code-review skill's judgment-based maintainability baseline. Credential identity refusal and actionable cleanup paths resolve the original hard-contract violations. XML adaptation remains behind the artifact-library boundary; source XML/XSD and process meaning remain authoritative. Exact dependency pins, installed resolution checks, and narrowly scoped SVG comparison preserve the documented boundaries. No actionable maintainability heuristic was identified.

## Independent Spec review

No findings in `108fda08...b83c48f`. The fixes address the reported boolean meaning loss, gateway cardinalities, plane-local DI, credential refusal, cleanup diagnostics, SVG comparison, dependency maintenance, and distribution requirements without identified scope creep. An additional 132 no-browser boolean lexical-preservation cases passed, including entity/numeric values, CR/LF/CRLF and astral characters. The shrinkwrap comparison confirms only Ajv and its root pin changed. Hosted CI, private-notification delivery, OMG permission interpretation, and separate v0 qualification remain explicitly unverified.

First review summary: Standards **0 findings**; Spec **0 findings**. The reviews ran independently and did not modify files or run competing browser workloads.

The first integrated full-suite run then passed **289/291**, zero skipped, in **124.326 seconds**. The two failures were the 100- and 250-node routing escapes described above; they are retained as failed observations, not discounted as flaky timing or waived. The additional routing correction requires focused scale verification, independent follow-up review, and a new final full-suite run before declaring this remediation verified.

## Routing follow-up verification

Correction commit: `1b5b617`. All three scale tests passed, including unchanged 250-node/500-connector semantics, two layouts, two Viewer renders, and exact repeatability. The 250-node case completed in 52.720 seconds overall (not one layout); the per-layout 30-second budget remained unchanged. This is correctness evidence, not twenty-sample performance qualification.

Both independent axes reviewed `b83c48f...1b5b617` while retaining their earlier full-diff assessments. **Standards: 0 findings. Spec: 0 findings.** The routing constraint preserves process meaning, permits cross-lane and Message Flow behavior, and the added waypoint oracle is independent of the implementation's DI assessment. No tests, facts, or limits were relaxed.

The corrected build/static checks and installed-package smoke passed again. Final development archive SHA-256 `b16332bdd1d7c649c6c67094fc9c1cd71faeed7f857c8ac2a03e24bd91e8e246`; 551,072 compressed bytes, 30,717,950 installed bytes. Skill/shrinkwrap/tree hashes are unchanged from the first smoke. All four commands, Handoff, skill equality, 38 dependency placements, and zero monitored Node/browser network attempts passed. OS-level isolation for this archive remains unrun.

The final serialized full suite passed **291/291**, **zero skipped**, in **139.007 seconds**, with no competing browser/layout work and process-scoped idle-sleep prevention. This includes every integration test selected by `npm test`. The unchanged 250-node test completed both layouts and renders in 35.277 seconds. These single-run durations are not p95 performance qualification. Full output is retained in ignored `.artifacts/remediation-full-suite-1b5b617.log`; the first failure's available output tail is retained separately as `.artifacts/remediation-initial-suite-tail-b83c48f.log`.

All actionable code and repository-maintenance findings in this remediation scope are implemented and locally verified. Both final review axes remain at zero findings. Source changes are committed locally on `main`; this pass did not push them or claim a new hosted CI result. Existing v0 release gates remain open as described below.

No billing changes, hosted reruns, model sessions, registry publication, release, or legal outreach occurred. Optional CodeQL/trusted-publishing setup is not a fixed code defect and is not introduced during a billing-blocked development pass. OMG XSD redistribution interpretation still requires suitable review or authorized clarification; attribution is not legal clearance. The build checkpoint's remaining readability, corpus, performance, supported-platform, real-host, and human qualification tasks remain open.
