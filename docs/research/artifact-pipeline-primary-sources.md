# Artifact pipeline: primary-source check

_Checked: 2026-09-08. This note records source inspection and published-package metadata, not executed compatibility or rendering tests._

## Decision relevance

An OpenBPMN-owned semantic representation can stay independent of XML, layout, and rendering libraries. The inspected sources support evaluating `bpmn-moddle` for serialization and `bpmn-auto-layout` for geometry behind internal boundaries. They do **not** prove that the current Consulting Core Profile can already produce its complete `.bpmn` + `.svg` + Quality Report bundle with a small browserless runtime.

The representative-diagram prototype should settle that remaining feasibility question against the profile's actual concepts. Declared upstream support is evidence for a candidate, not evidence that OpenBPMN meets its own support contract.

## Published packages versus repository main

The npm registry was queried directly with `npm view`. Package sizes below describe the package itself, before transitive dependencies or browser downloads.

| Package or source | Inspected version | Declared Node requirement | Relevant observation |
| --- | --- | --- | --- |
| Published `bpmn-moddle`, `latest` | `10.2.0` | `>=20.12` | MIT metadata; 317,123 bytes unpacked. |
| Published `bpmn-auto-layout`, `latest` | `1.3.0` | `>=18` | Stable distribution tag still points to the older layout generation. |
| Published `bpmn-auto-layout`, `next` | `2.0.0-alpha.2` | `>=18` | 1,674,773 bytes unpacked; dependencies include `bpmn-moddle ^10.0.0`. |
| `bpmn-auto-layout` repository main | `9eaa3b13532691b36f75d23806a84ccf53a91979` | `>=22.12` | Still identifies itself as alpha.2, but includes changes beyond its published artifact. |
| Published `bpmn-js`, `latest` | `18.28.0` | `*` in package metadata | 5,273,090 bytes unpacked; metadata points to its separate license text. |

