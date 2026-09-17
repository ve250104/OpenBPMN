# Runtime toolchain decision

_Selected and smoke-tested: 2026-09-08. This settles the implementation route; the complete Consulting Core and release qualification remain build acceptance requirements._

## Selected components

Ship one TypeScript application with separate modeling and management entry points. The primary platform bundle supplies a private, exact Node 24 runtime and inventoried production dependencies; secondary npm installations supply their own Node. Node 24.x remains the v0 runtime contract; the probes below ran on Node 24.14.0. Use exact direct dependency versions and a committed npm lockfile. Dependency updates require the affected semantic, geometry, schema, and rendering fixtures to pass before the pins change.

| Responsibility | Selected version | Distribution decision |
| --- | --- | --- |
| BPMN object/XML boundary | `bpmn-moddle@10.2.0` | Private interchange dependency; ESM uses the named `BpmnModdle` export. MIT. |
| Initial layout | `bpmn-auto-layout@2.0.0-alpha.2` | Exact alpha pin, behind the owned geometry adapter described below. The release’s MIT declaration is retained with the exact LICENSE supplied by a [later upstream notice correction](research/distribution-provenance.md); the runtime code is not upgraded. |
| SVG notation rendering | `bpmn-js@18.28.0` | Use the production Viewer bundle, not the Modeler. Preserve its upstream license, attribution, and watermark behavior. |
| Local browser control | `puppeteer-core@25.10.0` | Use an installed Chrome or Edge executable. No browser download during installation or invocation. Apache-2.0. |
| BPMN XSD validation | `libxml2-wasm@0.7.2` | Packaged WebAssembly; no Java, C build, or system `xmllint`. Include its MIT license and bundled libxml2 notice. |
| Font assets | `@fontsource/noto-sans@5.3.0` | Copy the normal 400/700 WOFF2 subset assets and their CSS Unicode ranges into the package at build time, with OFL-1.1 notice. Do not install the full font family as a production dependency. |
| TypeScript build | `typescript@5.9.3` | Development dependency; ship compiled JavaScript. |

