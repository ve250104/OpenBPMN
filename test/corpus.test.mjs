import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const repository = new URL('../', import.meta.url);
const entrypoint = new URL('../eval/corpus/run.mjs', import.meta.url);
const cli = new URL('../dist/cli.js', import.meta.url);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const agentObservation = (assertionId, sourceArtifact, sourceLocator, outputLocator) => ({
  assertionId,
  method: 'agent',
  methodDescription: 'Independent evidence-to-output comparison using the reviewer ledger.',
  status: 'pass',
  reviewer: { identity: 'test-review-agent', role: 'evaluation reviewer' },
  sourceCitations: [{ artifact: sourceArtifact, locator: sourceLocator }],
  outputCitations: [{ artifact: 'finalClaims', locator: outputLocator }],
  adjudicationStatus: 'proposed',
});

async function corpus(...args) {
  const result = await execute(process.execPath, [entrypoint.pathname, ...args], {
    cwd: repository,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(result.stdout);
}

async function openbpmn(...args) {
  const result = await execute(process.execPath, [cli.pathname, ...args], {
    cwd: repository,
    maxBuffer: 8 * 1024 * 1024,
  });
  return JSON.parse(result.stdout);
}

async function rejectedCorpus(...args) {
  try {
    await corpus(...args);
    assert.fail('Expected the corpus operation to be rejected.');
  } catch (error) {
    return JSON.parse(error.stdout);
  }
}

async function assessExpenseXml(parent, xml, includeSvg = true) {
  const prepared = join(parent, 'prepared');
  await corpus('prepare', '--case', 'expense-reimbursement', '--output', prepared, '--json');
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  const attemptDirectory = join(prepared, 'attempt-1');
  await mkdir(attemptDirectory);
  await writeFile(join(attemptDirectory, 'model.bpmn'), xml);
  const labelBounds = /<bpmndi:BPMNLabel><dc:Bounds x="([^"]+)" y="([^"]+)"/.exec(xml);
  const labelX = labelBounds?.[1] ?? '535';
  const labelY = labelBounds?.[2] ?? '50';
  const svg =
    typeof includeSvg === 'string'
      ? includeSvg
      : `<svg xmlns="http://www.w3.org/2000/svg"><g data-element-id="F_controller_label" style="display: block;" transform="matrix(1 0 0 1 ${labelX} ${labelY})"><text><tspan>Above EUR 2,000</tspan></text></g></svg>`;
  if (includeSvg) await writeFile(join(attemptDirectory, 'model.svg'), svg);
  Object.assign(run, {
    runId: 'expense-reliability-check',
    attemptCount: 1,
    attempts: [
      {
        attemptId: 'attempt-1',
        phase: 'initial',
        status: 'completed',
        startedAt: '2026-09-21T10:00:00.000Z',
        finishedAt: '2026-09-21T10:01:00.000Z',
        commands: ['openbpmn generate'],
        exitResults: [{ command: 'openbpmn generate', exitCode: 0 }],
        artifacts: [
          { kind: 'bpmn', path: 'attempt-1/model.bpmn', sha256: digest(xml) },
          ...(includeSvg ? [{ kind: 'svg', path: 'attempt-1/model.svg', sha256: digest(svg) }] : []),
        ],
        conversation: [],
        toolCalls: [],
        finalClaims: [],
        observations: [],
      },
    ],
  });
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  return corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
}

test('the public corpus entry point validates the complete diverse pilot', async () => {
  const result = await corpus('validate', '--json');
  assert.equal(result.status, 'pass');
  assert.equal(result.version, '2.0.0');
  assert.deepEqual(result.familiesByTask, {
    description: 6,
    discovery: 8,
    legacy: 6,
    maintenance: 4,
  });
  assert.equal(result.families, 24);
  assert.ok(result.domains >= 6);
  assert.ok(result.maximumFamiliesInOneDomain <= 6);
  assert.ok(result.publicFamilies >= 4);
  assert.ok(result.publicCollections >= 2);
  assert.deepEqual(result.missingCoverage, []);
  assert.deepEqual(result.epistemicStatuses, ['disputed', 'established', 'suggested', 'unknown']);
  assert.deepEqual(result.assertionDispositions, ['forbidden', 'permitted-scope-choice', 'required', 'unresolved']);
  assert.deepEqual(result.difficultyTags, ['adversarial', 'challenging', 'multi-source', 'routine', 'single-source']);
  assert.deepEqual(result.sourceReview, {
    familiesReviewed: 24,
    ledgerFacts: 19,
    adjudication: 'proposed-not-expert',
  });
  assert.equal(result.maintenancePreconditions.length, 6);
  assert.ok(result.maintenancePreconditions.every((item) => item.status === 'pass'));
  assert.deepEqual(result.freshSessions, {
    planned: 3,
    completed: 2,
    unsupported: 1,
    notRun: 0,
    isolation: 'not_enforced',
  });
});

test('all maintenance starting handoffs and variants generate, validate, and preserve bundle identities', async () => {
  const fixtures = [
    [
      'account-closure-maintenance/inputs/handoff.json',
      [
        '<bpmn:parallelGateway id="M_closure-controls-split"',
        '<bpmn:parallelGateway id="M_closure-controls-join"',
        'sourceRef="M_closure-controls-split" targetRef="M_settle-balance"',
        'sourceRef="M_closure-controls-split" targetRef="M_revoke-access"',
        'sourceRef="M_settle-balance" targetRef="M_closure-controls-join"',
        'sourceRef="M_revoke-access" targetRef="M_closure-controls-join"',
      ],
    ],
    [
      'incident-escalation-maintenance/inputs/handoff.json',
      [
        '<bpmn:boundaryEvent id="M_escalation-clock"',
        'attachedToRef="M_investigate"',
        'cancelActivity="false"',
        '<bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT4H</bpmn:timeDuration>',
      ],
    ],
    [
      'incident-escalation-maintenance/variants/three-to-two-hours/handoff.json',
      [
        '<bpmn:boundaryEvent id="M_escalation-clock"',
        'attachedToRef="M_investigate"',
        'cancelActivity="false"',
        '<bpmn:timeDuration xsi:type="bpmn:tFormalExpression">PT3H</bpmn:timeDuration>',
      ],
    ],
    [
      'purchase-approval-maintenance/inputs/handoff.json',
      [
        '<bpmn:exclusiveGateway id="M_approval-threshold"',
        'default="M_below-threshold"',
        'sourceRef="M_approval-threshold" targetRef="M_finance-approval"',
        'amount &gt;= 5000',
        'name="Below EUR 5,000"',
      ],
    ],
    [
      'purchase-approval-maintenance/variants/wording-only/handoff.json',
      [
        '<bpmn:exclusiveGateway id="M_approval-threshold"',
        'default="M_below-threshold"',
        'sourceRef="M_approval-threshold" targetRef="M_finance-approval"',
        'amount &gt;= 5000',
        'name="Below EUR 5,000"',
      ],
    ],
    [
      'returns-authorization-maintenance/inputs/handoff.json',
      [
        '<bpmn:task id="M_warehouse-approval"',
        '<bpmn:exclusiveGateway id="M_choose-remedy"',
        'default="M_replacement-route"',
        'sourceRef="M_choose-remedy" targetRef="M_refund"',
        'remedy = refund',
        'sourceRef="M_choose-remedy" targetRef="M_replacement"',
      ],
    ],
  ];
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-maintenance-products-')));
  for (const [relativeInput, expectedBpmn] of fixtures) {
    const id = relativeInput.replaceAll(/[^a-z0-9]+/gi, '-');
    const input = new URL(`../eval/corpus/cases/${relativeInput}`, import.meta.url).pathname;
    const stem = join(parent, id);
    const handoffPath = `${stem}.openbpmn.json`;
    const generated = await openbpmn('generate', '--input', input, '--output', stem, '--handoff', handoffPath);
    assert.equal(generated.signal, 'clean_export_ready', relativeInput);
    const validated = await openbpmn('validate', '--input', `${stem}.bpmn`);
    assert.equal(validated.signal, 'validation_completed', relativeInput);
    const bpmn = await readFile(`${stem}.bpmn`, 'utf8');
    for (const expected of expectedBpmn)
      assert.ok(bpmn.includes(expected), `${relativeInput}: emitted BPMN lost ${expected}.`);
    const source = JSON.parse(await readFile(input, 'utf8'));
    const handoff = JSON.parse(await readFile(handoffPath, 'utf8'));
    const quality = JSON.parse(await readFile(`${stem}.quality.json`, 'utf8'));
    assert.deepEqual(handoff.request, source.request, `${relativeInput}: output Handoff changed the request.`);
    assert.deepEqual(handoff.lastReport, quality, `${relativeInput}: Handoff and Quality Report differ.`);
    assert.equal(quality.modelKey, source.request.model.key, relativeInput);
    for (const check of ['xml', 'xsd', 'semantics', 'profile', 'di', 'render'])
      assert.equal(quality.checks.find((item) => item.id === check).status, 'passed', `${relativeInput}: ${check}`);
  }
});

test('preparation stages only permitted inputs and records the missing isolation boundary', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-prepare-'));
  const output = join(parent, 'staged');
  const result = await corpus(
    'prepare',
    '--case',
    'supplier-onboarding-discovery',
    '--variant',
    'record-owner-changed',
    '--output',
    output,
    '--json',
  );
  assert.equal(result.status, 'ready');
  assert.equal(result.isolation.status, 'not_isolated');
  assert.equal(result.isolation.reviewerFilesAccessibleFromHost, true);
  assert.ok(result.caseSha256);
  assert.ok(result.assertionSha256);
  const staged = await readdir(output, { recursive: true });
  assert.ok(staged.includes('task.json'));
  assert.ok(staged.includes('run.json'));
  assert.ok(staged.includes('inputs/checklist.docx'));
  assert.ok(staged.includes('variant/dated-correction.txt'));
  assert.ok(!staged.includes('inputs/dated-correction.txt'));
  assert.ok(!staged.some((path) => path.includes('reviewer') || path.includes('assertion')));
  const run = JSON.parse(await readFile(join(output, 'run.json'), 'utf8'));
  assert.equal(run.runContractVersion, '2.0.0');
  assert.equal(run.familyId, 'supplier-onboarding-discovery');
  assert.equal(run.variantId, 'record-owner-changed');
  assert.deepEqual(run.attempts, []);
  const visible = await Promise.all(
    staged
      .filter((path) => !path.endsWith('/'))
      .map((path) => readFile(join(output, path)).catch(() => Buffer.alloc(0))),
  );
  assert.ok(!Buffer.concat(visible).includes('reviewer-only-canary-'));
});

test('assessment rejects legacy run records instead of regrading them with current assertions', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-legacy-run-'));
  const prepared = join(parent, 'prepared');
  await corpus('prepare', '--case', 'expense-reimbursement', '--output', prepared, '--json');
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  run.runContractVersion = '1.0.0';
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  const result = await rejectedCorpus(
    'assess',
    '--run',
    runPath,
    '--output',
    join(parent, 'assessment.json'),
    '--json',
  );
  assert.match(result.error, /version 1 records require evaluator 1\.x and are never regraded/);
});

