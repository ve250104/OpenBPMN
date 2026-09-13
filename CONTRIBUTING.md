# Contributing

Use Node 24.x and the committed npm lockfile. Generation/rendering tests need an installed Chrome or Edge. Explicit dependency installation may use the network; builds copy only pinned local assets and do not download a browser.

```sh
npm ci --ignore-scripts
npm run build
npm run check
npm test
npm run test:integration
npm run test:package
npm run test:acceptance
```

Use Node 24.x and the committed `npm-shrinkwrap.json`, which also locks the published CLI's transitive runtime dependencies. Keep dependency changes exact-pinned and update the lock and generated notices together. Dependabot proposes reviewed updates; no automatic merging is configured. Layout or browser-library updates require the existing semantic and visual regressions, not just a successful install.

Submit changes through pull requests. `main` requires the GitHub Actions `linux` check, an up-to-date branch, and resolved review conversations, and blocks force pushes and deletion. Independent approval is not mandatory for this single-maintainer project. Administrator bypass is deliberately available while hosted CI is billing-blocked; an owner bypass must record the local checks and must not be described as a green hosted run. Local evidence does not waive release qualification.

Keep changes small and explain the user-visible behavior and originating issue. Add a failing public-behavior test before fixing a bug or extending a supported path. Preserve semantic keys and evidence; never change a fixture’s process facts to accommodate a compiler or renderer defect. Notation changes need positive/negative semantic, XSD, DI, and real Viewer evidence.

The test commands serialize files because multiple real browsers and layout workers can otherwise oversubscribe the reference machine and consume the product's unchanged timeout budget. Avoid overlapping full-suite, package, and performance runs. Keep the machine awake for measurements; on macOS, a process-scoped `caffeinate -i npm test` prevents idle sleep only for that run. Preserve interrupted or failed runs rather than counting them as performance samples.

`check` runs the pinned Biome formatter/linter, strict TypeScript, and schema, reference, version and notice checks. Use `npm run format` for consistent source formatting, then rebuild generated skill copies. The formatter is a development dependency, not part of the installed CLI.

`test:acceptance` is a strict release gate, not a synonym for unit tests. It returns nonzero until every required candidate-bound observation exists, including real host and human checks. The manifest at `eval/release-evidence.json` lists the exact requirements. Copy it to ignored `.artifacts/release-evidence.json` to record a candidate and observations without changing the candidate’s source commit. Include `packagePath`, `skillPath`, their SHA-256 hashes, the clean source commit, and the version; every observation binds both archive hashes and supplies evidence paths/hashes. The checker verifies those files and the current clean checkout. Matching metadata alone is not proof that a human performed a review: the maintainer must approve the underlying records. Keep evidence with release/CI artifacts.

The highest integration seam is the installed CLI and its artifacts. Private adapters are tested for genuine dependency behavior and injected failures. A successful parse is not XSD validation, structural DI is not visual readability, and an authored answer is not a user observation.

Use synthetic MIT-licensed fixtures with explicit provenance. Keep held-out evidence and reviewer expectations out of shipped examples and model context. Store large generated logs/archives in `.artifacts/` or CI artifacts, not source history. The release evidence must distinguish actual results from required, unrun checks.

Build scripts copy canonical schemas/examples/licenses into the portable skill and vendor pinned local assets. Edit their source files, then rebuild; do not hand-edit generated copies. The [build plan](docs/build-plan.md) indexes implementation issues; [AGENTS.md](AGENTS.md) provides contributor-agent routing.

Report reproducible bugs through GitHub Issues. Be respectful, avoid private data, and explain the smallest meaningful improvement. Project-authored contributions use the existing MIT license. There is no response-time or maintenance SLA.