Sources: npm registry metadata for [bpmn-moddle](https://registry.npmjs.org/bpmn-moddle/latest), [layout stable](https://registry.npmjs.org/bpmn-auto-layout/latest), [layout alpha](https://registry.npmjs.org/bpmn-auto-layout/2.0.0-alpha.2), and [bpmn-js](https://registry.npmjs.org/bpmn-js/latest); [pinned layout main package manifest](https://github.com/bpmn-io/bpmn-auto-layout/blob/9eaa3b13532691b36f75d23806a84ccf53a91979/package.json).

The package-level Node declaration is not a verified minimum for its entire dependency tree. In particular, the alpha's permissive Node declaration does not override the requirement of its resolved `bpmn-moddle` dependency. Do not use main's documentation or type exports as a description of the npm alpha artifact without checking the exact release.

## Layout coverage and limits

The stable 1.3.0 README lists limitations including only laying out the first participant's process and omitting message flows, groups, annotations, and associations. That documentation alone rules out assuming stable-tag coverage of the broad profile. Its subprocess wording also lags changes recorded upstream, so fixtures must determine actual behavior. [Stable README](https://github.com/bpmn-io/bpmn-auto-layout/blob/v1.3.0/README.md).

The alpha.2 layout contract documents nested horizontal lanes, expanded and collapsed subprocesses, collaboration participants and message routing, data-object/store references and associations, annotations, and explicit group membership. Layout replaces coordinates and uses declaration order for deterministic tie-breaking. Collapsed subprocess contents receive additional planes. It returns `{ xml, warnings }`; omissions can produce `DI_NOT_CREATED`. These are upstream claims awaiting OpenBPMN-specific tests. [Pinned alpha layout contract](https://github.com/bpmn-io/bpmn-auto-layout/blob/75a7f30958c7050474d48db09afd4cc7d352ccad/docs/LAYOUT.md).

The alpha's visual-element predicate includes data-object and data-store references but does not list standalone Data Input or Data Output shapes. Their complete visual support should therefore remain an explicit prototype check. A serialized element is insufficient evidence of generated DI. [Alpha BPMN predicates](https://github.com/bpmn-io/bpmn-auto-layout/blob/75a7f30958c7050474d48db09afd4cc7d352ccad/lib/layout/BpmnUtil.js).

Preserve primary-diagram selection and expanded/collapsed presentation intent in the layout request. After layout, compare semantic identities and relationships and check all intended visible elements independently; do not interpret upstream warnings as successful complete coverage.

## Serialization is not XSD validation

`bpmn-moddle.fromXML` instantiates a moddle XML reader with `lax: true` by default; `toXML` invokes its XML writer. These APIs provide a useful object/XML boundary, but a successful parse or round trip does not establish BPMN schema or normative semantic validity. [Pinned implementation](https://github.com/bpmn-io/bpmn-moddle/blob/84dca5154e815139e12bb9d8f5edfb72b817ed0e/lib/bpmn-moddle.js).

The upstream README separately describes XSD validation in the test suite and requires Java for that upstream test setup. This is not a Java requirement for ordinary library use. OpenBPMN's Clean Export contract still requires its own verified XSD-validation path and separate semantic/profile checks. No particular validator runtime was tested in this investigation. [README](https://github.com/bpmn-io/bpmn-moddle/blob/84dca5154e815139e12bb9d8f5edfb72b817ed0e/README.md).

## SVG rendering and distribution footprint

`bpmn-js` is a browser viewer/modeler. Its `saveSVG` implementation serializes its rendered canvas and calls the DOM method `getBBox`; this is not a standalone Node XML-to-SVG transformation. [Viewer implementation](https://github.com/bpmn-io/bpmn-js/blob/e27d06520d01ded523da484393f1180388c588e7/lib/BaseViewer.js).

The upstream `bpmn-to-image` tool renders through `bpmn-js` and Puppeteer; its manifest includes both as runtime dependencies. It establishes a concrete local browser-based route, with browser installation and startup implications that must be measured. [Tool README](https://github.com/bpmn-io/bpmn-to-image/blob/master/README.md), [manifest](https://github.com/bpmn-io/bpmn-to-image/blob/master/package.json).

`bpmn-js-headless` describes itself as experimental and removes graphical dependencies to support modeling operations. Its documented examples export XML, not rendered SVG. It must not be assumed to solve the SVG requirement. [Headless README](https://github.com/bpmn-io/bpmn-js-headless/blob/master/README.md).

A browserless renderer remains a desired candidate, not a verified architecture fact. The diagram prototype must compare its notation coverage, text measurement, deterministic output, and installation footprint against a browser viewer. The normal Output Bundle's mandatory SVG cannot quietly become optional to make the implementation easier.

## License payload observations

The published alpha.2 tarball was streamed and its complete file list inspected: two JavaScript bundles, two source maps, a CLI, `package.json`, and README. It contains no `LICENSE` file or `.d.ts` declarations, although its metadata and README say MIT. Record this packaging gap before distribution; do not claim that a shipped permission text or TypeScript declarations were verified. [Inspected published tarball](https://registry.npmjs.org/bpmn-auto-layout/-/bpmn-auto-layout-2.0.0-alpha.2.tgz).

`bpmn-js` carries a watermark-preservation condition in addition to its copyright and permission notice. Preserve the upstream renderer's required behavior and attribution; do not label that dependency plain MIT. [License text](https://github.com/bpmn-io/bpmn-js/blob/e27d06520d01ded523da484393f1180388c588e7/LICENSE).

## What remains unproved

- Complete positive and negative coverage of OpenBPMN's Consulting Core Profile.
- Schema-valid, semantically unchanged output after the selected layout implementation.
- Readable geometry and label placement on representative multi-participant, nested, and exception-heavy processes.
- A small, reproducible SVG-rendering installation across supported host environments.
- Downstream import behavior in named modeling tools.

No dependencies were installed, no prototype was implemented, and no downstream compatibility claim was established by this source check.
