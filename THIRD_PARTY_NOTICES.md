# Third-party notices

Project-authored code, documentation, and synthetic examples use the root MIT [LICENSE](LICENSE). Dependencies retain their own terms; the project license does not replace them.

| Component | Distributed material and notice |
| --- | --- |
| bpmn-js 18.28.0 | Pinned production Viewer at `assets/runtime/`; exact upstream license alongside it. Its watermark condition is retained, plus an external bpmn.io footer in SVG output. This is not plain MIT. |
| Noto Sans / Fontsource 5.3.0 | Normal 400/700 WOFF2 subsets at `assets/fonts/`, with upstream SIL Open Font License text. |
| bpmn-moddle 10.2.0 | npm runtime dependency; upstream MIT notice retained by npm and copied into `assets/notices/`. |
| bpmn-auto-layout 2.0.0-alpha.2 | npm runtime dependency. The release declares MIT but omits a root LICENSE. `assets/notices/` retains its metadata/README and the exact MIT notice from the [subsequent upstream correction](https://github.com/bpmn-io/bpmn-auto-layout/commit/9eaa3b13532691b36f75d23806a84ccf53a91979). The manifest distinguishes that notice source from the unchanged runtime pin. |
| libxml2-wasm 0.7.2 | npm runtime dependency; both its MIT notice and the bundled libxml2 notice are copied into `assets/notices/`. |
| puppeteer-core 25.10.0 | npm runtime dependency; Apache-2.0 notice copied into `assets/notices/`. No browser binary is included or downloaded. |
| Ajv 8.17.1; saxen 11.1.1 | npm runtime dependencies; exact upstream MIT notices copied into `assets/notices/`. |
| OMG BPMN 2.0.2 schemas | Five unchanged official schema documents at `assets/xsd/`. `provenance.json` records source URLs, source-check date and SHA-256 hashes. The [OMG specification’s copyright, permission and disclaimer notices](https://www.omg.org/spec/BPMN/2.0.2/PDF#page=2) remain authoritative; no project copyright is claimed over these files. Public-redistribution interpretation remains unresolved. |

The lockfile fixes the development/tested dependency resolution; each installed transitive dependency keeps its own package license. Build-time copies and hashes are reproducible without downloads. Runtime asset manifests identify the copied Viewer/fonts; this index does not assert that an unrun license/redistribution gate passed.

The [distribution provenance record](https://github.com/ve250104/OpenBPMN/blob/main/docs/research/distribution-provenance.md) separates verified origin and available notices from the still-open OMG machine-readable-schema redistribution question. No permission was inferred solely from public download availability or from another library’s copies.

Sources: [bpmn-js license](https://github.com/bpmn-io/bpmn-js/blob/v18.28.0/LICENSE), [layout alpha metadata and declaration](https://github.com/bpmn-io/bpmn-auto-layout/tree/v2.0.0-alpha.2), [OMG machine-readable documents](https://www.omg.org/spec/BPMN/2.0.2/About-BPMN).
