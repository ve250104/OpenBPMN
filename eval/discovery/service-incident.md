# Service incident and recovery evidence

Synthetic held-out evaluation evidence, licensed under the repository MIT license. No real incident or system is represented.

## User request

Model the agreed incident response from monitoring alert through service restoration and the recorded follow-up. Show the recovery work as a subprocess, and show the evidence used to decide that service is restored.

## Source A — incident-response workshop

An on-call engineer receives a monitoring alert and checks whether a customer-facing service is affected. If no service is affected, the engineer records a false alarm and ends the case. Otherwise the engineer opens an incident record and begins recovery.

Recovery consists of reviewing the diagnostic log, choosing a remediation, applying it, and checking a health-check result. If the result still shows failure, the engineer revisits the diagnosis and chooses another remediation. There is no agreed numeric retry limit. A healthy result completes recovery. The incident record is stored persistently; the diagnostic log and health-check result are information artifacts used by the recovery activities.

After recovery, the incident lead informs Customer Success that service is restored. Customer Success informs affected customers. The incident lead records follow-up actions and closes the incident. Sending the customer message and creating follow-up actions are sequential in this agreed view; the group did not agree to parallelize them.

## Source B — uncertainty

A participant suggested ending the entire incident immediately after the health check succeeds, but the workshop retained customer notification and follow-up as required steps. Escalation to an external provider was discussed without agreeing when it happens; it is not part of the selected flow, and that omission should stay visible in the review context.
