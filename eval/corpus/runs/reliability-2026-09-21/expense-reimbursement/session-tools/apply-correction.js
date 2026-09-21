import fs from 'node:fs';

const baselinePath = 'initial/expense-reimbursement.openbpmn.json';
const baselineHandoff = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const handoff = structuredClone(baselineHandoff);
const request = handoff.request;

function exactlyOne(items, predicate, description) {
  const matches = items.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${description}; found ${matches.length}.`);
  }
  return matches[0];
}

const processModel = exactlyOne(
  request.model.processes,
  (item) => item.key === 'expenseReimbursementProcess',
  'expense reimbursement process'
);

const requiredFlow = exactlyOne(
  processModel.flows,
  (item) => item.key === 'controllerRequired',
  'controller-required flow'
);
const complementaryFlow = exactlyOne(
  processModel.flows,
  (item) => item.key === 'controllerNotRequired',
  'controller-not-required flow'
);

if (
  requiredFlow.name !== 'Above EUR 2,000' ||
  requiredFlow.condition !== 'Claim amount is greater than EUR 2,000.' ||
  complementaryFlow.name !== 'EUR 2,000 or less' ||
  complementaryFlow.condition !== 'Claim amount is less than or equal to EUR 2,000.'
) {
  throw new Error('Baseline threshold does not match the expected saved handoff.');
}

requiredFlow.name = 'EUR 2,500 or more';
requiredFlow.condition = 'Claim amount is greater than or equal to EUR 2,500.';
complementaryFlow.name = 'Below EUR 2,500';
complementaryFlow.condition = 'Claim amount is less than EUR 2,500.';

request.evidence.push({
  key: 'correctionSource',
  source: 'Later expense reimbursement correction dated 2026-09-21',
  summary: 'Finance-controller approval applies at EUR 2,500 or more, and the complementary route is below EUR 2,500; unrelated work and identities must remain unchanged.',
  locator: 'inputs/correction.txt'
});

request.decisions.push({
  key: 'controllerThresholdCorrectionDecision',
  description: 'Replace the controller threshold with EUR 2,500 or more and the complementary route with below EUR 2,500 while preserving every unrelated element identity and behavior.',
  elementRefs: ['controllerThresholdGateway', 'controllerRequired', 'controllerNotRequired', 'decideControllerApproval'],
  evidenceRefs: ['correctionSource']
});

const requiredLink = exactlyOne(
  request.links,
  (item) => item.elementRef === 'controllerRequired',
  'controller-required evidence link'
);
requiredLink.assertion = 'Controller approval is required when the claim amount is EUR 2,500 or more.';
requiredLink.basis = 'decision';
requiredLink.supportRefs = ['controllerThresholdCorrectionDecision'];

const complementaryLink = exactlyOne(
  request.links,
  (item) => item.elementRef === 'controllerNotRequired',
  'controller-not-required evidence link'
);
complementaryLink.assertion = 'The complementary route covers claim amounts below EUR 2,500.';
complementaryLink.basis = 'decision';
complementaryLink.supportRefs = ['controllerThresholdCorrectionDecision'];

const lowScenario = exactlyOne(
  request.scenarios,
  (item) => item.key === 'lowValueApprovedClaim',
  'lower-value scenario'
);
lowScenario.name = 'Complete claim below EUR 2,500 is approved';
lowScenario.expectedOutcome = 'For a claim below EUR 2,500, the controller route is bypassed, Accounts Payable records payment after manager approval, and the employee is notified.';
lowScenario.evidenceRefs = [...new Set([...lowScenario.evidenceRefs, 'correctionSource'])];

const highScenario = exactlyOne(
  request.scenarios,
  (item) => item.key === 'highValueApprovedClaim',
  'higher-value scenario'
);
highScenario.name = 'Complete claim at EUR 2,500 or more is approved';
highScenario.expectedOutcome = 'For a claim at EUR 2,500 or more, both required approvals are present before Accounts Payable records payment and sends notice.';
highScenario.evidenceRefs = [...new Set([...highScenario.evidenceRefs, 'correctionSource'])];

handoff.reviewNotes = [
  ...(handoff.reviewNotes || []),
  'Correction applied on 2026-09-21: controller approval at EUR 2,500 or more; complementary route below EUR 2,500; unrelated identities and work preserved.'
];

const baselineProcess = exactlyOne(
  baselineHandoff.request.model.processes,
  (item) => item.key === 'expenseReimbursementProcess',
  'baseline expense reimbursement process'
);

const unchangedFlowKeys = baselineProcess.flows
  .map((flow) => flow.key)
  .filter((key) => key !== 'controllerRequired' && key !== 'controllerNotRequired');
for (const key of unchangedFlowKeys) {
  const before = exactlyOne(baselineProcess.flows, (item) => item.key === key, `baseline flow ${key}`);
  const after = exactlyOne(processModel.flows, (item) => item.key === key, `corrected flow ${key}`);
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Unrelated flow changed: ${key}`);
  }
}

if (JSON.stringify(baselineProcess.nodes) !== JSON.stringify(processModel.nodes)) {
  throw new Error('An unrelated node changed during correction.');
}
if (JSON.stringify(baselineProcess.lanes) !== JSON.stringify(processModel.lanes)) {
  throw new Error('An unrelated lane changed during correction.');
}

process.stdout.write(`${JSON.stringify(handoff)}\n`);
