# Support response and escalation

Synthetic evaluation evidence, licensed under the repository MIT license. Names and timing are fictional.

## User request

Model the current support handling for a customer ticket, including the response-time escalation and customer confirmation. Show us where work continues during escalation.

## Source A — Support lead

A received ticket is classified by Support. Ordinary tickets are investigated by a support specialist. If investigation is still active after four business hours, the team lead is notified and arranges additional help. The specialist continues the same investigation: the escalation must not cancel it. Only one timeout notification is needed for that investigation.

Once the specialist has a proposed resolution, Support sends it to the customer. The team waits for either customer confirmation or a seven-calendar-day timeout, whichever happens first. Confirmation closes the ticket as confirmed resolved. The timeout closes it as resolved without customer confirmation. If the customer reports that the issue is not resolved instead of confirming, Support returns to investigation.

## Source B — Engineering

Critical incidents are handled by a different incident-response process and should be shown as an explicitly excluded variant here, not modeled as ordinary tickets. The interview does not establish how four business hours map to holidays or the customer’s time zone.

## Source C — manager’s question

The manager wants to compare the current non-cancelling escalation with a proposal that stops work and transfers the entire investigation to the team lead. Those are two different behaviors; this request asks for the current one.
