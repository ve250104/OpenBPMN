import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strToU8, zipSync } from 'fflate';

const root = dirname(fileURLToPath(import.meta.url));
const casesRoot = join(root, 'cases');
const retrievedAt = '2026-09-21';
const baseCommit = 'bf84f92aaf43c8a735bd29cb4a2a70791b0eda05';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';
const deterministicZipOptions = { mtime: new Date(1980, 0, 1, 0, 0, 0) };
const purchaseExampleBpmn = await readFile(new URL('../../examples/purchase-approval.bpmn', import.meta.url), 'utf8');

const coverage = {
  alternatives: 'Alternative paths and outcomes',
  concurrency: 'Concurrent work and synchronization',
  retries: 'Retries or rework',
  'cancellation-escalation-timeout': 'Cancellation, escalation, or timeout',
  'participant-handoffs': 'Participant handoffs',
  'incomplete-continuations': 'Incomplete continuation evidence',
  'case-vs-batch': 'Case-level versus portfolio or batch scope',
  'long-labels': 'Long labels and readable association',
  'cross-lane-routing': 'Cross-lane routing',
  'nested-detail-views': 'Nested or detail views',
  'estimated-vs-mandatory-thresholds': 'Estimated versus mandatory thresholds',
  'business-vs-elapsed-time': 'Business versus elapsed time',
  'contradictory-ownership': 'Contradictory ownership evidence',
  'policy-practice-disagreement': 'Policy and practice disagreement',
  'unsupported-inference': 'Unsupported responsibility, receipt, or ordering inference',
};
const assessmentDimensions = [
  'evidenceFidelity',
  'coverage',
  'behavior',
  'representation',
  'technicalValidity',
  'readability',
  'interaction',
  'downstreamUsability',
];

const pmo = {
  classification: 'public-academic',
  sourceFamily: 'PMo Dataset',
  sourceVersion: '1.0.0 (Zenodo record 15857589)',
  originalUrl: 'https://doi.org/10.5281/zenodo.15857589',
  retrievedAt,
  rights: {
    license: 'CC-BY-4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/legalcode',
    attribution: 'Alexis Brissard, Frederic Cuppens, and Amal Zouaq, PMo Dataset v1.0.0',
  },
};

const flowBench = {
  classification: 'public-academic',
  sourceFamily: 'IBM FLOW-BENCH',
  sourceVersion: 'git commit 2e4c1e3a128d27b905ab98baa7b13fe4433c9ce7',
  originalUrl: 'https://github.com/IBM/flow-bench',
  retrievedAt,
  rights: {
    license: 'Apache-2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    attribution: 'IBM FLOW-BENCH contributors',
  },
};

const synthetic = (sourceFamily = 'OpenBPMN evaluation corpus') => ({
  classification: 'synthetic-fiction',
  sourceFamily,
  sourceVersion: '1.0.0',
  originalUrl: null,
  authorshipRecord: 'Authored for OpenBPMN issue #44; not client or operational material.',
  retrievedAt,
  rights: { license: 'MIT', licenseUrl: 'https://opensource.org/license/mit', attribution: 'OpenBPMN contributors' },
});

const expenseReferenceBpmn =
  '<?xml version="1.0" encoding="UTF-8"?>\n<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" targetNamespace="urn:openbpmn:corpus"><bpmn:process id="Expense" isExecutable="false"><bpmn:laneSet id="Lanes"><bpmn:lane id="Lane_AP" name="Accounts Payable"><bpmn:flowNodeRef>Start</bpmn:flowNodeRef><bpmn:flowNodeRef>Check</bpmn:flowNodeRef><bpmn:flowNodeRef>ApprovalDecision</bpmn:flowNodeRef><bpmn:flowNodeRef>Threshold</bpmn:flowNodeRef><bpmn:flowNodeRef>Pay</bpmn:flowNodeRef><bpmn:flowNodeRef>Paid</bpmn:flowNodeRef><bpmn:flowNodeRef>Rejected</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="Lane_Manager" name="Line manager"><bpmn:flowNodeRef>Approve</bpmn:flowNodeRef></bpmn:lane><bpmn:lane id="Lane_Controller" name="Finance controller"><bpmn:flowNodeRef>ControllerApprove</bpmn:flowNodeRef></bpmn:lane></bpmn:laneSet><bpmn:startEvent id="Start" name="Claim submitted"/><bpmn:userTask id="Check" name="Check receipts"/><bpmn:userTask id="Approve" name="Approve business purpose"/><bpmn:exclusiveGateway id="ApprovalDecision" name="Business purpose approved?"/><bpmn:exclusiveGateway id="Threshold" name="Additional approval needed?"/><bpmn:userTask id="ControllerApprove" name="Finance controller approves"/><bpmn:serviceTask id="Pay" name="Pay approved claim"/><bpmn:endEvent id="Paid" name="Claim paid"/><bpmn:endEvent id="Rejected" name="Claim rejected"/><bpmn:sequenceFlow id="F1" sourceRef="Start" targetRef="Check"/><bpmn:sequenceFlow id="F2" sourceRef="Check" targetRef="Approve"/><bpmn:sequenceFlow id="F3" sourceRef="Approve" targetRef="ApprovalDecision"/><bpmn:sequenceFlow id="F_reject" name="Rejected" sourceRef="ApprovalDecision" targetRef="Rejected"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">not approved</bpmn:conditionExpression></bpmn:sequenceFlow><bpmn:sequenceFlow id="F_approved" name="Approved" sourceRef="ApprovalDecision" targetRef="Threshold"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">approved</bpmn:conditionExpression></bpmn:sequenceFlow><bpmn:sequenceFlow id="F_standard" name="EUR 2,000 or less" sourceRef="Threshold" targetRef="Pay"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">amount &lt;= 2000</bpmn:conditionExpression></bpmn:sequenceFlow><bpmn:sequenceFlow id="F_controller" name="Above EUR 2,000" sourceRef="Threshold" targetRef="ControllerApprove"><bpmn:conditionExpression xsi:type="bpmn:tFormalExpression" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">amount &gt; 2000</bpmn:conditionExpression></bpmn:sequenceFlow><bpmn:sequenceFlow id="F4" sourceRef="ControllerApprove" targetRef="Pay"/><bpmn:sequenceFlow id="F5" sourceRef="Pay" targetRef="Paid"/></bpmn:process><bpmndi:BPMNDiagram id="Diagram"><bpmndi:BPMNPlane id="Plane" bpmnElement="Expense"><bpmndi:BPMNShape id="S_Start" bpmnElement="Start"><dc:Bounds x="40" y="100" width="36" height="36"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="S_Check" bpmnElement="Check"><dc:Bounds x="110" y="80" width="100" height="80"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="S_Approve" bpmnElement="Approve"><dc:Bounds x="250" y="80" width="100" height="80"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="S_ApprovalDecision" bpmnElement="ApprovalDecision"><dc:Bounds x="390" y="95" width="50" height="50"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="S_Threshold" bpmnElement="Threshold"><dc:Bounds x="500" y="95" width="50" height="50"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="S_ControllerApprove" bpmnElement="ControllerApprove"><dc:Bounds x="600" y="40" width="100" height="80"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="S_Pay" bpmnElement="Pay"><dc:Bounds x="740" y="80" width="100" height="80"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="S_Paid" bpmnElement="Paid"><dc:Bounds x="880" y="100" width="36" height="36"/></bpmndi:BPMNShape><bpmndi:BPMNShape id="S_Rejected" bpmnElement="Rejected"><dc:Bounds x="500" y="210" width="36" height="36"/></bpmndi:BPMNShape><bpmndi:BPMNEdge id="E1" bpmnElement="F1"><di:waypoint x="76" y="118"/><di:waypoint x="110" y="118"/></bpmndi:BPMNEdge><bpmndi:BPMNEdge id="E2" bpmnElement="F2"><di:waypoint x="210" y="118"/><di:waypoint x="250" y="118"/></bpmndi:BPMNEdge><bpmndi:BPMNEdge id="E3" bpmnElement="F3"><di:waypoint x="350" y="118"/><di:waypoint x="390" y="118"/></bpmndi:BPMNEdge><bpmndi:BPMNEdge id="E_reject" bpmnElement="F_reject"><di:waypoint x="415" y="145"/><di:waypoint x="518" y="210"/></bpmndi:BPMNEdge><bpmndi:BPMNEdge id="E_approved" bpmnElement="F_approved"><di:waypoint x="440" y="118"/><di:waypoint x="500" y="118"/></bpmndi:BPMNEdge><bpmndi:BPMNEdge id="E_standard" bpmnElement="F_standard"><di:waypoint x="550" y="118"/><di:waypoint x="740" y="118"/></bpmndi:BPMNEdge><bpmndi:BPMNEdge id="E_controller" bpmnElement="F_controller"><di:waypoint x="525" y="95"/><di:waypoint x="600" y="80"/><bpmndi:BPMNLabel><dc:Bounds x="535" y="50" width="110" height="20"/></bpmndi:BPMNLabel></bpmndi:BPMNEdge><bpmndi:BPMNEdge id="E4" bpmnElement="F4"><di:waypoint x="700" y="80"/><di:waypoint x="740" y="118"/></bpmndi:BPMNEdge><bpmndi:BPMNEdge id="E5" bpmnElement="F5"><di:waypoint x="840" y="118"/><di:waypoint x="880" y="118"/></bpmndi:BPMNEdge></bpmndi:BPMNPlane></bpmndi:BPMNDiagram></bpmn:definitions>\n';

