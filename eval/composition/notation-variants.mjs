// MIT-licensed synthetic feature slices. Requests and semantic facts are authored
// separately; neither expected facts nor symbols are captured from runtime output.
export const variants = [
  {
    id: 'activity-classifications',
    title: 'generation renders Script and Receive Task classifications with their native symbols',
    request: {
      schemaVersion: '1.0.0',
      profileVersion: '1.0.0',
      model: {
        key: 'notation',
        name: 'Communication preparation',
        primaryRef: 'process',
        declarations: [{ key: 'reply', type: 'message', name: 'Review reply' }],
        processes: [
          {
            key: 'process',
            name: 'Prepare and receive review',
            nodes: [
              { key: 'prepare', type: 'scriptTask', containerRef: 'process', name: 'Prepare review summary' },
              {
                key: 'receive',
                type: 'receiveTask',
                containerRef: 'process',
                name: 'Receive review reply',
                messageRef: 'reply',
              },
            ],
            flows: [{ key: 'next', containerRef: 'process', sourceRef: 'prepare', targetRef: 'receive' }],
          },
        ],
      },
    },
    expected: {
      title: 'Communication preparation',
      facts: [
        [
          'M_notation',
          'bpmn:Definitions',
          null,
          { name: 'Communication preparation', targetNamespace: 'urn:process-model:notation' },
        ],
        [
          'M_process',
          'bpmn:Process',
          'M_notation.rootElements',
          { name: 'Prepare and receive review', isExecutable: false },
        ],
        ['M_reply', 'bpmn:Message', 'M_notation.rootElements', { name: 'Review reply' }],
        ['M_prepare', 'bpmn:ScriptTask', 'M_process.flowElements', { name: 'Prepare review summary' }],
        [
          'M_receive',
          'bpmn:ReceiveTask',
          'M_process.flowElements',
          { name: 'Receive review reply', messageRef: 'M_reply' },
        ],
        ['M_next', 'bpmn:SequenceFlow', 'M_process.flowElements', { sourceRef: 'M_prepare', targetRef: 'M_receive' }],
      ],
      visible: [{ plane: 'M_process', shapes: ['M_prepare', 'M_receive'], edges: ['M_next'] }],
      symbols: [
        { id: 'M_prepare', min: { rect: 1, path: 1 }, text: 'Prepare review summary' },
        { id: 'M_receive', min: { rect: 1, path: 1 }, text: 'Receive review reply' },
      ],
    },
  },
];

