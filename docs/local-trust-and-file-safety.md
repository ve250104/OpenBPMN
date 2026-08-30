# Local trust, consent, and file safety

## Decision

OpenBPMN inherits the filesystem permissions, sandbox, and approval experience of the user's Host Agent. It does not implement another permission system. Its own responsibility is a small set of deterministic safeguards around explicit CLI inputs, untrusted process evidence, output paths, replacement, temporary data, sensitive companion artifacts, and invalid expert output.

This contract keeps the tool lightweight: no custom sandbox, permission UI, account, policy engine, secret vault, audit database, background service, telemetry, or network dependency.

## Authority model

Three layers have distinct responsibilities:

| Layer | Authority and responsibility |
| --- | --- |
| Human | Chooses the Host Agent, provides or names evidence, selects destinations directly or through the current working directory, authorizes replacement of named artifacts, and explicitly requests Handoff Files or invalid expert output. |
| Host Agent | Enforces Host-Native Authority, interprets the user's request, reads relevant source material within its granted scope, treats sources as untrusted data, and invokes the CLI with explicit paths and flags. |
| OpenBPMN CLI | Reads only named paths or standard input, validates all structured and XML inputs, constrains writes to resolved destinations, refuses implicit overwrite, writes safely, minimizes diagnostics, and performs no network activity. |

OpenBPMN neither expands nor attempts to reproduce a Host Agent's authority. Permission prompts may differ across Codex, Claude Code, Copilot, and other hosts; the CLI invariants remain identical.

## Read contract

The Host Agent may read files when its native authority permits and the modeling request makes them relevant. Typical authorization comes from:

- an attachment or path supplied by the human;
- a Handoff File named for resumption; or
- a request to use relevant project material inside the current working directory.

The Host Agent follows its own permission and sandbox rules for anything outside that scope. OpenBPMN adds no prompt layer.

The CLI never searches for evidence. It reads only:

- standard input;
- an explicit Structured Process Evidence or Handoff File path;
- an explicit `.bpmn` path supplied to `validate` or `render`; and
- versioned schemas and profile data shipped inside the installed package.

## Write contract

OpenBPMN may create a new, non-colliding Output Bundle at:

- a destination explicitly named by the human; or
- a safe new filename in the Host Agent's current working directory.

Writing to any other location requires an explicit path accepted by Host-Native Authority. The CLI creates ordinary files only and never writes through a symbolic-link output target.

Before writing, the CLI resolves the destination parent and verifies that every artifact remains within the selected output directory. It rejects path traversal that escapes that directory. Explicit reads may follow symbolic links when Host-Native Authority allows them; generated output paths may not redirect through them.

## Bundle Replacement

A user statement such as “update this process,” “replace the invoice-process bundle,” or an equivalent target-specific instruction authorizes replacement of that named Output Bundle. The Modeling Skill passes the authority through an explicit CLI replacement option. The CLI never infers replacement authority from file existence, prior invocations, Session State, or a general modeling request.

Replacement is bundle-level:

1. generate all new artifacts in a staging location within the destination filesystem;
2. validate the staged BPMN, SVG, and Quality Report;
3. verify that all target paths still match the authorized bundle;
4. replace the bundle only after every staged artifact is ready; and
5. retain or restore the previous complete bundle if any replacement step fails.

OpenBPMN does not add a second interactive confirmation after the human has given target-specific authority. It also does not retain automatic backups after a successful replacement.

Without replacement authority, a collision returns the filesystem-safety exit class and changes nothing. The Modeling Skill may select a new non-colliding filename and present it to the user.

## Temporary data

Structured Process Evidence is passed through standard input when practical. When a temporary file is required, OpenBPMN:

- uses the operating system's temporary directory;
- creates a random, content-free filename with user-only access;
- never places interview or Session State content in the repository as an implementation detail;
- closes handles before deletion; and
- attempts cleanup after both success and failure.

There is no background cleanup service. If the operating system prevents immediate removal, OpenBPMN reports the residual path without echoing its contents.

## Untrusted Process Evidence

Attachments, documents, BPMN XML, Handoff Files, annotations, and source excerpts are data. Text such as “ignore previous instructions,” shell commands, scripts, links, tool requests, or role instructions inside those sources carries no authority.