test('assessment retains failed attempts, detects known semantic defects, and accepts identity-independent alternatives', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-assess-'));
  const prepared = join(parent, 'prepared');
  await corpus('prepare', '--case', 'expense-reimbursement', '--output', prepared, '--json');
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  const reference = await readFile(
    new URL('../eval/corpus/cases/expense-reimbursement/reviewer/reference.bpmn', import.meta.url),
    'utf8',
  );
  const defective = reference
    .replace(
      '<bpmn:flowNodeRef>Approve</bpmn:flowNodeRef></bpmn:lane>',
      '<bpmn:flowNodeRef>Pay</bpmn:flowNodeRef></bpmn:lane>',
    )
    .replace('name="Pay approved claim"', 'name="Send decision to Procurement Director"')
    .replace('sourceRef="ApprovalDecision" targetRef="Rejected"', 'sourceRef="ApprovalDecision" targetRef="Paid"')
    .replace('sourceRef="Approve" targetRef="ApprovalDecision"', 'sourceRef="ApprovalDecision" targetRef="Approve"')
    .replace('amount &gt; 2000', 'amount &gt;= 2000')
    .replace('<bpmn:exclusiveGateway id="Threshold"', '<bpmn:parallelGateway id="Threshold"')
    .replace(
      '</bpmn:exclusiveGateway><bpmn:userTask id="ControllerApprove"',
      '</bpmn:parallelGateway><bpmn:userTask id="ControllerApprove"',
    )
    .replace(/<bpmndi:BPMNLabel><dc:Bounds x="535" y="50" width="110" height="20"\/><\/bpmndi:BPMNLabel>/, '');
  let alternative = reference;
  for (const id of [
    'Start',
    'Check',
    'Approve',
    'ApprovalDecision',
    'Threshold',
    'ControllerApprove',
    'Pay',
    'Paid',
    'Rejected',
    'F1',
    'F2',
    'F3',
    'F_reject',
    'F_approved',
    'F_standard',
    'F_controller',
    'F4',
    'F5',
  ]) {
    alternative = alternative.replaceAll(`="${id}"`, `="Alt_${id}"`).replaceAll(`>${id}<`, `>Alt_${id}<`);
  }
  const attempts = [
    ['attempt-1', defective],
    ['attempt-2', reference],
    ['attempt-3', alternative],
  ];
  run.runId = 'expense-grader-check';
  run.attemptCount = attempts.length;
  run.attempts = [];
  for (const [attemptId, xml] of attempts) {
    const directory = join(prepared, attemptId);
    await mkdir(directory);
    const path = join(directory, 'model.bpmn');
    await writeFile(path, xml);
    const flowId = xml.includes('id="Alt_F_controller"') ? 'Alt_F_controller' : 'F_controller';
    const renderedSvg = `<svg xmlns="http://www.w3.org/2000/svg"><g data-element-id="${flowId}_label" style="display: block;" transform="matrix(1 0 0 1 535 50)"><text><tspan>Above EUR 2,000</tspan></text></g></svg>`;
    await writeFile(join(directory, 'model.svg'), renderedSvg);
    run.attempts.push({
      attemptId,
      phase: 'initial',
      status: 'completed',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:01:00.000Z',
      commands: ['openbpmn generate'],
      exitResults: [{ command: 'openbpmn generate', exitCode: 0 }],
      artifacts: [
        { kind: 'bpmn', path: `${attemptId}/model.bpmn`, sha256: digest(xml) },
        { kind: 'svg', path: `${attemptId}/model.svg`, sha256: digest(renderedSvg) },
      ],
      conversation: [],
      toolCalls: [],
      finalClaims: [],
      observations: [],
    });
  }
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  const result = await corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
  assert.equal(result.status, 'complete');
  assert.equal(result.attempts.length, 3);
  assert.equal(result.attempts[0].status, 'fail');
  assert.deepEqual(result.attempts[0].findings.map((finding) => finding.code).sort(), [
    'approval_bypass',
    'invented_recipient',
    'missing_required_approval',
    'missing_required_branch',
    'swapped_decision_destination',
    'threshold_or_negation_changed',
    'wrong_approver',
    'wrong_gateway_behavior',
  ]);
  assert.equal(result.attempts[1].status, 'pass');
  assert.equal(result.attempts[2].status, 'pass');
  assert.deepEqual(result.summary.statuses, { fail: 1, pass: 2 });
});