function source(path, content, options = {}) {
  return {
    path,
    content,
    mediaType: options.mediaType ?? 'text/plain',
    role: options.role ?? 'evidence',
    viewpoint: options.viewpoint ?? 'process owner',
    provenance: options.provenance ?? synthetic(),
    transformationHistory: options.transformationHistory ?? ['Authored directly in the declared format.'],
    format: options.format ?? 'text',
  };
}

const cases = [
  {
    id: 'pmo-customer-order',
    title: 'Customer inquiry to confirmed order',
    task: 'description',
    lane: 'text-to-process',
    domain: 'sales',
    partition: 'development',
    tags: ['alternatives', 'participant-handoffs', 'unsupported-inference'],
    prompt:
      'Model only the customer-order process established by the supplied description. Preserve uncertainty about who approves the quote.',
    sources: [
      source(
        'description.txt',
        'This process begins when a potential customer inquires about a product or service.\nSales staff or customer support collects relevant information and addresses any concerns or questions.\nIf the customer is interested, they are guided through selecting the appropriate product or service.\nNext, the sales representative provides a quote, and after approval from the customer, the process moves to order placement.\nThe order is then recorded in the system, and the customer receives confirmation of their order.\nThe process ends when the order is successfully placed and confirmed.\n',
        {
          provenance: pmo,
          transformationHistory: [
            'Extracted descriptions/01.txt from pmo-dataset.zip (MD5 414d9fbc5aa04bc70db8bf1673f4c69a) and normalized CRLF to LF without semantic edits.',
          ],
        },
      ),
    ],
    facts: [
      ['customer interest is an alternative before quoting', 'required', 'critical', 0, 'lines 2-4'],
      ['customer approval precedes order placement', 'required', 'critical', 0, 'line 4'],
      ['an internal quote approver exists', 'forbidden', 'critical', 0, 'line 4'],
      [
        'sales staff and customer support may be one responsibility group or separate lanes',
        'permitted-scope-choice',
        'minor',
        0,
        'line 2',
        { epistemicStatus: 'established', caseScope: 'responsibility grouping only' },
      ],
    ],
    alternatives: ['Sales staff and customer support may be separate lanes or one named responsibility group.'],
    variants: [
      {
        id: 'independent-sentences-reordered',
        kind: 'meaning-preserving',
        replacesSourceIndexes: [0],
        source: source(
          'description.txt',
          'Sales staff or customer support collects relevant information and addresses concerns.\nThe process begins when a potential customer inquires.\nInterested customers select a product, receive a quote, approve it, and place an order.\nThe order is recorded and confirmation is sent.\n',
        ),
      },
    ],
  },
  {
    id: 'pmo-inventory-restock',
    title: 'Inventory restock',
    task: 'description',
    lane: 'text-to-process',
    domain: 'supply-chain',
    partition: 'held-out',
    tags: ['estimated-vs-mandatory-thresholds', 'participant-handoffs', 'unsupported-inference'],
    prompt:
      'Create a current-state restock model from the supplied account. Do not invent a numeric reorder threshold.',
    sources: [
      source(
        'description.txt',
        'This process begins with monitoring inventory levels in a warehouse or store.\nWhen stock reaches a predefined threshold, an automated alert or manual check signals the need to reorder.\nThe procurement team then places an order with suppliers, considering factors like cost, delivery time, and supplier reliability.\nOnce the order is placed, the inventory system updates with expected delivery dates.\nUpon receiving the stock, it is inspected for quality, recorded in the system, and placed on shelves or in storage.\nThe process ends when the inventory levels are updated after the restock is complete.\n',
        {
          provenance: pmo,
          transformationHistory: [
            'Extracted descriptions/03.txt from pmo-dataset.zip (MD5 414d9fbc5aa04bc70db8bf1673f4c69a) and normalized CRLF to LF without semantic edits.',
          ],
        },
      ),
    ],
    facts: [
      ['a predefined but nonnumeric threshold triggers reorder', 'required', 'critical', 0, 'line 2'],
      ['quality inspection occurs after receipt and before stock update', 'required', 'major', 0, 'lines 5-6'],
      ['the threshold is exactly ten units', 'forbidden', 'critical', 0, 'line 2'],
    ],
    variants: [
      {
        id: 'mandatory-threshold-added',
        kind: 'meaning-changing',
        replacesSourceIndexes: [0],
        prompt:
          'Create a current-state restock model using the targeted replacement description. Preserve the mandatory threshold of 20 units or fewer.',
        source: source(
          'description.txt',
          'Monitor stock continuously. Reorder when available stock is 20 units or fewer. Procurement orders from a supplier. Inspect received stock and update inventory.\n',
        ),
        changedAssertions: [
          {
            index: 0,
            claim: 'a mandatory threshold of 20 units or fewer triggers reorder',
            disposition: 'required',
            severity: 'critical',
            locator: 'sentence 2',
            epistemicStatus: 'established',
            entityScope: 'warehouse or store inventory',
            caseScope: 'targeted replacement description',
          },
        ],
      },
    ],
  },
  {
    id: 'flowbench-incident-routing',
    title: 'Impact-based incident routing',
    task: 'description',
    lane: 'text-to-process',
    domain: 'information-technology',
    partition: 'development',
    tags: ['alternatives', 'participant-handoffs'],
    prompt:
      'Translate the supplied enterprise-workflow utterance into BPMN while keeping the high-impact condition exact.',
    sources: [
      source(
        'utterance.txt',
        'Retrieve the latest ServiceNow incident. If the incident has "high" impact, create an issue in Jira and send a slack message. Else create a github issue.\n',
        {
          provenance: flowBench,
          transformationHistory: [
            'Extracted tests[uid=2].input.utterance from data/conditional_ootb.yaml without semantic edits.',
          ],
        },
      ),
    ],
    facts: [
      ['high impact creates both a Jira issue and Slack message', 'required', 'critical', 0, 'sentence 2'],
      ['the non-high alternative creates a GitHub issue', 'required', 'critical', 0, 'sentence 3'],
      ['the two high-impact actions are ordered by business requirement', 'forbidden', 'major', 0, 'sentence 2'],
    ],
  },
  {
    id: 'flowbench-account-filing',
    title: 'Account filing loop',
    task: 'description',
    lane: 'text-to-process',
    domain: 'information-technology',
    partition: 'held-out',
    tags: ['case-vs-batch', 'retries'],
    prompt: 'Model the account filing workflow. Preserve that the file creation repeats per retrieved account.',
    sources: [
      source(
        'utterance.txt',
        'Create a new box folder. For every retrieved salesforce account, create a new file in the folder.\n',
        {
          provenance: flowBench,
          transformationHistory: [
            'Extracted tests[uid=5].input.utterance from data/conditional_ootb.yaml without semantic edits.',
          ],
        },
      ),
    ],
    facts: [
      ['one folder is created before account iteration', 'required', 'major', 0, 'sentences 1-2'],
      ['file creation repeats for every retrieved account', 'required', 'critical', 0, 'sentence 2'],
      ['accounts are processed as one combined case', 'forbidden', 'major', 0, 'sentence 2'],
    ],
  },
  {
    id: 'permit-renewal',
    title: 'Permit renewal intake',
    task: 'description',
    lane: 'sop-to-process',
    domain: 'public-administration',
    partition: 'development',
    tags: ['long-labels', 'cancellation-escalation-timeout'],
    prompt:
      'Model the permit renewal SOP, keeping the 30 calendar day expiry separate from the five business day review target.',
    sources: [
      source(
        'sop.txt',
        'The clerk logs a renewal request and checks required attachments. Incomplete requests are returned. Complete requests are reviewed within five business days. If no applicant response arrives within 30 calendar days after a return, close the request as expired. Approved requests produce a renewed permit; refused requests produce a refusal notice.\n',
      ),
    ],
    facts: [
      [
        'five business days is a review target, not an elapsed timer definition',
        'required',
        'critical',
        0,
        'sentences 3-4',
      ],
      ['30 calendar days applies only after a returned incomplete request', 'required', 'critical', 0, 'sentence 4'],
    ],
  },
  {
    id: 'expense-reimbursement',
    title: 'Expense reimbursement',
    task: 'description',
    lane: 'sop-to-process',
    domain: 'finance',
    partition: 'known-regression',
    tags: ['cross-lane-routing', 'alternatives'],
    prompt:
      'Model employee expense reimbursement from the supplied procedure, retaining the different owner and approver roles.',
    sources: [
      source(
        'procedure.txt',
        'An employee submits a claim. Accounts Payable checks receipts and returns incomplete claims to the employee. The line manager approves business purpose. Claims above EUR 2,000 additionally require the finance controller. Accounts Payable pays approved claims and informs the employee; rejected claims end with a notice.\n',
      ),
    ],
    facts: [
      ['the line manager, not Accounts Payable, approves business purpose', 'required', 'critical', 0, 'sentences 2-3'],
      ['a Procurement Director recipient is not established', 'forbidden', 'critical', 0, 'entire procedure'],
      ['a rejected claim reaches a distinct rejected outcome', 'required', 'critical', 0, 'sentence 5'],
      [
        'business-purpose approval precedes the additional-approval decision',
        'required',
        'critical',
        0,
        'sentences 3-4',
      ],
      ['finance controller approval applies only above EUR 2,000', 'required', 'critical', 0, 'sentence 4'],
      ['the amount decision permits exactly one threshold branch', 'required', 'critical', 0, 'sentence 4'],
      ['the above-threshold branch remains visibly labelled', 'required', 'major', 0, 'sentence 4'],
      ['the unrelated payment activity remains unchanged in a correction', 'required', 'critical', 0, 'sentence 5'],
    ],
    automated: [
      {
        code: 'wrong_approver',
        matcher: {
          kind: 'element',
          name: 'Approve business purpose',
          type: 'bpmn:UserTask',
          lane: 'Line manager',
          expect: 'present',
        },
      },
      {
        code: 'invented_recipient',
        matcher: { kind: 'element', name: 'Procurement Director', nameMode: 'includes', expect: 'absent' },
      },
      {
        code: 'missing_required_branch',
        matcher: { kind: 'path', from: 'Business purpose approved?', to: 'Claim rejected', expect: 'present' },
      },
      {
        code: 'reversed_connection',
        matcher: {
          kind: 'path',
          from: 'Approve business purpose',
          to: 'Additional approval needed?',
          expect: 'present',
        },
      },
      {
        code: 'threshold_or_negation_changed',
        matcher: {
          kind: 'sequence',
          target: 'Finance controller approves',
          condition: 'amount > 2000',
          expect: 'present',
        },
      },
      {
        code: 'wrong_gateway_behavior',
        matcher: {
          kind: 'element',
          name: 'Additional approval needed?',
          type: 'bpmn:ExclusiveGateway',
          expect: 'present',
        },
      },
      { code: 'detached_label', matcher: { kind: 'di-label', sequenceName: 'Above EUR 2,000', expect: 'present' } },
      {
        code: 'unrelated_correction_change',
        matcher: { kind: 'element', name: 'Pay approved claim', type: 'bpmn:ServiceTask', expect: 'present' },
      },
    ],
    reviewerReference: expenseReferenceBpmn,
  },
  {
    id: 'automotive-ar-discovery',
    title: 'Automotive accounts-receivable discovery',
    task: 'discovery',
    lane: 'mixed-evidence-discovery',
    domain: 'automotive-finance',
    partition: 'known-regression',
    tags: ['contradictory-ownership', 'policy-practice-disagreement', 'case-vs-batch'],
    prompt:
      'Discover the current North and South receivables processes. Keep policy intent and observed practice distinct.',
    sources: [
      source(
        'north-interview.txt',
        'Interviewer: What starts billing?\nNorth analyst: We wait for the customer self-bill, then reconcile quantity and price differences. I flag doubtful balances to General Ledger; GL decides provisions and write-offs.\n',
        { viewpoint: 'North AR analyst' },
      ),
      source(
        'south-interview.txt',
        'South analyst: We invoice on shipment. Logistics confirms quantity disputes. Month-end AR sends an accrual extract to General Ledger.\n',
        { viewpoint: 'South AR analyst' },
      ),
      source(
        'policy.txt',
        'Corporate policy says AR owns collection follow-up. It does not assign write-off approval.\n',
        { viewpoint: 'corporate policy owner' },
      ),
    ],
    facts: [
      ['North waits for self-bill while South invoices on shipment', 'required', 'critical', 0, 'line 2'],
      ['General Ledger, not AR, decides provisions and write-offs', 'required', 'critical', 0, 'line 2'],
      ['policy wording proves observed collection practice', 'forbidden', 'critical', 2, 'sentences 1-2'],
    ],
    variants: [
      {
        id: 'viewpoints-reordered',
        kind: 'meaning-preserving',
        replacesSourceIndexes: [0, 1],
        source: source(
          'interviews.txt',
          'South invoices on shipment and sends month-end accrual extracts to GL. North waits for customer self-bill before reconciling differences and refers doubtful balances to GL.\n',
        ),
      },
    ],
  },
  {
    id: 'supplier-onboarding-discovery',
    title: 'Supplier onboarding discovery',
    task: 'discovery',
    lane: 'mixed-evidence-discovery',
    domain: 'procurement',
    partition: 'development',
    tags: ['participant-handoffs', 'unsupported-inference', 'policy-practice-disagreement'],
    prompt:
      'Model current supplier onboarding from the interview, checklist, and dated correction. Do not treat document transmission as approval.',
    sources: [
      source(
        'interview.txt',
        'Buyer: I collect tax and bank forms, then send the pack to Vendor Risk. I only know that a response eventually arrives.\nRisk analyst: We screen the supplier and send a decision to Master Data.\n',
        { viewpoint: 'buyer and risk analyst' },
      ),
      source(
        'checklist.docx',
        'Supplier checklist: tax form; bank evidence; sanctions screening; master-data creation.',
        {
          format: 'docx',
          mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          viewpoint: 'policy checklist owner',
        },
      ),
      source(
        'dated-correction.txt',
        '2026-08-14 — Master Data lead: Procurement no longer creates vendor records; Master Data creates them after Vendor Risk approval.\n',
        { viewpoint: 'Master Data lead' },
      ),
    ],
    facts: [
      [
        'Vendor Risk decides screening and Master Data creates the record',
        'required',
        'critical',
        2,
        'dated message',
        {
          effectiveDate: '2026-08-14',
          entityScope: 'Master Data and Vendor Risk',
          caseScope: 'supplier records created on or after the correction date',
        },
      ],
      ['sending the pack establishes that Vendor Risk approved it', 'forbidden', 'critical', 0, 'buyer statement'],
    ],
    variants: [
      {
        id: 'record-owner-changed',
        kind: 'meaning-changing',
        replacesSourceIndexes: [2],
        prompt:
          'Model current supplier onboarding using the later dated correction. Buyers now create vendor records after Vendor Risk approval.',
        source: source(
          'dated-correction.txt',
          '2026-09-18 — Procurement director: Buyers now create vendor records after Vendor Risk approval.\n',
        ),
        changedAssertions: [
          {
            index: 0,
            claim: 'Vendor Risk decides screening and Buyers create the record',
            disposition: 'required',
            severity: 'critical',
            locator: 'dated message',
            epistemicStatus: 'established',
            effectiveDate: '2026-09-18',
            entityScope: 'Procurement buyers and Vendor Risk',
            caseScope: 'supplier records created on or after the correction date',
          },
        ],
      },
    ],
  },
  {
    id: 'service-incident-discovery',
    title: 'Service incident triage discovery',
    task: 'discovery',
    lane: 'mixed-evidence-discovery',
    domain: 'information-technology',
    partition: 'held-out',
    tags: ['cancellation-escalation-timeout', 'business-vs-elapsed-time', 'retries'],
    prompt:
      'Discover incident triage and escalation from the operator account and duty table. Keep unknown calendar behavior unresolved.',
    sources: [
      source(
        'operator-transcript.txt',
        'Operator: We investigate while the escalation clock runs. A lead is notified after four business hours, but investigation does not stop. If recovery fails, we try another remediation.\n',
        { viewpoint: 'service desk operator' },
      ),
      source(
        'duty-roster.csv',
        'severity,recipient\ncritical,incident commander\nhigh,team lead\nnormal,service desk\n',
        { mediaType: 'text/csv', viewpoint: 'operations roster owner' },
      ),
    ],
    facts: [
      ['escalation notification does not interrupt investigation', 'required', 'critical', 0, 'sentence 2'],
      ['four business hours can be encoded as PT4H without qualification', 'forbidden', 'critical', 0, 'sentence 2'],
    ],
  },
  {
    id: 'grant-disbursement-discovery',
    title: 'Grant disbursement discovery',
    task: 'discovery',
    lane: 'mixed-evidence-discovery',
    domain: 'nonprofit',
    partition: 'development',
    tags: ['concurrency', 'contradictory-ownership'],
    prompt:
      'Model grant disbursement using the policy and case notes. Retain the ownership dispute for release authorization.',
    sources: [
      source(
        'grant-policy.txt',
        'Finance verifies bank details while Programs verifies milestone evidence. Both checks are required before release. The policy names the CFO as release approver.\n',
        { viewpoint: 'policy owner' },
      ),
      source(
        'case-notes.txt',
        'Case G-17: Programs and Finance checks completed. The operations director authorized release because the CFO was away. No delegation record is attached.\n',
        { viewpoint: 'case worker' },
      ),
    ],
    facts: [
      [
        'program and finance checks may proceed concurrently and both are required',
        'required',
        'critical',
        0,
        'sentences 1-2',
      ],
      [
        'the case proves a general operations-director approval rule',
        'forbidden',
        'critical',
        1,
        'sentence 2',
        {
          epistemicStatus: 'disputed',
          entityScope: 'case G-17',
          caseScope: 'single observed disbursement',
          additionalEvidence: [
            {
              sourceIndex: 0,
              locator: 'sentence 3',
              stance: 'contradicts',
              entityScope: 'all grant disbursements',
              caseScope: 'policy intent',
            },
          ],
        },
      ],
    ],
  },
  {
    id: 'clinic-discharge-discovery',
    title: 'Clinic discharge discovery',
    task: 'discovery',
    lane: 'mixed-evidence-discovery',
    domain: 'healthcare',
    partition: 'held-out',
    tags: ['participant-handoffs', 'incomplete-continuations'],
    prompt:
      'Discover discharge preparation. Show what is known, and leave the missing transport continuation unresolved.',
    sources: [
      source(
        'shift-handover.txt',
        'Nurse: I prepare the medication list and teaching notes. The physician signs the discharge order. For transport cases I send a request, but I do not see what happens next.\n',
        { viewpoint: 'ward nurse' },
      ),
      source(
        'discharge-policy.txt',
        'A signed discharge order and completed patient teaching are required before the patient leaves the ward.\n',
        { viewpoint: 'clinical governance' },
      ),
    ],
    facts: [
      [
        'physician signature and patient teaching are required before departure',
        'required',
        'critical',
        1,
        'sentence 1',
      ],
      ['transport request receipt or fulfillment is established', 'forbidden', 'critical', 0, 'sentence 3'],
    ],
  },
  {
    id: 'retail-returns-discovery',
    title: 'Retail returns discovery',
    task: 'discovery',
    lane: 'mixed-evidence-discovery',
    domain: 'retail',
    partition: 'development',
    tags: ['alternatives', 'estimated-vs-mandatory-thresholds'],
    prompt:
      'Model actual returns handling while keeping the spreadsheet threshold and customer account in their dated scope.',
    sources: [
      source(
        'customer-message.txt',
        '2026-07-02: The store clerk inspected my damaged item and offered replacement or refund. I chose a refund.\n',
        { viewpoint: 'customer' },
      ),
      source(
        'returns-register.xlsx',
        [
          ['case', 'amount', 'manager_seen'],
          ['R-101', '149.00', 'yes'],
          ['R-102', '35.00', 'no'],
        ],
        {
          format: 'xlsx',
          mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          viewpoint: 'store register owner',
        },
      ),
    ],
    facts: [
      [
        'replacement and refund are alternatives for the observed damaged-item case',
        'required',
        'major',
        0,
        'sentence 1',
      ],
      ['the two register rows prove a universal manager threshold', 'forbidden', 'critical', 1, 'rows 2-3'],
      [
        'the two register rows suggest that amount may influence manager review, but establish no threshold',
        'unresolved',
        'major',
        1,
        'rows 2-3',
        {
          epistemicStatus: 'suggested',
          entityScope: 'cases R-101 and R-102',
          caseScope: 'two dated register observations only',
        },
      ],
    ],
  },
  {
    id: 'university-access-discovery',
    title: 'University access provisioning discovery',
    task: 'discovery',
    lane: 'mixed-evidence-discovery',
    domain: 'education',
    partition: 'development',
    tags: ['policy-practice-disagreement', 'cross-lane-routing'],
    prompt:
      'Discover current access provisioning and call out the unresolved difference between policy and observed routing.',
    sources: [
      source(
        'technician-interview.txt',
        'Technician: Department administrators email us approved requests. We create the account and tell the requester. We do not contact Security for ordinary access.\n',
        { viewpoint: 'IT technician' },
      ),
      source('access-policy.txt', 'Information Security must approve all new accounts before IT provisioning.\n', {
        viewpoint: 'policy owner',
      }),
    ],
    facts: [
      [
        'current practice and policy approval routes disagree',
        'required',
        'critical',
        0,
        'sentences 1-3',
        {
          epistemicStatus: 'disputed',
          entityScope: 'ordinary university access',
          caseScope: 'observed practice versus policy intent',
          additionalEvidence: [
            {
              sourceIndex: 1,
              locator: 'sentence 1',
              stance: 'supports',
              entityScope: 'all new university accounts',
              caseScope: 'policy intent',
            },
          ],
        },
      ],
      [
        'silence about Security in practice proves approval did not occur',
        'forbidden',
        'critical',
        0,
        'sentence 3',
        {
          epistemicStatus: 'unknown',
          entityScope: 'ordinary university access',
          caseScope: 'technician observation only',
          additionalEvidence: [
            {
              sourceIndex: 1,
              locator: 'sentence 1',
              stance: 'contradicts',
              entityScope: 'all new university accounts',
              caseScope: 'policy intent',
            },
          ],
        },
      ],
    ],
  },
  {
    id: 'contract-renewal-discovery',
    title: 'Contract renewal discovery',
    task: 'discovery',
    lane: 'mixed-evidence-discovery',
    domain: 'legal',
    partition: 'held-out',
    tags: ['case-vs-batch', 'long-labels'],
    prompt: 'Model one contract renewal case. Keep the monthly portfolio review outside the case flow.',
    sources: [
      source(
        'renewal-sop.txt',
        'For each contract, the account manager requests updated commercial terms, Legal reviews deviations, and the customer either signs or declines. Unsigned contracts remain open until the stated expiry date.\n',
        { viewpoint: 'legal operations' },
      ),
      source(
        'portfolio-note.txt',
        'On the first Monday each month, managers review the portfolio of contracts expiring within 90 days and assign owners.\n',
        { viewpoint: 'sales operations' },
      ),
    ],
    facts: [
      [
        'monthly portfolio assignment is not sequence flow inside one renewal case',
        'required',
        'critical',
        1,
        'sentence 1',
      ],
      ['customer decline and unsigned expiry are distinguishable outcomes', 'required', 'major', 0, 'sentence 2'],
    ],
  },
  {
    id: 'structured-bpmn-preservation',
    title: 'Structured BPMN preservation',
    task: 'legacy',
    lane: 'legacy-preservation',
    domain: 'procurement',
    partition: 'known-regression',
    overlapGroup: 'purchase-approval',
    tags: ['alternatives', 'nested-detail-views'],
    prompt:
      'Validate and render the supplied BPMN read-only. Report preservation defects; do not import it for conversational editing.',
    applicability: ['supported', 'supplied-bpmn-validation-rendering'],
    sources: [
      source('purchase-approval.bpmn', purchaseExampleBpmn, {
        mediaType: 'application/xml',
        viewpoint: 'legacy model owner',
        transformationHistory: [`copied unchanged from examples/purchase-approval.bpmn at ${baseCommit}`],
      }),
    ],
    facts: [
      [
        'the completeness rework loop is preserved',
        'required',
        'critical',
        0,
        'BPMN ids M_check, M_complete, M_missing, M_correct, M_retry',
      ],
      [
        'the approved and rejected outcomes remain distinguishable',
        'required',
        'critical',
        0,
        'BPMN ids M_approval, M_rejection, M_sent, M_rejected',
      ],
      ['validation or rendering repairs the supplied semantics', 'forbidden', 'critical', 0, 'entire artifact'],
    ],
  },
  {
    id: 'editable-flowchart-translation',
    title: 'Editable non-BPMN flowchart translation',
    task: 'legacy',
    lane: 'legacy-translation',
    domain: 'manufacturing',
    partition: 'development',
    tags: ['participant-handoffs', 'cross-lane-routing'],
    prompt: 'Propose a reviewed BPMN translation of the editable flowchart. Keep translation decisions visible.',
    applicability: ['unsupported', 'arbitrary-non-bpmn-conversion'],
    sources: [
      source(
        'return-flow.drawio',
        '<mxfile><diagram name="Return"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="Inspect returned part" vertex="1" parent="1"><mxGeometry x="80" y="80" width="160" height="60" as="geometry"/></mxCell><mxCell id="3" value="Supplier accepts?" vertex="1" parent="1"><mxGeometry x="300" y="80" width="120" height="60" as="geometry"/></mxCell><mxCell id="4" value="Send replacement" vertex="1" parent="1"><mxGeometry x="480" y="40" width="140" height="60" as="geometry"/></mxCell><mxCell id="5" value="Escalate dispute" vertex="1" parent="1"><mxGeometry x="480" y="140" width="140" height="60" as="geometry"/></mxCell><mxCell id="6" edge="1" source="2" target="3" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell><mxCell id="7" value="yes" edge="1" source="3" target="4" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell><mxCell id="8" value="no" edge="1" source="3" target="5" parent="1"><mxGeometry relative="1" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>\n',
        { mediaType: 'application/vnd.jgraph.mxfile', viewpoint: 'legacy model owner' },
      ),
    ],
    facts: [
      ['yes and no destinations remain distinguishable', 'required', 'critical', 0, 'edges 7 and 8'],
      ['the flowchart is already unambiguous BPMN', 'forbidden', 'major', 0, 'entire artifact'],
    ],
  },
  {
    id: 'vector-pdf-preservation',
    title: 'Vector PDF claims intake',
    task: 'legacy',
    lane: 'legacy-recognition',
    domain: 'insurance',
    partition: 'development',
    tags: ['participant-handoffs', 'long-labels'],
    prompt: 'Reconstruct only what the vector PDF depicts and cite ambiguous ownership.',
    applicability: ['unsupported', 'pdf-semantic-import'],
    sources: [
      source(
        'claims-intake.pdf',
        {
          labels: [
            'Claim received',
            'Broker sends documents',
            'Claims team checks completeness',
            'Return incomplete claim',
            'Register complete claim',
          ],
          layout: 'base',
        },
        { format: 'pdf', mediaType: 'application/pdf', viewpoint: 'legacy model owner' },
      ),
    ],
    facts: [
      ['the incomplete branch returns to the broker', 'required', 'critical', 0, 'visible lower branch'],
      ['the PDF establishes an approval responsibility', 'forbidden', 'critical', 0, 'entire artifact'],
    ],
    variants: [
      {
        id: 'boxes-moved',
        kind: 'meaning-preserving',
        replacesSourceIndexes: [0],
        source: source(
          'claims-intake.pdf',
          {
            labels: [
              'Claim received',
              'Broker sends documents',
              'Claims team checks completeness',
              'Return incomplete claim',
              'Register complete claim',
            ],
            layout: 'moved',
          },
          { format: 'pdf', mediaType: 'application/pdf' },
        ),
      },
    ],
  },
  {
    id: 'clean-raster-bpmn',
    title: 'Clean raster invoice BPMN',
    task: 'legacy',
    lane: 'legacy-recognition',
    domain: 'finance',
    partition: 'held-out',
    tags: ['alternatives', 'cross-lane-routing'],
    prompt: 'Recognize the clean raster BPMN diagram without assuming hidden XML or metadata.',
    applicability: ['unsupported', 'raster-ocr-conversion'],
    sources: [
      source(
        'invoice-review.png',
        { labels: ['Invoice received', 'Valid?', 'Post invoice', 'Return to supplier'], degraded: false },
        { format: 'png', mediaType: 'image/png', viewpoint: 'legacy model owner' },
      ),
    ],
    facts: [
      ['valid and invalid branches reach different destinations', 'required', 'critical', 0, 'gateway and arrows'],
      ['a raster image contains an editable BPMN source', 'forbidden', 'critical', 0, 'container format'],
    ],
  },
  {
    id: 'ambiguous-swimlane-diagram',
    title: 'Ambiguous informal swimlane diagram',
    task: 'legacy',
    lane: 'legacy-translation',
    domain: 'logistics',
    partition: 'development',
    tags: ['contradictory-ownership', 'cross-lane-routing'],
    prompt: 'Translate the informal swimlane diagram only after surfacing the ambiguous ownership of release.',
    applicability: ['unsupported', 'visual-flowchart-conversion'],
    sources: [
      source(
        'shipment-release.svg',
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="360"><rect width="800" height="180" fill="#eef5ff"/><rect y="180" width="800" height="180" fill="#fff4e8"/><text x="20" y="35">Warehouse</text><text x="20" y="215">Transport</text><rect x="140" y="70" width="180" height="60" fill="white" stroke="black"/><text x="160" y="105">Prepare shipment</text><rect x="430" y="145" width="160" height="70" fill="white" stroke="black"/><text x="455" y="185">Release load?</text><rect x="650" y="240" width="120" height="60" fill="white" stroke="black"/><text x="675" y="275">Dispatch</text><path d="M320 100 L430 180 L650 270" fill="none" stroke="black" marker-end="url(#a)"/><defs><marker id="a" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z"/></marker></defs></svg>\n',
        { mediaType: 'image/svg+xml', viewpoint: 'legacy model owner' },
      ),
    ],
    facts: [
      [
        'release ownership is ambiguous because the box crosses the lane boundary',
        'unresolved',
        'critical',
        0,
        'Release load box',
      ],
      ['vertical position alone establishes the release performer', 'forbidden', 'critical', 0, 'lane boundary'],
    ],
  },
  {
    id: 'degraded-diagram-recognition',
    title: 'Degraded cancellation diagram',
    task: 'legacy',
    lane: 'legacy-recognition',
    domain: 'travel',
    partition: 'held-out',
    tags: ['incomplete-continuations', 'cancellation-escalation-timeout'],
    prompt:
      'Recover only readable meaning from the degraded image. Mark unreadable labels and destinations as unknown.',
    applicability: ['unsupported', 'degraded-image-recognition'],
    sources: [
      source(
        'cancellation-scan.png',
        { labels: ['Booking received', 'Cancellation requested', 'Close booking', '???'], degraded: true },
        { format: 'png', mediaType: 'image/png', viewpoint: 'legacy model owner' },
      ),
    ],
    facts: [
      ['the readable branch ends at Close booking', 'required', 'critical', 0, 'readable upper-right label'],
      ['the unreadable branch destination remains unknown', 'unresolved', 'critical', 0, 'blurred lower-right label'],
      [
        'the evaluator-only reference label may be reconstructed',
        'forbidden',
        'critical',
        0,
        'blurred lower-right label',
      ],
    ],
    variants: [
      {
        id: 'recipient-removed',
        kind: 'information-removing',
        replacesSourceIndexes: [0],
        prompt:
          'Recover only readable meaning from the further degraded image. Both branch destinations are now unreadable and must remain unknown.',
        source: source(
          'cancellation-scan.png',
          { labels: ['Booking received', 'Cancellation requested', '???', '???'], degraded: true },
          { format: 'png', mediaType: 'image/png' },
        ),
        changedAssertions: [
          {
            index: 0,
            claim: 'the removed readable branch destination remains unknown',
            disposition: 'unresolved',
            severity: 'critical',
            locator: 'obscured upper-right label',
            epistemicStatus: 'unknown',
            entityScope: 'cancellation case',
            caseScope: 'further degraded raster variant',
          },
        ],
      },
    ],
  },
  {
    id: 'purchase-approval-maintenance',
    title: 'Purchase approval correction',
    task: 'maintenance',
    lane: 'conversational-correction',
    domain: 'procurement',
    partition: 'known-regression',
    overlapGroup: 'purchase-approval',
    tags: ['estimated-vs-mandatory-thresholds', 'cross-lane-routing'],
    prompt:
      'Continue the supplied session. Change the inclusive approval threshold to EUR 7,500 and rename preparation without disturbing unrelated identities.',
    sources: [
      source(
        'handoff.json',
        {
          process: 'purchase approval',
          identities: ['check', 'budget-approval', 'finance-approval', 'prepare-po'],
          threshold: 'EUR 5,000 inclusive',
          correction: 'EUR 7,500 inclusive; rename Create purchase order to Prepare purchase order',
        },
        { format: 'handoff', mediaType: 'application/json', viewpoint: 'session owner' },
      ),
    ],
    facts: [
      ['the threshold changes to EUR 7,500 inclusive', 'required', 'critical', 0, 'correction'],
      ['unaffected gateway and flow identities remain stable', 'required', 'critical', 0, 'identities'],
    ],
    variants: [
      {
        id: 'wording-only',
        kind: 'meaning-preserving',
        replacesSourceIndexes: [0],
        source: source(
          'handoff.json',
          {
            process: 'purchase approval',
            identities: ['check', 'budget-approval', 'finance-approval', 'prepare-po'],
            threshold: 'EUR 5,000 inclusive',
            correction: 'Use 7,500 EUR or more; call the creation step Prepare purchase order.',
          },
          { format: 'handoff', mediaType: 'application/json', viewpoint: 'session owner' },
        ),
      },
    ],
  },
  {
    id: 'incident-escalation-maintenance',
    title: 'Incident escalation correction',
    task: 'maintenance',
    lane: 'conversational-correction',
    domain: 'information-technology',
    partition: 'held-out',
    tags: ['business-vs-elapsed-time', 'cancellation-escalation-timeout'],
    prompt:
      'Continue the supplied session. Change the accepted elapsed escalation interval to three hours while retaining the boundary-event identity.',
    sources: [
      source(
        'handoff.json',
        {
          process: 'incident escalation',
          identities: ['investigate', 'escalation-clock', 'notify-team-lead'],
          acceptedSimplification: 'PT4H',
          correction: 'PT3H',
        },
        { format: 'handoff', mediaType: 'application/json', viewpoint: 'session owner' },
      ),
    ],
    facts: [
      ['the interval changes from PT4H to PT3H', 'required', 'critical', 0, 'correction'],
      ['the escalation-clock identity is retained', 'required', 'critical', 0, 'boundaryEventId'],
    ],
    variants: [
      {
        id: 'three-to-two-hours',
        kind: 'meaning-changing',
        replacesSourceIndexes: [0],
        prompt:
          'Continue the supplied session using the targeted correction. Change the accepted elapsed escalation interval to two hours while retaining the boundary-event identity.',
        source: source(
          'handoff.json',
          {
            process: 'incident escalation',
            identities: ['investigate', 'escalation-clock', 'notify-team-lead'],
            acceptedSimplification: 'PT4H',
            correction: 'PT2H',
          },
          { format: 'handoff', mediaType: 'application/json', viewpoint: 'session owner' },
        ),
        changedAssertions: [
          {
            index: 0,
            claim: 'the interval changes from PT4H to PT2H',
            disposition: 'required',
            severity: 'critical',
            locator: 'correction',
            epistemicStatus: 'established',
            entityScope: 'incident escalation timer',
            caseScope: 'targeted correction variant',
          },
        ],
      },
    ],
  },
  {
    id: 'account-closure-maintenance',
    title: 'Customer account closure correction',
    task: 'maintenance',
    lane: 'conversational-correction',
    domain: 'banking',
    partition: 'development',
    tags: ['concurrency', 'participant-handoffs'],
    prompt:
      'Add the approved archive notification after both balance settlement and access revocation; preserve every other identity.',
    sources: [
      source(
        'handoff.json',
        {
          process: 'account closure',
          identities: ['settle-balance', 'revoke-access', 'closure-controls-complete'],
          parallel: ['settle-balance', 'revoke-access'],
          join: 'closure-controls-complete',
          correction: 'add archive notification after join',
        },
        { format: 'handoff', mediaType: 'application/json', viewpoint: 'session owner' },
      ),
    ],
    facts: [
      ['archive notification follows synchronization of both controls', 'required', 'critical', 0, 'correction'],
      ['the two controls become sequential', 'forbidden', 'critical', 0, 'parallel'],
    ],
  },
  {
    id: 'returns-authorization-maintenance',
    title: 'Returns authorization correction',
    task: 'maintenance',
    lane: 'conversational-correction',
    domain: 'retail',
    partition: 'held-out',
    tags: ['alternatives', 'unsupported-inference'],
    prompt:
      'Remove the unsupported warehouse-approval step while preserving refund and replacement routing and unaffected identities.',
    sources: [
      source(
        'handoff.json',
        {
          process: 'returns authorization',
          identities: ['inspect', 'choose-remedy', 'refund', 'replacement'],
          unsupported: 'warehouse approval',
          correction: 'remove unsupported approval',
        },
        { format: 'handoff', mediaType: 'application/json', viewpoint: 'session owner' },
      ),
    ],
    facts: [
      ['unsupported warehouse approval is removed', 'required', 'critical', 0, 'correction'],
      ['refund and replacement remain alternatives with stable identities', 'required', 'critical', 0, 'identities'],
    ],
  },
];

