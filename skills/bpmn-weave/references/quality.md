# Interpret results, not appearances

Read the JSON result’s `signal`, `status`, `exitCode`, `artifacts`, and `report`. Checks marked `not_run` are unknown, not passed. The report separates XML/XSD, semantic legality, profile, DI, rendering, evidence, and consulting assessment.

| Signal | What to do |
| --- | --- |
| `clean_export_ready` | Present the produced bundle and important advisories. Technical validity is not human approval or verified process truth. |
| `snapshot_ready` | Present the produced snapshot and its declared unresolved/profile limitations. Keep their record outside BPMN. |
| `clarification_needed` | Ask the consequential unresolved question. A preserved preview is the previous result, not a newly generated one. |
| `generation_failed` / `operation_failed` | Report the concrete failure/remediation and produced/preserved paths accurately. Use troubleshooting; never draw a substitute and call the command successful. |
| `invalid_exported` | Identify the distinct expert-invalid files and blocking findings. Exit 2 is deliberate for this completed expert action, not success/readiness. |
| `validation_completed` | Summarize assessed checks and unavailable evidence; no files were changed. |
| `render_completed` | Show the SVG from the supplied DI; this does not certify process validity. |

`--export auto` and `clean` require technical validity and no unresolved consequential meaning. `--export snapshot` permits declared evidence/profile limitations but still requires structurally valid BPMN and a faithful preview. Invalid output requires the human’s explicit per-invocation expert request and `--export snapshot --expert-invalid`; it uses `.invalid.*` names and must never replace a normal bundle. A structurally valid snapshot is not expert-invalid.

Advisory naming, missing Evidence Links, unclear ownership, and avoidable complexity are discussion points, not compulsory questionnaire items. The deterministic CLI assesses supplied structure and context; it cannot prove the truth of a source. If you discover a consequential uncertainty, record a typed issue rather than relying on a cosmetic warning to represent it.

For deeper review, compare the actual preview and semantics with the named scenarios: the happy path plus relevant alternatives. Check marker meaning, responsibility, conditions, waiting, interruption, visible data handoffs, retained subprocess detail, and intended results. Correct semantic mistakes in the complete request, keeping identities; report a tool defect if correct input cannot produce faithful artifacts.
