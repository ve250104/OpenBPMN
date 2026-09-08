import assert from 'node:assert/strict';
import test from 'node:test';
import { compileModel, semanticProjection } from '../dist/compiler.js';
import { validateModel } from '../dist/semantics.js';
import { validateXml } from '../dist/xml.js';

const basicRequest = () => ({
  schemaVersion: '1.0.0',
  profileVersion: '1.0.0',
  model: {
    key: 'invoice-model',
    name: 'Invoice handling',
    primaryRef: 'invoice-process',
    processes: [
      {
        key: 'invoice-process',
        name: 'Handle invoice',
        documentation: 'An agreed description, not an agent assessment.',
        nodes: [
          {
            key: 'start',
            type: 'startEvent',
            containerRef: 'invoice-process',
            name: 'Invoice received',
            event: { kind: 'none' },
          },
          { key: 'check', type: 'task', containerRef: 'invoice-process', name: 'Check invoice' },
          {
            key: 'end',
            type: 'endEvent',
            containerRef: 'invoice-process',
            name: 'Invoice checked',
            event: { kind: 'none' },
          },
        ],
        flows: [
          { key: 'received-to-check', containerRef: 'invoice-process', sourceRef: 'start', targetRef: 'check' },
          { key: 'check-to-complete', containerRef: 'invoice-process', sourceRef: 'check', targetRef: 'end' },
        ],
      },
    ],
  },
});

test('a supplied basic Process compiles to the agreed design-time meaning', async () => {
  const request = basicRequest();
  const before = structuredClone(request);
  const xml = await compileModel(request);

  assert.deepEqual(await semanticProjection(xml), {
    $type: 'bpmn:Definitions',
    id: 'M_invoice-model',
    name: 'Invoice handling',
    targetNamespace: 'urn:process-model:invoice-model',
    rootElements: [
      {
        $type: 'bpmn:Process',
        id: 'M_invoice-process',
        name: 'Handle invoice',
        isExecutable: false,
        documentation: [{ $type: 'bpmn:Documentation', text: 'An agreed description, not an agent assessment.' }],
        flowElements: [
          {
            $type: 'bpmn:Task',
            id: 'M_check',
            name: 'Check invoice',
            incoming: ['M_received-to-check'],
            outgoing: ['M_check-to-complete'],
          },
          { $type: 'bpmn:SequenceFlow', id: 'M_check-to-complete', sourceRef: 'M_check', targetRef: 'M_end' },
          { $type: 'bpmn:EndEvent', id: 'M_end', name: 'Invoice checked', incoming: ['M_check-to-complete'] },
          { $type: 'bpmn:SequenceFlow', id: 'M_received-to-check', sourceRef: 'M_start', targetRef: 'M_check' },
          { $type: 'bpmn:StartEvent', id: 'M_start', name: 'Invoice received', outgoing: ['M_received-to-check'] },
        ],
      },
    ],
  });
  assert.deepEqual(request, before, 'compilation must not mutate supplied process meaning');
});

test('a dangling Sequence Flow is refused with its missing reference identified', async () => {
  const request = basicRequest();
  request.model.processes[0].flows[0].targetRef = 'absent';
  await assert.rejects(compileModel(request), (error) => {
    assert.equal(error.exitCode, 2);
    assert.deepEqual(
      error.findings.map(({ code, elementRefs }) => ({ code, elementRefs })),
      [{ code: 'REF_MISSING', elementRefs: ['received-to-check', 'absent'] }],
    );
    return true;
  });
});

test('an End Event cannot send a Sequence Flow back into a Start Event', async () => {
  const request = basicRequest();
  request.model.processes[0].flows.push({
    key: 'illegal-return',
    containerRef: 'invoice-process',
    sourceRef: 'end',
    targetRef: 'start',
  });
  assert.deepEqual(
    validateModel(request).map(({ code, elementRefs }) => ({ code, elementRefs })),
    [
      { code: 'EVENT_PLACEMENT', elementRefs: ['illegal-return', 'end'] },
      { code: 'EVENT_PLACEMENT', elementRefs: ['illegal-return', 'start'] },
    ],
  );
  await assert.rejects(compileModel(request), { code: 'MODEL_INVALID', exitCode: 2 });
  assert.match(await compileModel(request, { allowInvalid: true }), /id="M_illegal-return"/);
});

test('an unimplemented semantic feature is refused instead of silently omitted', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes[1] = { key: 'check', type: 'complexGateway', containerRef: 'invoice-process' };
  const findings = validateModel(request);
  assert.deepEqual(
    findings
      .filter((finding) => finding.code === 'CAPABILITY_UNAVAILABLE')
      .map(({ code, elementRefs }) => ({ code, elementRefs })),
    [{ code: 'CAPABILITY_UNAVAILABLE', elementRefs: ['check'] }],
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { code: 'MODEL_INVALID' });
});

test('a Sequence Flow cannot cross its Process scope', async () => {
  const request = basicRequest();
  request.model.processes[0].flows[0].containerRef = 'other-process';
  assert.deepEqual(
    validateModel(request).map(({ code, elementRefs }) => ({ code, elementRefs })),
    [{ code: 'FLOW_SCOPE', elementRefs: ['received-to-check'] }],
  );
  await assert.rejects(compileModel(request), { code: 'MODEL_INVALID', exitCode: 2 });
});

test('duplicate semantic keys never become ambiguous XML identities', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes.push({
    key: 'check',
    type: 'task',
    containerRef: 'invoice-process',
    name: 'A different task',
  });
  assert.ok(
    validateModel(request).some((finding) => finding.code === 'KEY_DUPLICATE' && finding.elementRefs.includes('check')),
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { code: 'MODEL_INVALID', exitCode: 2 });
});

test('an Exclusive decision preserves a condition and its explicit default path', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes.push({
    key: 'decision',
    type: 'exclusiveGateway',
    containerRef: 'invoice-process',
    name: 'Invoice acceptable?',
    defaultFlowRef: 'otherwise',
  });
  request.model.processes[0].flows = [
    { key: 'arrived', containerRef: 'invoice-process', sourceRef: 'start', targetRef: 'decision' },
    {
      key: 'accepted',
      containerRef: 'invoice-process',
      sourceRef: 'decision',
      targetRef: 'check',
      name: 'Yes',
      condition: 'amount > 500 & customer = "internal"',
    },
    { key: 'otherwise', containerRef: 'invoice-process', sourceRef: 'decision', targetRef: 'end', name: 'Otherwise' },
    { key: 'checked', containerRef: 'invoice-process', sourceRef: 'check', targetRef: 'end' },
  ];
  assert.deepEqual(validateModel(request), []);
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  const elements = projection.rootElements[0].flowElements;
  assert.deepEqual(
    elements.find((element) => element.id === 'M_decision'),
    {
      $type: 'bpmn:ExclusiveGateway',
      id: 'M_decision',
      name: 'Invoice acceptable?',
      default: 'M_otherwise',
      incoming: ['M_arrived'],
      outgoing: ['M_accepted', 'M_otherwise'],
    },
  );
  assert.deepEqual(
    elements.find((element) => element.id === 'M_accepted'),
    {
      $type: 'bpmn:SequenceFlow',
      id: 'M_accepted',
      name: 'Yes',
      sourceRef: 'M_decision',
      targetRef: 'M_check',
      conditionExpression: { $type: 'bpmn:FormalExpression', body: 'amount > 500 & customer = "internal"' },
    },
  );
  assert.equal(await compileModel(request), xml);
});

test('a default Sequence Flow belongs to its owner and never carries a condition', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes[1].defaultFlowRef = 'check-to-complete';
  request.model.processes[0].flows[1].condition = 'An invalid condition on the default path';
  assert.deepEqual(
    validateModel(request).map(({ code, elementRefs }) => ({ code, elementRefs })),
    [{ code: 'DEFAULT_FLOW', elementRefs: ['check', 'check-to-complete'] }],
  );
  await assert.rejects(compileModel(request), { exitCode: 2 });
  delete request.model.processes[0].flows[1].condition;
  request.model.processes[0].nodes[1].defaultFlowRef = 'received-to-check';
  assert.ok(validateModel(request).some((finding) => finding.code === 'DEFAULT_FLOW'));
});

test('parallel work retains both branches and its explicit synchronization', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes.push(
    { key: 'fork', type: 'parallelGateway', containerRef: 'invoice-process' },
    { key: 'archive', type: 'task', containerRef: 'invoice-process', name: 'Archive invoice' },
    { key: 'join', type: 'parallelGateway', containerRef: 'invoice-process' },
  );
  request.model.processes[0].flows = [
    { key: 'arrived', containerRef: 'invoice-process', sourceRef: 'start', targetRef: 'fork' },
    { key: 'to-check', containerRef: 'invoice-process', sourceRef: 'fork', targetRef: 'check' },
    { key: 'to-archive', containerRef: 'invoice-process', sourceRef: 'fork', targetRef: 'archive' },
    { key: 'checked', containerRef: 'invoice-process', sourceRef: 'check', targetRef: 'join' },
    { key: 'archived', containerRef: 'invoice-process', sourceRef: 'archive', targetRef: 'join' },
    { key: 'finished', containerRef: 'invoice-process', sourceRef: 'join', targetRef: 'end' },
  ];
  assert.deepEqual(validateModel(request), []);
  const elements = (await semanticProjection(await compileModel(request))).rootElements[0].flowElements;
  assert.deepEqual(
    elements.filter((element) => element.$type === 'bpmn:ParallelGateway'),
    [
      {
        $type: 'bpmn:ParallelGateway',
        id: 'M_fork',
        incoming: ['M_arrived'],
        outgoing: ['M_to-archive', 'M_to-check'],
      },
      { $type: 'bpmn:ParallelGateway', id: 'M_join', incoming: ['M_archived', 'M_checked'], outgoing: ['M_finished'] },
    ],
  );
});

test('an Inclusive split preserves independently applicable branch conditions', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes.push({
    key: 'requirements',
    type: 'inclusiveGateway',
    containerRef: 'invoice-process',
  });
  request.model.processes[0].flows = [
    { key: 'arrived', containerRef: 'invoice-process', sourceRef: 'start', targetRef: 'requirements' },
    {
      key: 'needs-review',
      containerRef: 'invoice-process',
      sourceRef: 'requirements',
      targetRef: 'check',
      condition: 'Review required',
    },
    {
      key: 'can-finish',
      containerRef: 'invoice-process',
      sourceRef: 'requirements',
      targetRef: 'end',
      condition: 'Archiving permitted',
    },
    { key: 'checked', containerRef: 'invoice-process', sourceRef: 'check', targetRef: 'end' },
  ];
  assert.deepEqual(validateModel(request), []);
  const elements = (await semanticProjection(await compileModel(request))).rootElements[0].flowElements;
  assert.deepEqual(
    elements.find((element) => element.id === 'M_requirements'),
    {
      $type: 'bpmn:InclusiveGateway',
      id: 'M_requirements',
      incoming: ['M_arrived'],
      outgoing: ['M_can-finish', 'M_needs-review'],
    },
  );
  assert.deepEqual(
    elements.filter((element) => element.conditionExpression).map((element) => element.conditionExpression.body),
    ['Archiving permitted', 'Review required'],
  );
});

