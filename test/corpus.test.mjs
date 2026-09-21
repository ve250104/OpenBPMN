import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const repository = new URL('../', import.meta.url);
const entrypoint = new URL('../eval/corpus/run.mjs', import.meta.url);
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

async function rejectedCorpus(...args) {
  try {
    await corpus(...args);
    assert.fail('Expected the corpus operation to be rejected.');
  } catch (error) {
    return JSON.parse(error.stdout);
  }
}

test('the public corpus entry point validates the complete diverse pilot', async () => {
  const result = await corpus('validate', '--json');
  assert.equal(result.status, 'pass');
  assert.equal(result.version, '1.0.0');
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
    run.attempts.push({
      attemptId,
      status: 'completed',
      startedAt: '2026-09-21T10:00:00.000Z',
      finishedAt: '2026-09-21T10:01:00.000Z',
      commands: ['openbpmn generate'],
      exitResults: [{ command: 'openbpmn generate', exitCode: 0 }],
      artifacts: [{ kind: 'bpmn', path: `${attemptId}/model.bpmn`, sha256: digest(xml) }],
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
    'detached_label',
    'invented_recipient',
    'missing_required_branch',
    'reversed_connection',
    'threshold_or_negation_changed',
    'unrelated_correction_change',
    'wrong_approver',
    'wrong_gateway_behavior',
  ]);
  assert.equal(result.attempts[1].status, 'pass');
  assert.equal(result.attempts[2].status, 'pass');
  assert.deepEqual(result.summary.statuses, { fail: 1, pass: 2 });
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
