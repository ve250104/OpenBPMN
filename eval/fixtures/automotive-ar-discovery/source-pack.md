# Automotive AR discovery source pack

## Classification

- **Fixture:** `automotive-ar-discovery`
- **Data class:** authored synthetic fiction
- **Intended use:** public OpenBPMN evaluation and examples
- **Confidentiality:** contains no real client data
- **Derivation:** renamed, reduced, and paraphrased from an owner-controlled synthetic consulting-demo corpus

This file is process evidence, not an answer key. A Modeling Copilot should distinguish reported practice from official policy, surface contradictions, ask for material missing information, and help the consultant decide how to represent the process before producing a BPMN Process Model.

## Consultant request

Help me document the current Accounts Receivable process across two operating units of an automotive components group. Start when Logistics makes a delivery ready for billing. End after month-end AR close and any handoff for doubtful receivables.

The model should make meaningful differences between the two units visible. It should also show important handoffs to Logistics, Quality, Commercial Pricing, Accounts Payable, the Chief Accountant, and General Ledger Accounting.

Do not treat the official process description as proof of actual practice when interview evidence contradicts it.

## Source A — North unit shadowing workshop

The North unit accountant begins by checking the SAP billing-due list for deliveries belonging to her portfolio.

For ordinary billing, she creates the invoice manually. For self-billing customers, however, the delivery remains unbilled until the customer sends a self-bill. The accountant then compares quantity, part number, and price in the self-billing monitor. If they match, she processes the transfer and the delivery is consumed.

Tooling invoices frequently fail because VAT or sales-order data is wrong. The accountant cancels the rejected invoice, corrects the underlying data with the responsible colleague, and issues it again. The interview does not state how many correction attempts may occur.

Issued invoices leave through customer-specific channels: EDI, customer portals, email attachments, and occasionally post. Since the ERP migration, an invoice may appear sent internally while the customer has not received it. Self-bills may also become stuck in the EDI layer.

When money arrives, the accountant checks the electronic bank statement and clears the payment against open invoices using the payment advice. One payment may cover many invoices, requiring manual line-by-line matching.

There is no formal dunning run. The accountant reviews overdue items, waits briefly, and sends an informal reminder. Escalation may involve Sales or the unit finance lead, but the decision rule and timing are not defined.

Quantity disputes go to Logistics, quality disputes to Quality, and price disputes to Commercial Pricing. Some price discrepancies create an automatic report; other disputes are tracked through email and a private spreadsheet. Deductions that belong on the vendor side are handed to Accounts Payable.

At month end, the accountant completes billing and clearing, saves open-item and billing-due extracts for audit, and prepares a sales-accrual view for self-billing deliveries that remain unbilled. The Chief Accountant posts the accrual. Intercompany balances are confirmed manually by email.

A long-aged receivable can eventually be proposed for write-off, but General Ledger Accounting owns the provision and write-off after a finance decision.

## Source B — South unit shadowing workshop

The South unit also begins with the SAP billing-due list, but its timing differs. Each morning the accountant issues all due invoices, including those for self-billing customers. The customer self-bill commonly arrives about a week later; processing it updates the invoice that already exists.

Invoices are dispatched through EDI, portals, or email according to the customer. Payment advice is equally inconsistent: some customers provide a portal file, some email a document, and one places invoice references directly in the email body.

The accountant checks the electronic bank statement daily and clears payments using the customer reference. Large remittances still require line-by-line work.

There is no formal dunning run here either. Collection activity depends on the customer: a portal ticket, hotline call, direct Accounts Payable contact, general mailbox, or chatbot. Escalation may move through the business-unit manager and eventually Legal, but the evidence does not give a uniform rule.

Price differences feed a recurring Commercial Pricing report. Quantity disputes require Logistics confirmation before a debit or credit note. Quality and other-cost claims go to different accounting owners. Each accountant maintains a separate local dispute tracker.

Before month end, the unit updates payment data and completes overdue-commentary and tooling-receivable files line by line. A coordinator combines them for the monthly commercial review. Intercompany balances are confirmed manually.

For doubtful receivables, General Ledger Accounting acts only after the relevant court-insolvency documentation exists. The AR accountant identifies the case but does not post the provision or write-off.

## Source C — Billing specialist interview

Payment terms originate in customer master data maintained from information supplied by Sales. The master-data team controls access but does not validate whether the commercial term is correct. A wrong term therefore flows into the sales document, the invoice, and its due date.

When a tooling invoice is rejected, the specialist cancels it, corrects the problem, and reissues it. The account does not establish whether the process returns to Sales, Master Data, or the accountant for every error type.

There is no approved, current work instruction for all tooling variants. Some operational knowledge exists only in personal notes.

## Source D — official group process description

The released group process describes one standardized sequence for every unit. It includes:

1. A customer credit-exposure check and credit-block release.
2. A separate financial-invoice activity.
3. A formal escalating dunning run that produces dunning notices.
4. Self-billing reconciliation, cash application, dispute routing, month-end reporting, and doubtful-receivable assessment.

Both operating-unit workshops say the first three activities are not performed in practice. Staff report no credit-control step for the relevant customer base, no separate financial-invoice posting, and no formal dunning run.

## Known evidence gaps

The source material deliberately leaves these points unresolved:

- Whether to create one shared process with unit-specific branches or two linked unit processes.
- The precise event that starts the process for self-billing customers.
- Retry or escalation limits for rejected invoices and failed EDI transmissions.
- Objective thresholds and ownership for collection escalation.
- Who owns shared dispute data when every accountant keeps a local tracker.
- The exact boundary between AR close and General Ledger close.
- Whether the official process is an intended future state, an obsolete description, or a control requirement that is currently breached.
- Volumes, cycle times, frequencies, and financial impact.

These gaps are expected to trigger focused clarification rather than invented process detail.
