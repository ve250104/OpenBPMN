import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parseInput, validateProtocol } from '../dist/input.js';

function basicRequest() {
  return {
    schemaVersion: '1.0.0',
    profileVersion: '1.0.0',
    model: { key: 'document', name: 'Request review', primaryRef: 'review', processes: [{ key: 'review' }] },
  };
}

function richRequest() {
  const request: any = basicRequest();
  const process = request.model.processes[0];
  process.nodes = [
    ...['task', 'userTask', 'manualTask', 'serviceTask', 'businessRuleTask', 'scriptTask', 'subProcess'].map(
      (type) => ({ key: type, type, containerRef: 'review' }),
    ),
    { key: 'send', type: 'sendTask', containerRef: 'review', messageRef: 'message' },
    { key: 'receive', type: 'receiveTask', containerRef: 'review', messageRef: 'message' },
    { key: 'call', type: 'callActivity', containerRef: 'review', calledProcessRef: 'called' },
    ...['exclusiveGateway', 'inclusiveGateway', 'parallelGateway', 'eventBasedGateway'].map((type) => ({
      key: type,
      type,
      containerRef: 'review',
    })),
    { key: 'start', type: 'startEvent', containerRef: 'review', event: { kind: 'none' } },
    { key: 'end', type: 'endEvent', containerRef: 'review', event: { kind: 'terminate' } },
    {
      key: 'timer',
      type: 'boundaryEvent',
      containerRef: 'review',
      attachedToRef: 'task',
      interrupting: false,
      event: { kind: 'timer', timeDuration: 'P2D' },
    },
    { key: 'catch', type: 'intermediateCatchEvent', containerRef: 'review', event: { kind: 'signal', ref: 'signal' } },
    {
      key: 'throw',
      type: 'intermediateThrowEvent',
      containerRef: 'review',
      event: { kind: 'escalation', ref: 'escalation' },
    },
  ];
  process.nodes[0].loop = { kind: 'standard', condition: 'Further review needed', testBefore: false };
  process.nodes[1].loop = { kind: 'multiInstance', sequential: true };
  process.flows = [{ key: 'firstFlow', containerRef: 'review', sourceRef: 'start', targetRef: 'task' }];
  process.lanes = [{ key: 'owner', parentRef: 'review', flowNodeRefs: ['task'] }];
  process.artifacts = [
    { key: 'data', type: 'dataObject', containerRef: 'review', isCollection: true },
    { key: 'dataRef', type: 'dataObjectReference', containerRef: 'review', dataObjectRef: 'data', state: 'received' },
    { key: 'storeRef', type: 'dataStoreReference', containerRef: 'review', dataStoreRef: 'store' },
    { key: 'input', type: 'dataInput', ownerRef: 'task' },
    { key: 'output', type: 'dataOutput', ownerRef: 'task' },
    { key: 'note', type: 'textAnnotation', containerRef: 'review', text: 'Check original request' },
    { key: 'group', type: 'group', containerRef: 'review', categoryRef: 'category', memberRefs: ['task', 'note'] },
    {
      key: 'association',
      type: 'association',
      containerRef: 'review',
      sourceRef: 'task',
      targetRef: 'note',
      direction: 'none',
    },
  ];
  process.dataAssociations = [
    { key: 'consumes', direction: 'input', ownerRef: 'task', sourceRefs: ['dataRef'], targetRef: 'input' },
  ];
  request.model.processes.push({ key: 'called' });
  request.model.declarations = [
    { key: 'message', type: 'message', name: 'Review request' },
    { key: 'signal', type: 'signal', name: 'Urgent review' },
    { key: 'error', type: 'error', code: 'REVIEW_FAILED' },
    { key: 'escalation', type: 'escalation', code: 'DELAYED' },
    { key: 'store', type: 'dataStore', capacity: 100, unlimited: false },
    { key: 'category', type: 'category', value: 'Review evidence' },
  ];
  request.model.collaboration = {
    key: 'collaboration',
    participants: [{ key: 'internal', processRef: 'review' }, { key: 'external' }],
    messageFlows: [{ key: 'communicates', sourceRef: 'send', targetRef: 'external', messageRef: 'message' }],
  };
  request.model.primaryRef = 'collaboration';
  request.evidence = [{ key: 'account', source: 'Operator notes', summary: 'The operator reviews the request.' }];
  request.decisions = [
    { key: 'choice', description: 'Use current practice', elementRefs: ['review'], evidenceRefs: ['account'] },
  ];
  request.issues = [
    {
      key: 'question',
      kind: 'question',
      description: 'Who covers absence?',
      elementRefs: ['task'],
      evidenceRefs: ['account'],
      affectsMeaning: false,
    },
  ];
  request.links = [
    { elementRef: 'task', assertion: 'Review the request', basis: 'evidence', supportRefs: ['account'] },
  ];
  request.scenarios = [
    {
      key: 'happy',
      name: 'Ordinary request',
      startRef: 'start',
      steps: ['start', 'task'],
      expectedOutcome: 'Review occurs',
    },
  ];
  request.presentation = {
    direction: 'leftToRight',
    participantOrder: ['internal', 'external'],
    laneOrder: ['owner'],
    subprocesses: [{ elementRef: 'subProcess', expanded: true }],
  };
  return request;
}

