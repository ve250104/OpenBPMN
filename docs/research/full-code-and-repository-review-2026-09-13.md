# Full code and repository review

Reviewed 2026-09-13. **Do not sign off this build as finished v0 or release-ready.** The implemented foundation is substantial, but this review confirmed five code defects and one failing cross-platform test, alongside repository-maintenance gaps. Passing the existing suite does not cover these new counterexamples.

## Scope and verification

- Code baseline: planning handoff `813fb1bba3108bf5786d86fba42e28f0523e8928` through implementation `22047beb55677145553349d494ade0a5d44cfedc`, using `git diff 813fb1b...HEAD`. This covers the full implementation, rather than only the most recent fixes. Baseline confirmation was requested; the broad scope follows the request for a full review.
- Remote `main` additionally contains `108fda08f263051b0aff15bd5337057079e65da3`, a README-only removal of one compatibility sentence. That delta was inspected separately; the local checkout was not changed to it.
- Independent Standards and Spec reviews, plus repository/security/distribution research against first-party documentation. Standards include the repository's documented rules and judgment-based maintainability heuristics; no arbitrary style complaints or tooling-enforced formatting findings are counted.
- Fresh macOS arm64 / Node 24.14.0: build and static checks passed; **256/256 tests passed, zero skipped**, in 146.03 seconds. This is correctness evidence, not a controlled performance qualification.
- Fresh installed-package smoke: all four commands, executable shim, installed documentation links, refinement/Handoff, skill equality, and network monitoring passed. No monitored Node/browser requests. This Mac run did not perform OS-level network isolation.
- Package SHA-256: `ed023e814c1df21edd1facae98fb9a8a24837c1f8c39007fe5ee4676b222be6f`; compressed 538,784 bytes; installed dependencies/package 30,672,685 bytes. Skill ZIP SHA-256: `79ac71f83b8c9fb45c1f60f819f1bd0a01027c03b2c6e08729f87e83122ad29c`. These are development observations, not one fully qualified release candidate.
- Both production-only and complete dependency audits reported one moderate Ajv advisory, zero high/critical advisories. Its documented exploit requires an option not enabled in this code; no exploitable application path was demonstrated.
- No additional model sessions, paid CI reruns, changes to GitHub/billing/security settings, issue comments, fixes, commits, or pushes. Only review documents and ignored diagnostic evidence were created. No private source material or real credentials were used in reproductions.

## Standards

Two confirmed **hard contract violations**, not style judgments.

