# Distribution provenance: layout engine and official schemas

Checked 2026-09-08. Scope: read-only primary-source investigation of the exact selected dependency and five bundled XSDs. No maintainer contact, permission request, publication, dependency upgrade, or legal clearance occurred. This records evidence and engineering recommendations, not legal advice.

## Outcome

The layout package's missing notice can now be supplied from an exact upstream correction published today. The OMG schemas have verified origin and unchanged bytes, but a distinct public-redistribution permission question remains; provenance and attribution alone do not settle it. Do not mark the complete distribution gate passed solely from this note.

## bpmn-auto-layout 2.0.0-alpha.2

The installed package and [published npm metadata](https://registry.npmjs.org/bpmn-auto-layout/2.0.0-alpha.2) declare MIT. The [tagged README](https://github.com/bpmn-io/bpmn-auto-layout/blob/v2.0.0-alpha.2/README.md) also declares MIT, while the exact tagged root and seven-file npm package omit a LICENSE. Registry `gitHead` and the annotated tag resolve to the same commit, `75a7f30958c7050474d48db09afd4cc7d352ccad`; [tag object](https://api.github.com/repos/bpmn-io/bpmn-auto-layout/git/tags/73087ad7f32274a883584ae262d2302d3fc404c6). The package tarball integrity is `sha512-Xg8BoRMijfECgWljIlE44hbGDAuF0BkjJuLfd5o3oOx1ileL06EJQhlgO040xFIegfjxq91dVFAoxCL17wo53A==`.

Upstream [commit 9eaa3b1](https://github.com/bpmn-io/bpmn-auto-layout/commit/9eaa3b13532691b36f75d23806a84ccf53a91979), committed at 2026-09-08 08:01:59 UTC, adds only the missing LICENSE and explicitly closes [issue 153](https://github.com/bpmn-io/bpmn-auto-layout/issues/153). That issue describes the notice omission in alpha.2 and 1.3.0; it is not a third-party replacement license. The [official comparison](https://api.github.com/repos/bpmn-io/bpmn-auto-layout/compare/75a7f30958c7050474d48db09afd4cc7d352ccad...9eaa3b13532691b36f75d23806a84ccf53a91979) confirms the correction descends from the selected release (`ahead`, 134 commits, zero behind). Many intervening code changes exist, so the correction must not be represented as the alpha.2 source tree.

The [exact corrected LICENSE](https://raw.githubusercontent.com/bpmn-io/bpmn-auto-layout/9eaa3b13532691b36f75d23806a84ccf53a91979/LICENSE) supplies the copyright line `Copyright (c) 2016-present Camunda Services GmbH` and the full MIT permission, retention condition, and disclaimer. Freshly fetched bytes have SHA-256 `b40e4b8f5966bebfbfc5c4ea46d294013076df895570a2d1a2ad9e80445a2d88`.

Inference: the original MIT declarations plus this upstream correction provide substantially stronger attribution evidence than an invented copyright line or generic MIT template. The fix addresses the missing notice; it is not a new runtime qualification or a legal opinion on retroactivity.

Recommended packaging change:

1. Vendor those exact corrected LICENSE bytes under a clearly named third-party notice path, with the correction commit, source URL, SHA-256, and affected runtime version in provenance.
2. Keep alpha.2 and the existing lockfile pin. Make the offline package-notice build preserve and hash the vendored correction rather than requiring a missing file from `node_modules` or fetching at build time.
3. Retain the original package metadata/README alongside it and describe the distinction in `THIRD_PARTY_NOTICES.md`: alpha.2 declares MIT; the missing notice was supplied from the later upstream correction. Verify the exact notice exists in the packed artifact before closing this particular notice check.

## OMG BPMN 2.0.2 XSDs

OMG's [2.0.2 specification page](https://www.omg.org/spec/BPMN/2.0.2/About-BPMN) identifies all five files under `BPMN/20100501/` as normative machine-readable documents, file ID `dtc/10-05-04`. The date in their URL is therefore not evidence that the wrong version was selected. On this check, all five official responses were HTTP 200 and matched the local bytes and `assets/xsd/provenance.json` hashes:

| Official file | SHA-256 |
| --- | --- |
| [BPMN20.xsd](https://www.omg.org/spec/BPMN/20100501/BPMN20.xsd) | `a07c159cb0594573dd7c97b1370dd116112378f377e43c89a8bf512ac5030705` |
| [BPMNDI.xsd](https://www.omg.org/spec/BPMN/20100501/BPMNDI.xsd) | `f0dff1cd559d1514d8ebfc8c646f58402bcaced27ec22e2aa6456c2dcc80b038` |
| [DC.xsd](https://www.omg.org/spec/BPMN/20100501/DC.xsd) | `a2f90e5ad9bb48c6915e4e034b4e27ac838264a1d4f27bfc70dbdfc69351312d` |
| [DI.xsd](https://www.omg.org/spec/BPMN/20100501/DI.xsd) | `8220b179c175572df74e08a51bffabe957867962035cee7b5fee0b6acb4c4498` |
| [Semantic.xsd](https://www.omg.org/spec/BPMN/20100501/Semantic.xsd) | `c4318842f7d2bbc262d7954c9452c501db16f0868eac0b8732ec5d7fb384d9a7` |

These file bytes do not contain an independent copyright or license notice. The [specification's front matter, PDF pages 2–3](https://www.omg.org/spec/BPMN/2.0.2/PDF#page=2), names the copyright holders and authorizes creation/distribution of software based on the specification. Its permission for copying the specification also requires copyright/permission retention, no modification, informational use, and restrictions on network posting and commercial transfer. It disclaims warranties and separately limits conformance claims. This is not an MIT-style unconditional redistribution grant. OMG's [current legal page](https://www.omg.org/legal/) likewise does not supply a blanket implied intellectual-property license through availability on the site.

Genuine gap: the reviewed primary materials do not unambiguously establish whether publicly packaging these exact machine-readable schemas inside a software implementation falls under the software grant or the restricted specification-copying terms. No schema-specific exception or separate grant was found in the files, linked specification materials, or relevant official search results. This is an unresolved interpretation, not a conclusion that all BPMN implementations or schema redistribution are forbidden. Another project's vendored copies would not themselves establish the rights holder's permission.

### Separate machine-readable and contribution checks

The network-copy restriction is printed in the PDF's publication terms. It is **not evidence of an explicit schema-specific prohibition**. The catalogue deliberately lists machine-readable XSDs separately, but supplies no separate permission statement at those links. The safe conclusion remains **permission interpretation unresolved**, not **XSD redistribution prohibited**.

The historical [BPMN 2.0 RFP, sections 4.4 and 4.7–4.9](https://www.omg.org/bpmn/Documents/BPMN_2-0_RFP_07-06-05.pdf#page=13), requires publication rights for OMG and its sublicensees, distinguishes written specifications from implementations, and includes a non-infringement assurance for using the eventual specification or conforming software. That supports implementation, but the RFP is a requirements/template document, not evidence that this project's public XSD redistribution is a granted sublicense.

The public [OMG IPR Policy ipr/12-09-02, section 2](https://www.omg.org/cgi-bin/doc?ipr/12-09-02.pdf), states that contributors grant OMG perpetual, irrevocable, royalty-free copyright rights for dissemination, including authority to let others copy/modify/distribute. It also requires contributors to own sufficient rights. Its patent modes are a separate subject. This establishes OMG's potential authority to clarify or grant dissemination rights, not a separately expressed universal downstream XSD license. The current [IPR-policy locator](https://www.omg.org/cgi-bin/doc.cgi?ipr) identifies `ipr/25-07-01`, version 2.0, but links its document through the members area; that current document's contents were not inspected. Likewise the [URI/namespace policy locator](https://www.omg.org/cgi-bin/doc?smsc/2018-08-01) links members-area downloads; no permission was inferred from its title.

The [bpmn-moddle v10.2.0 XSD directory](https://github.com/bpmn-io/bpmn-moddle/tree/v10.2.0/resources/bpmn/xsd) contains all five schemas. Fresh comparisons show none has the exact official byte hash: four differ only in CRLF/LF, and `DI.xsd` also omits the official UTF-8 BOM. After just those encoding normalizations, all five are equal. No schema contains its own notice, and there is no directory-specific LICENSE/NOTICE in the tagged tree. The [root MIT license](https://github.com/bpmn-io/bpmn-moddle/blob/v10.2.0/LICENSE) names camunda Services GmbH. The [XSD history's initial commit](https://github.com/bpmn-io/bpmn-moddle/commit/2f17e50e6ec12812010792128bf3496428f37bcb) says the project was extracted from bpmn-js; it supplies no separate OMG permission. This demonstrates established upstream distribution practice and lineage, but does not prove that Camunda can relicense the underlying OMG material. Switching to these normalized copies would not resolve the permission question or preserve exact official hashes.

Recommended handling:

1. Keep the five files byte-identical; do not add project copyright or silently relicense them. Expand provenance with explicit per-file URLs, source-check date, OMG file IDs, and the exact governing-notice reference.
2. Record the copyright/permission/disclaimer source in the package's third-party notice index. Do not treat that attribution as clearance of the separate permission question.
3. Before a public release containing these files, resolve and record the redistribution interpretation through suitable legal review or rights-holder clarification. Any outreach needs explicit authority; none was sent here.
4. If that cannot be resolved, explicitly revisit distribution design with the owner. Requiring users to obtain schemas themselves would change the approved offline, plug-and-play contract; it is not an authorized silent workaround. Neither substituting an unverified third-party mirror nor removing XSD validation is an acceptable claim-preserving fix.

## Reproduction

Read-only checks used npm registry metadata, GitHub's tree/tag/commit/compare APIs, the linked official documents, and byte hashing of fresh official responses against local files. The public 2012 IPR PDF was extracted directly with `curl` piped to `pdftotext` after the web reader mishandled its query URL; no members-area download or authentication workaround was attempted. No source or dependency was modified during the investigation. Packaging-script, notice, and release-evidence changes are separate implementation work and must be verified on the final packed candidate.