test('a complete structured request is accepted without inventing optional collections or process meaning', () => {
  const request = basicRequest();
  const parsed = parseInput(JSON.stringify(request));
  assert.deepEqual(parsed.request, request);
  assert.deepEqual(parsed.findings, []);
  assert.equal(parsed.handoff, undefined);
});

test('malformed input, unsupported versions and unknown top-level fields are refused without payload disclosure', () => {
  for (const input of [
    '{"private":"not-json"',
    JSON.stringify({ ...basicRequest(), schemaVersion: '2.0.0' }),
    JSON.stringify({ ...basicRequest(), shell: 'private command' }),
    'null',
  ]) {
    const result = parseInput(input);
    assert.equal(result.request, undefined);
    assert.ok(result.findings.length > 0);
    assert.ok(result.findings.every((finding) => finding.category === 'input'));
    assert.doesNotMatch(JSON.stringify(result.findings), /private command|not-json/);
  }
});

test('duplicate JSON members including escaped aliases are refused instead of accepting the last value', () => {
  const plain = JSON.stringify(basicRequest());
  const duplicatedRoot = plain.replace('"schemaVersion":"1.0.0"', '"schemaVersion":"9.9.9","schemaVersion":"1.0.0"');
  const escapedModelKey = plain.replace('"key":"review"', '"key":"removed","k\\u0065y":"review"');
  for (const text of [duplicatedRoot, escapedModelKey]) {
    const result = parseInput(text);
    assert.equal(result.request, undefined);
    assert.equal(result.findings[0]?.code, 'KEY_DUPLICATE');
  }
});

test('the full Consulting Core record families travel through structured input without coercion or loss', () => {
  const request = richRequest();
  const result = parseInput(JSON.stringify(request));
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.request, request);
});

test('input budgets apply to the whole invocation before large or deeply nested content is accepted', () => {
  const oversized = JSON.stringify({ ...basicRequest(), private: 'x'.repeat(5 * 1024 * 1024) });
  const tooManyElements: any = basicRequest();
  tooManyElements.model.processes[0].nodes = Array.from({ length: 1_999 }, (_, i) => ({
    key: `task${i}`,
    type: 'task',
    containerRef: 'review',
  }));
  const tooMuchContext: any = basicRequest();
  tooMuchContext.evidence = Array.from({ length: 2_501 }, (_, i) => ({
    key: `e${i}`,
    source: 'Notes',
    summary: 'Review occurs.',
  }));
  tooMuchContext.decisions = Array.from({ length: 2_500 }, (_, i) => ({
    key: `d${i}`,
    description: 'Review the request.',
  }));
  for (const value of [
    oversized,
    JSON.stringify(tooManyElements),
    JSON.stringify(tooMuchContext),
    '['.repeat(30) + '0' + ']'.repeat(30),
  ]) {
    const result = parseInput(value);
    assert.equal(result.request, undefined);
    assert.equal(result.findings[0]?.code, 'INPUT_LIMIT');
  }
});

