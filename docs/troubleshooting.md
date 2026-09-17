# Troubleshooting

Find the result’s stable code and remediation first. A `cleanEligible` value describes model checks, not whether a failed file operation produced a bundle; inspect the signal and artifact list too.

Incomplete setup: run the full `bpmn-weave-manage doctor` path printed by setup. Read each failed check and its remediation. Local application, browser, example generation, and actual host discovery are separate observations. Missing Chrome/Edge requires installing a browser yourself or selecting its absolute executable path; BPMN Weave never silently installs one or attaches to your personal browser session.

Command not found after setup: reopen the shell and refresh/restart the selected agent, then use the full launcher path reported during setup. The primary installation's launcher uses its private Node runtime. If a manually invoked `node dist/cli.js` or a secondary npm install reports the wrong Node version, it is not using that launcher. Check the command resolved inside the agent's shell; do not globally replace another tool's Node installation.

Skill not discovered or wrong version: inspect the host and registration paths reported by doctor. Competing personal/project skill folders can shadow the intended installation. Setup reports conflicts and preserves existing files; resolve the named conflict explicitly and rerun. Folder placement is not proof that a running host session has refreshed its skills.

Update/uninstall conflict: preserve user-modified or unowned files named in the diagnostic. Update uses an explicitly supplied extracted candidate; verify its source and hashes. An interrupted installation requires the reported recovery action, not deleting arbitrary directories or globally reinstalling Node. Uninstall deliberately retains files whose ownership can no longer be verified, as well as user models and Handoffs.

Input refusal: check the JSON pointer and versioned schema. Unknown versions, keys, fields, references, overlarge input, and unsafe semantic credentials are refused rather than guessed or silently changed.

Output refusal: choose a new filename or explicitly authorize replacement of the named files. Use an existing canonical directory without symlink redirection. The input and all outputs must be distinct; the optional Handoff must be a sibling.

Interrupted write: inspect the exact staging/lock path named in the error and its manifest. Do not delete recoverable originals merely to retry. Catchable failures attempt complete rollback; kill/power loss is not a crash-proof multi-file transaction. If the operating system prevents rollback, do not treat the destinations as a complete bundle; the command reports only originals it can actually verify as preserved.

Diagram failure: no new normal bundle is published when faithful geometry or rendering fails. Keep the previous preview labeled unchanged. Supply a minimal synthetic reproducer, the tool/browser/OS versions, and the stable code in a bug report. Do not upload interviews, complete Handoffs, credentials, or client XML.

For unsupported notation or a consumer limitation, retain the requirement and review a separately agreed alternative. Repeated retries or an expert flag do not turn it into supported behavior.