test('events and Parallel Gateways cannot acquire conditional Sequence Flows', async () => {
  for (const source of ['start', 'parallel']) {
    const request = basicRequest();
    const flow = source === 'start' ? request.model.processes[0].flows[0] : request.model.processes[0].flows[1];
    if (source === 'parallel')
      request.model.processes[0].nodes[1] = { key: 'check', type: 'parallelGateway', containerRef: 'invoice-process' };
    flow.condition = 'Only sometimes';
    assert.deepEqual(
      validateModel(request)
        .filter((finding) => finding.code === 'FLOW_CONDITION')
        .map((finding) => finding.elementRefs),
      [[flow.key, flow.sourceRef]],
    );
    await assert.rejects(compileModel(request), { exitCode: 2 });
  }
});

test('a decision split requires stated conditions or an explicit default', async () => {
  for (const type of ['exclusiveGateway', 'inclusiveGateway']) {
    const request = basicRequest();
    request.model.processes[0].nodes[1] = { key: 'check', type, containerRef: 'invoice-process' };
    request.model.processes[0].flows.push({
      key: 'alternative',
      containerRef: 'invoice-process',
      sourceRef: 'check',
      targetRef: 'end',
    });
    assert.deepEqual(
      validateModel(request)
        .filter((finding) => finding.code === 'FLOW_CONDITION')
        .map((finding) => finding.elementRefs),
      [
        ['check-to-complete', 'check'],
        ['alternative', 'check'],
      ],
    );
    request.model.processes[0].flows[1].condition = 'Invoice accepted';
    request.model.processes[0].nodes[1].defaultFlowRef = 'alternative';
    assert.deepEqual(validateModel(request), []);
  }
});

test('the requested primary model must resolve before any XML is emitted', async () => {
  const request = basicRequest();
  request.model.primaryRef = 'unknown-process';
  await assert.rejects(compileModel(request), (error) => {
    assert.equal(error.exitCode, 2);
    assert.ok(
      error.findings.some(
        (finding) => finding.code === 'REF_MISSING' && finding.elementRefs.includes('unknown-process'),
      ),
    );
    return true;
  });
});

test('a collaboration can preserve a message between two black-box participants', async () => {
  const request = {
    schemaVersion: '1.0.0',
    profileVersion: '1.0.0',
    model: {
      key: 'handoff-model',
      name: 'Supplier handoff',
      primaryRef: 'handoff',
      processes: [],
      declarations: [{ key: 'invoice', type: 'message', name: 'Invoice' }],
      collaboration: {
        key: 'handoff',
        name: 'Supplier handoff',
        participants: [
          { key: 'supplier', name: 'Supplier' },
          { key: 'buyer', name: 'Buyer' },
        ],
        messageFlows: [{ key: 'send-invoice', sourceRef: 'supplier', targetRef: 'buyer', messageRef: 'invoice' }],
      },
    },
  };
  assert.deepEqual(validateModel(request), []);
  assert.deepEqual((await semanticProjection(await compileModel(request))).rootElements, [
    {
      $type: 'bpmn:Collaboration',
      id: 'M_handoff',
      name: 'Supplier handoff',
      participants: [
        { $type: 'bpmn:Participant', id: 'M_buyer', name: 'Buyer' },
        { $type: 'bpmn:Participant', id: 'M_supplier', name: 'Supplier' },
      ],
      messageFlows: [
        {
          $type: 'bpmn:MessageFlow',
          id: 'M_send-invoice',
          sourceRef: 'M_supplier',
          targetRef: 'M_buyer',
          messageRef: 'M_invoice',
        },
      ],
    },
    { $type: 'bpmn:Message', id: 'M_invoice', name: 'Invoice' },
  ]);
});

test('a white-box participant sends a declared Message through a Send Task', async () => {
  const request = basicRequest();
  request.model.primaryRef = 'handoff';
  request.model.declarations = [
    { key: 'invoice', type: 'message', name: 'Invoice' },
    { key: 'unused-message', type: 'message', name: 'Retained explicit declaration' },
  ];
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'sendTask',
    containerRef: 'invoice-process',
    name: 'Send invoice',
    messageRef: 'invoice',
  };
  request.model.collaboration = {
    key: 'handoff',
    participants: [{ key: 'supplier', processRef: 'invoice-process' }, { key: 'buyer' }],
    messageFlows: [{ key: 'message', sourceRef: 'check', targetRef: 'buyer', messageRef: 'invoice' }],
  };
  assert.deepEqual(validateModel(request), []);
  const projection = await semanticProjection(await compileModel(request));
  const process = projection.rootElements.find((element) => element.id === 'M_invoice-process');
  assert.deepEqual(
    process.flowElements.find((element) => element.id === 'M_check'),
    {
      $type: 'bpmn:SendTask',
      id: 'M_check',
      name: 'Send invoice',
      messageRef: 'M_invoice',
      incoming: ['M_received-to-check'],
      outgoing: ['M_check-to-complete'],
    },
  );
  assert.ok(projection.rootElements.some((element) => element.id === 'M_unused-message'));
  assert.deepEqual(projection.rootElements.find((element) => element.id === 'M_handoff').participants, [
    { $type: 'bpmn:Participant', id: 'M_buyer' },
    { $type: 'bpmn:Participant', id: 'M_supplier', processRef: 'M_invoice-process' },
  ]);
});

test('a Receive Task preserves a declared incoming Message', async () => {
  const request = basicRequest();
  request.model.declarations = [{ key: 'invoice', type: 'message', name: 'Invoice' }];
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'receiveTask',
    containerRef: 'invoice-process',
    name: 'Receive invoice',
    messageRef: 'invoice',
  };
  const elements = (await semanticProjection(await compileModel(request))).rootElements.find(
    (element) => element.id === 'M_invoice-process',
  ).flowElements;
  assert.deepEqual(
    elements.find((element) => element.id === 'M_check'),
    {
      $type: 'bpmn:ReceiveTask',
      id: 'M_check',
      name: 'Receive invoice',
      messageRef: 'M_invoice',
      incoming: ['M_received-to-check'],
      outgoing: ['M_check-to-complete'],
    },
  );
});

test('a communication task cannot silently discard an unresolved Message reference', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'sendTask',
    containerRef: 'invoice-process',
    messageRef: 'unknown-message',
  };
  assert.deepEqual(
    validateModel(request).map(({ code, elementRefs }) => ({ code, elementRefs })),
    [{ code: 'REF_MISSING', elementRefs: ['check', 'unknown-message'] }],
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
});

test('Message Flows cross participant boundaries and never connect internal work', async () => {
  const request = basicRequest();
  request.model.primaryRef = 'collaboration';
  request.model.collaboration = {
    key: 'collaboration',
    participants: [{ key: 'supplier', processRef: 'invoice-process' }, { key: 'buyer' }],
    messageFlows: [{ key: 'internal-message', sourceRef: 'check', targetRef: 'supplier' }],
  };
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'MESSAGE_SCOPE')
      .map((finding) => finding.elementRefs),
    [['internal-message', 'check', 'supplier']],
  );
  await assert.rejects(compileModel(request), { exitCode: 2 });
  request.model.collaboration.messageFlows[0].targetRef = 'buyer';
  assert.deepEqual(validateModel(request), []);
});

test('collaboration references never disappear during serialization', async () => {
  const request = basicRequest();
  request.model.primaryRef = 'collaboration';
  request.model.collaboration = {
    key: 'collaboration',
    participants: [{ key: 'supplier', processRef: 'absent-process' }, { key: 'buyer' }],
    messageFlows: [{ key: 'handoff', sourceRef: 'absent-node', targetRef: 'buyer', messageRef: 'absent-message' }],
  };
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'REF_MISSING')
      .map((finding) => finding.elementRefs),
    [
      ['supplier', 'absent-process'],
      ['handoff', 'absent-node'],
      ['handoff', 'absent-message'],
    ],
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
});

test('Message Flow endpoints must be interaction nodes, not control routing or None Events', async () => {
  const request = basicRequest();
  request.model.primaryRef = 'collaboration';
  request.model.processes[0].nodes[1].type = 'parallelGateway';
  request.model.collaboration = {
    key: 'collaboration',
    participants: [{ key: 'supplier', processRef: 'invoice-process' }, { key: 'buyer' }],
    messageFlows: [{ key: 'handoff', sourceRef: 'check', targetRef: 'buyer' }],
  };
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'MESSAGE_ENDPOINT')
      .map((finding) => finding.elementRefs),
    [['handoff', 'check']],
  );
  await assert.rejects(compileModel(request), { exitCode: 2 });
  request.model.collaboration.messageFlows[0].sourceRef = 'start';
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'MESSAGE_ENDPOINT')
      .map((finding) => finding.elementRefs),
    [['handoff', 'start']],
  );
});

test('nested lanes retain responsibility with derived ancestor membership', async () => {
  const request = basicRequest();
  request.model.processes[0].lanes = [
    { key: 'finance', name: 'Finance', parentRef: 'invoice-process' },
    { key: 'clerk', name: 'Invoice clerk', parentRef: 'finance', flowNodeRefs: ['start', 'check'] },
    { key: 'manager', name: 'Finance manager', parentRef: 'finance', flowNodeRefs: ['end'] },
  ];
  const before = structuredClone(request);
  const projection = await semanticProjection(await compileModel(request));
  const process = projection.rootElements.find((element) => element.id === 'M_invoice-process');
  assert.deepEqual(process.laneSets, [
    {
      $type: 'bpmn:LaneSet',
      id: 'G_lanes_invoice-process',
      lanes: [
        {
          $type: 'bpmn:Lane',
          id: 'M_finance',
          name: 'Finance',
          flowNodeRef: ['M_check', 'M_end', 'M_start'],
          childLaneSet: {
            $type: 'bpmn:LaneSet',
            id: 'G_lanes_finance',
            lanes: [
              { $type: 'bpmn:Lane', id: 'M_clerk', name: 'Invoice clerk', flowNodeRef: ['M_check', 'M_start'] },
              { $type: 'bpmn:Lane', id: 'M_manager', name: 'Finance manager', flowNodeRef: ['M_end'] },
            ],
          },
        },
      ],
    },
  ]);
  assert.deepEqual(request, before);
  request.model.processes[0].lanes[1].flowNodeRefs = ['start'];
  request.model.processes[0].lanes[2].flowNodeRefs = ['check', 'end'];
  const corrected = await semanticProjection(await compileModel(request));
  assert.deepEqual(
    corrected.rootElements.find((element) => element.id === 'M_invoice-process').laneSets[0].lanes[0].childLaneSet
      .lanes[1].flowNodeRef,
    ['M_check', 'M_end'],
  );
});