// These two fixed graphs are worked examples, not projections of the request.
// Each event's request and expected BPMN definition are specified independently.
function eventVariant({ id, placement, event, definition, declaration, declarationFact, interrupting = true }) {
  const position = {
    start: ['start', 'startEvent', 'bpmn:StartEvent'],
    end: ['end', 'endEvent', 'bpmn:EndEvent'],
    catch: ['focus', 'intermediateCatchEvent', 'bpmn:IntermediateCatchEvent'],
    throw: ['focus', 'intermediateThrowEvent', 'bpmn:IntermediateThrowEvent'],
    boundary: ['boundary', 'boundaryEvent', 'bpmn:BoundaryEvent'],
  }[placement];
  const [key, type, expectedType] = position;
  const focus = {
    key,
    type,
    containerRef: 'process',
    name: 'Review notification',
    event,
    ...(placement === 'boundary' ? { attachedToRef: 'work', interrupting } : {}),
  };
  const nodes = [
    { key: 'start', type: 'startEvent', containerRef: 'process', event: { kind: 'none' } },
    { key: 'work', type: 'task', containerRef: 'process', name: 'Review case' },
    { key: 'end', type: 'endEvent', containerRef: 'process', event: { kind: 'none' } },
  ];
  const flows = [
    { key: 'entry', containerRef: 'process', sourceRef: 'start', targetRef: 'work' },
    { key: 'complete', containerRef: 'process', sourceRef: 'work', targetRef: 'end' },
  ];
  const facts = [
    [
      'M_notation',
      'bpmn:Definitions',
      null,
      { name: 'Review notification', targetNamespace: 'urn:process-model:notation' },
    ],
    ['M_process', 'bpmn:Process', 'M_notation.rootElements', { name: 'Handle review', isExecutable: false }],
    ['M_start', 'bpmn:StartEvent', 'M_process.flowElements', {}],
    ['M_work', 'bpmn:Task', 'M_process.flowElements', { name: 'Review case' }],
    ['M_end', 'bpmn:EndEvent', 'M_process.flowElements', {}],
    ['M_entry', 'bpmn:SequenceFlow', 'M_process.flowElements', { sourceRef: 'M_start', targetRef: 'M_work' }],
    ['M_complete', 'bpmn:SequenceFlow', 'M_process.flowElements', { sourceRef: 'M_work', targetRef: 'M_end' }],
  ];
  const visible = { plane: 'M_process', shapes: ['M_start', 'M_work', 'M_end'], edges: ['M_entry', 'M_complete'] };
  if (placement === 'start' || placement === 'end') {
    nodes[nodes.findIndex((node) => node.key === key)] = focus;
    facts.find((row) => row[0] === 'M_' + key)[3] = { name: 'Review notification' };
  } else {
    nodes.push(focus);
    facts.push([
      'M_' + key,
      expectedType,
      'M_process.flowElements',
      {
        name: 'Review notification',
        ...(placement === 'boundary'
          ? { attachedToRef: 'M_work', ...(interrupting ? {} : { cancelActivity: false }) }
          : {}),
      },
    ]);
    visible.shapes.push('M_' + key);
    if (placement === 'boundary') {
      flows.push({ key: 'handle', containerRef: 'process', sourceRef: 'boundary', targetRef: 'end' });
      facts.push([
        'M_handle',
        'bpmn:SequenceFlow',
        'M_process.flowElements',
        { sourceRef: 'M_boundary', targetRef: 'M_end' },
      ]);
      visible.edges.push('M_handle');
    } else {
      flows[1].targetRef = 'focus';
      flows.push({ key: 'continue', containerRef: 'process', sourceRef: 'focus', targetRef: 'end' });
      facts.find((row) => row[0] === 'M_complete')[3] = { sourceRef: 'M_work', targetRef: 'M_focus' };
      facts.push([
        'M_continue',
        'bpmn:SequenceFlow',
        'M_process.flowElements',
        { sourceRef: 'M_focus', targetRef: 'M_end' },
      ]);
      visible.edges.push('M_continue');
    }
  }
  facts.push(['G_event_' + key, definition.type, 'M_' + key + '.eventDefinitions', definition.attributes]);
  if (declarationFact) facts.push(declarationFact);
  return {
    id,
    title: 'generation preserves and renders ' + id,
    request: {
      schemaVersion: '1.0.0',
      profileVersion: '1.0.0',
      model: {
        key: 'notation',
        name: 'Review notification',
        primaryRef: 'process',
        ...(declaration ? { declarations: [declaration] } : {}),
        processes: [{ key: 'process', name: 'Handle review', nodes, flows }],
      },
    },
    expected: {
      title: id,
      facts,
      visible: [visible],
      symbols: [
        {
          id: 'M_' + key,
          min: {
            circle: ['boundary', 'catch', 'throw'].includes(placement) ? 2 : 1,
            ...(definition.type === 'bpmn:TerminateEventDefinition' ? { circle: 2 } : { path: 1 }),
          },
          ...(placement === 'boundary' ? { dashed: !interrupting } : {}),
          text: 'Review notification',
        },
      ],
    },
  };
}

variants.push(
  eventVariant({
    id: 'event.message.boundary.interrupting',
    placement: 'boundary',
    event: { kind: 'message', ref: 'notice' },
    definition: { type: 'bpmn:MessageEventDefinition', attributes: { messageRef: 'M_notice' } },
    declaration: { key: 'notice', type: 'message', name: 'Review notice' },
    declarationFact: ['M_notice', 'bpmn:Message', 'M_notation.rootElements', { name: 'Review notice' }],
  }),
);

for (const [suffix, placement, interrupting] of [
  ['start', 'start', true],
  ['boundary.interrupting', 'boundary', true],
  ['boundary.nonInterrupting', 'boundary', false],
])
  variants.push(
    eventVariant({
      id: 'event.conditional.' + suffix,
      placement,
      interrupting,
      event: { kind: 'conditional', condition: 'Review evidence is available' },
      definition: {
        type: 'bpmn:ConditionalEventDefinition',
        attributes: {
          condition: { $type: 'bpmn:FormalExpression', body: 'Review evidence is available' },
        },
      },
    }),
  );

for (const [suffix, placement, interrupting] of [
  ['start', 'start', true],
  ['catch', 'catch', true],
  ['end', 'end', true],
  ['boundary.interrupting', 'boundary', true],
  ['boundary.nonInterrupting', 'boundary', false],
])
  variants.push(
    eventVariant({
      id: 'event.signal.' + suffix,
      placement,
      interrupting,
      event: { kind: 'signal', ref: 'notice' },
      definition: { type: 'bpmn:SignalEventDefinition', attributes: { signalRef: 'M_notice' } },
      declaration: { key: 'notice', type: 'signal', name: 'Review broadcast' },
      declarationFact: ['M_notice', 'bpmn:Signal', 'M_notation.rootElements', { name: 'Review broadcast' }],
    }),
  );

