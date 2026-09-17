# Operational failures

Use the stable finding code and remediation; default diagnostics intentionally omit process payloads. Do not paste source documents, complete Handoffs, XML, or credentials into an issue report. A minimal licensed synthetic reproducer is useful.

- Missing CLI/version mismatch: name the installed and required versions from `capabilities` and `version.json`. Ask the human to install matching CLI/skill artifacts or obtain authority to do it. Ordinary modeling never implicitly fetches packages with `npx`.
- Missing/incompatible browser: generation/rendering need installed local Chrome or Edge. Use an explicit absolute executable path when discovery fails. `validate` and `capabilities` do not need a browser. Retain the Chromium sandbox and use no personal browser profile.
- Input-schema/ref errors: inspect the indicated JSON pointer and relevant schema definition. Repair transcription/shape mistakes without changing intended meaning; consequential corrections remain Modeling Decisions. Unknown schema versions are not silently migrated.
- Geometry/render failures: preserve the prior bundle and report the failing requirement. `render` uses supplied DI only; it never repairs a missing diagram or validates a semantic import.
- File collision: choose a new name, or pass `--replace` when the user has authorized replacing that named output. Directory, symlink, alias, or stale-stage findings require the actual safe path/recovery action, not a bypass.
- Interrupted staging: inspect the named manifest and recoverable original files. Explain the observed state before manual recovery; never erase an unfinished stage or lock merely to rerun. Ordinary filesystems do not provide crash-proof multi-file transactions.
- Unsupported notation: retain the requirement and discuss its actual meaning. Repeated retries, expert flags, or renaming a construct do not make it supported.

After one retry correcting a specific input, path, or prerequisite, stop an unchanged dependency failure and report the blocker. The human’s request to finish does not grant installation, account, overwrite, or network authority beyond the host’s existing scope.