test('lane membership has one leaf owner and cannot assert a competing ancestor assignment', async () => {
  const request = basicRequest();
  request.model.processes[0].lanes = [
    { key: 'finance', parentRef: 'invoice-process', flowNodeRefs: ['end'] },
    { key: 'clerk', parentRef: 'finance', flowNodeRefs: ['check'] },
    { key: 'manager', parentRef: 'finance', flowNodeRefs: ['check'] },
  ];
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'LANE_MEMBERSHIP')
      .map((finding) => finding.elementRefs),
    [['finance'], ['manager', 'clerk', 'check']],
  );
  await assert.rejects(compileModel(request), { exitCode: 2 });
});

test('lane parent chains must resolve to an acyclic same-Process scope', async () => {
  const request = basicRequest();
  request.model.processes[0].lanes = [{ key: 'clerk', parentRef: 'missing-parent', flowNodeRefs: ['absent'] }];
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'REF_MISSING')
      .map((finding) => finding.elementRefs),
    [
      ['clerk', 'missing-parent'],
      ['clerk', 'absent'],
    ],
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
  request.model.processes[0].lanes = [
    { key: 'clerk', parentRef: 'manager' },
    { key: 'manager', parentRef: 'clerk' },
  ];
  assert.ok(validateModel(request).some((finding) => finding.code === 'CONTAINMENT_CYCLE'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
  request.model.processes[0].lanes = [{ key: 'clerk', parentRef: 'invoice-process', flowNodeRefs: ['foreign-task'] }];
  request.model.processes.push({
    key: 'other-process',
    nodes: [{ key: 'foreign-task', type: 'task', containerRef: 'other-process' }],
  });
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'LANE_MEMBERSHIP')
      .map((finding) => finding.elementRefs),
    [['clerk', 'foreign-task']],
  );
});

test('a multiply instantiated Process never silently chooses its Message Flow participant', async () => {
  const request = basicRequest();
  request.model.primaryRef = 'collaboration';
  request.model.collaboration = {
    key: 'collaboration',
    participants: [
      { key: 'north', processRef: 'invoice-process' },
      { key: 'south', processRef: 'invoice-process' },
      { key: 'buyer' },
    ],
    messageFlows: [{ key: 'handoff', sourceRef: 'check', targetRef: 'buyer' }],
  };
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'MODEL_AMBIGUOUS')
      .map((finding) => finding.elementRefs),
    [['handoff', 'check', 'north', 'south']],
  );
  await assert.rejects(compileModel(request), { exitCode: 2 });
  request.model.collaboration.messageFlows[0].sourceRef = 'north';
  assert.deepEqual(validateModel(request), []);
  const projection = await semanticProjection(await compileModel(request));
  assert.equal(
    projection.rootElements.find((element) => element.id === 'M_collaboration').messageFlows[0].sourceRef,
    'M_north',
  );
});

test('task classifications preserve design-time meaning without invented engine configuration', async () => {
  const request = basicRequest();
  const types = ['userTask', 'manualTask', 'serviceTask', 'businessRuleTask', 'scriptTask'];
  request.model.processes[0].nodes = types.map((type) => ({
    key: type,
    type,
    containerRef: 'invoice-process',
    name: `A ${type}`,
  }));
  request.model.processes[0].flows = [];
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  assert.deepEqual(
    projection.rootElements[0].flowElements,
    [...types]
      .sort((a, b) => a.localeCompare(b, 'en'))
      .map((type) => ({
        $type: `bpmn:${type[0].toUpperCase()}${type.slice(1)}`,
        id: `M_${type}`,
        name: `A ${type}`,
      })),
  );
  assert.doesNotMatch(xml, /implementation=|scriptFormat=|<bpmn:script>|extensionElements/);
});

test('standard and multi-instance repetition retain exactly the stated design-time loop semantics', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes = [
    {
      key: 'retry',
      type: 'task',
      containerRef: 'invoice-process',
      loop: { kind: 'standard', condition: 'Invoice remains incomplete', testBefore: true },
    },
    {
      key: 'sequential',
      type: 'userTask',
      containerRef: 'invoice-process',
      loop: { kind: 'multiInstance', sequential: true },
    },
    {
      key: 'parallel',
      type: 'serviceTask',
      containerRef: 'invoice-process',
      loop: { kind: 'multiInstance', sequential: false },
    },
  ];
  request.model.processes[0].flows = [];
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  assert.deepEqual(projection.rootElements[0].flowElements, [
    {
      $type: 'bpmn:ServiceTask',
      id: 'M_parallel',
      loopCharacteristics: { $type: 'bpmn:MultiInstanceLoopCharacteristics' },
    },
    {
      $type: 'bpmn:Task',
      id: 'M_retry',
      loopCharacteristics: {
        $type: 'bpmn:StandardLoopCharacteristics',
        testBefore: true,
        loopCondition: { $type: 'bpmn:FormalExpression', body: 'Invoice remains incomplete' },
      },
    },
    {
      $type: 'bpmn:UserTask',
      id: 'M_sequential',
      loopCharacteristics: { $type: 'bpmn:MultiInstanceLoopCharacteristics', isSequential: true },
    },
  ]);
  assert.equal((await validateXml(xml)).schemaValid, true);
  assert.doesNotMatch(xml, /loopCardinality|loopDataInputRef|inputDataItem|completionCondition/);
});

test('embedded Subprocess flow and responsibility remain nested independent of presentation', async () => {
  const request = basicRequest();
  const process = request.model.processes[0];
  process.nodes[1].type = 'subProcess';
  process.nodes.push(
    { key: 'child-start', type: 'startEvent', containerRef: 'check', event: { kind: 'none' } },
    { key: 'child-work', type: 'manualTask', containerRef: 'check', name: 'Inspect invoice' },
    { key: 'child-end', type: 'endEvent', containerRef: 'check', event: { kind: 'none' } },
  );
  process.flows.push(
    { key: 'child-first', containerRef: 'check', sourceRef: 'child-start', targetRef: 'child-work' },
    { key: 'child-last', containerRef: 'check', sourceRef: 'child-work', targetRef: 'child-end' },
  );
  process.lanes = [{ key: 'specialist', parentRef: 'check', flowNodeRefs: ['child-start', 'child-work', 'child-end'] }];
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  const subprocess = projection.rootElements[0].flowElements.find((element) => element.id === 'M_check');
  assert.deepEqual(subprocess, {
    $type: 'bpmn:SubProcess',
    id: 'M_check',
    name: 'Check invoice',
    incoming: ['M_received-to-check'],
    outgoing: ['M_check-to-complete'],
    flowElements: [
      { $type: 'bpmn:EndEvent', id: 'M_child-end', incoming: ['M_child-last'] },
      { $type: 'bpmn:SequenceFlow', id: 'M_child-first', sourceRef: 'M_child-start', targetRef: 'M_child-work' },
      { $type: 'bpmn:SequenceFlow', id: 'M_child-last', sourceRef: 'M_child-work', targetRef: 'M_child-end' },
      { $type: 'bpmn:StartEvent', id: 'M_child-start', outgoing: ['M_child-first'] },
      {
        $type: 'bpmn:ManualTask',
        id: 'M_child-work',
        name: 'Inspect invoice',
        incoming: ['M_child-first'],
        outgoing: ['M_child-last'],
      },
    ],
    laneSets: [
      {
        $type: 'bpmn:LaneSet',
        id: 'G_lanes_check',
        lanes: [
          {
            $type: 'bpmn:Lane',
            id: 'M_specialist',
            flowNodeRef: ['M_child-end', 'M_child-start', 'M_child-work'],
          },
        ],
      },
    ],
  });
  assert.equal((await validateXml(xml)).schemaValid, true);
  request.presentation = { direction: 'leftToRight', subprocesses: [{ elementRef: 'check', expanded: true }] };
  assert.deepEqual(await semanticProjection(await compileModel(request)), projection);
});

test('recursive Subprocess containment is refused without dropping a disconnected scope', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes = [
    { key: 'outer', type: 'subProcess', containerRef: 'inner' },
    { key: 'inner', type: 'subProcess', containerRef: 'outer' },
  ];
  request.model.processes[0].flows = [];
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'CONTAINMENT_CYCLE')
      .map((finding) => finding.elementRefs),
    [
      ['outer', 'outer'],
      ['inner', 'inner'],
    ],
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
});

test('a Sequence Flow cannot shortcut from a parent into its Subprocess', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes[1].type = 'subProcess';
  request.model.processes[0].nodes.push({ key: 'child', type: 'task', containerRef: 'check' });
  request.model.processes[0].flows[0].targetRef = 'child';
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'FLOW_SCOPE')
      .map((finding) => finding.elementRefs),
    [['received-to-check']],
  );
  await assert.rejects(compileModel(request), { exitCode: 2 });
  const projection = await semanticProjection(await compileModel(request, { allowInvalid: true }));
  assert.equal(
    projection.rootElements[0].flowElements.find((element) => element.id === 'M_received-to-check').targetRef,
    'M_child',
  );
  request.model.processes[0].nodes.pop();
  request.model.processes.push({ key: 'external', nodes: [{ key: 'child', type: 'task', containerRef: 'external' }] });
  const crossProcess = await semanticProjection(await compileModel(request, { allowInvalid: true }));
  assert.equal(
    crossProcess.rootElements
      .find((element) => element.id === 'M_invoice-process')
      .flowElements.find((element) => element.id === 'M_received-to-check').targetRef,
    'M_child',
  );
});

test('a Call Activity references an explicit same-file Process QName without copying its contents', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes[1] = {
    key: 'check',
    name: 'Check invoice',
    type: 'callActivity',
    containerRef: 'invoice-process',
    calledProcessRef: 'specialist-process',
  };
  request.model.processes.push({
    key: 'specialist-process',
    name: 'Specialist review',
    nodes: [{ key: 'specialist-task', type: 'userTask', containerRef: 'specialist-process' }],
  });
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  const call = projection.rootElements
    .find((element) => element.id === 'M_invoice-process')
    .flowElements.find((element) => element.id === 'M_check');
  assert.deepEqual(call, {
    $type: 'bpmn:CallActivity',
    id: 'M_check',
    name: 'Check invoice',
    incoming: ['M_received-to-check'],
    outgoing: ['M_check-to-complete'],
    calledElement: { namespace: 'urn:process-model:invoice-model', localName: 'M_specialist-process' },
  });
  assert.deepEqual(
    projection.rootElements.find((element) => element.id === 'M_specialist-process'),
    {
      $type: 'bpmn:Process',
      id: 'M_specialist-process',
      name: 'Specialist review',
      isExecutable: false,
      flowElements: [{ $type: 'bpmn:UserTask', id: 'M_specialist-task' }],
    },
  );
  assert.match(xml, /xmlns:tns="urn:process-model:invoice-model"/);
  assert.equal((await validateXml(xml)).schemaValid, true);
  const equivalentPrefix = xml.replaceAll('xmlns:tns=', 'xmlns:model=').replaceAll('tns:M_', 'model:M_');
  assert.deepEqual(
    await semanticProjection(equivalentPrefix),
    projection,
    'QName prefix spelling does not change process meaning',
  );
});

