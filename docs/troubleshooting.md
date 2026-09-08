# Troubleshooting

Find the result’s stable code and remediation first. A `cleanEligible` value describes model checks, not whether a failed file operation produced a bundle; inspect the signal and artifact list too.

Missing runtime: use Node 24.x, check `capabilities`, and explicitly point to an installed Chrome/Edge executable when discovery fails. The CLI never installs a browser or attaches to your personal browser session.

Input refusal: check the JSON pointer and versioned schema. Unknown versions, keys, fields, references, overlarge input, and unsafe semantic credentials are refused rather than guessed or silently changed.

Output refusal: choose a new filename or explicitly authorize replacement of the named files. Use an existing canonical directory without symlink redirection. The input and all outputs must be distinct; the optional Handoff must be a sibling.

Interrupted write: inspect the exact staging/lock path named in the error and its manifest. Do not delete recoverable originals merely to retry. Catchable failures attempt complete rollback; kill/power loss is not a crash-proof multi-file transaction. If the operating system prevents rollback, do not treat the destinations as a complete bundle; the command reports only originals it can actually verify as preserved.

Diagram failure: no new normal bundle is published when faithful geometry or rendering fails. Keep the previous preview labeled unchanged. Supply a minimal synthetic reproducer, the tool/browser/OS versions, and the stable code in a bug report. Do not upload interviews, complete Handoffs, credentials, or client XML.

For unsupported notation or a consumer limitation, retain the requirement and review a separately agreed alternative. Repeated retries or an expert flag do not turn it into supported behavior.
