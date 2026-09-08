# Public identity and finished v0 release plan

This is the implementation decision for public positioning, distribution, repository presentation, and maintenance. It defines how the finished release will ship; it does not claim that the current repository already contains the implementation or has passed release qualification. The complete [v0 release contract](product-direction.md) and [Consulting Core 1.0.0](consulting-core-profile.md) remain mandatory.

## Identity and positioning

| Surface | Selected identity |
| --- | --- |
| Public product name | **BPMN Weave** |
| Short description | **Turn process conversations into reviewable BPMN.** |
| npm package | `@ve250104/bpmn-weave` |
| Executable | `bpmn-weave` |
| Modeling Skill name and directory | `bpmn-weave` |
| First finished release | `0.1.0`, Git tag `v0.1.0` |
| Existing repository location | `https://github.com/ve250104/OpenBPMN` |

The README explains the value in concrete terms: describe how work happens, resolve consequential ambiguity through conversation, inspect the resulting diagram, and obtain a portable BPMN file with a separate Quality Report. Operators and process consultants are the primary audience. The distinction is careful process interpretation and reliable artifacts, supported by reproducible evidence.

Use the compound name consistently. OpenBPMN is the historical repository name; the implementation updates user-facing titles and command examples to BPMN Weave. Existing specification identifiers, profile identity, and `.openbpmn.json` Handoff File suffix remain unchanged for v0. They are interchange identifiers, not a second public product. Changing them later requires an explicit format migration. The repository URL need not change to ship under the selected name; no repository rename, account creation, or package registration is part of this planning decision.