test('identities and evidence references are unambiguous while deleted identities remain reserved', () => {
  const duplicate = richRequest();
  duplicate.model.declarations[0].key = 'task';
  const missingSupport = richRequest();
  missingSupport.links[0].supportRefs = ['missing'];
  const missingElement = richRequest();
  missingElement.issues[0].elementRefs = ['gone'];
  const reusedHistoric = richRequest();
  reusedHistoric.decisions[0].historicalElementRefs = ['task'];
  for (const request of [duplicate, missingSupport, missingElement, reusedHistoric]) {
    const result = parseInput(JSON.stringify(request));
    assert.equal(result.request, undefined);
    assert.ok(result.findings.length > 0);
  }
  const historical = richRequest();
  historical.decisions[0].historicalElementRefs = ['removedTask'];
  historical.issues[0].resolution = { kind: 'resolved', decisionRef: 'choice' };
  historical.issues[0].historicalElementRefs = ['removedTask'];
  historical.evidence[0].key = 'choice';
  historical.decisions[0].evidenceRefs = ['choice'];
  historical.issues[0].evidenceRefs = ['choice'];
  historical.links[0].supportRefs = ['choice'];
  assert.ok(parseInput(JSON.stringify(historical)).request);
});

test('an explicit Handoff preserves the sole request, human lifecycle text and historical report without treating that report as current', () => {
  const handoff = {
    handoffVersion: '1.0.0',
    request: richRequest(),
    lifecycleStatus: 'Working copy selected by the process owner',
    reviewNotes: ['Discuss absence cover in the next session.'],
    lastReport: {
      reportVersion: '1.0.0',
      toolVersion: '0.1.0-dev.0',
      profileVersion: '1.0.0',
      modelKey: 'document',
      export: { requested: 'snapshot', outcome: 'none', cleanEligible: false, expertOverride: false },
      checks: ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render', 'evidence', 'consulting'].map((id) => ({
        id,
        status: 'not_run',
        findingRefs: [],
        reason: 'Historical assessment unavailable.',
      })),
      findings: [],
      context: {},
    },
  };
  const result = parseInput(JSON.stringify(handoff));
  assert.deepEqual(result.request, handoff.request);
  assert.deepEqual(result.handoff, handoff);
  assert.deepEqual(result.findings, []);
  const malformed = structuredClone(handoff);
  delete (malformed.lastReport.checks[0] as any).reason;
  assert.equal(parseInput(JSON.stringify(malformed)).request, undefined);
});

test('the public result schema permits completed validation with defects and rejects impossible command signals', () => {
  const ajv = new Ajv2020({ strict: true });
  for (const name of ['request', 'quality-report'])
    ajv.addSchema(JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8')));
  const validate = ajv.compile(
    JSON.parse(readFileSync(new URL('../schemas/result.schema.json', import.meta.url), 'utf8')),
  );
  const result = {
    resultVersion: '1.0.0',
    command: 'validate',
    toolVersion: '0.1.0',
    profileVersion: '1.0.0',
    status: 'completed',
    signal: 'validation_completed',
    exitCode: 2,
    artifacts: [],
    report: {
      reportVersion: '1.0.0',
      toolVersion: '0.1.0',
      profileVersion: '1.0.0',
      export: { requested: 'none', outcome: 'none', cleanEligible: false, expertOverride: false },
      checks: ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render', 'evidence', 'consulting'].map((id) => ({
        id,
        status: 'not_run',
        findingRefs: [],
        reason: 'Assessment unavailable.',
      })),
      findings: [],
      context: {},
    },
  };
  assert.equal(validate(result), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...result, signal: 'capabilities_reported' }), false);
  assert.equal(validate({ ...result, status: 'failed', exitCode: 0 }), false);
  assert.equal(validate({ ...result, privateTranscript: 'not allowed' }), false);
});