test('a Call Activity cannot hide an unresolved external process reference', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'callActivity',
    containerRef: 'invoice-process',
    calledProcessRef: 'absent-process',
  };
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'REF_MISSING')
      .map((finding) => finding.elementRefs),
    [['check', 'absent-process']],
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
});

test('loop markers cannot be silently accepted on non-Activity nodes', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'parallelGateway',
    containerRef: 'invoice-process',
    loop: { kind: 'multiInstance', sequential: false },
  };
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'LOOP_PLACEMENT')
      .map((finding) => finding.elementRefs),
    [['check']],
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
});

test('semantic projection treats a default BPMN namespace and its equivalent prefix identically', async () => {
  const xml = await compileModel(basicRequest());
  const equivalent = xml.replace('xmlns:bpmn=', 'xmlns=').replaceAll('<bpmn:', '<').replaceAll('</bpmn:', '</');
  assert.deepEqual(await semanticProjection(equivalent), await semanticProjection(xml));
});

test('expert invalid lane inspection preserves a resolvable foreign reference instead of omitting it', async () => {
  const request = basicRequest();
  request.model.processes[0].lanes = [
    { key: 'wrong-owner', parentRef: 'invoice-process', flowNodeRefs: ['foreign-task'] },
  ];
  request.model.processes.push({
    key: 'foreign-process',
    nodes: [{ key: 'foreign-task', type: 'task', containerRef: 'foreign-process' }],
  });
  await assert.rejects(compileModel(request), { exitCode: 2 });
  const projection = await semanticProjection(await compileModel(request, { allowInvalid: true }));
  assert.deepEqual(
    projection.rootElements.find((element) => element.id === 'M_invoice-process').laneSets[0].lanes[0].flowNodeRef,
    ['M_foreign-task'],
  );
});

test('Message Events retain their named payload and boundary interruption in every supported position', async () => {
  for (const [type, interrupting] of [
    ['startEvent'],
    ['intermediateCatchEvent'],
    ['intermediateThrowEvent'],
    ['endEvent'],
    ['boundaryEvent', true],
    ['boundaryEvent', false],
  ]) {
    const request = basicRequest();
    request.model.declarations = [{ key: 'invoice-message', type: 'message', name: 'Invoice' }];
    const event = {
      key: 'message-event',
      type,
      containerRef: 'invoice-process',
      event: { kind: 'message', ref: 'invoice-message' },
    };
    if (type === 'boundaryEvent') {
      Object.assign(event, { attachedToRef: 'check', interrupting });
      request.model.processes[0].nodes.push(event);
      request.model.processes[0].flows.push({
        key: 'boundary-path',
        containerRef: 'invoice-process',
        sourceRef: event.key,
        targetRef: 'end',
      });
    } else {
      const index = type === 'startEvent' ? 0 : type === 'endEvent' ? 2 : 1;
      event.key = request.model.processes[0].nodes[index].key;
      request.model.processes[0].nodes[index] = event;
    }
    const xml = await compileModel(request);
    const projection = await semanticProjection(xml);
    const projected = projection.rootElements
      .find((element) => element.id === 'M_invoice-process')
      .flowElements.find((element) => element.id === `M_${event.key}`);
    assert.deepEqual(projected.eventDefinitions, [
      { $type: 'bpmn:MessageEventDefinition', id: `G_event_${event.key}`, messageRef: 'M_invoice-message' },
    ]);
    if (type === 'boundaryEvent') {
      assert.equal(projected.attachedToRef, 'M_check');
      assert.equal(projected.cancelActivity ?? true, interrupting);
    }
    assert.equal((await validateXml(xml)).schemaValid, true);
  }
});

test('Signal Events preserve named broadcast meaning in catching, throwing, and boundary positions', async () => {
  for (const [type, interrupting] of [
    ['startEvent'],
    ['intermediateCatchEvent'],
    ['intermediateThrowEvent'],
    ['endEvent'],
    ['boundaryEvent', true],
    ['boundaryEvent', false],
  ]) {
    const request = basicRequest();
    request.model.declarations = [{ key: 'changed', type: 'signal', name: 'Invoice changed' }];
    const event = {
      key: 'signal-event',
      type,
      containerRef: 'invoice-process',
      event: { kind: 'signal', ref: 'changed' },
    };
    if (type === 'boundaryEvent') {
      Object.assign(event, { attachedToRef: 'check', interrupting });
      request.model.processes[0].nodes.push(event);
      request.model.processes[0].flows.push({
        key: 'signal-path',
        containerRef: 'invoice-process',
        sourceRef: event.key,
        targetRef: 'end',
      });
    } else {
      const index = type === 'startEvent' ? 0 : type === 'endEvent' ? 2 : 1;
      event.key = request.model.processes[0].nodes[index].key;
      request.model.processes[0].nodes[index] = event;
    }
    const xml = await compileModel(request);
    const projection = await semanticProjection(xml);
    assert.deepEqual(
      projection.rootElements.find((element) => element.id === 'M_changed'),
      { $type: 'bpmn:Signal', id: 'M_changed', name: 'Invoice changed' },
    );
    const projected = projection.rootElements
      .find((element) => element.id === 'M_invoice-process')
      .flowElements.find((element) => element.id === `M_${event.key}`);
    assert.deepEqual(projected.eventDefinitions, [
      { $type: 'bpmn:SignalEventDefinition', id: `G_event_${event.key}`, signalRef: 'M_changed' },
    ]);
    if (type === 'boundaryEvent') assert.equal(projected.cancelActivity ?? true, interrupting);
    assert.equal((await validateXml(xml)).schemaValid, true);
  }
});

test('Timer Events retain exactly one inert timer expression in each legal placement', async () => {
  for (const [field, value] of [
    ['timeDate', '2026-10-01T09:00:00Z'],
    ['timeDuration', 'P1D'],
    ['timeCycle', 'R3/PT1H'],
  ]) {
    for (const [type, interrupting] of [
      ['startEvent'],
      ['intermediateCatchEvent'],
      ['boundaryEvent', true],
      ['boundaryEvent', false],
    ]) {
      const request = basicRequest();
      const event = { key: 'timer', type, containerRef: 'invoice-process', event: { kind: 'timer', [field]: value } };
      if (type === 'boundaryEvent') {
        Object.assign(event, { attachedToRef: 'check', interrupting });
        request.model.processes[0].nodes.push(event);
        request.model.processes[0].flows.push({
          key: 'timer-path',
          containerRef: 'invoice-process',
          sourceRef: event.key,
          targetRef: 'end',
        });
      } else {
        const index = type === 'startEvent' ? 0 : 1;
        event.key = request.model.processes[0].nodes[index].key;
        request.model.processes[0].nodes[index] = event;
      }
      const xml = await compileModel(request);
      const projection = await semanticProjection(xml);
      const projected = projection.rootElements[0].flowElements.find((element) => element.id === `M_${event.key}`);
      assert.deepEqual(projected.eventDefinitions, [
        {
          $type: 'bpmn:TimerEventDefinition',
          id: `G_event_${event.key}`,
          [field]: { $type: 'bpmn:FormalExpression', body: value },
        },
      ]);
      if (type === 'boundaryEvent') assert.equal(projected.cancelActivity ?? true, interrupting);
      assert.equal((await validateXml(xml)).schemaValid, true);
    }
  }
});

test('Conditional Events preserve the supplied business condition without an execution binding', async () => {
  for (const [type, interrupting] of [
    ['startEvent'],
    ['intermediateCatchEvent'],
    ['boundaryEvent', true],
    ['boundaryEvent', false],
  ]) {
    const request = basicRequest();
    const event = {
      key: 'condition',
      type,
      containerRef: 'invoice-process',
      event: { kind: 'conditional', condition: 'All invoice evidence is available' },
    };
    if (type === 'boundaryEvent') {
      Object.assign(event, { attachedToRef: 'check', interrupting });
      request.model.processes[0].nodes.push(event);
      request.model.processes[0].flows.push({
        key: 'condition-path',
        containerRef: 'invoice-process',
        sourceRef: event.key,
        targetRef: 'end',
      });
    } else {
      const index = type === 'startEvent' ? 0 : 1;
      event.key = request.model.processes[0].nodes[index].key;
      request.model.processes[0].nodes[index] = event;
    }
    const xml = await compileModel(request);
    const projection = await semanticProjection(xml);
    const projected = projection.rootElements[0].flowElements.find((element) => element.id === `M_${event.key}`);
    assert.deepEqual(projected.eventDefinitions, [
      {
        $type: 'bpmn:ConditionalEventDefinition',
        id: `G_event_${event.key}`,
        condition: { $type: 'bpmn:FormalExpression', body: 'All invoice evidence is available' },
      },
    ]);
    if (type === 'boundaryEvent') assert.equal(projected.cancelActivity ?? true, interrupting);
    assert.equal((await validateXml(xml)).schemaValid, true);
  }
});

test('event triggers cannot be moved into illegal throwing or embedded-start positions', async () => {
  for (const event of [
    { kind: 'timer', timeDuration: 'P1D' },
    { kind: 'conditional', condition: 'Evidence received' },
  ]) {
    for (const type of ['intermediateThrowEvent', 'endEvent']) {
      const request = basicRequest();
      request.model.processes[0].nodes[1] = { key: 'check', type, containerRef: 'invoice-process', event };
      assert.deepEqual(
        validateModel(request)
          .filter((finding) => finding.code === 'EVENT_PLACEMENT')
          .map((finding) => finding.elementRefs)
          .filter((refs) => refs.length === 1),
        [['check']],
      );
      await assert.rejects(compileModel(request), { exitCode: 2 });
      assert.match(await compileModel(request, { allowInvalid: true }), /EventDefinition/);
    }
  }
  const nested = basicRequest();
  nested.model.processes[0].nodes[1].type = 'subProcess';
  nested.model.processes[0].nodes.push({
    key: 'triggered-child',
    type: 'startEvent',
    containerRef: 'check',
    event: { kind: 'timer', timeDuration: 'P1D' },
  });
  assert.ok(
    validateModel(nested).some(
      (finding) => finding.code === 'EVENT_PLACEMENT' && finding.elementRefs.includes('triggered-child'),
    ),
  );
});

test('boundary attachments and named Event references resolve without silent substitution', async () => {
  const request = basicRequest();
  request.model.declarations = [{ key: 'wrong-kind', type: 'signal' }];
  request.model.processes[0].nodes.push({
    key: 'boundary',
    type: 'boundaryEvent',
    containerRef: 'invoice-process',
    attachedToRef: 'absent',
    interrupting: true,
    event: { kind: 'message', ref: 'wrong-kind' },
  });
  request.model.processes[0].flows.push({
    key: 'recovery',
    containerRef: 'invoice-process',
    sourceRef: 'boundary',
    targetRef: 'end',
  });
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'REF_MISSING')
      .map((finding) => finding.elementRefs),
    [
      ['boundary', 'wrong-kind'],
      ['boundary', 'absent'],
    ],
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
  const boundary = request.model.processes[0].nodes[3];
  boundary.event = { kind: 'signal', ref: 'wrong-kind' };
  boundary.attachedToRef = 'start';
  assert.ok(validateModel(request).some((finding) => finding.code === 'BOUNDARY_ATTACHMENT'));
  boundary.attachedToRef = 'check';
  assert.deepEqual(validateModel(request), []);
  request.model.processes[0].nodes[1].type = 'subProcess';
  boundary.containerRef = 'check';
  assert.ok(validateModel(request).some((finding) => finding.code === 'BOUNDARY_ATTACHMENT'));
});