function xmlEscape(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function docx(text) {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${String(
    text,
  )
    .split('\n')
    .map((line) => `<w:p><w:r><w:t>${xmlEscape(line)}</w:t></w:r></w:p>`)
    .join('')}<w:sectPr/></w:body></w:document>`;
  return Buffer.from(
    zipSync(
      {
        '[Content_Types].xml': strToU8(
          '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        ),
        '_rels/.rels': strToU8(
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        ),
        'word/document.xml': strToU8(document),
      },
      deterministicZipOptions,
    ),
  );
}

function xlsx(rows) {
  const cells = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => `<c r="${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`).join('')}</row>`,
    )
    .join('');
  return Buffer.from(
    zipSync(
      {
        '[Content_Types].xml': strToU8(
          '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        ),
        '_rels/.rels': strToU8(
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        ),
        'xl/workbook.xml': strToU8(
          '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Returns" sheetId="1" r:id="rId1"/></sheets></workbook>',
        ),
        'xl/_rels/workbook.xml.rels': strToU8(
          '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        ),
        'xl/worksheets/sheet1.xml': strToU8(
          `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${cells}</sheetData></worksheet>`,
        ),
      },
      deterministicZipOptions,
    ),
  );
}

function pdf(specification) {
  const labels = specification.labels.map((label) => String(label).replaceAll(/[()\\]/g, '\\$&'));
  const layout =
    specification.layout === 'moved'
      ? {
          start: [70, 300],
          broker: [150, 390],
          check: [350, 270],
          decision: [570, 300],
          complete: [640, 390],
          returned: [640, 150],
        }
      : {
          start: [70, 300],
          broker: [130, 270],
          check: [330, 270],
          decision: [570, 300],
          complete: [640, 390],
          returned: [640, 150],
        };
  const commands = ['0.8 w', '35 90 772 430 re S', 'BT /F1 16 Tf 55 485 Td (Claims intake legacy flow) Tj ET'];
  const box = ([x, y], width, label, fontSize = 10) =>
    commands.push(`${x} ${y} ${width} 60 re S`, `BT /F1 ${fontSize} Tf ${x + 8} ${y + 26} Td (${label}) Tj ET`);
  const circle = ([x, y]) =>
    commands.push(
      `${x + 18} ${y} m ${x + 18} ${y + 9.94} ${x + 9.94} ${y + 18} ${x} ${y + 18} c ${x - 9.94} ${y + 18} ${x - 18} ${y + 9.94} ${x - 18} ${y} c ${x - 18} ${y - 9.94} ${x - 9.94} ${y - 18} ${x} ${y - 18} c ${x + 9.94} ${y - 18} ${x + 18} ${y - 9.94} ${x + 18} ${y} c S`,
      `BT /F1 10 Tf ${x - 20} ${y - 38} Td (${labels[0]}) Tj ET`,
    );
  const diamond = ([x, y]) =>
    commands.push(
      `${x} ${y + 28} m ${x + 28} ${y} l ${x} ${y - 28} l ${x - 28} ${y} l h S`,
      `BT /F1 9 Tf ${x - 22} ${y - 43} Td (Complete?) Tj ET`,
    );
  const arrow = (points) => {
    commands.push(
      `${points[0][0]} ${points[0][1]} m ${points
        .slice(1)
        .map(([x, y]) => `${x} ${y} l`)
        .join(' ')} S`,
    );
    const [x, y] = points.at(-1);
    commands.push(`${x} ${y} m ${x - 8} ${y + 4} l ${x - 8} ${y - 4} l h f`);
  };
  circle(layout.start);
  box(layout.broker, 160, labels[1]);
  box(layout.check, 190, labels[2], 9);
  diamond(layout.decision);
  box(layout.complete, 140, labels[4]);
  box(layout.returned, 140, labels[3]);
  arrow([
    [layout.start[0] + 18, layout.start[1]],
    [layout.broker[0], layout.broker[1] + 30],
  ]);
  arrow([
    [layout.broker[0] + 160, layout.broker[1] + 30],
    [layout.check[0], layout.check[1] + 30],
  ]);
  arrow([
    [layout.check[0] + 190, layout.check[1] + 30],
    [layout.decision[0] - 28, layout.decision[1]],
  ]);
  arrow([
    [layout.decision[0] + 28, layout.decision[1]],
    [layout.complete[0], layout.complete[1] + 30],
  ]);
  arrow([
    [layout.decision[0] + 10, layout.decision[1] - 24],
    [layout.returned[0], layout.returned[1] + 30],
  ]);
  arrow([
    [layout.returned[0], layout.returned[1] + 15],
    [layout.broker[0] - 25, layout.returned[1] + 15],
    [layout.broker[0] - 25, layout.broker[1] + 15],
    [layout.broker[0], layout.broker[1] + 15],
  ]);
  commands.push(
    `BT /F1 9 Tf ${layout.complete[0] - 45} ${layout.complete[1] + 48} Td (complete) Tj ET`,
    `BT /F1 9 Tf ${layout.returned[0] - 55} ${layout.returned[1] + 48} Td (incomplete) Tj ET`,
  );
  const stream = commands.join('\n') + '\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let output = '%PDF-1.4\n%âãÏÓ\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

function handoff(session) {
  const processKey = session.process.replaceAll(/[^A-Za-z0-9_.-]+/g, '-');
  const identities = session.identities ?? ['review-current-model'];
  const nodes = [
    {
      key: 'session-start',
      type: 'startEvent',
      containerRef: processKey,
      name: 'Existing session started',
      event: { kind: 'none' },
    },
    ...identities.map((key) => ({ key, type: 'task', containerRef: processKey, name: key.replaceAll('-', ' ') })),
    {
      key: 'session-end',
      type: 'endEvent',
      containerRef: processKey,
      name: 'Existing modeled outcome',
      event: { kind: 'none' },
    },
  ];
  const flows = nodes.slice(0, -1).map((node, index) => ({
    key: `session-flow-${index + 1}`,
    containerRef: processKey,
    sourceRef: node.key,
    targetRef: nodes[index + 1].key,
  }));
  return {
    handoffVersion: '1.0.0',
    lifecycleStatus: 'Synthetic correction fixture; human correction requested but not yet applied.',
    reviewNotes: [session.correction, `Session facts: ${JSON.stringify(session)}`],
    request: {
      schemaVersion: '1.0.0',
      profileVersion: '1.0.0',
      model: {
        key: `${processKey}-model`,
        name: session.process,
        primaryRef: processKey,
        processes: [
          {
            key: processKey,
            name: session.process,
            nodes,
            flows,
            lanes: [
              {
                key: 'current-owner',
                name: 'Current modeled owner',
                parentRef: processKey,
                flowNodeRefs: nodes.map((node) => node.key),
              },
            ],
          },
        ],
      },
      evidence: [{ key: 'session-account', source: 'Synthetic session account', summary: JSON.stringify(session) }],
      links: identities.map((key) => ({
        elementRef: key,
        assertion: `Retain the existing ${key} identity unless the correction names it.`,
        basis: 'evidence',
        supportRefs: ['session-account'],
      })),
    },
  };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const bitmapFont = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '?': ['01110', '10001', '00001', '00010', '00100', '00000', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

function png(specification) {
  const width = 640;
  const height = 260;
  const pixels = Buffer.alloc((width * 3 + 1) * height, 255);
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  const set = (x, y, color = 0) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    pixels[offset] = color;
    pixels[offset + 1] = color;
    pixels[offset + 2] = color;
  };
  const line = (x1, y1, x2, y2, color = 0) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
    for (let step = 0; step <= steps; step++)
      set(Math.round(x1 + ((x2 - x1) * step) / steps), Math.round(y1 + ((y2 - y1) * step) / steps), color);
  };
  const rect = (x, y, w, h, color = 0) => {
    line(x, y, x + w, y, color);
    line(x + w, y, x + w, y + h, color);
    line(x + w, y + h, x, y + h, color);
    line(x, y + h, x, y, color);
  };
  const text = (value, x, y, color = 0) => {
    let cursor = x;
    for (const character of String(value).toUpperCase()) {
      const glyph = bitmapFont[character] ?? bitmapFont['?'];
      glyph.forEach((row, rowIndex) => {
        [...row].forEach((pixel, columnIndex) => {
          if (pixel === '1') set(cursor + columnIndex, y + rowIndex, color);
        });
      });
      cursor += 6;
    }
  };
  const centered = (value, centerX, y, color = 0) =>
    text(value, Math.round(centerX - (String(value).length * 6 - 1) / 2), y, color);
  const circle = (cx, cy, radius, color = 0) => {
    for (let angle = 0; angle < 360; angle++) {
      const radians = (angle * Math.PI) / 180;
      set(Math.round(cx + Math.cos(radians) * radius), Math.round(cy + Math.sin(radians) * radius), color);
    }
  };
  const arrow = (x1, y1, x2, y2, color = 0) => {
    line(x1, y1, x2, y2, color);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    line(
      x2,
      y2,
      Math.round(x2 - 8 * Math.cos(angle - Math.PI / 6)),
      Math.round(y2 - 8 * Math.sin(angle - Math.PI / 6)),
      color,
    );
    line(
      x2,
      y2,
      Math.round(x2 - 8 * Math.cos(angle + Math.PI / 6)),
      Math.round(y2 - 8 * Math.sin(angle + Math.PI / 6)),
      color,
    );
  };
  const ink = specification.degraded ? 105 : 0;
  rect(20, 20, 600, 220, specification.degraded ? 165 : 0);
  circle(100, 120, 20, ink);
  line(300, 90, 330, 120, ink);
  line(330, 120, 300, 150, ink);
  line(300, 150, 270, 120, ink);
  line(270, 120, 300, 90, ink);
  rect(410, 40, 180, 70, specification.degraded ? 150 : 0);
  rect(410, 160, 180, 70, specification.degraded ? 220 : 0);
  arrow(120, 120, 270, 120, ink);
  arrow(330, 120, 410, 75, specification.degraded ? 145 : 0);
  arrow(330, 120, 410, 195, specification.degraded ? 220 : 0);
  centered(specification.labels[0], 100, 148, specification.degraded ? 95 : 0);
  centered(specification.labels[1], 300, 160, specification.degraded ? 115 : 0);
  centered(specification.labels[2], 500, 70, specification.degraded ? 130 : 0);
  centered(specification.labels[3], 500, 190, specification.degraded ? 225 : 0);
  if (specification.degraded) {
    for (let x = 390; x < 620; x++) for (let y = 140; y < 240; y++) if ((x + y) % 3 === 0) set(x, y, 245);
    centered('???', 500, 190, 232);
  }
  const signature = Buffer.from('89504e470d0a1a0a', 'hex');
  const chunk = (type, data) => {
    const typeBytes = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
    return Buffer.concat([length, typeBytes, data, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const description = Buffer.from(`Description\0${specification.labels.join(' | ')}`);
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('tEXt', description),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function bytesFor(item) {
  if (item.format === 'docx') return docx(item.content);
  if (item.format === 'xlsx') return xlsx(item.content);
  if (item.format === 'pdf') return pdf(item.content);
  if (item.format === 'png') return png(item.content);
  if (item.format === 'handoff') return Buffer.from(json(handoff(item.content)));
  return Buffer.from(typeof item.content === 'string' ? item.content : json(item.content));
}

function assertionFromFact(definition, fact, index, sourceOverride) {
  const [claim, disposition, severity, sourceIndex, locator, context = {}] = fact;
  const sourceItem = sourceOverride?.source ?? definition.sources[sourceIndex];
  const sourceId = sourceOverride?.sourceId ?? `${definition.id}.source.${sourceIndex + 1}`;
  const evidence = [
    {
      sourceId,
      locator,
      stance: context.stance ?? (disposition === 'forbidden' ? 'does-not-support' : 'supports'),
      effectiveDate: context.effectiveDate ?? null,
      entityScope: context.entityScope ?? sourceItem.viewpoint,
      caseScope: context.caseScope ?? definition.title,
    },
    ...(context.additionalEvidence ?? []).map((additional) => {
      const item = definition.sources[additional.sourceIndex];
      return {
        sourceId: `${definition.id}.source.${additional.sourceIndex + 1}`,
        locator: additional.locator,
        stance: additional.stance,
        effectiveDate: additional.effectiveDate ?? null,
        entityScope: additional.entityScope ?? item.viewpoint,
        caseScope: additional.caseScope ?? definition.title,
      };
    }),
  ];
  return {
    id: `${definition.id}.assertion.${index + 1}`,
    claim,
    disposition,
    severity,
    dimension: assessmentDimensions[index % assessmentDimensions.length],
    epistemicStatus:
      context.epistemicStatus ??
      (disposition === 'required' ? 'established' : disposition === 'permitted-scope-choice' ? 'suggested' : 'unknown'),
    evidence,
    outputLocations: ['BPMN semantics', 'SVG preview', 'Quality Report', 'final delivery claims'],
    evaluation: definition.automated?.[index]
      ? { kind: 'automated', ...definition.automated[index] }
      : {
          kind: 'agent',
          instructions:
            'Inspect the cited source and externally observable candidate artifacts; do not infer from candidate plausibility.',
        },
  };
}

await mkdir(casesRoot, { recursive: true });
const manifestCases = [];
for (const definition of cases) {
  const directory = join(casesRoot, definition.id);
  await mkdir(join(directory, 'inputs'), { recursive: true });
  await mkdir(join(directory, 'reviewer'), { recursive: true });
  const assertions = definition.facts.map((fact, index) => assertionFromFact(definition, fact, index));
  const inventory = [];
  for (let index = 0; index < definition.sources.length; index++) {
    const item = definition.sources[index];
    const bytes = bytesFor(item);
    const target = join(directory, 'inputs', item.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    inventory.push({
      id: `${definition.id}.source.${index + 1}`,
      path: `inputs/${item.path}`,
      mediaType: item.mediaType,
      sha256: hash(bytes),
      role: item.role,
      viewpoint: item.viewpoint,
      provenance: item.provenance,
      transformationHistory: item.transformationHistory,
    });
  }
  const variants = [];
  const variantAssertions = [];
  for (const variant of definition.variants ?? []) {
    const bytes = bytesFor(variant.source);
    const path = `variants/${variant.id}/${variant.source.path}`;
    const sourceId = `${definition.id}.variant.${variant.id}.source.1`;
    const replacesSourceIds = variant.replacesSourceIndexes.map((index) => {
      if (!definition.sources[index]) throw new Error(`${definition.id}/${variant.id}: unknown replacement source.`);
      return `${definition.id}.source.${index + 1}`;
    });
    const target = join(directory, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    const changed = variant.changedAssertions ?? [];
    const changedIndexes = new Set(changed.map((item) => item.index));
    if (variant.kind === 'meaning-preserving' && changed.length)
      throw new Error(`${definition.id}/${variant.id}: meaning-preserving variant changes assertions.`);
    if (variant.kind !== 'meaning-preserving' && !changed.length)
      throw new Error(`${definition.id}/${variant.id}: targeted variant needs changed assertions.`);
    variants.push({
      id: variant.id,
      kind: variant.kind,
      partition: definition.partition,
      prompt: variant.prompt ?? definition.prompt,
      replacesSourceIds,
      inputArtifacts: [
        {
          id: sourceId,
          path,
          mediaType: variant.source.mediaType,
          sha256: hash(bytes),
          role: variant.source.role,
          viewpoint: variant.source.viewpoint,
          provenance: variant.source.provenance,
          transformationHistory: variant.source.transformationHistory,
        },
      ],
      stableAssertionIds: assertions.filter((_, index) => !changedIndexes.has(index)).map((assertion) => assertion.id),
      changedAssertionIds: changed.map((item) => assertions[item.index].id),
    });
    if (changed.length)
      variantAssertions.push({
        variantId: variant.id,
        assertions: changed.map((item) =>
          assertionFromFact(
            definition,
            [item.claim, item.disposition, item.severity, 0, item.locator, item],
            item.index,
            { source: variant.source, sourceId },
          ),
        ),
      });
  }
  const [supportStatus, capability] = definition.applicability ?? ['supported', 'source-driven-modeling-session'];
  const caseContract = {
    caseVersion: '1.0.0',
    familyId: definition.id,
    caseId: `${definition.id}.base`,
    title: definition.title,
    primaryTask: definition.task,
    evaluationLane: definition.lane,
    businessDomain: definition.domain,
    partition: definition.partition,
    upstreamOverlapGroup: definition.overlapGroup ?? definition.id,
    knownRegression: definition.partition === 'known-regression',
    difficultyTags: [
      definition.partition === 'known-regression'
        ? 'adversarial'
        : ['discovery', 'legacy'].includes(definition.task)
          ? 'challenging'
          : 'routine',
      definition.sources.length > 1 ? 'multi-source' : 'single-source',
    ],
    coverage: Object.fromEntries(definition.tags.map((tag) => [tag, [assertions[0].id]])),
    task: {
      prompt: definition.prompt,
      scope: { requested: definition.title, excluded: ['process improvement unless explicitly requested'] },
      clarificationAnswers: [],
      correctionTurns: definition.task === 'maintenance' ? [definition.prompt] : [],
    },
    applicability: {
      status: supportStatus,
      capability,
      reason:
        supportStatus === 'supported'
          ? 'Within the current declared public boundary.'
          : 'Exploratory corpus probe; current product contract does not implement this conversion.',
      fixedBeforeExecution: true,
    },
    sourceArtifacts: inventory,
    reviewerMaterial: 'reviewer/assertions.json',
    variants,
    reviewStatus: {
      machineIntegrity: 'pass-at-authored-version',
      independentAgentReview: 'completed-for-consistency',
      expertAdjudication: 'not_run',
      humanUsabilityReview: 'not_run',
    },
  };
  const reviewer = {
    reviewVersion: '1.0.0',
    familyId: definition.id,
    canary: `reviewer-only-canary-${hash(definition.id).slice(0, 16)}`,
    authoredIndependentlyOfCandidate: true,
    assertions,
    variantAssertions,
    reviewRubric: {
      version: '1.0.0',
      criteria: [
        {
          id: 'comprehension',
          question: 'Can a reviewer identify ownership, branching, and completion without author assistance?',
          scale: ['clear', 'partly clear', 'unclear'],
          citationRequired: true,
        },
        {
          id: 'ambiguity',
          question: 'Are material unknowns and competing interpretations visible rather than silently resolved?',
          scale: ['explicit', 'partly explicit', 'hidden'],
          citationRequired: true,
        },
        {
          id: 'correction-effort',
          question: 'How much measured reviewer effort was required to reach an acceptable correction?',
          scale: ['no correction', 'minor correction', 'major correction', 'not measured'],
          citationRequired: true,
        },
      ],
    },
    acceptableAlternatives: definition.alternatives ?? [
      'Any BPMN topology is acceptable when it preserves every assertion and does not add forbidden meaning.',
    ],
    observedResults: [],
  };
  if (definition.reviewerReference) {
    const referenceBytes = Buffer.from(definition.reviewerReference);
    await writeFile(join(directory, 'reviewer', 'reference.bpmn'), referenceBytes);
    reviewer.referenceArtifacts = [
      { path: 'reference.bpmn', mediaType: 'application/xml', sha256: hash(referenceBytes) },
    ];
  }
  await writeFile(join(directory, 'case.json'), json(caseContract));
  await writeFile(join(directory, 'reviewer', 'assertions.json'), json(reviewer));
  manifestCases.push({ familyId: definition.id, case: `cases/${definition.id}/case.json` });
}

const smokeCases = ['pmo-customer-order', 'supplier-onboarding-discovery', 'purchase-approval-maintenance'];
const smokeCampaign = {
  runContractVersion: '1.0.0',
  campaignId: 'pilot-smoke-2026-09-21',
  predeclared: true,
  cases: smokeCases,
  attemptsPerCase: 3,
  candidate: {
    source: 'main',
    commit: 'bf84f92aaf43c8a735bd29cb4a2a70791b0eda05',
    dirtyState: 'clean-at-predeclaration',
  },
  host: { kind: 'Codex desktop', filesystemIsolation: 'not_available', reviewerFilesAccessible: true },
  model: { id: 'not_observed', reasoningSettings: 'not_observed' },
  skill: { version: 'not_observed' },
  metrics: { tokens: null, cost: null, humanCorrectionMinutes: null },
  attempts: smokeCases.flatMap((familyId) =>
    Array.from({ length: 3 }, (_, index) => ({
      attemptId: `${familyId}.attempt.${index + 1}`,
      familyId,
      attempt: index + 1,
      status: 'not_run',
      isolation: 'not_isolated',
      reason:
        'No reviewer-blind host/filesystem sandbox was available in the implementation environment; no session result is fabricated.',
      prompt: cases.find((item) => item.id === familyId).prompt,
      answers: [],
      startedAt: null,
      finishedAt: null,
      commands: [],
      exitResults: [],
      artifacts: [],
      conversation: [],
      toolCalls: [],
      finalClaims: [],
    })),
  ),
};
await mkdir(join(root, 'runs'), { recursive: true });
await writeFile(join(root, 'runs', 'smoke-campaign.json'), json(smokeCampaign));
await writeFile(
  join(root, 'pilot.json'),
  json({
    corpusVersion: '1.0.0',
    title: 'OpenBPMN evidence-grounded pilot corpus',
    familyCount: 24,
    taskAllocation: { description: 6, discovery: 8, legacy: 6, maintenance: 4 },
    coverage,
    publicSourceRequirements: { minimumFamilies: 4, minimumCollections: 2 },
    cases: manifestCases,
    smokeCampaign: 'runs/smoke-campaign.json',
    technicalFixturesExcludedFromFamilyCount: [
      '../composition/manifest.json',
      '../compatibility/analysis/manifest.json',
    ],
  }),
);
console.log(`Built ${manifestCases.length} corpus families in ${root}`);
