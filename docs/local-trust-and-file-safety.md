# Data and file safety

OpenBPMN works within the permissions and sandbox of your chosen agent. It does not provide a separate account, permission system, secret vault, or hosted process service.

Your agent may send conversational content to its provider according to that product's settings and terms. A local OpenBPMN CLI does not mean that model inference happens on your device.

## Source material

Supply only process material you are authorized to use. Attachments, interview notes, BPMN XML, and Handoffs are treated as evidence about a process. Instructions embedded in those sources do not authorize the skill to execute commands or take unrelated actions.

The modeling commands read their explicitly named input or standard input, bundled resources, and browser locations needed for rendering. They do not search your files for evidence. The agent may read additional relevant material within the scope of your request and its own permissions.

Structured input is checked against versioned schemas and size/depth limits. XML with DTDs or external entities is refused. The CLI does not execute scripts, expressions, links, or vendor-extension payloads from a model. See the [protocol reference](../skills/openbpmn/references/protocol.md) for input limits.

## Generated files

The usual output contains BPMN, an SVG preview, and a separate Quality Report. You choose the destination directly or through the agent's current directory. Output directories must resolve safely, and output files cannot redirect through symbolic links.

Existing files are not overwritten unless you authorize replacement of that named bundle, for example, “Update this process.” The skill carries that choice through the CLI's explicit replacement option. A general modeling request does not authorize replacing existing files.

New artifacts are prepared and checked before replacing the previous bundle. Handled failures preserve or restore the previous complete output; a failed first generation does not publish an incomplete normal bundle. Successful replacement does not keep an automatic backup.

Power loss or a forcibly killed process can interrupt a multi-file replacement. A later attempt reports the unfinished staging location and refuses to overwrite recoverable material. Follow the recovery diagnostic before retrying. If the operating system prevents restoration, do not treat the destination files as a complete bundle.

## Reports and Handoffs

Quality Reports contain concise evidence references, findings, decisions, unresolved questions, and affected model identifiers. A Handoff is created only when requested and contains the structured model and enough paraphrased context to continue in another session. Neither is intended to copy full source documents or transcripts.

These files can still contain sensitive business information. Review them before sharing. Source paths are reduced to relative paths or display names where appropriate. High-confidence credential checks can redact obvious secrets or refuse unsafe input, but they cannot recognize every sensitive value. There is no force-include-credentials option.

OpenBPMN does not automatically save conversation history or create a persistent process workspace.

## Temporary files and diagnostics

Generation uses temporary storage and a fresh browser profile, separate from your ordinary browsing session. Cleanup is attempted after success and failure. If files cannot be removed, the command reports their location without printing their contents.

Normal diagnostics identify codes, model elements, versions, counts, and artifact paths. They do not automatically dump interviews, structured requests, BPMN XML, or Handoffs. Debug output may include technical stack traces; review logs before sharing them.

The modeling commands make no telemetry, update, package-download, or remote-validation requests. See [support status](support.md) for the limits of platform and offline verification.

## Installation management

Setup installs a matched private runtime, CLI, and modeling skill at disclosed locations. It registers the selected skill and reversible command-discovery integration. It preserves unrelated host instructions, permissions, credentials, and user files.

Updates use an explicitly supplied bundle and do not check for new versions in the background. A handled update failure preserves the previous runnable CLI and skill. An interrupted operation is reported for recovery; installation changes are not claimed to be universally safe from power loss.

Installation metadata records owned paths, file hashes, versions, and host registrations. It does not store process evidence, prompts, credentials, or chat state. Doctor works without downloads.

Uninstall removes verified owned installation files and integration. It preserves models, Handoffs, unrelated files, and modified files whose ownership cannot be established safely. Read the retained-path list in its result. See [Installation](installation.md) for commands and locations.

## Invalid expert exports

An explicitly requested expert snapshot can produce distinct `.invalid.bpmn` and `.invalid.quality.json` files, and an `.invalid.svg` when rendering succeeds. The option applies only to that invocation and is not saved in a Handoff.

These files do not replace a normal valid bundle or signal a clean export. Their report identifies the blocking findings. See the [command reference](commands.md) before using this option.

Report suspected vulnerabilities through the [private reporting form](https://github.com/ve250104/OpenBPMN/security/advisories/new). Use synthetic examples and omit confidential process material.