test('events and gateways cannot claim legal control flow when their required connections are absent', async () => {
  const request = basicRequest();
  request.model.declarations = [{ key: 'message', type: 'message' }];
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'intermediateCatchEvent',
    containerRef: 'invoice-process',
    event: { kind: 'message', ref: 'message' },
  };
  request.model.processes[0].flows = [];
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'EVENT_FLOW')
      .map((finding) => finding.elementRefs),
    [['start'], ['check'], ['end']],
  );
  request.model.processes[0].nodes[1] = { key: 'check', type: 'parallelGateway', containerRef: 'invoice-process' };
  assert.ok(
    validateModel(request).some((finding) => finding.code === 'GATEWAY_FLOW' && finding.elementRefs.includes('check')),
  );
  request.model.processes[0].nodes = request.model.processes[0].nodes.filter((node) => node.type !== 'endEvent');
  assert.ok(validateModel(request).some((finding) => finding.code === 'EVENT_SCOPE'));
  await assert.rejects(compileModel(request), { exitCode: 2 });
  assert.match(await compileModel(request, { allowInvalid: true }), /M_check/);
});

test('Event-Based Gateways preserve competition and explicit instantiating variants', async () => {
  for (const variant of [{}, { instantiate: true }, { instantiate: true, eventGatewayType: 'Parallel' }]) {
    const request = basicRequest();
    request.model.declarations = [{ key: 'reply', type: 'message' }];
    const process = request.model.processes[0];
    process.nodes[1] = { key: 'check', type: 'eventBasedGateway', containerRef: 'invoice-process', ...variant };
    process.nodes.push(
      {
        key: 'reply-wait',
        type: 'intermediateCatchEvent',
        containerRef: 'invoice-process',
        event: { kind: 'message', ref: 'reply' },
      },
      {
        key: 'timeout',
        type: 'intermediateCatchEvent',
        containerRef: 'invoice-process',
        event: { kind: 'timer', timeDuration: 'P1D' },
      },
    );
    process.flows = [
      process.flows[0],
      { key: 'on-reply', containerRef: 'invoice-process', sourceRef: 'check', targetRef: 'reply-wait' },
      { key: 'on-timeout', containerRef: 'invoice-process', sourceRef: 'check', targetRef: 'timeout' },
      { key: 'reply-done', containerRef: 'invoice-process', sourceRef: 'reply-wait', targetRef: 'end' },
      { key: 'timeout-done', containerRef: 'invoice-process', sourceRef: 'timeout', targetRef: 'end' },
    ];
    if (variant.instantiate) {
      process.nodes.shift();
      process.flows.shift();
    }
    const xml = await compileModel(request);
    const projection = await semanticProjection(xml);
    const gateway = projection.rootElements
      .find((element) => element.id === 'M_invoice-process')
      .flowElements.find((element) => element.id === 'M_check');
    assert.deepEqual(gateway, {
      $type: 'bpmn:EventBasedGateway',
      id: 'M_check',
      outgoing: ['M_on-reply', 'M_on-timeout'],
      ...(variant.instantiate ? {} : { incoming: ['M_received-to-check'] }),
      ...variant,
    });
    assert.equal((await validateXml(xml)).schemaValid, true);
  }
});

test('event-based configurations refuse illegal targets, instantiation, and receive-message mixing', async () => {
  const request = basicRequest();
  const process = request.model.processes[0];
  process.nodes[1] = {
    key: 'check',
    type: 'eventBasedGateway',
    containerRef: 'invoice-process',
    eventGatewayType: 'Parallel',
  };
  assert.ok(validateModel(request).some((finding) => finding.code === 'EVENT_BASED_FLOW'));
  assert.ok(validateModel(request).some((finding) => finding.code === 'EVENT_BASED_TARGET'));
  process.nodes[1].instantiate = true;
  assert.ok(validateModel(request).some((finding) => finding.code === 'EVENT_BASED_FLOW'));
  delete process.nodes[1].instantiate;
  delete process.nodes[1].eventGatewayType;
  process.nodes.push(
    { key: 'receive', type: 'receiveTask', containerRef: 'invoice-process' },
    {
      key: 'message-catch',
      type: 'intermediateCatchEvent',
      containerRef: 'invoice-process',
      event: { kind: 'message', ref: 'reply' },
    },
  );
  request.model.declarations = [{ key: 'reply', type: 'message' }];
  process.flows = [
    process.flows[0],
    { key: 'to-receive', containerRef: 'invoice-process', sourceRef: 'check', targetRef: 'receive' },
    { key: 'to-message', containerRef: 'invoice-process', sourceRef: 'check', targetRef: 'message-catch' },
    { key: 'receive-done', containerRef: 'invoice-process', sourceRef: 'receive', targetRef: 'end' },
    { key: 'message-done', containerRef: 'invoice-process', sourceRef: 'message-catch', targetRef: 'end' },
  ];
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'EVENT_BASED_MIX')
      .map((finding) => finding.elementRefs),
    [['check']],
  );
  process.nodes[4].event = { kind: 'timer', timeDuration: 'P1D' };
  assert.deepEqual(validateModel(request), []);
  process.flows.push({ key: 'extra-entry', containerRef: 'invoice-process', sourceRef: 'start', targetRef: 'receive' });
  assert.ok(
    validateModel(request).some(
      (finding) => finding.code === 'EVENT_BASED_TARGET' && finding.elementRefs.includes('receive'),
    ),
  );
  process.flows.pop();
  process.nodes.push({
    key: 'attached-timer',
    type: 'boundaryEvent',
    containerRef: 'invoice-process',
    attachedToRef: 'receive',
    interrupting: false,
    event: { kind: 'timer', timeDuration: 'PT1H' },
  });
  process.flows.push({
    key: 'attached-done',
    containerRef: 'invoice-process',
    sourceRef: 'attached-timer',
    targetRef: 'end',
  });
  assert.ok(
    validateModel(request).some(
      (finding) => finding.code === 'EVENT_BASED_TARGET' && finding.elementRefs.includes('receive'),
    ),
  );
  await assert.rejects(compileModel(request), { exitCode: 2 });
});

test('None Events stay within the profile Start and End positions', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'intermediateThrowEvent',
    containerRef: 'invoice-process',
    event: { kind: 'none' },
  };
  assert.ok(
    validateModel(request).some((finding) => finding.code === 'CONCEPT_DEFERRED' && finding.category === 'profile'),
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'boundaryEvent',
    attachedToRef: 'start',
    interrupting: true,
    containerRef: 'invoice-process',
    event: { kind: 'none' },
  };
  assert.ok(validateModel(request).some((finding) => finding.code === 'EVENT_PLACEMENT'));
});

test('named communication references agree and intermediate Message Events do not fan out messages', async () => {
  const request = basicRequest();
  request.model.primaryRef = 'collaboration';
  request.model.declarations = [
    { key: 'invoice', type: 'message' },
    { key: 'receipt', type: 'message' },
  ];
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'sendTask',
    containerRef: 'invoice-process',
    messageRef: 'invoice',
  };
  request.model.collaboration = {
    key: 'collaboration',
    participants: [{ key: 'sender', processRef: 'invoice-process' }, { key: 'buyer' }, { key: 'archive' }],
    messageFlows: [{ key: 'message-one', sourceRef: 'check', targetRef: 'buyer', messageRef: 'receipt' }],
  };
  assert.ok(validateModel(request).some((finding) => finding.code === 'MESSAGE_MISMATCH'));
  request.model.collaboration.messageFlows[0].messageRef = 'invoice';
  request.model.collaboration.messageFlows.push({
    key: 'message-two',
    sourceRef: 'check',
    targetRef: 'archive',
    messageRef: 'invoice',
  });
  assert.deepEqual(validateModel(request), []);
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'intermediateThrowEvent',
    containerRef: 'invoice-process',
    event: { kind: 'message', ref: 'invoice' },
  };
  assert.ok(validateModel(request).some((finding) => finding.code === 'MESSAGE_CARDINALITY'));
  await assert.rejects(compileModel(request), { exitCode: 2 });
});

test('Error Events preserve named throws and interrupting named or catch-all boundaries', async () => {
  for (const ref of ['invalid-invoice', undefined]) {
    const request = basicRequest();
    request.model.declarations = [
      { key: 'invalid-invoice', type: 'error', name: 'Invalid invoice', code: 'INV_INVALID' },
    ];
    request.model.processes[0].nodes[2].event = { kind: 'error', ref: 'invalid-invoice' };
    request.model.processes[0].nodes.push({
      key: 'error-boundary',
      type: 'boundaryEvent',
      containerRef: 'invoice-process',
      attachedToRef: 'check',
      interrupting: true,
      event: { kind: 'error', ...(ref === undefined ? {} : { ref }) },
    });
    request.model.processes[0].flows.push({
      key: 'error-path',
      containerRef: 'invoice-process',
      sourceRef: 'error-boundary',
      targetRef: 'end',
    });
    const xml = await compileModel(request);
    const projection = await semanticProjection(xml);
    assert.deepEqual(
      projection.rootElements.find((element) => element.id === 'M_invalid-invoice'),
      { $type: 'bpmn:Error', id: 'M_invalid-invoice', name: 'Invalid invoice', errorCode: 'INV_INVALID' },
    );
    const process = projection.rootElements.find((element) => element.id === 'M_invoice-process');
    assert.deepEqual(process.flowElements.find((element) => element.id === 'M_end').eventDefinitions, [
      { $type: 'bpmn:ErrorEventDefinition', id: 'G_event_end', errorRef: 'M_invalid-invoice' },
    ]);
    assert.deepEqual(process.flowElements.find((element) => element.id === 'M_error-boundary').eventDefinitions, [
      {
        $type: 'bpmn:ErrorEventDefinition',
        id: 'G_event_error-boundary',
        ...(ref === undefined ? {} : { errorRef: 'M_invalid-invoice' }),
      },
    ]);
    assert.equal((await validateXml(xml)).schemaValid, true);
  }
});