variants.push(
  eventVariant({
    id: 'event.error.boundary.interrupting.catchAll',
    placement: 'boundary',
    event: { kind: 'error' },
    definition: { type: 'bpmn:ErrorEventDefinition', attributes: {} },
  }),
);

for (const [suffix, placement, interrupting, named] of [
  ['throw', 'throw', true, true],
  ['end', 'end', true, true],
  ['boundary.interrupting.named', 'boundary', true, true],
  ['boundary.nonInterrupting.named', 'boundary', false, true],
  ['boundary.interrupting.catchAll', 'boundary', true, false],
  ['boundary.nonInterrupting.catchAll', 'boundary', false, false],
])
  variants.push(
    eventVariant({
      id: 'event.escalation.' + suffix,
      placement,
      interrupting,
      event: { kind: 'escalation', ...(named ? { ref: 'notice' } : {}) },
      definition: { type: 'bpmn:EscalationEventDefinition', attributes: named ? { escalationRef: 'M_notice' } : {} },
      declaration: { key: 'notice', type: 'escalation', name: 'Review assistance', code: 'REVIEW' },
      declarationFact: [
        'M_notice',
        'bpmn:Escalation',
        'M_notation.rootElements',
        { name: 'Review assistance', escalationCode: 'REVIEW' },
      ],
    }),
  );

variants.push(
  eventVariant({
    id: 'event.terminate.end',
    placement: 'end',
    event: { kind: 'terminate' },
    definition: { type: 'bpmn:TerminateEventDefinition', attributes: {} },
  }),
);

variants.push({
  id: 'event.link.continuation',
  title: 'generation preserves same-scope Link continuation with catching and throwing symbols',
  request: {
    schemaVersion: '1.0.0',
    profileVersion: '1.0.0',
    model: {
      key: 'notation',
      name: 'Review continuation',
      primaryRef: 'process',
      processes: [
        {
          key: 'process',
          name: 'Continue review',
          nodes: [
            { key: 'start', type: 'startEvent', containerRef: 'process', event: { kind: 'none' } },
            {
              key: 'jump',
              type: 'intermediateThrowEvent',
              containerRef: 'process',
              name: 'Continue review',
              event: { kind: 'link', name: 'Review' },
            },
            {
              key: 'resume',
              type: 'intermediateCatchEvent',
              containerRef: 'process',
              name: 'Resume review',
              event: { kind: 'link', name: 'Review' },
            },
            { key: 'end', type: 'endEvent', containerRef: 'process', event: { kind: 'none' } },
          ],
          flows: [
            { key: 'leave', containerRef: 'process', sourceRef: 'start', targetRef: 'jump' },
            { key: 'finish', containerRef: 'process', sourceRef: 'resume', targetRef: 'end' },
          ],
        },
      ],
    },
  },
  expected: {
    title: 'Review continuation',
    facts: [
      [
        'M_notation',
        'bpmn:Definitions',
        null,
        { name: 'Review continuation', targetNamespace: 'urn:process-model:notation' },
      ],
      ['M_process', 'bpmn:Process', 'M_notation.rootElements', { name: 'Continue review', isExecutable: false }],
      ['M_start', 'bpmn:StartEvent', 'M_process.flowElements', {}],
      ['M_jump', 'bpmn:IntermediateThrowEvent', 'M_process.flowElements', { name: 'Continue review' }],
      [
        'G_event_jump',
        'bpmn:LinkEventDefinition',
        'M_jump.eventDefinitions',
        { name: 'Review', target: 'G_event_resume' },
      ],
      ['M_resume', 'bpmn:IntermediateCatchEvent', 'M_process.flowElements', { name: 'Resume review' }],
      [
        'G_event_resume',
        'bpmn:LinkEventDefinition',
        'M_resume.eventDefinitions',
        { name: 'Review', source: ['G_event_jump'] },
      ],
      ['M_end', 'bpmn:EndEvent', 'M_process.flowElements', {}],
      ['M_leave', 'bpmn:SequenceFlow', 'M_process.flowElements', { sourceRef: 'M_start', targetRef: 'M_jump' }],
      ['M_finish', 'bpmn:SequenceFlow', 'M_process.flowElements', { sourceRef: 'M_resume', targetRef: 'M_end' }],
    ],
    visible: [
      { plane: 'M_process', shapes: ['M_start', 'M_jump', 'M_resume', 'M_end'], edges: ['M_leave', 'M_finish'] },
    ],
    symbols: [
      { id: 'M_jump', min: { circle: 2, path: 1 }, text: 'Continue review' },
      { id: 'M_resume', min: { circle: 2, path: 1 }, text: 'Resume review' },
    ],
  },
});