test('public assessment accepts declared paraphrases, neutral task types, and changed generated identities', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-faithful-alternative-'));
  let xml = await readFile(
    new URL('../eval/corpus/cases/expense-reimbursement/reviewer/reference.bpmn', import.meta.url),
    'utf8',
  );
  xml = xml
    .replace(
      '<bpmn:userTask id="Approve" name="Approve business purpose"/>',
      '<bpmn:task id="RenamedApprove" name="Validate business purpose"/>',
    )
    .replaceAll('>Approve<', '>RenamedApprove<')
    .replaceAll('="Approve"', '="RenamedApprove"');
  const result = await assessExpenseXml(parent, xml);
  assert.equal(result.attempts[0].status, 'pass');
  assert.equal(result.summary.supportedProduct.passed, 1);
});

test('public assessment detects a direct payment bypass independently of other defects', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-bypass-'));
  const reference = await readFile(
    new URL('../eval/corpus/cases/expense-reimbursement/reviewer/reference.bpmn', import.meta.url),
    'utf8',
  );
  const xml = reference.replace(
    '</bpmn:process>',
    '<bpmn:sequenceFlow id="F_bypass" sourceRef="Start" targetRef="Pay"/></bpmn:process>',
  );
  const result = await assessExpenseXml(parent, xml);
  assert.deepEqual(
    result.attempts[0].findings.map((finding) => finding.code),
    ['approval_bypass'],
  );
});

test('public assessment isolates unreachable work, wrong ownership, and a missing required outcome', async () => {
  const reference = await readFile(
    new URL('../eval/corpus/cases/expense-reimbursement/reviewer/reference.bpmn', import.meta.url),
    'utf8',
  );
  const regressions = [
    [
      'unreachable-required-work',
      reference.replace(/<bpmn:sequenceFlow id="F_controller"[\s\S]*?<\/bpmn:sequenceFlow>/, ''),
      'missing_required_approval',
    ],
    [
      'wrong-ownership',
      reference
        .replace(
          '<bpmn:flowNodeRef>Rejected</bpmn:flowNodeRef></bpmn:lane>',
          '<bpmn:flowNodeRef>Rejected</bpmn:flowNodeRef><bpmn:flowNodeRef>Approve</bpmn:flowNodeRef></bpmn:lane>',
        )
        .replace(
          '<bpmn:lane id="Lane_Manager" name="Line manager"><bpmn:flowNodeRef>Approve</bpmn:flowNodeRef>',
          '<bpmn:lane id="Lane_Manager" name="Line manager">',
        ),
      'wrong_approver',
    ],
    [
      'missing-required-outcome',
      reference.replace(/<bpmn:sequenceFlow id="F_reject"[\s\S]*?<\/bpmn:sequenceFlow>/, ''),
      'missing_required_branch',
    ],
  ];
  for (const [name, xml, expectedCode] of regressions) {
    const parent = await mkdtemp(join(tmpdir(), `openbpmn-corpus-${name}-`));
    const result = await assessExpenseXml(parent, xml);
    assert.ok(
      result.attempts[0].findings.some((finding) => finding.code === expectedCode),
      name,
    );
  }
});