The name avoids direct confusion with the existing [Imixs Open BPMN modeler](https://github.com/imixs/open-bpmn). A bounded check on 2026-09-08 found zero repositories in the [GitHub repository-name query](https://api.github.com/search/repositories?q=bpmn-weave+in%3Aname), and the npm registry returned HTTP 404 for both [the unscoped package](https://registry.npmjs.org/bpmn-weave) and [the selected scoped package](https://registry.npmjs.org/@ve250104%2fbpmn-weave). Exact-phrase web searches found related uses of “weave” but no exact product match in the returned results. This preliminary collision check establishes neither exclusive rights nor control of the npm scope. Confirm the registry target immediately before first publication; scope ownership is a publication prerequisite, not an unresolved product decision.

Do not claim full BPMN support, official OMG conformance, identical agent conversations, automatic business truth, measured savings, or a vendor integration. “Local” means that the CLI runs locally without a project-hosted service; the user's Host Agent may process evidence with its provider according to its own settings. A compatibility claim names the tested consumer and operation and links to the recorded result. Synthetic examples remain labeled synthetic.

## One package and two installable artifacts

Ship one Node.js package containing compiled ESM JavaScript, the four-command CLI, bundled renderer assets, XML schemas, JSON schemas, profile/rule data, font assets, and the portable Modeling Skill. The package has one `bin` entry. Internal modules are private implementation details; there is no separately published SDK.

The release publishes:

1. The exact npm package tarball produced by `npm pack`, named `ve250104-bpmn-weave-0.1.0.tgz`.
2. `bpmn-weave-skill-0.1.0.zip`, containing one complete `bpmn-weave/` directory with `SKILL.md`, required reference files, minimal examples, license, and version metadata.
3. SHA-256 checksums and a release qualification summary linking to full evidence in the repository.

The ZIP is another presentation of the package's skill directory, not a second implementation or separately versioned product. Its contents must match the corresponding package directory byte for byte. Runtime dependencies are resolved by npm during the explicit install step. No browser binary, model runtime, source archive, evaluation transcripts, or historical planning documents enter either runtime artifact. Package `files` is an explicit allowlist, and `npm pack --json` is checked against it.

The standard installation command, once the package has actually been published, is:

```sh
npm install --global @ve250104/bpmn-weave@0.1.0
bpmn-weave capabilities --json
```

The GitHub release tarball is an equally supported install source:

```sh
npm install --global ./ve250104-bpmn-weave-0.1.0.tgz
bpmn-weave capabilities --json
```

Documentation uses the archive route until npm publication is verified; it never presents an unpublished package as installable. A project-local npm installation is also documented for users who prefer an existing project package manager. The Modeling Skill invokes the installed executable or its explicitly selected local path. Ordinary modeling does not use `npx` to fetch a tool implicitly.

There is no install lifecycle script, automatic browser download, automatic update, or automatic modification of an agent's instruction files. The maintainer can ship the tested GitHub release archives even when npm credentials are unavailable. npm publication is an additional distribution action using the same tested tarball, and requires verified ownership and current registry authentication. Scoped public packages require public access configuration; follow the [npm publication requirements](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).

## Runtime and platform support

The required v0 runtime is **Node.js 24.x**, with `engines.node` set to `>=24.0.0 <25`. Node 24 is an LTS release in the [official release schedule](https://nodejs.org/en/about/previous-releases). Pin the exact Node 24 patch and npm version in release evidence and use the current supported Node 24 patch for user instructions. Other Node major versions are not release support claims merely because they can execute the package.

| Required qualification environment | Node | Browser used for generation and rendering |
| --- | --- | --- |
| macOS 14 or later, Apple Silicon | 24.x | Installed Google Chrome |
| Ubuntu 24.04, x86-64 | 24.x | Installed Google Chrome or the exact Chrome for Testing build installed explicitly by CI |
| Windows 11, x86-64 | 24.x | Installed Microsoft Edge; Chrome is an additional supported discovery path after its smoke check passes |

These are the required release environments, not a claim that they have passed today. A fresh supported environment needs Node, npm, and one documented local browser. `generate` and `render` require the browser; `validate` and `capabilities` do not. Browser absence produces an actionable result describing the prerequisite and preserves the current bundle. The runtime selection contract owns exact discovery rules, renderer isolation, fonts, dependency pins, and timeouts.

The browser runs headlessly in a temporary profile. The tool does not connect to the user's browsing session. A browser executable override is a path to a local executable, never a remote rendering service. Dependencies and bundled fonts/assets must operate without network access after installation. Linux setup names any browser OS packages required by the chosen official browser distribution. Browser downloads for CI are explicit environment preparation, not runtime behavior.

## Portable Modeling Skill and supported Host Agents

Author the consulting workflow once at `skills/bpmn-weave/SKILL.md`. All required branch references travel inside that directory. The skill checks the CLI/profile version through `capabilities`, loads relevant references progressively, and follows the [Agent Workflow](agent-workflow.md). A skill/core version mismatch is reported with a useful upgrade instruction. Do not silently run a payload against an incompatible schema.

The primary user setup is: install the CLI, extract the skill ZIP, put the single `bpmn-weave` folder into the selected Host Agent's skill directory, and start or refresh the agent session. Documentation includes shell and PowerShell copy instructions using explicit source and destination paths and refuses accidental replacement of an unrelated existing skill directory. Installing a skill is user-selected setup; it does not initialize a process workspace. Upgrades replace the named installed skill only with the user's authority and update the CLI and skill together.

| V0 conversational surface | Personal installation | Project installation | Discovery evidence |
| --- | --- | --- | --- |
| Local Codex CLI | `~/.agents/skills/bpmn-weave/` | `.agents/skills/bpmn-weave/` | [Official skill locations and invocation](https://learn.chatgpt.com/docs/build-skills) |
| Local Claude Code | `~/.claude/skills/bpmn-weave/` | `.claude/skills/bpmn-weave/` | [Official skill locations and invocation](https://code.claude.com/docs/en/skills) |
| Local GitHub Copilot CLI | `~/.copilot/skills/bpmn-weave/` | `.github/skills/bpmn-weave/` | [Official CLI skill installation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) |

The directory names above represent the user's home or chosen project; on Windows, setup instructions use the corresponding resolved home path. The same portable skill bytes work at every location. Thin discovery pointers in repository instructions may link to the canonical skill for source-checkout users. Such pointers contain no second consulting method and are not required for users installing the self-contained skill folder. No host-specific permission defaults or `allowed-tools` grants are shipped.

The three local CLI surfaces are required end-to-end release checks. Record exact Host Agent and model versions, installation location, date, commands, outputs, and evidence of refinement and Handoff File continuation. Deterministic outputs from equivalent structured inputs must agree; conversation wording is not an equality assertion. Host authentication and subscriptions belong to the user's environment. A host that has not been exercised remains unverified and prevents declaring the promised three-host v0 finished.

Some vendors also support skills in desktop, IDE, or cloud products; that documentation is not proof that this local package works on every such surface. Add a specific observed surface only after running the same workflow there. OpenAI currently recommends plugins for reusable distribution while still documenting local skill folders. V0 deliberately uses those documented folders for the three local CLI targets; no plugin directory publication or cloud promise is needed for this release. [OpenAI distribution guidance](https://learn.chatgpt.com/docs/build-skills), [GitHub surface distinctions](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills).

## Repository and documentation structure

The README is the product entry point. In order, it shows: what the tool does and for whom; a readable diagram from a labeled example; prerequisites and installation; a short conversational quickstart; the three output files; actual scope and compatibility; and links for deeper usage and contribution. Examples and screenshots must come from the version they describe. Until release qualification passes, the README states that implementation is in progress.

The finished source layout is deliberately small:

```text
src/                 CLI and internal core modules
skills/bpmn-weave/   Canonical Modeling Skill and progressive references
schemas/             Versioned input, report, and handoff contracts
assets/              Pinned local renderer, schemas, and fonts
test/                Deterministic contract and integration tests
eval/                Reviewed corpus and host/downstream qualification evidence
examples/            Small runnable user examples and their generated outputs
scripts/             Build, package, and verification utilities
docs/                User guide, command reference, contracts, and decisions
```

Generated `dist/` is built for releases and excluded from source history. The package lock is committed. Keep the maintained code, schemas, rules, and documentation in one package rather than a monorepo. Third-party source or redistribution notices live beside the assets they cover and are indexed by `THIRD_PARTY_NOTICES.md`.

User-facing documentation comprises an installation page, a concise modeling guide, the command/result reference, the support/compatibility matrix, and troubleshooting. Each user instruction appears in one authoritative place with links elsewhere. Existing Wayfinder contracts and research remain under `docs/` and GitHub Issues, reached through an architecture/planning index rather than the quickstart. A root `CONTRIBUTING.md` explains development and review; `CHANGELOG.md` records observable changes. `AGENTS.md` and `CLAUDE.md` remain short repository-working instructions with context pointers. Do not copy the planning corpus into the Modeling Skill.

## License and attribution

Retain the repository's existing MIT license and copyright notice for project-authored code, documentation, and synthetic fixtures. The root [LICENSE](../LICENSE) was inspected in full for this decision; it currently names `Copyright (c) 2026 Vincent2501`. Do not silently change the named copyright holder. Mark contributed example material with its actual provenance and license; third-party interviews are not assumed redistributable.

Runtime components retain their own licenses. The [bpmn-js license](https://github.com/bpmn-io/bpmn-js/blob/e27d06520d01ded523da484393f1180388c588e7/LICENSE) has a watermark-preservation condition and must not be described as plain MIT. Keep its watermark implementation intact and its badge visible in any viewer surface. Preserve attribution already supplied in exported output. The project also includes a small linked bpmn.io attribution footer outside model bounds in generated SVG previews as a conservative presentation policy. That footer is not process meaning and is never inserted into the `.bpmn` file.

The distribution includes exact available upstream license texts and source/version references for dependencies copied or bundled into it, including fonts, the validator, schemas, and layout code. Noto Sans assets retain the SIL Open Font License notice. The observed `bpmn-auto-layout` alpha package and matching source tag omit a root license file despite MIT metadata and a README declaration. The implementation retains those declarations and the exact notice from the subsequent upstream correction, recording the two source versions distinctly. The separate OMG machine-readable-schema redistribution interpretation remains unresolved. Do not invent upstream license text or mark that open gate passed from attribution alone. These are distribution-evidence requirements, not a change to the selected project MIT license. [Current provenance findings](research/distribution-provenance.md).

## Development checks and release procedure

Use npm with the committed lockfile and exact direct runtime pins. The implementation provides these stable contributor commands:

| Command | Required purpose |
| --- | --- |
| `npm ci` | Install the locked development dependencies in a clean checkout. |
| `npm run check` | Formatting, lint, TypeScript, schema/example validation, documentation links, skill packaging equality, and license inventory checks. |
| `npm test` | Deterministic semantic, profile, report, identity, CLI, and file-safety tests. |
| `npm run build` | Compile the CLI and bundle runtime assets without network access. |
| `npm run test:integration` | Real XSD validation, layout, SVG rendering, complete bundle operations, failure preservation, and no-network checks. |
| `npm run test:acceptance` | Full corpus, profile coverage, review thresholds, determinism, and recorded release qualification status. |
| `npm run test:package` | Pack, install into an isolated prefix, and exercise the distributed files and examples outside the checkout. |

These are planned commands to be implemented, not commands alleged to exist today. CI runs `check`, unit tests, build, and integration tests on pull requests. Package qualification runs on the required platform matrix before release. Hosted Windows CI can test the Windows Server runner and its exact OS is recorded; an additional Windows 11 install/workflow observation is required for the Windows 11 support claim. Do not relabel a CI server as a Windows 11 test.

`test:package` installs the exact packed archive without a source checkout, verifies all four commands, generates/validates/renders an independent fixture, checks the three expected files, and checks missing-browser, invalid-input, path-with-spaces, Unicode-path, overwrite-refusal, and failed-replacement behavior. It also verifies skill references are self-contained and that user setup works from the skill ZIP. Tests must not reach sibling source files accidentally. Record packed and installed sizes; no arbitrary badge claims a small installation without measuring it. The installed browser's size is documented separately.

Release from a clean reviewed commit after all v0 acceptance requirements pass. Generate the package once, test that archive, attach it with the skill ZIP and checksums to the GitHub release, and publish the same archive to npm when publication access is available. Record the source commit, package integrity, exact dependencies/browser/font versions, supported environment observations, host checks, and downstream qualification results. Registry publication and GitHub release creation are external execution steps; this decision authorizes neither action in the planning session.

Version `0.1.0` denotes the first finished agreed scope. It is not a label for a partly implemented product. Afterward, patch releases fix behavior compatibly, minor releases may change the public CLI or add capabilities with explicit migration notes, and existing schema/profile version rules continue independently. Publish actual limitations in the support matrix. A required supported path that is broken or unverified blocks completion rather than being renamed experimental.

## Maintenance and contribution

The repository owner is the initial maintainer and makes final scope/release decisions. GitHub Issues contain reproducible bugs, small proposals, and implementation work. Pull requests should explain the user-visible behavior and include the relevant regression or fixture change; notation support changes also update the conformance matrix and evidence. Documentation-only corrections need the documentation checks, not artificial unit tests.

Keep one short contribution guide covering setup, checks, small reviewable changes, evidence and fixture provenance, and respectful collaboration. Contributions use the existing project license; no separate CLA or committee is required for v0. Security reporting uses a concise `SECURITY.md` pointing to GitHub's private vulnerability-reporting surface after that surface is enabled and verified; until then, do not advertise a private report route that does not exist. There is no response-time or maintenance SLA claim.

Future feature ideas stay in issues until they serve the documented product boundary. The maintainer may decline additions that dilute the portable Modeling Skill, deterministic CLI, or reliable process artifacts. Release notes report changes and evidence, not aspirational product breadth.