for (const variant of [
  { id: 'gateway.eventBased.exclusiveInstantiation', request: { instantiate: true }, expected: { instantiate: true } },
  {
    id: 'gateway.eventBased.parallelInstantiation',
    request: { instantiate: true, eventGatewayType: 'Parallel' },
    expected: { instantiate: true, eventGatewayType: 'Parallel' },
  },
])
  variants.push({
    id: variant.id,
    title: 'generation preserves and renders ' + variant.id,
    request: {
      schemaVersion: '1.0.0',
      profileVersion: '1.0.0',
      model: {
        key: 'notation',
        name: 'Review initiated by event',
        primaryRef: 'process',
        declarations: [{ key: 'notice', type: 'message', name: 'Review request' }],
        processes: [
          {
            key: 'process',
            name: 'Begin requested review',
            nodes: [
              {
                key: 'begin',
                type: 'eventBasedGateway',
                containerRef: 'process',
                name: 'Review requested',
                ...variant.request,
              },
              {
                key: 'received',
                type: 'intermediateCatchEvent',
                containerRef: 'process',
                name: 'Request received',
                event: { kind: 'message', ref: 'notice' },
              },
              {
                key: 'elapsed',
                type: 'intermediateCatchEvent',
                containerRef: 'process',
                name: 'Review date reached',
                event: { kind: 'timer', timeDuration: 'P1D' },
              },
              { key: 'done', type: 'endEvent', containerRef: 'process', event: { kind: 'none' } },
            ],
            flows: [
              { key: 'onMessage', containerRef: 'process', sourceRef: 'begin', targetRef: 'received' },
              { key: 'onTime', containerRef: 'process', sourceRef: 'begin', targetRef: 'elapsed' },
              { key: 'receivedDone', containerRef: 'process', sourceRef: 'received', targetRef: 'done' },
              { key: 'elapsedDone', containerRef: 'process', sourceRef: 'elapsed', targetRef: 'done' },
            ],
          },
        ],
      },
    },
    expected: {
      title: 'Review initiated by event',
      facts: [
        [
          'M_notation',
          'bpmn:Definitions',
          null,
          { name: 'Review initiated by event', targetNamespace: 'urn:process-model:notation' },
        ],
        [
          'M_process',
          'bpmn:Process',
          'M_notation.rootElements',
          { name: 'Begin requested review', isExecutable: false },
        ],
        ['M_notice', 'bpmn:Message', 'M_notation.rootElements', { name: 'Review request' }],
        [
          'M_begin',
          'bpmn:EventBasedGateway',
          'M_process.flowElements',
          { name: 'Review requested', ...variant.expected },
        ],
        ['M_received', 'bpmn:IntermediateCatchEvent', 'M_process.flowElements', { name: 'Request received' }],
        ['G_event_received', 'bpmn:MessageEventDefinition', 'M_received.eventDefinitions', { messageRef: 'M_notice' }],
        ['M_elapsed', 'bpmn:IntermediateCatchEvent', 'M_process.flowElements', { name: 'Review date reached' }],
        [
          'G_event_elapsed',
          'bpmn:TimerEventDefinition',
          'M_elapsed.eventDefinitions',
          { timeDuration: { $type: 'bpmn:FormalExpression', body: 'P1D' } },
        ],
        ['M_done', 'bpmn:EndEvent', 'M_process.flowElements', {}],
        [
          'M_onMessage',
          'bpmn:SequenceFlow',
          'M_process.flowElements',
          { sourceRef: 'M_begin', targetRef: 'M_received' },
        ],
        ['M_onTime', 'bpmn:SequenceFlow', 'M_process.flowElements', { sourceRef: 'M_begin', targetRef: 'M_elapsed' }],
        [
          'M_receivedDone',
          'bpmn:SequenceFlow',
          'M_process.flowElements',
          { sourceRef: 'M_received', targetRef: 'M_done' },
        ],
        [
          'M_elapsedDone',
          'bpmn:SequenceFlow',
          'M_process.flowElements',
          { sourceRef: 'M_elapsed', targetRef: 'M_done' },
        ],
      ],
      visible: [
        {
          plane: 'M_process',
          shapes: ['M_begin', 'M_received', 'M_elapsed', 'M_done'],
          edges: ['M_onMessage', 'M_onTime', 'M_receivedDone', 'M_elapsedDone'],
        },
      ],
      symbols: [
        { id: 'M_begin', min: { polygon: 1, circle: 1 }, text: 'Review requested' },
        { id: 'M_received', min: { circle: 2, path: 1 }, text: 'Request received' },
        { id: 'M_elapsed', min: { circle: 2, path: 1 }, text: 'Review date reached' },
      ],
    },
  });