test('empty optional text is omitted and conditional-flow labels reuse the supplied condition without replacing explicit names', () => {
  const request = richRequest();
  const flow = request.model.processes[0].flows[0];
  flow.name = '';
  flow.condition = 'Amount is above the approval threshold';
  request.model.documentation = '';
  request.model.processes[0].nodes[0].name = '';
  const result = parseInput(JSON.stringify(request));
  assert.ok(result.request);
  assert.equal(result.request.model.documentation, undefined);
  assert.equal(result.request.model.processes[0]?.nodes?.[0]?.name, undefined);
  assert.equal(result.request.model.processes[0]?.flows?.[0]?.name, 'Amount is above the approval threshold');
  flow.name = 'Approval required';
  flow.condition = 'x'.repeat(501);
  assert.equal(parseInput(JSON.stringify(request)).request?.model.processes[0]?.flows?.[0]?.name, 'Approval required');
  delete flow.name;
  assert.equal(parseInput(JSON.stringify(request)).request, undefined);
  const unknown: any = basicRequest();
  unknown.model.unknownInstruction = '';
  assert.equal(parseInput(JSON.stringify(unknown)).request, undefined);
});

test('finished protocol validation rejects dangling check findings and unearned Clean eligibility', () => {
  const report: any = {
    reportVersion: '1.0.0',
    toolVersion: '0.1.0',
    profileVersion: '1.0.0',
    export: { requested: 'none', outcome: 'none', cleanEligible: false, expertOverride: false },
    checks: ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render', 'evidence', 'consulting'].map((id) => ({
      id,
      status: 'not_run',
      findingRefs: [],
      reason: 'Assessment unavailable.',
    })),
    findings: [],
    context: {},
  };
  assert.equal(validateProtocol('request', basicRequest()), true);
  assert.equal(validateProtocol('report', report), true);
  report.checks[0].findingRefs = ['missingFinding'];
  assert.equal(validateProtocol('report', report), false);
  report.checks[0].findingRefs = [];
  report.export.cleanEligible = true;
  assert.equal(validateProtocol('report', report), false);
  report.export.cleanEligible = false;
  const result = {
    resultVersion: '1.0.0',
    command: 'generate',
    toolVersion: '0.1.0',
    profileVersion: '1.0.0',
    status: 'completed',
    signal: 'clean_export_ready',
    exitCode: 0,
    artifacts: [],
    report,
  };
  assert.equal(validateProtocol('result', result), false);
});

test('flat nesting and historical Handoff content cannot bypass input limits or carry incoherent assessments', () => {
  const nested: any = basicRequest();
  nested.model.processes[0].nodes = Array.from({ length: 17 }, (_, i) => ({
    key: `sub${i}`,
    type: 'subProcess',
    containerRef: i === 0 ? 'review' : `sub${i - 1}`,
  }));
  assert.equal(parseInput(JSON.stringify(nested)).findings[0]?.code, 'INPUT_LIMIT');
  const report: any = {
    reportVersion: '1.0.0',
    toolVersion: '0.1.0',
    profileVersion: '1.0.0',
    export: { requested: 'none', outcome: 'none', cleanEligible: false, expertOverride: false },
    checks: ['input', 'xml', 'xsd', 'semantics', 'profile', 'di', 'render', 'evidence', 'consulting'].map((id) => ({
      id,
      status: 'not_run',
      findingRefs: [],
      reason: 'Not assessed.',
    })),
    findings: [],
    context: {},
  };
  const handoff: any = { handoffVersion: '1.0.0', request: basicRequest(), lastReport: report };
  report.checks[0].findingRefs = ['missing'];
  assert.equal(parseInput(JSON.stringify(handoff)).request, undefined);
  report.checks[0].findingRefs = [];
  handoff.request.evidence = Array.from({ length: 2_501 }, (_, i) => ({
    key: `e${i}`,
    source: 'Notes',
    summary: 'Review occurs.',
  }));
  report.context.evidence = handoff.request.evidence;
  assert.equal(parseInput(JSON.stringify(handoff)).findings[0]?.code, 'INPUT_LIMIT');
});

test('Group, Association, and Data Association reject nonstandard name fields instead of silently dropping them', () => {
  for (const name of ['Visible label', ''])
    for (const type of ['group', 'association', 'dataAssociation']) {
      const request = richRequest();
      const record =
        type === 'dataAssociation'
          ? request.model.processes[0].dataAssociations[0]
          : request.model.processes[0].artifacts.find((item) => item.type === type);
      record.name = name;
      assert.equal(
        parseInput(JSON.stringify(request)).request,
        undefined,
        `${type} must not accept name, including an empty unknown property.`,
      );
    }
});