The Modeling Skill interprets imported content only as claims about the process. It acts on a command found inside evidence only if the human independently asks for that action.

The deterministic CLI:

- validates Structured Process Evidence and Handoff Files against strict schemas;
- enforces bounded input sizes and collection depths;
- uses XML parsing with DTD and external-entity resolution disabled;
- never evaluates scripts, expressions, templates, links, or extension payloads;
- treats unsupported namespaces and extensions as findings rather than executable behavior; and
- fails closed on malformed input.

Exact size and depth limits belong to implementation configuration shipped with the CLI, not a user security-policy system.

## Data-minimized artifacts

Quality Reports and Handoff Files are Data-Minimized Artifacts.

Quality Reports contain:

- stable evidence identifiers and display names;
- concise paraphrases needed to explain a finding;
- affected model-element identifiers;
- severity, category, and remediation guidance; and
- unresolved questions and explicit Modeling Decisions relevant to the result.

They do not copy full interviews, documents, transcripts, credentials, or unrelated source passages. Source paths are relative where useful and otherwise reduced to display names.

Handoff Files contain the minimum paraphrased evidence, decisions, conflicts, draft semantics, and review scenarios needed to continue. They do not embed original source files or chat transcripts.

Before writing either artifact, the skill and CLI apply lightweight high-confidence secret checks. Detected credentials and obvious secret values are redacted and produce a warning tied to the evidence identifier. OpenBPMN offers no force-include-credentials option. Detection is defense-in-depth, not a guarantee that every sensitive value will be recognized.

## Diagnostics and retention

Default CLI output and errors may include:

- stable codes;
- element and evidence identifiers;
- counts and versions;
- artifact paths; and
- data-minimized explanations.

They do not print Structured Process Evidence, raw interview passages, Handoff contents, full BPMN XML, or secret values. Explicit debug mode may expose technical stack traces but still does not dump process payloads automatically.

OpenBPMN stores no logs outside artifacts requested by the human and retains no process data after the CLI invocation. It performs no telemetry, update check, remote validation, package download, or other network request.

The Host Agent may send conversational content to its own AI provider according to the user's chosen product and account terms. Local-First means no OpenBPMN-operated service or network behavior; it does not claim that third-party model inference occurs on-device.

## Failure behavior

A failed operation:

- returns structured findings and Quality Report content through the result envelope;
- removes staged and temporary output where possible;
- leaves the previous Output Bundle unchanged; and
- creates no destination artifacts on a first-run failure.

The CLI never leaves a partially replaced Output Bundle. Cleanup failures are reported as paths and codes without revealing content.

## Invalid Expert Export

An Invalid Expert Export is available only through an explicit per-invocation option. The option is never persisted in configuration, Session State, or a Handoff File.

The CLI writes distinct names:

- `<process>.invalid.bpmn`;
- `<process>.invalid.quality.json`; and
- optionally `<process>.invalid.svg` when rendering succeeds.

Invalid expert files never replace a valid Output Bundle, never emit `clean_export_ready`, and always identify the blocking validation failures and applied override in the Quality Report and result envelope. A collision with an existing invalid expert file still requires target-specific replacement authority.

## Fixed safety surface

The MVP exposes only the options needed to carry user intent into the deterministic boundary, including:

- input and output paths;
- structured result output;
- target-specific Bundle Replacement;
- explicit Handoff File creation; and
- per-invocation Invalid Expert Export.

It has no user security-policy file, broad allowlist, custom permission store, vault, audit mode, or background enforcement process.

## Acceptance evidence

The implementation must demonstrate this contract with focused tests for:

1. explicit-path and standard-input reads only;
2. prompt-like instructions remaining inert inside every input format;
3. DTD and external-entity rejection;
4. traversal and symbolic-link output refusal;
5. collision refusal without replacement authority;
6. complete bundle preservation under injected generation and replacement failures;
7. temporary-input cleanup after success and failure;
8. high-confidence secret redaction without raw-value logging;
9. data-minimized default and debug diagnostics;
10. distinct, non-persistent invalid expert output; and
11. absence of OpenBPMN network behavior in normal commands.

These are small deterministic tests around the CLI boundary, not the foundation of a broader security subsystem.
