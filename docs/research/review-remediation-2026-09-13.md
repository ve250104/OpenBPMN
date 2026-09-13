# Review remediation — 2026-09-13

Follow-up to the [full code review](full-code-and-repository-review-2026-09-13.md) and [repository readiness review](open-source-readiness-review-2026-09-13.md). Implementation baseline: `108fda08f263051b0aff15bd5337057079e65da3`, the then-current `main`. The dated reviews remain historical observations, not descriptions of today's settings. This pass fixes their actionable findings; it does not qualify a finished v0, publish a package, or resolve the existing legal/host/human acceptance gates.

## Standards fixes

- Credential-bearing unsupported-concept identities now trigger a safe input refusal before any report, snapshot, or Handoff is published. They are not redacted into a different semantic identity. Public CLI regressions cover normal generation, requested snapshots, and Handoffs; historical report context is also covered. Synthetic credentials only.
- Renderer cleanup failures now identify the exact residual private directory in a controlled diagnostic. A real filesystem-boundary failure verifies the path is actionable without exposing the dependency error or private file contents; the test restores the filesystem function and removes only its own temporary directory.

## Spec fixes

- XML Schema boolean forms keep their standard meaning in both inspection and Viewer rendering. A private namespace-aware, descriptor-typed lexical view handles the dependency parser limitation. XML/XSD checks still inspect the original bytes, and source files and supplied DI are not rewritten. [W3C boolean definition](https://www.w3.org/TR/xmlschema-2/#boolean).
- Supplied gateway directions are checked against their actual incoming/outgoing cardinalities, including Converging, Diverging, and Mixed. Unspecified remains legal under its own rule; the projection no longer silently drops a contradictory declaration. [OMG BPMN 2.0.2 §10.6.1](https://www.omg.org/spec/BPMN/2.0.2/PDF#page=319).
- DI checks use each plane's semantic scope and visible containment, rather than allowing another plane's shapes to satisfy coverage. Wrong-plane, incomplete repeated-view, misplaced-lane/pool, collapsed-content, and cross-plane explicit endpoint cases have public CLI counterexamples. Existing shared-process pools, subprocess/call panels, Group views, and Process/Activity IO remain covered by the unchanged rendering suite.

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

Focused regressions are run as each fix is made; full-suite, installed-archive, and final independent review results will be recorded here after integration. Tests use Node 24.14.0 and installed Chrome on macOS arm64 unless explicitly labelled otherwise.

No billing changes, hosted reruns, model sessions, registry publication, release, or legal outreach occurred. Optional CodeQL/trusted-publishing setup is not a fixed code defect and is not introduced during a billing-blocked development pass. OMG XSD redistribution interpretation still requires suitable review or authorized clarification; attribution is not legal clearance. The build checkpoint's remaining readability, corpus, performance, supported-platform, real-host, and human qualification tasks remain open.
