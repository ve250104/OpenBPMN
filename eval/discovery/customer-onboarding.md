# Startup customer onboarding

Synthetic evaluation evidence, licensed under the repository MIT license. No real company, customer, or deployment is represented.

## User request

Create a BPMN diagram of our current customer onboarding, starting after the signed agreement is recorded and ending when the customer is live or explicitly declines to continue. It should make our team’s handoff to the external identity-verification provider clear. Keep it useful for a team discussion.

## Source A — Customer Success interview

Customer Success records the signed agreement, opens the onboarding case, and asks the customer for its setup details. We wait for those details; the interview gives no reminder schedule or deadline. Customer Success checks that the details are complete. If information is missing, we ask the customer to correct it and check the response again.

When details are complete, Operations sends a verification request to the external verification provider. The provider sends an approved or rejected result. Approval lets Operations provision the account. Rejection is reviewed by Customer Success, who discusses alternatives with the customer. If the customer chooses to correct its details, we return to the completeness check and request verification again. If the customer declines, we close the onboarding case as declined.

After the account is provisioned, Customer Success arranges a kickoff with the customer and then marks the customer live. Billing setup is handled elsewhere and must not delay this modeled process. The provider’s internal verification steps are unknown.

## Source B — Operations clarification

Verification and provisioning are not parallel. We provision only after an approved provider result. The provider is independent, not a lane inside our company. An approved verification does not itself mean the customer is live.

## Source C — outdated note

An old checklist assigns provisioning to Customer Success. Operations says its team has performed it since the latest handover, but the checklist owner has not confirmed the change.