test('Escalation Events preserve ordinary continuation and either explicit boundary interruption choice', async () => {
  for (const interrupting of [true, false])
    for (const ref of ['review-needed', undefined]) {
      const request = basicRequest();
      request.model.declarations = [
        { key: 'review-needed', type: 'escalation', name: 'Review needed', code: 'REVIEW' },
      ];
      request.model.processes[0].nodes[1] = { key: 'check', type: 'subProcess', containerRef: 'invoice-process' };
      request.model.processes[0].nodes[2].event = { kind: 'escalation', ref: 'review-needed' };
      request.model.processes[0].nodes.push(
        {
          key: 'raise',
          type: 'intermediateThrowEvent',
          containerRef: 'check',
          event: { kind: 'escalation', ref: 'review-needed' },
        },
        { key: 'work', type: 'task', containerRef: 'check' },
        { key: 'continue', type: 'task', containerRef: 'check' },
        {
          key: 'escalation-boundary',
          type: 'boundaryEvent',
          containerRef: 'invoice-process',
          attachedToRef: 'check',
          interrupting,
          event: { kind: 'escalation', ...(ref === undefined ? {} : { ref }) },
        },
      );
      request.model.processes[0].flows.push(
        { key: 'raise-path', containerRef: 'check', sourceRef: 'work', targetRef: 'raise' },
        { key: 'continue-path', containerRef: 'check', sourceRef: 'raise', targetRef: 'continue' },
        { key: 'escalation-path', containerRef: 'invoice-process', sourceRef: 'escalation-boundary', targetRef: 'end' },
      );
      const xml = await compileModel(request);
      const projection = await semanticProjection(xml);
      const process = projection.rootElements.find((element) => element.id === 'M_invoice-process');
      assert.deepEqual(
        projection.rootElements.find((element) => element.id === 'M_review-needed'),
        { $type: 'bpmn:Escalation', id: 'M_review-needed', name: 'Review needed', escalationCode: 'REVIEW' },
      );
      const boundary = process.flowElements.find((element) => element.id === 'M_escalation-boundary');
      assert.equal(boundary.cancelActivity ?? true, interrupting);
      assert.deepEqual(boundary.eventDefinitions, [
        {
          $type: 'bpmn:EscalationEventDefinition',
          id: 'G_event_escalation-boundary',
          ...(ref === undefined ? {} : { escalationRef: 'M_review-needed' }),
        },
      ]);
      const raised = process.flowElements
        .find((element) => element.id === 'M_check')
        .flowElements.find((element) => element.id === 'M_raise');
      assert.deepEqual(raised.eventDefinitions, [
        { $type: 'bpmn:EscalationEventDefinition', id: 'G_event_raise', escalationRef: 'M_review-needed' },
      ]);
      assert.deepEqual(raised.outgoing, ['M_continue-path']);
      assert.equal((await validateXml(xml)).schemaValid, true);
    }
});

test('Terminate End Events retain their enclosing scope without converting the parent completion', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes[1].type = 'subProcess';
  request.model.processes[0].nodes.push(
    { key: 'inner-start', type: 'startEvent', containerRef: 'check', event: { kind: 'none' } },
    { key: 'inner-work', type: 'task', containerRef: 'check' },
    { key: 'stop-inner', type: 'endEvent', containerRef: 'check', event: { kind: 'terminate' } },
  );
  request.model.processes[0].flows.push({
    key: 'terminate-path',
    containerRef: 'check',
    sourceRef: 'inner-work',
    targetRef: 'stop-inner',
  });
  request.model.processes[0].flows.push({
    key: 'inner-entry',
    containerRef: 'check',
    sourceRef: 'inner-start',
    targetRef: 'inner-work',
  });
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  const process = projection.rootElements[0];
  assert.equal(process.flowElements.find((element) => element.id === 'M_end').eventDefinitions, undefined);
  assert.deepEqual(
    process.flowElements
      .find((element) => element.id === 'M_check')
      .flowElements.find((element) => element.id === 'M_stop-inner').eventDefinitions,
    [{ $type: 'bpmn:TerminateEventDefinition', id: 'G_event_stop-inner' }],
  );
  assert.equal((await validateXml(xml)).schemaValid, true);
});