1. **[P2] Redact credentials in unsupported-concept references** — [src/review.ts:85–90](../../src/review.ts#L85).

   `if (!displayFields.has(field) && !meaning) return value;` skips `issues[].concept`. That field permits a `namespaceURI#localName`; an authenticated/query-bearing URI therefore bypasses existing high-confidence detection. Public CLI reproduction: invoice example plus an unresolved issue whose concept is `https://example.invalid/?api_key=synthetic-review-credential#Extension`. Generation exits 2, produces no artifacts, but stdout includes the synthetic credential verbatim in `report.context.issues`; no `SECRET_REDACTED` finding occurs. Snapshot report/Handoff construction also retains that field. Classify and sanitize—or safely refuse—this field before publishing review context.

   Violates [local-trust-and-file-safety.md](../local-trust-and-file-safety.md), Data-minimized artifacts and the explicit prohibition on secret values in diagnostics. This is a detector coverage omission for an already-recognized pattern, not a demand for exhaustive detection.

2. **[P2] Identify residual renderer files when cleanup fails** — [src/renderer.ts:573–575](../../src/renderer.ts#L573).

   Cleanup throws only `CLEANUP_FAILED: Temporary renderer files could not be removed.` The random profile path is discarded, preventing targeted recovery of retained temporary content. Reproduced by injecting `EACCES` at the real `rm` boundary; the profile was created, but the error contained no residual location. Use the content-free path in the controlled diagnostic, without dumping browser data.

   Violates [local-trust-and-file-safety.md](../local-trust-and-file-safety.md), Temporary data and Failure behavior, both requiring residual paths and codes. The fault-injection builtin was restored and that exact temporary directory removed.

## Spec

1. **[P1] XML boolean variants silently change meaning** — [src/inspect.ts:413](../../src/inspect.ts#L413).

   The raw checks recognize literal `true`; the subsequent moddle parse interprets `1` and whitespace-padded `true` as false. These are valid XML Schema boolean representations. Public `validate` therefore incorrectly returns exit 0 and `cleanEligible: true` for executable/compensation models. A sequential multi-instance fixture also passes while being interpreted as parallel. Guard unsupported lexical forms before assessment/rendering, or preserve their standard meaning consistently. A raw-token check alone is insufficient while the later parser still changes the value.

   Spec: [architecture.md:66](../architecture.md#L66) requires assessment of “the original document”; [contracts.md:144](../contracts.md#L144) requires passed semantic/profile checks for Clean eligibility. [W3C boolean definition](https://www.w3.org/TR/xmlschema-2/#boolean).

2. **[P1] Gateway direction constraints disappear during inspection** — [src/inspect.ts:344](../../src/inspect.ts#L344) and [projection at line 590](../../src/inspect.ts#L590).

   `gatewayDirection` is accepted but omitted from the projection. Adding `gatewayDirection="Converging"` to the purchase example's two-outgoing XOR passes every validity check and exits 0. This violates BPMN's converging-gateway cardinality rules. Validate the supplied attribute or explicitly leave its assessment unavailable.

   Spec: [architecture.md:66](../architecture.md#L66) says validation “assesses the original document without first forcing it through the narrower canonical input schema.” [OMG BPMN 2.0.2 §10.6.1, printed page 289](https://www.omg.org/spec/BPMN/2.0.2/PDF#page=319).

3. **[P1] DI coverage ignores the owning plane** — [src/renderer.ts:644](../../src/renderer.ts#L644).

   Shapes are counted globally without checking whether their semantics belong to that plane. Adding an empty `OtherProcess` and pointing the purchase example's plane at it still yields exit 0, `di: passed`, and Clean eligibility. Check plane scope and containment before accepting coverage.

   Spec: [acceptance-and-compatibility.md:37](../acceptance-and-compatibility.md#L37) requires “the right DI type and plane.”

All three have real CLI reproductions in ignored `.artifacts/spec-review-Tk0jMi/observations.json`; the runner is `.artifacts/spec-review-repro.mjs`. The original fixture and literal `isExecutable="true"` provide controls. The defective cases all report XML/XSD/semantics/profile/DI passed with no findings. No scope-creep findings; already declared unrun release gates were not recounted as new code defects.

## Repository check

### Confirmed failing test: purchase-example SVG

**[P1] Restore the cross-platform test gate.** [test/generate.integration.test.mjs:36–40](../../test/generate.integration.test.mjs#L36) compares exported SVG bytes against the checked-in example on every environment. The [implementation CI run](https://github.com/ve250104/OpenBPMN/actions/runs/34749345799) and [README-only run](https://github.com/ve250104/OpenBPMN/actions/runs/34749811930) both reached the test suite. The latter ran all 256 tests: 255 passed, and this strict SVG comparison failed. Subsequent installed-package and isolation steps were skipped.

Billing restrictions are separate and are not classified as a repository defect. The logged test failure is affirmative evidence that this particular job executed. The exact cross-platform SVG difference was not recovered here: do not assume a cosmetic mismatch or silently regenerate the golden file. Retain both outputs, identify the difference, and keep byte-repeatability assertions within recorded/pinned environments while independently checking semantic and visual fidelity across platforms. The current workflow chooses an Ubuntu image without pinning the browser version used by this golden comparison. Fixing that test must not conceal a real rendering difference.

### Owner-controlled security and maintenance settings

Read-only API observations verified three **P2 readiness gaps**: private vulnerability reporting disabled; Dependabot alerts/security updates disabled with no update configuration; and no branch protection/rulesets for `main`. Enable a working private reporting route and reviewed advisory/update flow. Choose a small enforceable default-branch policy after checks work in the owner's available infrastructure; do not require approvals that a sole maintainer cannot obtain. These are recommendations requiring deliberate settings changes, not changes made by this audit. Details and official references are in the [open-source readiness report](open-source-readiness-review-2026-09-13.md).

### Dependency, distribution, and presentation follow-ups

- Ajv is pinned at `8.17.1`. The moderate `$data` ReDoS advisory is fixed in `8.18.0`; review a supported patched pin and rerun affected tests. The existing constructor at [src/input.ts:18](../../src/input.ts#L18) does not enable `$data`, and no use was found in `src` or `scripts`. Treat this as dependency maintenance, not demonstrated exploitability. [Maintainer release](https://github.com/ajv-validator/ajv/releases/tag/v8.18.0), [advisory](https://github.com/advisories/GHSA-2g4f-4pwh-qvx6).
- Reproducibility recommendation: the distributed archive contains neither `package-lock.json` nor `npm-shrinkwrap.json`. Direct versions are fixed, but transitive dependencies such as `moddle`, `moddle-xml`, and `min-dash` use ranges. A tarball hash alone therefore does not bind every installed runtime dependency. Record the resolved installed tree in qualification; consider a production shrinkwrap for this CLI if exact installation reproduction is required. The present direct-pin/committed-lock rule is implemented, so this is additional distribution hardening rather than an invented standards violation. [npm lockfile scope](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json/), [publishable shrinkwrap](https://docs.npmjs.com/cli/v11/commands/npm-shrinkwrap/).
- After the merge, the README still directs clones to `wip/v0-implementation`, and several user links target that branch. They currently resolve, but can diverge from default-branch development. Update them deliberately when choosing `main` as the maintained public entry point. The checkpoint also describes the earlier pre-merge branch arrangement; preserve history while making current status easy to find.
- The About description/topics are empty. Add concise accurate metadata and, if outside reports begin arriving, one minimal bug template requesting versions and a synthetic reproduction. A separate website, elaborate governance, badges, and a mandatory independent reviewer would not improve this lean v0 by themselves.
- The OMG schema redistribution interpretation remains an explicitly documented release gate, not newly established infringement. No rights-holder outreach or legal clearance occurred. bpmn-js's non-MIT watermark condition and retained notices remain important. See [provenance](distribution-provenance.md) and the cited OSS report.

## What is already good

One package and portable skill, explicit output/overwrite authority, bounded inputs, official local XSD validation, separate semantic/DI checks, real Viewer tests, adversarial filesystem tests, an installed-package test seam, exact direct dependency pins, synthetic fixture provenance, and honest development/support labeling are meaningful foundations. Actions use full-SHA pins and read-only permissions; GitHub secret scanning and push protection are enabled. The review does not recommend a rewrite or a larger application.

## Limits and recommended next pass

Fix the three false-validity paths with public counterexample regressions; fix the two data-minimization/recovery defects; then resolve the SVG comparison and rerun the full and installed suites. Keep Standards and Spec findings distinct during follow-up. Repository setting changes and dependency upgrades need their own explicit implementation authorization.

Existing gateway-readability polish, fresh successful host workflows, independent corpus/repeatability/performance qualification, required platform observations, human usability review, and distribution permission remain unfinished-v0 work. They were not performed by this review. No exhaustive-history secret scan, penetration test, account-security audit, business-correctness certification, or real vendor-tenant import was claimed.

**Axis summary: Standards — 2 findings, worst credential disclosure in review context; Spec — 3 findings, all P1 false-validity/meaning-preservation defects.**