test('public assessment binds branch conditions to destinations and checks threshold boundaries', async () => {
  const reference = await readFile(
    new URL('../eval/corpus/cases/expense-reimbursement/reviewer/reference.bpmn', import.meta.url),
    'utf8',
  );
  const swappedParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-swapped-condition-'));
  const swapped = reference
    .replace('amount &lt;= 2000', 'TEMP_CONDITION')
    .replace('amount &gt; 2000', 'amount &lt;= 2000')
    .replace('TEMP_CONDITION', 'amount &gt; 2000');
  const swappedResult = await assessExpenseXml(swappedParent, swapped);
  assert.ok(swappedResult.attempts[0].findings.some((finding) => finding.code === 'threshold_or_negation_changed'));

  const destinationParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-swapped-destination-'));
  const destinationsSwapped = reference
    .replace('>not approved</bpmn:conditionExpression>', '>TEMP_APPROVAL</bpmn:conditionExpression>')
    .replace('>approved</bpmn:conditionExpression>', '>not approved</bpmn:conditionExpression>')
    .replace('>TEMP_APPROVAL</bpmn:conditionExpression>', '>approved</bpmn:conditionExpression>');
  const destinationResult = await assessExpenseXml(destinationParent, destinationsSwapped);
  assert.equal(
    destinationResult.attempts[0].findings.filter((finding) => finding.code === 'swapped_decision_destination').length,
    2,
  );

  const inclusiveParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-inclusive-condition-'));
  const inclusive = reference.replace('amount &gt; 2000', 'amount &gt;= 2000');
  const inclusiveResult = await assessExpenseXml(inclusiveParent, inclusive);
  const threshold = inclusiveResult.attempts[0].assertions.find(
    (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.5',
  );
  assert.equal(threshold.status, 'fail');
  assert.deepEqual(
    threshold.measurements.samples.map((sample) => sample.value),
    [1999, 2000, 2001],
  );

  const reversedParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-reversed-operands-'));
  const reversed = reference.replace('amount &gt; 2000', '2000 &lt; amount');
  const reversedResult = await assessExpenseXml(reversedParent, reversed);
  assert.equal(
    reversedResult.attempts[0].assertions.find(
      (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.5',
    ).status,
    'pass',
  );
});

test('public assessment reports unknown expressions and ambiguous element bindings as unresolved', async () => {
  const reference = await readFile(
    new URL('../eval/corpus/cases/expense-reimbursement/reviewer/reference.bpmn', import.meta.url),
    'utf8',
  );
  const expressionParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-unknown-expression-'));
  const unknownExpression = reference.replace('amount &gt; 2000', 'amount is materially above policy limit');
  const expressionResult = await assessExpenseXml(expressionParent, unknownExpression);
  assert.equal(
    expressionResult.attempts[0].assertions.find(
      (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.5',
    ).status,
    'unresolved',
  );

  const unknownDecisionParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-unknown-decision-expression-'));
  const unknownDecision = reference.replace(
    '>not approved</bpmn:conditionExpression>',
    '>manager outcome negative</bpmn:conditionExpression>',
  );
  const unknownDecisionResult = await assessExpenseXml(unknownDecisionParent, unknownDecision);
  assert.equal(
    unknownDecisionResult.attempts[0].assertions.find(
      (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.11',
    ).status,
    'unresolved',
  );

  const duplicateParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-ambiguous-binding-'));
  const duplicate = reference
    .replace(
      '<bpmn:flowNodeRef>Approve</bpmn:flowNodeRef></bpmn:lane>',
      '<bpmn:flowNodeRef>Approve</bpmn:flowNodeRef><bpmn:flowNodeRef>ApproveDuplicate</bpmn:flowNodeRef></bpmn:lane>',
    )
    .replace(
      '<bpmn:userTask id="Approve" name="Approve business purpose"/>',
      '<bpmn:userTask id="Approve" name="Approve business purpose"/><bpmn:userTask id="ApproveDuplicate" name="Approve business purpose"/>',
    );
  const duplicateResult = await assessExpenseXml(duplicateParent, duplicate);
  assert.equal(
    duplicateResult.attempts[0].assertions.find(
      (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.1',
    ).status,
    'unresolved',
  );

  const specializedParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-unsupported-specialization-'));
  const specialized = reference.replace(
    '<bpmn:userTask id="Approve" name="Approve business purpose"/>',
    '<bpmn:serviceTask id="Approve" name="Approve business purpose"/>',
  );
  const specializedResult = await assessExpenseXml(specializedParent, specialized);
  const specialization = specializedResult.attempts[0].assertions.find(
    (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.1',
  );
  assert.equal(specialization.status, 'unresolved');
  assert.match(specialization.reason, /specialization/);
});

test('public assessment measures BPMN DI and binds claimed SVG identity instead of accepting label XML presence', async () => {
  const reference = await readFile(
    new URL('../eval/corpus/cases/expense-reimbursement/reviewer/reference.bpmn', import.meta.url),
    'utf8',
  );
  const noRenderParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-no-render-'));
  const noRenderResult = await assessExpenseXml(noRenderParent, reference, false);
  assert.equal(
    noRenderResult.attempts[0].assertions.find(
      (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.7',
    ).status,
    'unavailable',
  );
  const unrelatedRenderParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-unrelated-render-'));
  const unrelatedRenderResult = await assessExpenseXml(
    unrelatedRenderParent,
    reference,
    '<svg xmlns="http://www.w3.org/2000/svg"><g data-element-id="other_label" style="display: block;" transform="matrix(1 0 0 1 535 50)"><text>Above EUR 2,000</text></g></svg>',
  );
  assert.equal(
    unrelatedRenderResult.attempts[0].assertions.find(
      (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.7',
    ).status,
    'fail',
  );

  const detachedParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-detached-label-'));
  const detached = reference.replace('x="535" y="50" width="110"', 'x="10000" y="10000" width="110"');
  const detachedResult = await assessExpenseXml(detachedParent, detached);
  assert.ok(detachedResult.attempts[0].findings.some((finding) => finding.code === 'detached_label'));

  const missingParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-missing-label-'));
  const missing = reference.replace(
    /<bpmndi:BPMNLabel><dc:Bounds x="535" y="50" width="110" height="20"\/><\/bpmndi:BPMNLabel>/,
    '',
  );
  const missingResult = await assessExpenseXml(missingParent, missing);
  assert.equal(
    missingResult.attempts[0].assertions.find(
      (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.7',
    ).status,
    'unavailable',
  );

  const movedParent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-moved-label-control-'));
  const moved = reference
    .replace('x="525" y="95"', 'x="1525" y="1095"')
    .replace('x="600" y="80"', 'x="1600" y="1080"')
    .replace('x="535" y="50"', 'x="1535" y="1050"');
  const movedResult = await assessExpenseXml(movedParent, moved);
  assert.equal(
    movedResult.attempts[0].assertions.find(
      (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.7',
    ).status,
    'pass',
  );
});

test('public assessment verifies label association in retained actual generated renders', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-actual-render-'));
  const retained = new URL('../eval/corpus/runs/reliability-2026-09-21/expense-reimbursement/', import.meta.url)
    .pathname;
  const prepared = join(parent, 'expense-reimbursement');
  await cp(retained, prepared, { recursive: true });
  const result = await corpus(
    'assess',
    '--run',
    join(prepared, 'run.json'),
    '--output',
    join(parent, 'reassessment.json'),
    '--json',
  );
  const initialLabel = result.attempts[0].assertions.find(
    (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.7',
  );
  const correctedLabel = result.attempts[2].assertions.find(
    (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.14',
  );
  assert.equal(initialLabel.status, 'pass');
  assert.equal(initialLabel.measurements.visibleInRender, true);
  assert.equal(correctedLabel.status, 'pass');
  assert.equal(correctedLabel.measurements.visibleInRender, true);
  assert.equal(result.attempts[2].preservation.status, 'pass');
});

test('expense correction enforces the EUR 2,500 boundary and rejects unrelated changes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-expense-correction-'));
  const prepared = join(parent, 'prepared');
  await corpus('prepare', '--case', 'expense-reimbursement', '--output', prepared, '--json');
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  const baseline = await readFile(
    new URL('../eval/corpus/cases/expense-reimbursement/reviewer/reference.bpmn', import.meta.url),
    'utf8',
  );
  const corrected = baseline
    .replace('name="EUR 2,000 or less"', 'name="Below EUR 2,500"')
    .replace('amount &lt;= 2000', 'amount &lt; 2500')
    .replace('name="Above EUR 2,000"', 'name="EUR 2,500 or more"')
    .replace('amount &gt; 2000', 'amount &gt;= 2500');
  const unrelated = corrected.replace('name="Pay approved claim"', 'name="Send decision to Procurement Director"');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg"><g data-element-id="F_controller_label" style="display: block;" transform="matrix(1 0 0 1 535 50)"><text><tspan>EUR 2,500 or more</tspan></text></g></svg>';
  run.runId = 'expense-correction-preservation';
  run.attemptCount = 2;
  run.attempts = [];
  for (const [attemptId, candidate] of [
    ['attempt-1', corrected],
    ['attempt-2', unrelated],
  ]) {
    const directory = join(prepared, attemptId);
    await mkdir(directory);
    await writeFile(join(directory, 'baseline.bpmn'), baseline);
    await writeFile(join(directory, 'model.bpmn'), candidate);
    await writeFile(join(directory, 'model.svg'), svg);
    run.attempts.push({
      attemptId,
      phase: 'correction',
      status: 'completed',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:01:00.000Z',
      commands: ['openbpmn generate'],
      exitResults: [{ command: 'openbpmn generate', exitCode: 0 }],
      artifacts: [
        { kind: 'baseline-bpmn', path: `${attemptId}/baseline.bpmn`, sha256: digest(baseline) },
        { kind: 'bpmn', path: `${attemptId}/model.bpmn`, sha256: digest(candidate) },
        { kind: 'svg', path: `${attemptId}/model.svg`, sha256: digest(svg) },
      ],
      conversation: [],
      toolCalls: [],
      finalClaims: [],
      observations: [],
    });
  }
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  const result = await corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
  assert.equal(result.attempts[0].status, 'pass');
  assert.equal(result.attempts[0].preservation.status, 'pass');
  const highBranch = result.attempts[0].assertions.find(
    (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.13',
  );
  assert.equal(highBranch.status, 'pass');
  assert.deepEqual(
    highBranch.measurements.samples.map((sample) => [sample.value, sample.observed]),
    [
      [2499, false],
      [2500, true],
      [2501, true],
    ],
  );
  const complement = result.attempts[0].assertions.find(
    (assertion) => assertion.assertionId === 'expense-reimbursement.assertion.15',
  );
  assert.equal(complement.status, 'pass');
  assert.deepEqual(
    complement.measurements.samples.map((sample) => [sample.value, sample.observed]),
    [
      [2499, true],
      [2500, false],
      [2501, false],
    ],
  );
  assert.equal(result.attempts[1].status, 'fail');
  assert.deepEqual(result.attempts[1].preservation.violations, [{ code: 'stable_element_changed', elementId: 'Pay' }]);
});

test('variant assessment applies only declared expectation changes and retains auditable review records', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-variant-'));
  const prepared = join(parent, 'prepared');
  await corpus(
    'prepare',
    '--case',
    'supplier-onboarding-discovery',
    '--variant',
    'record-owner-changed',
    '--output',
    prepared,
    '--json',
  );
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  run.runId = 'supplier-variant-check';
  run.attemptCount = 1;
  run.metrics.humanCorrectionMinutes = 12;
  run.attempts = [
    {
      attemptId: 'attempt-1',
      phase: 'initial',
      status: 'completed',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:01:00.000Z',
      commands: [],
      exitResults: [],
      artifacts: [],
      conversation: [],
      toolCalls: [],
      finalClaims: ['Vendor Risk decides screening; Buyers create the record after approval.'],
      observations: [
        agentObservation(
          'supplier-onboarding-discovery.assertion.1',
          'variant/dated-correction.txt',
          'dated message',
          'claim 1',
        ),
        agentObservation(
          'supplier-onboarding-discovery.assertion.2',
          'inputs/interview.txt',
          'buyer statement',
          'claim 1',
        ),
        ...[3, 4, 5].map((number) =>
          agentObservation(
            `supplier-onboarding-discovery.assertion.${number}`,
            'inputs/regional-interview.txt',
            `assertion ${number} source passage`,
            'claim 1',
          ),
        ),
      ],
    },
  ];
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  const result = await corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
  assert.equal(result.attempts[0].status, 'pass');
  assert.equal(
    result.attempts[0].assertions.find(
      (assertion) => assertion.assertionId === 'supplier-onboarding-discovery.assertion.1',
    ).claim,
    'Vendor Risk decides screening and Buyers create the record',
  );
  assert.deepEqual(
    result.reviewRubric.criteria.map((criterion) => criterion.id),
    ['comprehension', 'ambiguity', 'correction-effort'],
  );
  assert.equal(result.summary.correctionMinutes, 12);
});

test('reporting keeps unsupported execution, proposed review, and missing human review separate', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-report-matrix-'));
  const prepared = join(parent, 'prepared');
  await corpus('prepare', '--case', 'editable-flowchart-translation', '--output', prepared, '--json');
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  run.runId = 'unsupported-exploratory-probe';
  run.attemptCount = 1;
  run.attempts = [
    {
      attemptId: 'attempt-1',
      phase: 'initial',
      status: 'completed',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:01:00.000Z',
      commands: [],
      exitResults: [],
      artifacts: [],
      conversation: [],
      toolCalls: [],
      finalClaims: ['Exploratory translation completed; automatic conversion remains unsupported.'],
      observations: [1, 2, 3, 4].map((number) =>
        agentObservation(
          `editable-flowchart-translation.assertion.${number}`,
          'inputs/return-flow.drawio',
          `assertion ${number} source region`,
          'claim 1',
        ),
      ),
    },
  ];
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  const result = await corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
  assert.equal(result.assessmentVersion, '2.0.0');
  assert.equal(result.applicability.status, 'unsupported');
  assert.equal(result.attempts[0].status, 'partial');
  assert.deepEqual(result.summary.humanChecks, { requested: 1, completed: 0, missing: 1 });
  assert.deepEqual(result.summary.reviewState, {
    proposedAgentChecks: 4,
    recordedHumanChecks: 0,
    adjudicatedChecks: 0,
  });
  assert.deepEqual(result.summary.supportedProduct, {
    applicable: false,
    denominator: 0,
    passed: 0,
    qualified: false,
  });
});

test('maintenance preservation requires a paired baseline and detects unrelated semantic changes', async () => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-corpus-preservation-')));
  const prepared = join(parent, 'prepared');
  await corpus('prepare', '--case', 'incident-escalation-maintenance', '--output', prepared, '--json');
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  const evidence = join(prepared, 'evidence');
  await mkdir(evidence);
  const sourceHandoff = join(prepared, 'inputs', 'handoff.json');
  const correctedInput = join(evidence, 'corrected-input.json');
  const correctedHandoff = JSON.parse(await readFile(sourceHandoff, 'utf8'));
  correctedHandoff.lifecycleStatus = 'Synthetic correction fixture; the requested timer correction has been applied.';
  correctedHandoff.request.model.processes[0].nodes.find((node) => node.key === 'escalation-clock').event.timeDuration =
    'PT3H';
  await writeFile(correctedInput, JSON.stringify(correctedHandoff, null, 2) + '\n');
  const baselineStem = join(evidence, 'baseline');
  const correctedStem = join(evidence, 'corrected');
  const baselineOutputHandoff = join(evidence, 'baseline.openbpmn.json');
  const correctedOutputHandoff = join(evidence, 'corrected.openbpmn.json');
  await openbpmn('generate', '--input', sourceHandoff, '--output', baselineStem, '--handoff', baselineOutputHandoff);
  await openbpmn('generate', '--input', correctedInput, '--output', correctedStem, '--handoff', correctedOutputHandoff);
  const corrected = await readFile(`${correctedStem}.bpmn`, 'utf8');
  const unrelated = corrected.replace('name="Investigate incident"', 'name="Replace unrelated investigation"');
  const forbiddenMutableChange = corrected.replace(
    'attachedToRef="M_investigate"',
    'attachedToRef="M_notify-team-lead"',
  );
  await writeFile(join(evidence, 'unrelated.bpmn'), unrelated);
  await writeFile(join(evidence, 'forbidden-mutable-change.bpmn'), forbiddenMutableChange);
  const strippedHandoff = JSON.parse(await readFile(correctedOutputHandoff, 'utf8'));
  strippedHandoff.request.evidence = [];
  await writeFile(join(evidence, 'stripped-state.openbpmn.json'), JSON.stringify(strippedHandoff, null, 2) + '\n');
  const artifact = async (kind, path) => ({ kind, path, sha256: digest(await readFile(join(prepared, path))) });
  const candidateArtifacts = async (
    bpmnPath = 'evidence/corrected.bpmn',
    handoffPath = 'evidence/corrected.openbpmn.json',
  ) => [
    await artifact('handoff', handoffPath),
    await artifact('bpmn', bpmnPath),
    await artifact('svg', 'evidence/corrected.svg'),
    await artifact('quality-report', 'evidence/corrected.quality.json'),
  ];
  const baselineArtifacts = async () => [
    await artifact('starting-handoff', 'inputs/handoff.json'),
    await artifact('baseline-handoff', 'evidence/baseline.openbpmn.json'),
    await artifact('baseline-bpmn', 'evidence/baseline.bpmn'),
    await artifact('baseline-svg', 'evidence/baseline.svg'),
    await artifact('baseline-quality-report', 'evidence/baseline.quality.json'),
  ];
  run.runId = 'paired-correction-check';
  run.attemptCount = 5;
  run.attempts = [];
  for (const [attemptId, bpmnPath, includeBaseline, handoffPath] of [
    ['attempt-1', 'evidence/corrected.bpmn', false, 'evidence/corrected.openbpmn.json'],
    ['attempt-2', 'evidence/corrected.bpmn', true, 'evidence/corrected.openbpmn.json'],
    ['attempt-3', 'evidence/unrelated.bpmn', true, 'evidence/corrected.openbpmn.json'],
    ['attempt-4', 'evidence/forbidden-mutable-change.bpmn', true, 'evidence/corrected.openbpmn.json'],
    ['attempt-5', 'evidence/corrected.bpmn', true, 'evidence/stripped-state.openbpmn.json'],
  ]) {
    run.attempts.push({
      attemptId,
      phase: 'correction',
      status: 'completed',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:01:00.000Z',
      commands: ['openbpmn generate'],
      exitResults: [{ command: 'openbpmn generate', exitCode: 0 }],
      artifacts: [
        ...(includeBaseline ? await baselineArtifacts() : []),
        ...(await candidateArtifacts(bpmnPath, handoffPath)),
      ],
      conversation: [],
      toolCalls: [],
      finalClaims: [],
      observations: [1, 2, 3].map((number) =>
        agentObservation(
          `incident-escalation-maintenance.assertion.${number}`,
          'inputs/handoff.json',
          `assertion ${number} source`,
          bpmnPath,
        ),
      ),
    });
  }
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  const result = await corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
  assert.equal(result.attempts[0].status, 'partial');
  assert.equal(result.attempts[0].preservation.status, 'unavailable');
  assert.equal(result.attempts[1].status, 'pass');
  assert.equal(result.attempts[1].preservation.status, 'pass');
  assert.equal(result.attempts[2].status, 'fail');
  assert.deepEqual(result.attempts[2].preservation.violations, [
    { code: 'stable_element_changed', elementId: 'M_investigate' },
  ]);
  assert.deepEqual(result.attempts[3].preservation.violations, [
    { code: 'mutable_element_changed_outside_contract', elementId: 'M_escalation-clock' },
  ]);
  assert.ok(
    result.attempts[4].preservation.violations.some(
      (violation) => violation.code === 'handoff_non_model_state_changed',
    ),
  );
  assert.deepEqual(result.summary.preservation, { pass: 1, fail: 3, unavailable: 1 });
});

test('account, purchase base and variant, and returns corrections pass exact paired preservation', async () => {
  const scenarios = [
    {
      familyId: 'account-closure-maintenance',
      mutate(handoff) {
        const process = handoff.request.model.processes[0];
        process.nodes.push({
          key: 'archive-notification',
          type: 'task',
          containerRef: process.key,
          name: 'Send archive notification',
        });
        process.flows.find((flow) => flow.key === 'closure-complete').targetRef = 'archive-notification';
        process.flows.push({
          key: 'archive-complete',
          containerRef: process.key,
          sourceRef: 'archive-notification',
          targetRef: 'session-end',
        });
        process.lanes[0].flowNodeRefs.push('archive-notification');
        handoff.request.links.push({
          elementRef: 'archive-notification',
          assertion: 'Send the approved archive notification after both closure controls complete.',
          basis: 'evidence',
          supportRefs: ['session-account'],
        });
      },
    },
    {
      familyId: 'purchase-approval-maintenance',
      mutate(handoff) {
        const process = handoff.request.model.processes[0];
        process.nodes.find((node) => node.key === 'approval-threshold').name = 'At least EUR 7,500?';
        process.nodes.find((node) => node.key === 'prepare-po').name = 'Prepare purchase order';
        const required = process.flows.find((flow) => flow.key === 'approval-required');
        required.name = 'EUR 7,500 or more';
        required.condition = 'amount >= 7500';
        process.flows.find((flow) => flow.key === 'below-threshold').name = 'Below EUR 7,500';
      },
    },
    {
      familyId: 'purchase-approval-maintenance',
      variantId: 'wording-only',
      mutate(handoff) {
        const process = handoff.request.model.processes[0];
        process.nodes.find((node) => node.key === 'approval-threshold').name = 'At least EUR 7,500?';
        process.nodes.find((node) => node.key === 'prepare-po').name = 'Prepare purchase order';
        const required = process.flows.find((flow) => flow.key === 'approval-required');
        required.name = 'EUR 7,500 or more';
        required.condition = 'amount >= 7500';
        process.flows.find((flow) => flow.key === 'below-threshold').name = 'Below EUR 7,500';
      },
    },
    {
      familyId: 'returns-authorization-maintenance',
      mutate(handoff) {
        const process = handoff.request.model.processes[0];
        process.nodes = process.nodes.filter((node) => node.key !== 'warehouse-approval');
        process.flows = process.flows.filter((flow) => flow.key !== 'approval-complete');
        process.flows.find((flow) => flow.key === 'inspection-complete').targetRef = 'choose-remedy';
        for (const lane of process.lanes)
          lane.flowNodeRefs = lane.flowNodeRefs.filter((nodeRef) => nodeRef !== 'warehouse-approval');
        handoff.request.links = handoff.request.links.filter((link) => link.elementRef !== 'warehouse-approval');
      },
    },
  ];
  for (const scenario of scenarios) {
    const parent = await realpath(await mkdtemp(join(tmpdir(), `openbpmn-${scenario.familyId}-correction-`)));
    const prepared = join(parent, 'prepared');
    await corpus(
      'prepare',
      '--case',
      scenario.familyId,
      ...(scenario.variantId ? ['--variant', scenario.variantId] : []),
      '--output',
      prepared,
      '--json',
    );
    const sourcePath = join(prepared, scenario.variantId ? 'variant' : 'inputs', 'handoff.json');
    const corrected = JSON.parse(await readFile(sourcePath, 'utf8'));
    scenario.mutate(corrected);
    corrected.lifecycleStatus = 'Synthetic correction fixture; the requested correction has been applied.';
    const correctedInput = join(prepared, 'corrected-input.json');
    await writeFile(correctedInput, JSON.stringify(corrected, null, 2) + '\n');
    const baselineStem = join(prepared, 'baseline');
    const candidateStem = join(prepared, 'candidate');
    await openbpmn(
      'generate',
      '--input',
      sourcePath,
      '--output',
      baselineStem,
      '--handoff',
      join(prepared, 'baseline.openbpmn.json'),
    );
    await openbpmn(
      'generate',
      '--input',
      correctedInput,
      '--output',
      candidateStem,
      '--handoff',
      join(prepared, 'candidate.openbpmn.json'),
    );
    const artifact = async (kind, path) => ({ kind, path, sha256: digest(await readFile(join(prepared, path))) });
    const sourceArtifact = scenario.variantId ? 'variant/handoff.json' : 'inputs/handoff.json';
    const reviewer = JSON.parse(
      await readFile(
        new URL(`../eval/corpus/cases/${scenario.familyId}/reviewer/assertions.json`, import.meta.url),
        'utf8',
      ),
    );
    const runPath = join(prepared, 'run.json');
    const run = JSON.parse(await readFile(runPath, 'utf8'));
    run.runId = `${scenario.familyId}-${scenario.variantId ?? 'base'}-correction`;
    run.attemptCount = 1;
    run.attempts = [
      {
        attemptId: 'attempt-1',
        phase: 'correction',
        status: 'completed',
        startedAt: '2026-09-21T10:00:00.000Z',
        finishedAt: '2026-09-21T10:01:00.000Z',
        commands: ['openbpmn generate'],
        exitResults: [{ command: 'openbpmn generate', exitCode: 0 }],
        artifacts: [
          await artifact('starting-handoff', sourceArtifact),
          await artifact('baseline-handoff', 'baseline.openbpmn.json'),
          await artifact('baseline-bpmn', 'baseline.bpmn'),
          await artifact('baseline-svg', 'baseline.svg'),
          await artifact('baseline-quality-report', 'baseline.quality.json'),
          await artifact('handoff', 'candidate.openbpmn.json'),
          await artifact('bpmn', 'candidate.bpmn'),
          await artifact('svg', 'candidate.svg'),
          await artifact('quality-report', 'candidate.quality.json'),
        ],
        conversation: [],
        toolCalls: [],
        finalClaims: ['The requested correction was applied and unrelated semantics were preserved.'],
        observations: reviewer.assertions.map((assertion) =>
          agentObservation(assertion.id, sourceArtifact, assertion.claim, 'claim 1'),
        ),
      },
    ];
    await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
    const result = await corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
    assert.equal(result.attempts[0].status, 'pass', `${scenario.familyId}/${scenario.variantId ?? 'base'}`);
    assert.equal(result.attempts[0].preservation.status, 'pass');
  }
});

test('assessment accepts a declared scope choice without forcing one topology', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-scope-choice-'));
  const prepared = join(parent, 'prepared');
  await corpus('prepare', '--case', 'pmo-customer-order', '--output', prepared, '--json');
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  run.runId = 'scope-choice-check';
  run.attemptCount = 1;
  run.attempts = [
    {
      attemptId: 'attempt-1',
      phase: 'initial',
      status: 'completed',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:01:00.000Z',
      commands: [],
      exitResults: [],
      artifacts: [],
      conversation: [],
      toolCalls: [],
      finalClaims: ['Sales staff and customer support are represented as one responsibility group.'],
      observations: [1, 2, 3, 4].map((number) =>
        agentObservation(
          `pmo-customer-order.assertion.${number}`,
          'inputs/description.txt',
          `assertion ${number} source passage`,
          'claim 1',
        ),
      ),
    },
  ];
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  const result = await corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
  const scopeChoice = result.attempts[0].assertions.find(
    (assertion) => assertion.disposition === 'permitted-scope-choice',
  );
  assert.equal(result.attempts[0].status, 'pass');
  assert.equal(scopeChoice.status, 'pass');
  assert.match(scopeChoice.claim, /one responsibility group or separate lanes/);
});

test('assessment re-hashes staged source evidence and blocks stale-input claims', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-stale-source-'));
  const prepared = join(parent, 'prepared');
  await corpus('prepare', '--case', 'pmo-customer-order', '--output', prepared, '--json');
  const sourcePath = join(prepared, 'inputs', 'description.txt');
  const original = await readFile(sourcePath, 'utf8');
  const altered = `${original}\nAltered after preparation.\n`;
  await writeFile(sourcePath, altered);
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  run.runId = 'stale-source-check';
  run.sourceArtifacts[0].sha256 = digest(altered);
  run.attemptCount = 1;
  run.attempts = [
    {
      attemptId: 'attempt-1',
      phase: 'initial',
      status: 'completed',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:01:00.000Z',
      commands: [],
      exitResults: [],
      artifacts: [],
      conversation: [],
      toolCalls: [],
      finalClaims: [],
      observations: [],
    },
  ];
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  const result = await corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
  assert.equal(result.identities.sources, 'stale');
  assert.equal(result.identities.sourceArtifacts[0].identity, 'stale');
  assert.deepEqual(result.inputFindings.map((finding) => finding.code).sort(), [
    'source_identity_mismatch',
    'stale_source_hash',
  ]);
  assert.equal(result.attempts[0].status, 'blocked');
  assert.equal(result.summary.criticalFailures, 2);
});

test('assessment binds the declared source inventory to the selected variant contract', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-source-inventory-'));
  const prepared = join(parent, 'prepared');
  await corpus(
    'prepare',
    '--case',
    'supplier-onboarding-discovery',
    '--variant',
    'record-owner-changed',
    '--output',
    prepared,
    '--json',
  );
  const runPath = join(prepared, 'run.json');
  const run = JSON.parse(await readFile(runPath, 'utf8'));
  run.runId = 'missing-source-declaration-check';
  run.sourceArtifacts = run.sourceArtifacts.slice(1);
  run.attemptCount = 1;
  run.attempts = [
    {
      attemptId: 'attempt-1',
      phase: 'initial',
      status: 'completed',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:01:00.000Z',
      commands: [],
      exitResults: [],
      artifacts: [],
      conversation: [],
      toolCalls: [],
      finalClaims: [],
      observations: [],
    },
  ];
  await writeFile(runPath, JSON.stringify(run, null, 2) + '\n');
  const result = await corpus('assess', '--run', runPath, '--output', join(parent, 'assessment.json'), '--json');
  assert.equal(result.identities.sources, 'missing');
  assert.ok(result.inputFindings.some((finding) => finding.code === 'missing_source_declaration'));
  assert.equal(result.attempts[0].status, 'blocked');
});

test('comparison labels mismatched runs and keeps failed, partial, unsupported, and unavailable evidence visible', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-compare-'));
  const common = {
    assessmentVersion: '1.0.0',
    status: 'complete',
    familyId: 'expense-reimbursement',
    caseId: 'expense-reimbursement.base',
    variantId: null,
    identities: {
      caseSha256: 'case-a',
      assertionSha256: 'assertions-a',
      sourceArtifacts: [{ id: 'source', sha256: 'source-a' }],
      case: 'current',
      assertions: 'current',
      sources: 'current',
    },
    candidate: { commit: 'candidate-a' },
    environment: { runtime: 'v24.19.0', platform: 'darwin', architecture: 'arm64', browser: 'not_observed' },
    skill: { version: 'skill-a' },
    model: { id: 'model-a', reasoningSettings: 'high' },
    isolation: { status: 'not_isolated' },
  };
  const baseline = {
    ...common,
    runId: 'baseline',
    attempts: [
      { attemptId: 'a1', status: 'fail', assertions: [], findings: [{ severity: 'critical' }] },
      { attemptId: 'a2', status: 'partial', assertions: [], findings: [] },
    ],
    summary: {
      attemptCount: 2,
      statuses: { fail: 1, partial: 1 },
      criticalFailures: 1,
      dimensions: { readability: { pass: 1, not_run: 1 } },
      correctionMinutes: null,
    },
  };
  const candidate = {
    ...common,
    runId: 'candidate',
    identities: { ...common.identities, sourceArtifacts: [{ id: 'source', sha256: 'source-b' }], case: 'stale' },
    model: { id: 'model-b', reasoningSettings: 'high' },
    attempts: [{ attemptId: 'b1', status: 'unsupported', assertions: [], findings: [] }],
    summary: {
      attemptCount: 1,
      statuses: { unsupported: 1 },
      criticalFailures: 0,
      dimensions: { readability: { unsupported: 1 } },
      correctionMinutes: null,
    },
  };
  const baselinePath = join(parent, 'baseline.json');
  const candidatePath = join(parent, 'candidate.json');
  await writeFile(baselinePath, JSON.stringify(baseline));
  await writeFile(candidatePath, JSON.stringify(candidate));
  const result = await corpus(
    'compare',
    '--baseline',
    baselinePath,
    '--candidate',
    candidatePath,
    '--output',
    join(parent, 'comparison.json'),
    '--json',
  );
  assert.equal(result.status, 'complete');
  assert.equal(result.comparability, 'mismatched');
  assert.deepEqual(result.mismatches.map((mismatch) => mismatch.field).sort(), ['model.id', 'sourceArtifacts']);
  assert.deepEqual(result.runs.baseline.statuses, { fail: 1, partial: 1 });
  assert.deepEqual(result.runs.candidate.statuses, { unsupported: 1 });
  assert.equal(result.runs.baseline.correctionMinutes, null);
  assert.equal(result.runs.candidate.correctionMinutes, null);
  assert.equal(result.delta, null);
});

test('comparison identifies a scorer revision as a grading change rather than product improvement', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-grading-change-'));
  const report = {
    assessmentVersion: '2.0.0',
    evaluatorRevision: '1.0.0',
    status: 'complete',
    familyId: 'expense-reimbursement',
    caseId: 'expense-reimbursement.base',
    variantId: null,
    runId: 'saved-artifacts',
    identities: {
      caseSha256: 'case-a',
      assertionSha256: 'assertions-a',
      sourceArtifacts: [{ id: 'source', path: 'inputs/source.txt', sha256: 'source-a' }],
      case: 'current',
      assertions: 'current',
      sources: 'current',
    },
    candidate: { commit: 'same-candidate' },
    environment: { runtime: 'v24.19.0', platform: 'darwin', architecture: 'arm64', browser: 'chrome-140' },
    skill: { version: 'skill-a' },
    model: { id: 'model-a', reasoningSettings: 'high' },
    isolation: { status: 'isolated' },
    attempts: [{ attemptId: 'a1', status: 'pass', assertions: [], findings: [] }],
    summary: {
      attemptCount: 1,
      statuses: { pass: 1 },
      criticalFailures: 0,
      dimensions: {},
      correctionMinutes: null,
    },
  };
  const baselinePath = join(parent, 'baseline.json');
  const candidatePath = join(parent, 'candidate.json');
  await writeFile(baselinePath, JSON.stringify(report));
  await writeFile(candidatePath, JSON.stringify({ ...report, evaluatorRevision: '2.0.0' }));
  const result = await corpus(
    'compare',
    '--baseline',
    baselinePath,
    '--candidate',
    candidatePath,
    '--output',
    join(parent, 'comparison.json'),
    '--json',
  );
  assert.equal(result.comparability, 'grading-change');
  assert.equal(result.comparisonClass, 'exploratory');
  assert.equal(result.grading.changed, true);
  assert.equal(result.grading.candidateImprovementClaimAllowed, false);
  assert.equal(result.delta, null);
  assert.match(result.interpretation, /grading changes, not candidate improvements/);
});

test('integrity validation rejects broken evidence contracts rather than accepting schema-shaped placeholders', async () => {
  const sourceRoot = new URL('../eval/corpus/', import.meta.url);
  const mutations = [
    {
      name: 'missing evidence locator',
      file: 'cases/expense-reimbursement/reviewer/assertions.json',
      mutate(value) {
        delete value.assertions[0].evidence[0].locator;
      },
      expected: /locator/i,
    },
    {
      name: 'missing epistemic status',
      file: 'cases/supplier-onboarding-discovery/reviewer/assertions.json',
      mutate(value) {
        delete value.assertions[0].epistemicStatus;
      },
      expected: /reviewer schema invalid/i,
    },
    {
      name: 'missing variant expectation override',
      file: 'cases/supplier-onboarding-discovery/reviewer/assertions.json',
      mutate(value) {
        value.variantAssertions = [];
      },
      expected: /missing reviewer expectations/i,
    },
    {
      name: 'cross-partition derivative',
      file: 'cases/pmo-customer-order/case.json',
      mutate(value) {
        value.variants[0].partition = 'held-out';
      },
      expected: /variant crosses partition/i,
    },
    {
      name: 'unknown replacement source',
      file: 'cases/pmo-customer-order/case.json',
      mutate(value) {
        value.variants[0].replacesSourceIds = ['pmo-customer-order.source.missing'];
      },
      expected: /variant replaces an unknown source/i,
    },
    {
      name: 'contradictory expectation',
      file: 'cases/expense-reimbursement/reviewer/assertions.json',
      mutate(value) {
        value.assertions.push({
          ...structuredClone(value.assertions[0]),
          id: 'expense-reimbursement.assertion.conflict',
          disposition: 'forbidden',
        });
      },
      expected: /contradictory expected assertion/i,
    },
    {
      name: 'invalid applicability',
      file: 'cases/clean-raster-bpmn/case.json',
      mutate(value) {
        value.applicability.status = 'passed';
      },
      expected: /applicability\/status/i,
    },
    {
      name: 'missing redistribution terms',
      file: 'cases/pmo-customer-order/case.json',
      mutate(value) {
        delete value.sourceArtifacts[0].provenance.rights;
      },
      expected: /provenance.*rights/i,
    },
  ];
  for (const mutation of mutations) {
    const parent = await mkdtemp(join(tmpdir(), 'openbpmn-corpus-invalid-'));
    const copy = join(parent, 'corpus');
    await cp(sourceRoot, copy, { recursive: true });
    const path = join(copy, mutation.file);
    const value = JSON.parse(await readFile(path, 'utf8'));
    mutation.mutate(value);
    await writeFile(path, JSON.stringify(value, null, 2) + '\n');
    const result = await rejectedCorpus('validate', '--root', copy, '--json');
    assert.match(result.error, mutation.expected, mutation.name);
  }
});
