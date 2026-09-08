# Runtime selection evidence

This private research package preserves the 2026-09-08 feasibility checks used to choose OpenBPMN's runtime. It is not the product implementation or a substitute for the full Consulting Core release suite.

## Run

Use Node 24.x and an already-installed Chrome or Edge. Commands run from this directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run smoke -- --browser-executable "/absolute/path/to/chrome-or-edge"
```

The original macOS invocation used `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. If Node 24 is not active, an explicit development-only runtime invocation is:

```sh
npm exec --yes --package=node@24.14.0 -- node smoke.mjs --browser-executable "/absolute/path/to/chrome-or-edge"
```

Dependency installation downloads npm packages but no browser. The harness downloads the five public normative schemas from OMG and verifies their recorded SHA-256 values before use. This research setup requires network access; production OpenBPMN will package the schemas and need no runtime network. Schema provenance is recorded in [schema-provenance.json](schema-provenance.json), with the official normative index and exact retrieval URLs.

A failed assertion exits nonzero. Successful runs print the environment, checks, schema hashes, artifact sizes, and informal timings. Generated BPMN, SVG, and PNG files appear under the ignored `artifacts/` directory. Only synthetic process content is used. The Viewer runs in a new temporary browser profile with a DevTools pipe; page requests other than embedded data are blocked. Existing user browser sessions and profiles are not used.

## What it checks

- Compile a synthetic Start → User Task → End process with two Sequence Flows, then schema-validate it using the five in-memory official schemas.
- Run the exact layout alpha twice, compare bytes with the checked-in [synthetic expected BPMN](fixtures/simple.bpmn), and verify five primary DI elements and unchanged flow semantics.
- Reject missing required XML attributes and malformed layout input.
- Demonstrate the published layout alpha's silent omission of Process Data Input/Output DI, then show that explicit additional geometry passes XSD validation and Viewer rendering.
- Render final XML, check expected labels and Data Input/Output shapes, and reject input with no DI.
- Expose random IDs in raw SVG and verify that DOM-based ID/reference normalization produces identical output in repeated rendering.

The initial recorded environment was Node 24.14.0, macOS 26.5 arm64, and Chrome 152.0.7977.76. Basic layout took 2–12 ms and several imports/exports plus browser startup and screenshot took approximately 2.7–3.6 seconds. These are observations, not release performance claims.

## Limits

The DI completion is a two-shape feasibility probe with fixed coordinates; it is not a production layout algorithm. SVG normalization is deliberately limited to this fixture's attribute references. The harness embeds only Latin regular/bold faces; production must qualify its broader packaged font subsets. The saved raw SVG still exposes upstream randomized IDs; normalized equality is asserted separately.

This fixture has one plane. The production contract requires one SVG sheet with distinct panels for the primary diagram and all additional planes needed to expose collapsed subprocess contents and referenced Processes. The selected Viewer can import/open a requested diagram; panel composition and complete plane coverage remain implementation acceptance work. The production browser override flag is `--browser-executable`, as used here.

There is no downstream Signavio/Celonis qualification, no full-profile coverage, no hostile-input or interruption suite, no broad platform claim, and no publication-ready preview in this branch. Those remain explicit product build and release gates.