test('exception Events require legal positions, named throws, and interrupting Error catches', async () => {
  for (const [kind, type] of [
    ['error', 'startEvent'],
    ['error', 'intermediateCatchEvent'],
    ['error', 'intermediateThrowEvent'],
    ['escalation', 'startEvent'],
    ['escalation', 'intermediateCatchEvent'],
    ['terminate', 'intermediateThrowEvent'],
    ['terminate', 'boundaryEvent'],
  ]) {
    const request = basicRequest();
    request.model.declarations = [{ key: 'exception', type: kind === 'terminate' ? 'error' : kind }];
    request.model.processes[0].nodes[1] = {
      key: 'check',
      type,
      containerRef: 'invoice-process',
      ...(type === 'boundaryEvent' ? { attachedToRef: 'start', interrupting: true } : {}),
      event: { kind, ...(kind === 'terminate' ? {} : { ref: 'exception' }) },
    };
    assert.ok(
      validateModel(request).some((finding) => finding.code === 'EVENT_PLACEMENT' && finding.elementRefs.length === 1),
    );
    await assert.rejects(compileModel(request), { exitCode: 2 });
  }
  const request = basicRequest();
  request.model.processes[0].nodes[2].event = { kind: 'error' };
  assert.ok(validateModel(request).some((finding) => finding.code === 'REF_MISSING'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
  request.model.processes[0].nodes[2].event = { kind: 'none' };
  request.model.processes[0].nodes.push({
    key: 'catch',
    type: 'boundaryEvent',
    containerRef: 'invoice-process',
    attachedToRef: 'check',
    interrupting: false,
    event: { kind: 'error' },
  });
  request.model.processes[0].flows.push({
    key: 'catch-path',
    containerRef: 'invoice-process',
    sourceRef: 'catch',
    targetRef: 'end',
  });
  assert.ok(validateModel(request).some((finding) => finding.code === 'EVENT_INTERRUPTION'));
  const projection = await semanticProjection(await compileModel(request, { allowInvalid: true }));
  assert.equal(
    projection.rootElements[0].flowElements.find((element) => element.id === 'M_catch').cancelActivity,
    false,
  );
});

test('same-scope Link continuation derives stable definition references without inventing Sequence Flows', async () => {
  const request = basicRequest();
  const process = request.model.processes[0];
  process.nodes.push(
    {
      key: 'jump-one',
      type: 'intermediateThrowEvent',
      containerRef: 'invoice-process',
      event: { kind: 'link', name: 'Continue review' },
    },
    {
      key: 'jump-two',
      type: 'intermediateThrowEvent',
      containerRef: 'invoice-process',
      event: { kind: 'link', name: 'Continue review' },
    },
    {
      key: 'resume',
      type: 'intermediateCatchEvent',
      containerRef: 'invoice-process',
      event: { kind: 'link', name: 'Continue review' },
    },
  );
  process.flows = [
    process.flows[1],
    { key: 'start-one', containerRef: 'invoice-process', sourceRef: 'start', targetRef: 'jump-one' },
    { key: 'start-two', containerRef: 'invoice-process', sourceRef: 'start', targetRef: 'jump-two' },
    { key: 'resume-review', containerRef: 'invoice-process', sourceRef: 'resume', targetRef: 'check' },
  ];
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  const elements = projection.rootElements[0].flowElements;
  assert.deepEqual(elements.find((element) => element.id === 'M_resume').eventDefinitions, [
    {
      $type: 'bpmn:LinkEventDefinition',
      id: 'G_event_resume',
      name: 'Continue review',
      source: ['G_event_jump-one', 'G_event_jump-two'],
    },
  ]);
  assert.deepEqual(elements.find((element) => element.id === 'M_jump-one').eventDefinitions, [
    { $type: 'bpmn:LinkEventDefinition', id: 'G_event_jump-one', name: 'Continue review', target: 'G_event_resume' },
  ]);
  assert.equal(elements.filter((element) => element.$type === 'bpmn:SequenceFlow').length, 4);
  assert.equal((await validateXml(xml)).schemaValid, true);
});

test('Link continuation refuses unmatched names, multiple catches, cross-scope matching, and flow shortcuts', async () => {
  const request = basicRequest();
  const process = request.model.processes[0];
  process.nodes[1] = {
    key: 'check',
    type: 'intermediateThrowEvent',
    containerRef: 'invoice-process',
    event: { kind: 'link', name: 'Review' },
  };
  assert.ok(validateModel(request).some((finding) => finding.code === 'LINK_MATCHING'));
  assert.ok(validateModel(request).some((finding) => finding.code === 'EVENT_FLOW'));
  process.nodes.push({
    key: 'resume',
    type: 'intermediateCatchEvent',
    containerRef: 'invoice-process',
    event: { kind: 'link', name: 'Review' },
  });
  process.flows[1].sourceRef = 'resume';
  assert.deepEqual(validateModel(request), []);
  process.nodes.push({
    key: 'duplicate-resume',
    type: 'intermediateCatchEvent',
    containerRef: 'invoice-process',
    event: { kind: 'link', name: 'Review' },
  });
  assert.ok(validateModel(request).some((finding) => finding.code === 'LINK_MATCHING'));
  await assert.rejects(compileModel(request), { exitCode: 2 });
  process.nodes.pop();
  process.nodes[3].containerRef = 'nested';
  process.nodes.push({ key: 'nested', type: 'subProcess', containerRef: 'invoice-process' });
  assert.ok(validateModel(request).some((finding) => finding.code === 'LINK_MATCHING'));
  process.nodes[1].type = 'startEvent';
  assert.ok(
    validateModel(request).some((finding) => finding.code === 'EVENT_PLACEMENT' && finding.elementRefs.length === 1),
  );
});

test('an explicit End Event requires explicit entry while entirely eventless scopes remain legal', async () => {
  const request = basicRequest();
  request.model.processes[0].nodes.shift();
  request.model.processes[0].flows.shift();
  assert.ok(validateModel(request).some((finding) => finding.code === 'EVENT_SCOPE'));
  request.model.processes[0].nodes.pop();
  request.model.processes[0].flows = [];
  assert.deepEqual(validateModel(request), []);
});

test('Data Objects, States, and Data Stores retain distinct stable references and capacity semantics', async () => {
  const request = basicRequest();
  request.model.declarations = [
    { key: 'archive', type: 'dataStore', name: 'Invoice archive', capacity: 1000, unlimited: false },
    { key: 'unused-store', type: 'dataStore' },
  ];
  request.model.processes[0].artifacts = [
    {
      key: 'invoice-copy',
      type: 'dataObjectReference',
      containerRef: 'invoice-process',
      dataObjectRef: 'invoice-data',
      name: 'Approved invoice',
      state: 'Approved',
    },
    { key: 'invoice-data', type: 'dataObject', containerRef: 'invoice-process', name: 'Invoices', isCollection: true },
    {
      key: 'archive-view',
      type: 'dataStoreReference',
      containerRef: 'invoice-process',
      dataStoreRef: 'archive',
      state: 'Retained',
    },
  ];
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  assert.deepEqual(
    projection.rootElements.find((element) => element.id === 'M_archive'),
    { $type: 'bpmn:DataStore', id: 'M_archive', name: 'Invoice archive', capacity: 1000, isUnlimited: false },
  );
  assert.deepEqual(
    projection.rootElements.find((element) => element.id === 'M_unused-store'),
    { $type: 'bpmn:DataStore', id: 'M_unused-store' },
  );
  const elements = projection.rootElements.find((element) => element.id === 'M_invoice-process').flowElements;
  assert.deepEqual(
    elements.find((element) => element.id === 'M_invoice-data'),
    { $type: 'bpmn:DataObject', id: 'M_invoice-data', name: 'Invoices', isCollection: true },
  );
  assert.deepEqual(
    elements.find((element) => element.id === 'M_invoice-copy'),
    {
      $type: 'bpmn:DataObjectReference',
      id: 'M_invoice-copy',
      name: 'Approved invoice',
      dataObjectRef: 'M_invoice-data',
      dataState: { $type: 'bpmn:DataState', id: 'G_state_invoice-copy', name: 'Approved' },
    },
  );
  assert.deepEqual(
    elements.find((element) => element.id === 'M_archive-view'),
    {
      $type: 'bpmn:DataStoreReference',
      id: 'M_archive-view',
      dataStoreRef: 'M_archive',
      dataState: { $type: 'bpmn:DataState', id: 'G_state_archive-view', name: 'Retained' },
    },
  );
  assert.equal((await validateXml(xml)).schemaValid, true);
});

test('data artifact references and lifecycle scope cannot silently resolve to another kind or a child lifetime', async () => {
  const request = basicRequest();
  request.model.declarations = [{ key: 'not-a-store', type: 'message' }];
  request.model.processes[0].artifacts = [
    { key: 'data-reference', type: 'dataObjectReference', containerRef: 'invoice-process', dataObjectRef: 'absent' },
    {
      key: 'store-reference',
      type: 'dataStoreReference',
      containerRef: 'invoice-process',
      dataStoreRef: 'not-a-store',
    },
  ];
  assert.deepEqual(
    validateModel(request)
      .filter((finding) => finding.code === 'REF_MISSING')
      .map((finding) => finding.elementRefs),
    [
      ['data-reference', 'absent'],
      ['store-reference', 'not-a-store'],
    ],
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
  request.model.processes[0].artifacts.pop();
  request.model.processes[0].nodes[1].type = 'subProcess';
  request.model.processes[0].artifacts.push({ key: 'child-data', type: 'dataObject', containerRef: 'check' });
  request.model.processes[0].artifacts[0].dataObjectRef = 'child-data';
  assert.ok(validateModel(request).some((finding) => finding.code === 'DATA_SCOPE'));
  request.model.processes[0].artifacts[0].containerRef = 'check';
  request.model.processes[0].artifacts[1].containerRef = 'invoice-process';
  assert.deepEqual(validateModel(request), []);
  request.model.processes[0].artifacts[0].containerRef = 'end';
  assert.ok(validateModel(request).some((finding) => finding.code === 'ARTIFACT_SCOPE'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
});

test('Process and Activity IO preserve declarations with complete derived input and output sets', async () => {
  const request = basicRequest();
  request.model.processes[0].artifacts = [
    { key: 'process-input', type: 'dataInput', ownerRef: 'invoice-process', name: 'Invoices', isCollection: true },
    { key: 'process-output', type: 'dataOutput', ownerRef: 'invoice-process', name: 'Review results' },
    { key: 'task-input', type: 'dataInput', ownerRef: 'check', name: 'Invoice' },
    { key: 'task-output', type: 'dataOutput', ownerRef: 'check', name: 'Decision' },
  ];
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  const process = projection.rootElements[0];
  assert.deepEqual(process.ioSpecification, {
    $type: 'bpmn:InputOutputSpecification',
    id: 'G_io_invoice-process',
    dataInputs: [{ $type: 'bpmn:DataInput', id: 'M_process-input', name: 'Invoices', isCollection: true }],
    dataOutputs: [{ $type: 'bpmn:DataOutput', id: 'M_process-output', name: 'Review results' }],
    inputSets: [{ $type: 'bpmn:InputSet', id: 'G_inputSet_invoice-process', dataInputRefs: ['M_process-input'] }],
    outputSets: [{ $type: 'bpmn:OutputSet', id: 'G_outputSet_invoice-process', dataOutputRefs: ['M_process-output'] }],
  });
  assert.deepEqual(process.flowElements.find((element) => element.id === 'M_check').ioSpecification, {
    $type: 'bpmn:InputOutputSpecification',
    id: 'G_io_check',
    dataInputs: [{ $type: 'bpmn:DataInput', id: 'M_task-input', name: 'Invoice' }],
    dataOutputs: [{ $type: 'bpmn:DataOutput', id: 'M_task-output', name: 'Decision' }],
    inputSets: [{ $type: 'bpmn:InputSet', id: 'G_inputSet_check', dataInputRefs: ['M_task-input'] }],
    outputSets: [{ $type: 'bpmn:OutputSet', id: 'G_outputSet_check', dataOutputRefs: ['M_task-output'] }],
  });
  assert.equal((await validateXml(xml)).schemaValid, true);
});

test('Events use direct catching outputs and throwing inputs instead of an Activity IO specification', async () => {
  for (const [type, input] of [
    ['startEvent', false],
    ['intermediateCatchEvent', false],
    ['boundaryEvent', false],
    ['intermediateThrowEvent', true],
    ['endEvent', true],
  ]) {
    const request = basicRequest();
    request.model.declarations = [{ key: 'invoice', type: 'message' }];
    const event = { key: 'event', type, containerRef: 'invoice-process', event: { kind: 'message', ref: 'invoice' } };
    if (type === 'boundaryEvent') {
      Object.assign(event, { attachedToRef: 'check', interrupting: false });
      request.model.processes[0].nodes.push(event);
      request.model.processes[0].flows.push({
        key: 'boundary-path',
        containerRef: 'invoice-process',
        sourceRef: 'event',
        targetRef: 'end',
      });
    } else {
      const index = type === 'startEvent' ? 0 : type === 'endEvent' ? 2 : 1;
      event.key = request.model.processes[0].nodes[index].key;
      request.model.processes[0].nodes[index] = event;
    }
    request.model.processes[0].artifacts = [
      {
        key: 'event-data',
        type: input ? 'dataInput' : 'dataOutput',
        ownerRef: event.key,
        name: 'Invoice payload',
        isCollection: true,
      },
    ];
    const xml = await compileModel(request);
    const projection = await semanticProjection(xml);
    const projected = projection.rootElements
      .find((element) => element.id === 'M_invoice-process')
      .flowElements.find((element) => element.id === `M_${event.key}`);
    assert.equal(projected.ioSpecification, undefined);
    assert.deepEqual(projected[input ? 'dataInputs' : 'dataOutputs'], [
      {
        $type: input ? 'bpmn:DataInput' : 'bpmn:DataOutput',
        id: 'M_event-data',
        name: 'Invoice payload',
        isCollection: true,
      },
    ]);
    assert.deepEqual(projected[input ? 'inputSet' : 'outputSet'], {
      $type: input ? 'bpmn:InputSet' : 'bpmn:OutputSet',
      id: `G_${input ? 'inputSet' : 'outputSet'}_${event.key}`,
      [input ? 'dataInputRefs' : 'dataOutputRefs']: ['M_event-data'],
    });
    assert.equal((await validateXml(xml)).schemaValid, true);
  }
});

test('IO declarations enforce legal owners, direction, and named communication cardinality', async () => {
  const request = basicRequest();
  request.model.processes[0].artifacts = [{ key: 'input', type: 'dataInput', ownerRef: 'absent' }];
  assert.ok(validateModel(request).some((finding) => finding.code === 'REF_MISSING'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
  request.model.processes[0].artifacts[0].ownerRef = 'start';
  assert.ok(validateModel(request).some((finding) => finding.code === 'IO_DIRECTION'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
  request.model.processes[0].artifacts[0].ownerRef = 'check';
  request.model.processes[0].nodes[1].type = 'subProcess';
  assert.ok(validateModel(request).some((finding) => finding.code === 'IO_PLACEMENT'));
  request.model.processes[0].nodes[1] = {
    key: 'check',
    type: 'sendTask',
    containerRef: 'invoice-process',
    messageRef: 'invoice',
  };
  request.model.declarations = [{ key: 'invoice', type: 'message' }];
  request.model.processes[0].artifacts.push({ key: 'second-input', type: 'dataInput', ownerRef: 'check' });
  assert.ok(validateModel(request).some((finding) => finding.code === 'IO_CARDINALITY'));
  delete request.model.processes[0].nodes[1].messageRef;
  assert.deepEqual(validateModel(request), []);
  request.model.processes[0].nodes[1].type = 'parallelGateway';
  assert.ok(validateModel(request).some((finding) => finding.code === 'IO_OWNER'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
});

test('Data Associations retain owner-specific input and output meaning with exact IO references', async () => {
  const request = basicRequest();
  request.model.processes[0].artifacts = [
    { key: 'process-input', type: 'dataInput', ownerRef: 'invoice-process' },
    { key: 'process-output', type: 'dataOutput', ownerRef: 'invoice-process' },
    { key: 'task-input', type: 'dataInput', ownerRef: 'check' },
    { key: 'task-output', type: 'dataOutput', ownerRef: 'check' },
  ];
  request.model.processes[0].dataAssociations = [
    {
      key: 'supply',
      direction: 'input',
      ownerRef: 'check',
      sourceRefs: ['process-input'],
      targetRef: 'task-input',
      documentation: 'The provided invoice is reviewed.',
    },
    {
      key: 'collect',
      direction: 'output',
      ownerRef: 'check',
      sourceRefs: ['task-output'],
      targetRef: 'process-output',
    },
  ];
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  const task = projection.rootElements[0].flowElements.find((element) => element.id === 'M_check');
  assert.deepEqual(task.dataInputAssociations, [
    {
      $type: 'bpmn:DataInputAssociation',
      id: 'M_supply',
      sourceRef: ['M_process-input'],
      targetRef: 'M_task-input',
      documentation: [{ $type: 'bpmn:Documentation', text: 'The provided invoice is reviewed.' }],
    },
  ]);
  assert.deepEqual(task.dataOutputAssociations, [
    {
      $type: 'bpmn:DataOutputAssociation',
      id: 'M_collect',
      sourceRef: ['M_task-output'],
      targetRef: 'M_process-output',
    },
  ]);
  assert.equal((await validateXml(xml)).schemaValid, true);
  assert.doesNotMatch(xml, /<bpmn:association\b|transformation|assignment/);
});

test('Data Associations require typed, accessible endpoints and the owning IO while expert mode retains multiple sources', async () => {
  const request = basicRequest();
  request.model.processes[0].artifacts = [
    { key: 'document', type: 'dataObject', containerRef: 'invoice-process' },
    { key: 'other-document', type: 'dataObject', containerRef: 'invoice-process' },
    { key: 'input', type: 'dataInput', ownerRef: 'check' },
  ];
  request.model.processes[0].dataAssociations = [
    { key: 'supply', direction: 'input', ownerRef: 'check', sourceRefs: ['document'], targetRef: 'input' },
  ];
  assert.deepEqual(validateModel(request), []);
  request.model.processes[0].dataAssociations[0].targetRef = 'document';
  assert.ok(validateModel(request).some((finding) => finding.code === 'DATA_RELATION'));
  await assert.rejects(compileModel(request), { exitCode: 2 });
  request.model.processes[0].dataAssociations[0].targetRef = 'input';
  request.model.processes[0].dataAssociations[0].sourceRefs = ['document', 'other-document'];
  assert.ok(validateModel(request).some((finding) => finding.code === 'DATA_ASSOCIATION_SOURCE_COUNT'));
  await assert.rejects(compileModel(request), { exitCode: 2 });
  const expert = await semanticProjection(await compileModel(request, { allowInvalid: true }));
  assert.deepEqual(
    expert.rootElements[0].flowElements.find((element) => element.id === 'M_check').dataInputAssociations[0].sourceRef,
    ['M_document', 'M_other-document'],
  );
  request.model.processes[0].dataAssociations[0].sourceRefs = ['check'];
  assert.ok(validateModel(request).some((finding) => finding.code === 'REF_MISSING'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
  request.model.processes[0].dataAssociations[0].sourceRefs = ['document'];
  request.model.processes[0].dataAssociations[0].ownerRef = 'invoice-process';
  assert.ok(validateModel(request).some((finding) => finding.code === 'DATA_ASSOCIATION_OWNER'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
});

test('Data Associations check each endpoint role even when the same key occurs twice', async () => {
  const request = basicRequest();
  request.model.processes[0].artifacts = [{ key: 'input', type: 'dataInput', ownerRef: 'check' }];
  request.model.processes[0].dataAssociations = [
    { key: 'self', direction: 'input', ownerRef: 'check', sourceRefs: ['input'], targetRef: 'input' },
  ];
  assert.ok(validateModel(request).some((finding) => finding.code === 'DATA_RELATION'));
  await assert.rejects(compileModel(request), { exitCode: 2 });
});

test('catching and throwing Event Data Associations retain their real XML placement and direction', async () => {
  const request = basicRequest();
  request.model.declarations = [{ key: 'invoice', type: 'message' }];
  request.model.processes[0].nodes[0].event = { kind: 'message', ref: 'invoice' };
  request.model.processes[0].nodes[2].event = { kind: 'message', ref: 'invoice' };
  request.model.processes[0].artifacts = [
    { key: 'received', type: 'dataOutput', ownerRef: 'start' },
    { key: 'sent', type: 'dataInput', ownerRef: 'end' },
    { key: 'invoice-data', type: 'dataObject', containerRef: 'invoice-process' },
  ];
  request.model.processes[0].dataAssociations = [
    { key: 'capture', direction: 'output', ownerRef: 'start', sourceRefs: ['received'], targetRef: 'invoice-data' },
    { key: 'dispatch', direction: 'input', ownerRef: 'end', sourceRefs: ['invoice-data'], targetRef: 'sent' },
  ];
  const xml = await compileModel(request);
  assert.equal((await validateXml(xml)).schemaValid, true);
  const projection = await semanticProjection(xml);
  const elements = projection.rootElements.find((root) => root.id === 'M_invoice-process').flowElements;
  assert.deepEqual(elements.find((element) => element.id === 'M_start').dataOutputAssociations[0], {
    $type: 'bpmn:DataOutputAssociation',
    id: 'M_capture',
    sourceRef: ['M_received'],
    targetRef: 'M_invoice-data',
  });
  assert.deepEqual(elements.find((element) => element.id === 'M_end').dataInputAssociations[0], {
    $type: 'bpmn:DataInputAssociation',
    id: 'M_dispatch',
    sourceRef: ['M_invoice-data'],
    targetRef: 'M_sent',
  });
  request.model.processes[0].dataAssociations[0].direction = 'input';
  assert.ok(validateModel(request).some((finding) => finding.code === 'DATA_ASSOCIATION_DIRECTION'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { exitCode: 2 });
});

test('intentional annotations, groups, categories, and associations remain standard non-control-flow artifacts', async () => {
  const request = basicRequest();
  request.model.declarations = [{ key: 'quality', type: 'category', name: 'Control', value: 'Four-eye check' }];
  request.model.processes[0].artifacts = [
    {
      key: 'note',
      type: 'textAnnotation',
      containerRef: 'invoice-process',
      text: 'Retain the original invoice.',
      documentation: 'An intentional process note.',
    },
    { key: 'scope', type: 'group', containerRef: 'invoice-process', categoryRef: 'quality', memberRefs: ['check'] },
    {
      key: 'explain',
      type: 'association',
      containerRef: 'invoice-process',
      sourceRef: 'note',
      targetRef: 'check',
      direction: 'one',
    },
    {
      key: 'explain-path',
      type: 'association',
      containerRef: 'invoice-process',
      sourceRef: 'note',
      targetRef: 'check-to-complete',
      direction: 'both',
    },
  ];
  request.model.primaryRef = 'interaction';
  request.model.collaboration = {
    key: 'interaction',
    participants: [{ key: 'our-team', processRef: 'invoice-process' }, { key: 'supplier' }],
    artifacts: [
      {
        key: 'interaction-note',
        type: 'textAnnotation',
        containerRef: 'interaction',
        text: 'The supplier provides the invoice.',
      },
      {
        key: 'interaction-group',
        type: 'group',
        containerRef: 'interaction',
        categoryRef: 'quality',
        memberRefs: ['check', 'supplier'],
      },
      {
        key: 'interaction-association',
        type: 'association',
        containerRef: 'interaction',
        sourceRef: 'interaction-note',
        targetRef: 'supplier',
      },
    ],
  };
  const before = structuredClone(request);
  const xml = await compileModel(request);
  const projection = await semanticProjection(xml);
  assert.equal((await validateXml(xml)).schemaValid, true);
  assert.deepEqual(
    projection.rootElements.find((element) => element.id === 'M_quality'),
    {
      $type: 'bpmn:Category',
      id: 'M_quality',
      name: 'Control',
      categoryValue: [{ $type: 'bpmn:CategoryValue', id: 'G_categoryValue_quality', value: 'Four-eye check' }],
    },
  );
  const process = projection.rootElements.find((element) => element.id === 'M_invoice-process');
  assert.equal(process.flowElements.length, 5);
  assert.deepEqual(process.artifacts, [
    {
      $type: 'bpmn:Association',
      id: 'M_explain',
      sourceRef: 'M_note',
      targetRef: 'M_check',
      associationDirection: 'One',
    },
    {
      $type: 'bpmn:Association',
      id: 'M_explain-path',
      sourceRef: 'M_note',
      targetRef: 'M_check-to-complete',
      associationDirection: 'Both',
    },
    {
      $type: 'bpmn:TextAnnotation',
      id: 'M_note',
      text: 'Retain the original invoice.',
      documentation: [{ $type: 'bpmn:Documentation', text: 'An intentional process note.' }],
    },
    { $type: 'bpmn:Group', id: 'M_scope', categoryValueRef: 'G_categoryValue_quality' },
  ]);
  const collaboration = projection.rootElements.find((element) => element.id === 'M_interaction');
  assert.equal(collaboration.artifacts.length, 3);
  assert.deepEqual(
    collaboration.artifacts.find((element) => element.id === 'M_interaction-association'),
    {
      $type: 'bpmn:Association',
      id: 'M_interaction-association',
      sourceRef: 'M_interaction-note',
      targetRef: 'M_supplier',
    },
  );
  assert.deepEqual(request, before);
  assert.doesNotMatch(xml, /memberRefs|reviewContext|working version/);
});

test('documentation artifacts refuse dangling references and unsafe owners without inventing category or labels', async () => {
  const request = basicRequest();
  request.model.processes[0].artifacts = [
    { key: 'group', type: 'group', containerRef: 'invoice-process', categoryRef: 'absent', memberRefs: ['check'] },
  ];
  assert.ok(
    validateModel(request).some((finding) => finding.code === 'REF_MISSING' && finding.elementRefs.includes('absent')),
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { code: 'MODEL_INVALID' });
  request.model.declarations = [{ key: 'absent', type: 'category', value: 'Related work' }];
  request.model.processes[0].artifacts[0].memberRefs = ['missing-task'];
  assert.ok(
    validateModel(request).some(
      (finding) => finding.code === 'REF_MISSING' && finding.elementRefs.includes('missing-task'),
    ),
  );
  request.model.processes[0].artifacts[0].memberRefs = [];
  assert.deepEqual(validateModel(request), [], 'external BPMN Group does not require semantic memberRefs');
  request.model.processes[0].artifacts.push({
    key: 'link-note',
    type: 'association',
    containerRef: 'invoice-process',
    sourceRef: 'group',
    targetRef: 'missing-target',
  });
  assert.ok(
    validateModel(request).some(
      (finding) => finding.code === 'REF_MISSING' && finding.elementRefs.includes('missing-target'),
    ),
  );
  await assert.rejects(compileModel(request, { allowInvalid: true }), { code: 'MODEL_INVALID' });
  request.model.processes[0].artifacts.pop();
  request.model.primaryRef = 'interaction';
  request.model.collaboration = {
    key: 'interaction',
    artifacts: [{ key: 'note', type: 'textAnnotation', containerRef: 'check', text: 'Keep original.' }],
  };
  assert.ok(validateModel(request).some((finding) => finding.code === 'ARTIFACT_SCOPE'));
  await assert.rejects(compileModel(request, { allowInvalid: true }), { code: 'MODEL_INVALID' });
});

test('the compiler never accepts nonstandard names on unnameable documentation or data association elements', async () => {
  for (const type of ['group', 'association', 'textAnnotation', 'dataAssociation']) {
    const request = basicRequest();
    request.model.declarations = [{ key: 'category', type: 'category', value: 'Work' }];
    request.model.processes[0].artifacts = [
      { key: 'document', type: 'dataObject', containerRef: 'invoice-process' },
      { key: 'input', type: 'dataInput', ownerRef: 'check' },
    ];
    const record =
      type === 'group'
        ? { key: 'record', type, containerRef: 'invoice-process', categoryRef: 'category', memberRefs: ['check'] }
        : type === 'association'
          ? { key: 'record', type, containerRef: 'invoice-process', sourceRef: 'document', targetRef: 'check' }
          : type === 'textAnnotation'
            ? { key: 'record', type, containerRef: 'invoice-process', text: 'An intentional note.' }
            : { key: 'record', direction: 'input', ownerRef: 'check', sourceRefs: ['document'], targetRef: 'input' };
    record.name = 'Do not silently convert this to documentation';
    if (type === 'dataAssociation') request.model.processes[0].dataAssociations = [record];
    else request.model.processes[0].artifacts.push(record);
    assert.ok(validateModel(request).some((finding) => finding.code === 'ATTRIBUTE_UNSUPPORTED'));
    await assert.rejects(compileModel(request, { allowInvalid: true }), { code: 'MODEL_INVALID' });
  }
});