Published package metadata was checked directly with `npm view`, then the five runtime packages and font package were installed with lifecycle scripts disabled. Sources: [moddle registry record](https://registry.npmjs.org/bpmn-moddle/10.2.0), [layout registry record](https://registry.npmjs.org/bpmn-auto-layout/2.0.0-alpha.2), [viewer registry record](https://registry.npmjs.org/bpmn-js/18.28.0), [Puppeteer registry record](https://registry.npmjs.org/puppeteer-core/25.10.0), [validator registry record](https://registry.npmjs.org/libxml2-wasm/0.7.2), [font registry record](https://registry.npmjs.org/@fontsource%2fnoto-sans/5.3.0), [TypeScript registry record](https://registry.npmjs.org/typescript/5.9.3).

## Layout is an adapter, not a pass-through

The published alpha's `layoutProcess(xml)` returns `{ xml, warnings }`. Its single-argument API and shipped JavaScript are the implementation reference; do not assume unpublished main-branch options or TypeScript declarations. It computes useful initial geometry for supported flow and collaboration structures. [Published API description](https://github.com/bpmn-io/bpmn-auto-layout/blob/v2.0.0-alpha.2/README.md).

OpenBPMN extracts geometry from that result, independently compares semantic identities and relationships, completes missing supported geometry, then compiles the authoritative model with the accepted DI. This completion stage is part of the selected adapter. It places visible **Process-level** Data Input/Output glyphs and labels, reserves their space, and routes associations while preserving scope, lane containment, and process meaning. Activity/Event IO backing Data Associations is supporting invisible substructure: the visible association docks on the owner, without inventing standalone payload glyphs. This follows [BPMN 2.0.2, printed page 4 and pages 210–215](https://www.omg.org/spec/BPMN/2.0.2/PDF#page=34), not a relaxation of complete visible coverage. Any further profile gaps found by the coverage fixtures are owned by this adapter; they cannot be silently omitted or declared Supported without implementation.

This is a demonstrated need: the installed alpha emitted **no DI and no warnings** for a synthetic Process's Data Input and Data Output. Supplying their two shapes and label bounds without changing semantics produced XSD-valid XML that the Viewer rendered without warnings. That feasibility probe concerned Process IO, not invisible Activity/Event IO. A later combined-data regression showed that substituting private data-reference proxies still exhausted the alpha's artifact placement. The implementation therefore owns native Process IO placement in a reserved band, necessary pool expansion, and routing from the authoritative original references. Explicit Group membership is also owned geometry; it never invents category assignments on semantic members. Complete placement, routing, and combined visual qualification remain release gates. The upstream artifact predicate does not include these two IO element types, while the Viewer has separate renderers for them. [Pinned layout predicate](https://github.com/bpmn-io/bpmn-auto-layout/blob/75a7f30958c7050474d48db09afd4cc7d352ccad/lib/layout/BpmnUtil.js), [Viewer renderer source](https://github.com/bpmn-io/bpmn-js/blob/e27d06520d01ded523da484393f1180388c588e7/lib/draw/BpmnRenderer.js).

Reject incomplete geometry before normal bundle output. Neither absence of upstream warnings nor a successful Viewer import establishes complete profile coverage. Handle alpha dependency failures through the established structured result contract; do not expose its raw exception schema as OpenBPMN's API.

## Local SVG production

Discover Chrome or Edge from documented executable locations and `PATH`, with `--browser-executable <absolute-path>` taking precedence. The option is accepted by `generate`, `render`, and `capabilities`; it never comes from process evidence or a Handoff File. Launch a new headless process with a temporary profile and DevTools pipe, load the packaged Viewer and fonts from memory, and close the process and temporary resources in `finally`. Never attach to the user's running browser, use their profile, expose a debugging port, fetch web fonts, or install a browser implicitly. Missing or incompatible browser behavior becomes an actionable runtime finding before bundle replacement.

Keep Chromium's sandbox enabled. Block page requests except the exact embedded assets; disable background networking and component updates in the renderer launch configuration. The XML document and model labels are data passed to the fixed Viewer, never interpolated into executable HTML or JavaScript. A browser's background-process behavior is distinct from page request interception, so the release tests must also verify no model-dependent network activity. This does not claim universal OS-level network isolation.

The implementation's full-command NetLog regression exposed startup services that the generic background flag does not stop in Chrome 152.0.7977.76. The disposable profile disables online Safe Browsing and speculative preloading (`net.network_prediction_options=2`); launch disables `NetworkTimeServiceQuerying` and `AimEnabled`, and Chromium's per-endpoint Gaia configuration replaces account discovery with an inert `data:` URL. These settings affect only the owned offline rendering process, never the user's browser profile, and do not disable the Chromium sandbox. The blank page only receives the packaged Viewer and allowlisted embedded font assets. The causal source references are [network-time service](https://chromium.googlesource.com/chromium/src/+/25e84d9ef2ae6b698d42ef95600ce1f86a95d409/components/network_time/network_time_tracker.cc), [AI eligibility startup](https://raw.githubusercontent.com/chromium/chromium/main/components/omnibox/browser/aim_eligibility_service.cc), [Safe Browsing OHTTP service](https://raw.githubusercontent.com/chromium/chromium/main/components/safe_browsing/core/browser/hashprefix_realtime/ohttp_key_service.cc), [Gaia endpoint configuration](https://raw.githubusercontent.com/chromium/chromium/main/google_apis/gaia/gaia_config.cc), and [persisted preloading enum](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/preloading/preloading_prefs.h).

Executed locally: three consecutive `offlineSmoke` calls against the compiled CLI and synthetic `examples/invoice-review.json` under Node 24.14.0/macOS 26.5 arm64/Chrome 152.0.7977.76 recorded zero Node socket/DNS/fetch attempts and zero browser HTTP request starts, TCP connect attempts, or UDP connects. The harness counts BEGIN events, not duplicate completion records; no UDP route-probe exemption was needed after speculative preloading was disabled. Its temporary logs are deleted. This is local monitoring evidence only: Linux network-namespace denial and the remaining exact browser/platform matrix are still separate release gates, not established by these runs.

`puppeteer-core` does not download Chrome. Its launch API requires an executable path or channel, and upstream warns that arbitrary browser versions are not guaranteed compatible. The release matrix therefore records the exact Chrome/Edge versions exercised, and the renderer checks its capabilities when launched. A user may install a browser themselves; a CI fixture may explicitly provision a pinned browser as development infrastructure. [Puppeteer installation](https://pptr.dev/guides/installation), [launch contract and compatibility limitation](https://pptr.dev/api/puppeteer.puppeteernode.launch).

Render the exact final BPMN XML and DI. Produce one SVG sheet with labelled panels for the primary diagram and every secondary plane required to show collapsed subprocess contents and referenced Processes. The installed Viewer's `importXML(xml, diagramId)` accepts the particular diagram to open; render each plane separately, namespace its SVG definition IDs by stable panel identity, and compose panels without changing their internal DI coordinates. The single-plane smoke below does not qualify this composition behavior. [Viewer diagram-selection API](https://github.com/bpmn-io/bpmn-js/blob/e27d06520d01ded523da484393f1180388c588e7/lib/BaseViewer.js).

Embed the selected font faces before measurement, wait for `document.fonts.ready`, and configure the Viewer's text renderer to use the same font. The packaged 16 normal 400/700 subset files total **325,464 bytes**; embed the used subsets in the exported SVG. Keep source text intact and test font coverage; unknown glyph coverage must be reported rather than disguised as complete rendering. Use an explicit light canvas with white background so exported diagrams remain legible in dark host applications.

Raw `saveSVG()` output is **not byte-deterministic**: the probe found randomized marker IDs. The owned SVG serializer must assign stable IDs in document order and update exact fragment references in attributes/CSS without changing BPMN `data-element-id` values, labels, or paths. The probe verified identical output after that DOM-based normalization. Validate the final SVG against the local static-output policy, including references, embedded assets, and preserved upstream attribution. Keep the visible `bpmn.io` footer outside the process geometry as specified in the release plan; it is not BPMN metadata. [Upstream SVG export](https://github.com/bpmn-io/bpmn-js/blob/e27d06520d01ded523da484393f1180388c588e7/lib/BaseViewer.js), [upstream license](https://github.com/bpmn-io/bpmn-js/blob/e27d06520d01ded523da484393f1180388c588e7/LICENSE).

## Local schema validation

Vendor the five official BPMN 2.0.2 schema documents identified by OMG: `BPMN20.xsd`, `BPMNDI.xsd`, `DC.xsd`, `DI.xsd`, and `Semantic.xsd`. Record their source URLs and hashes below. Compile `BPMN20.xsd` using `XsdValidator.fromDoc`; resolve its includes/imports solely through `XmlBufferInputProvider` populated with those five packaged buffers. Never register the library's filesystem provider or resolve document-supplied schema locations. Dispose XML documents, validators, and the schema document explicitly. [OMG normative machine-readable documents](https://www.omg.org/spec/BPMN/2.0.2/About-BPMN), [validator project and runtime requirements](https://github.com/jameslan/libxml2-wasm), [validation and virtual-I/O API](https://jameslan.github.io/libxml2-wasm/v0.4/documents/Querying_and_Validating.html).

The installed 0.7.2 declarations and runtime were inspected and exercised. Use `XML_PARSE_NO_XXE`, `XML_PARSE_NO_SYS_CATALOG`, and `XML_PARSE_NONET` with the allowlisted provider; reject DTD/entity declarations under OpenBPMN's input policy. Do not enable recovery, entity substitution, huge documents, input decompression, or XInclude processing. `NONET` alone is not the boundary: current libxml2 documents that its built-in network clients were removed, making the resource loader policy decisive. The adapter must enforce input bounds and run resource-heavy validation in a worker that can be terminated on timeout. These operational limits remain testable implementation work.

XSD validation covers schema structure, required attributes, and types. It does not establish legal BPMN routing, complete references, Consulting Core conformance, readable DI, or source fidelity; those remain separate checks.

| Official schema filename | SHA-256 of bytes fetched for the probe |
| --- | --- |
| `BPMN20.xsd` | `a07c159cb0594573dd7c97b1370dd116112378f377e43c89a8bf512ac5030705` |
| `BPMNDI.xsd` | `f0dff1cd559d1514d8ebfc8c646f58402bcaced27ec22e2aa6456c2dcc80b038` |
| `DC.xsd` | `a2f90e5ad9bb48c6915e4e034b4e27ac838264a1d4f27bfc70dbdfc69351312d` |
| `DI.xsd` | `8220b179c175572df74e08a51bffabe957867962035cee7b5fee0b6acb4c4498` |
| `Semantic.xsd` | `c4318842f7d2bbc262d7954c9452c501db16f0868eac0b8732ec5d7fb384d9a7` |

The base source URL for each is `https://www.omg.org/spec/BPMN/20100501/`. Fetching these public schemas was a research setup step; release commands use the packaged copies and require no network.

## Executed evidence and footprint

An isolated temporary directory contained the dependencies and a synthetic three-node, two-flow process. No repository dependency manifests, user documents, or existing browser profiles were changed. The harness created moddle elements, compiled XML, performed layout, parsed the resulting bytes, compared flow semantics, validated against the official schemas, rendered twice, normalized SVG identifiers, and tested failure cases. The second fixture added Process-level Data Input/Output and supplied the missing geometry.

The harness, exact npm lockfile, expected synthetic BPMN, and checked schema download recipe are preserved in [immutable runtime-selection evidence](https://github.com/ve250104/OpenBPMN/tree/a6fb8170433a9127e22acc1ef20971ba759a55db/research/runtime-selection) on the separate `research/v0-runtime-selection` branch. The portable harness was rerun successfully under Node 24.14.0 after adding the explicit browser argument and schema hash assertions. From that evidence directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm exec --yes --package=node@24.14.0 -- node smoke.mjs --browser-executable "/absolute/path/to/chrome-or-edge"
```

| Executed probe | Observed result |
| --- | --- |
| Environment | Node 24.14.0; macOS 26.5 arm64; installed Chrome 152.0.7977.76. Also passed under the host's Node 25.9.0; that is not a support promise. |
| Compile and final-layout XSD | Both passed with the five in-memory OMG schemas. |
| Required-attribute negatives | Missing Definitions `targetNamespace` and missing Sequence Flow `targetRef` were rejected. |
| Geometry and semantics | Exactly five expected primary shapes/edges; flow identities, node types, labels, sources, and targets unchanged. Repeated layout XML was byte-identical. |
| Malformed layout input | Rejected. |
| Viewer positive/negative | Final XML imported without warnings and SVG contained the task label. Input without DI rejected with `no diagram to display`. |
| Data Input/Output gap | Both shapes missing upstream with no warning; adding their DI yielded XSD-valid XML and successful visible rendering. |
| SVG repetition | Raw bytes differed only in the examined marker IDs; deterministic DOM ID/reference normalization produced equal bytes. |
| Visual inspection | Synthetic process preview inspected on a white canvas; labels, task marker, event circles, and arrowheads readable. This is not the representative-diagram visual suite. |
| Page network requests | Zero external page requests in the final successful run; only in-memory scripts and embedded font data were used. No browser was downloaded. |
| Informal timing | Simple initial layout 2–12 ms across probes; browser start plus several imports/exports and screenshot approximately 2.7–3.6 s. No benchmark threshold is inferred from these small probes. |
| Artifact size | Simple BPMN 2,174 bytes; SVG with two embedded Latin faces 41,562 bytes. |

The installed diagnostic tree contained **48 packages and approximately 53 MiB on disk**, including the entire 7.2 MB unpacked font family and transitive browser-protocol libraries. This is a measured development tree, not the final published size. Removing the full font package in favor of the selected 318 KiB assets should reduce the unbundled production tree; packaging must measure the actual `.tgz` and clean install. The runtime does not bundle a browser, native compiler, Java, or a service. Package-level unpacked metadata alone must not be advertised as installation footprint.

The build must turn the probes into committed regression tests and complete the profile matrix, geometry completion/routing, representative visual fixtures, hostile input/timeout handling, browser discovery/errors, font and SVG normalization, platform matrix, and downstream observations. These are known implementation and qualification tasks, not undecided dependency choices or permission to ship a partial profile.
