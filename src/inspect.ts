import { BpmnModdle, type ModdleElement } from 'bpmn-moddle';
import { createRequire } from 'node:module';
import { validateXml } from './xml.js';
import { validateModel } from './semantics.js';
import { assessSuppliedDi } from './renderer.js';
import { containsCredential } from './review.js';
import type { FindingInput } from './diagnostics.js';
import type {
  ProcessRequest,
  ProcessNode,
  EventDefinition,
  Lane,
  Declaration,
  Artifact,
  DocumentationArtifact,
  DataAssociation,
} from './model.js';

type Status = 'passed' | 'failed' | 'not_run';
export interface BpmnInspection {
  xmlValid: boolean;
  schemaValid: boolean;
  semantics: Status;
  profile: Status;
  di: Status;
  renderable: boolean;
  modelKey?: string;
  findings: FindingInput[];
}

const safeRef = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,127}$/.test(value) && !containsCredential(value);
const localType = (element: ModdleElement): string => element.$type.slice(5, 6).toLowerCase() + element.$type.slice(6);
function flowElements(scope: ModdleElement): ModdleElement[] {
  return ((scope.flowElements ?? []) as ModdleElement[]).flatMap((element) => [
    element,
    ...(element.$type === 'bpmn:SubProcess' ? flowElements(element) : []),
  ]);
}
function eventMeaning(node: ModdleElement): EventDefinition {
  const definition = node.eventDefinitions?.[0] ?? node.eventDefinitionRef?.[0];
  if (!definition) return { kind: 'none' };
  const kind = localType(definition).replace(/EventDefinition$/, '');
  if (kind === 'timer')
    return {
      kind,
      ...Object.fromEntries(
        ['timeDate', 'timeDuration', 'timeCycle']
          .filter((field) => definition[field])
          .map((field) => [field, definition[field].body ?? '']),
      ),
    } as EventDefinition;
  if (kind === 'conditional') return { kind, condition: definition.condition?.body ?? '' };
  if (kind === 'link') return { kind, name: definition.name ?? '' };
  if (['message', 'signal', 'error', 'escalation'].includes(kind))
    return { kind, ...(definition[`${kind}Ref`] ? { ref: definition[`${kind}Ref`].id ?? '' } : {}) } as EventDefinition;
  return { kind } as EventDefinition;
}
const record = (element: ModdleElement) => ({
  key: element.id ?? '',
  ...(element.name === undefined ? {} : { name: element.name }),
});
function lanes(scope: ModdleElement, findings: FindingInput[]): Lane[] {
  const walk = (lane: ModdleElement, parentRef: string): Lane[] => {
    const children = ((lane.childLaneSet?.lanes ?? []) as ModdleElement[]).flatMap((child) =>
      walk(child, lane.id ?? ''),
    );
    const supplied: string[] = (lane.flowNodeRef ?? []).map((node: ModdleElement) => node.id ?? '');
    if (children.length && supplied.length) {
      const aggregate = new Set(children.flatMap((child) => child.flowNodeRefs ?? []));
      if (supplied.some((key) => !aggregate.has(key)) || [...aggregate].some((key) => !supplied.includes(key)))
        findings.push({
          code: 'LANE_MEMBERSHIP',
          category: 'profile',
          elementRefs: lane.id ? [lane.id] : [],
          message: 'Supplied ancestor Lane membership does not match its leaf aggregate.',
          remediation:
            'Review the parent and child responsibilities; Consulting Core derives ancestor membership from leaf assignments.',
        });
    }
    return [{ ...record(lane), parentRef, flowNodeRefs: children.length ? [] : supplied }, ...children];
  };
  return ((scope.laneSets ?? []) as ModdleElement[]).flatMap((set) =>
    ((set.lanes ?? []) as ModdleElement[]).flatMap((lane) => walk(lane, scope.id ?? '')),
  );
}
function calledProcess(node: ModdleElement, root: ModdleElement, reference: unknown = node.calledElement): string {
  const qname = String(reference ?? '');
  const [prefix, local] = qname.includes(':') ? qname.split(':', 2) : ['', qname];
  let parent: ModdleElement | undefined = node;
  const attribute = prefix ? `xmlns:${prefix}` : 'xmlns';
  while (parent && !Object.hasOwn(parent.$attrs ?? {}, attribute)) parent = parent.$parent;
  const uri = parent?.$attrs?.[attribute];
  return (prefix ? uri === root.targetNamespace : uri === undefined || uri === root.targetNamespace)
    ? (local ?? '')
    : '';
}
function documentationArtifacts(scope: ModdleElement): DocumentationArtifact[] {
  return ((scope.artifacts ?? []) as ModdleElement[]).map((element) => {
    const common = { ...record(element), containerRef: scope.id ?? '' };
    if (element.$type === 'bpmn:TextAnnotation')
      return { key: common.key, containerRef: common.containerRef, type: 'textAnnotation', text: element.text ?? '' };
    if (element.$type === 'bpmn:Group')
      return { ...common, type: 'group', categoryRef: element.categoryValueRef?.id ?? '', memberRefs: [] };
    return {
      ...common,
      type: 'association',
      sourceRef: element.sourceRef?.id ?? '',
      targetRef: element.targetRef?.id ?? '',
      direction: (element.associationDirection ?? 'None').toLowerCase(),
    };
  });
}
function dataArtifacts(process: ModdleElement): Artifact[] {
  const elements = flowElements(process);
  const owners = [
    process,
    ...elements.filter((element) => element.$instanceOf?.('bpmn:Activity') || element.$instanceOf?.('bpmn:Event')),
  ];
  const data: Artifact[] = elements
    .filter((element) =>
      ['bpmn:DataObject', 'bpmn:DataObjectReference', 'bpmn:DataStoreReference'].includes(element.$type),
    )
    .map(
      (element) =>
        ({
          ...record(element),
          type: localType(element),
          containerRef: element.$parent?.id ?? '',
          ...(element.$type === 'bpmn:DataObject' ? { isCollection: element.isCollection === true } : {}),
          ...(element.$type === 'bpmn:DataObjectReference' ? { dataObjectRef: element.dataObjectRef?.id ?? '' } : {}),
          ...(element.$type === 'bpmn:DataStoreReference' ? { dataStoreRef: element.dataStoreRef?.id ?? '' } : {}),
          ...(element.dataState ? { state: element.dataState.name ?? '' } : {}),
        }) as Artifact,
    );
  for (const owner of owners)
    for (const direction of ['Input', 'Output']) {
      for (const element of [
        ...(owner.ioSpecification?.[`data${direction}s`] ?? []),
        ...(owner[`data${direction}s`] ?? []),
      ] as ModdleElement[]) {
        data.push({
          ...record(element),
          type: direction === 'Input' ? 'dataInput' : 'dataOutput',
          ownerRef: owner.id ?? '',
          isCollection: element.isCollection === true,
        });
      }
    }
  return [
    ...data,
    ...[process, ...elements.filter((element) => element.$type === 'bpmn:SubProcess')].flatMap(documentationArtifacts),
  ];
}
function dataAssociations(process: ModdleElement): DataAssociation[] {
  return [process, ...flowElements(process)].flatMap((owner) =>
    ['Input', 'Output'].flatMap((direction) =>
      ((owner[`data${direction}Associations`] ?? []) as ModdleElement[]).map((association) => ({
        ...record(association),
        direction: direction === 'Input' ? ('input' as const) : ('output' as const),
        ownerRef: owner.id ?? '',
        sourceRefs: ((association.sourceRef ?? []) as ModdleElement[]).map((source) => source.id ?? ''),
        targetRef: association.targetRef?.id ?? '',
      })),
    ),
  );
}
interface SaxElement {
  name: string;
  attrs: Record<string, string>;
  ns: Record<string, string>;
}
interface SaxParser {
  ns(namespaces: Record<string, string>): void;
  on(event: string, callback: (...args: any[]) => void): void;
  parse(xml: string): unknown;
}
const { Parser } = createRequire(import.meta.url)('saxen') as {
  Parser: new (options: { proxy: boolean }) => SaxParser;
};
const namespace = {
  'http://www.omg.org/spec/BPMN/20100524/MODEL': 'bpmn',
  'http://www.omg.org/spec/BPMN/20100524/DI': 'bpmndi',
  'http://www.omg.org/spec/DD/20100524/DC': 'dc',
  'http://www.omg.org/spec/DD/20100524/DI': 'di',
  'http://www.w3.org/2001/XInclude': 'xi',
  'http://www.w3.org/2001/XMLSchema-instance': 'xsi',
  'http://www.w3.org/XML/1998/namespace': 'xml',
};
const semanticTags = new Set([
  'definitions',
  'process',
  'collaboration',
  'participant',
  'lane',
  'task',
  'userTask',
  'manualTask',
  'serviceTask',
  'businessRuleTask',
  'scriptTask',
  'sendTask',
  'receiveTask',
  'callActivity',
  'subProcess',
  'startEvent',
  'endEvent',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
  'boundaryEvent',
  'exclusiveGateway',
  'inclusiveGateway',
  'parallelGateway',
  'eventBasedGateway',
  'complexGateway',
  'sequenceFlow',
  'messageFlow',
  'message',
  'signal',
  'error',
  'escalation',
  'dataStore',
  'category',
  'dataObject',
  'dataObjectReference',
  'dataStoreReference',
  'dataInput',
  'dataOutput',
  'dataInputAssociation',
  'dataOutputAssociation',
  'textAnnotation',
  'group',
  'association',
]);
const deferredVisual = new Set([
  'complexGateway',
  'adHocSubProcess',
  'transaction',
  'choreography',
  'choreographyTask',
  'callChoreography',
  'subChoreography',
  'conversation',
  'subConversation',
  'callConversation',
  'conversationLink',
  'compensateEventDefinition',
  'cancelEventDefinition',
]);
const supportedTags = new Set(
  [...semanticTags]
    .filter((name) => !deferredVisual.has(name))
    .concat([
      'documentation',
      'text',
      'incoming',
      'outgoing',
      'sourceRef',
      'targetRef',
      'flowNodeRef',
      'laneSet',
      'childLaneSet',
      'extensionElements',
      'ioSpecification',
      'inputSet',
      'outputSet',
      'dataInputRefs',
      'dataOutputRefs',
      'optionalInputRefs',
      'optionalOutputRefs',
      'whileExecutingInputRefs',
      'whileExecutingOutputRefs',
      'standardLoopCharacteristics',
      'multiInstanceLoopCharacteristics',
      'loopCondition',
      'messageEventDefinition',
      'signalEventDefinition',
      'timerEventDefinition',
      'conditionalEventDefinition',
      'errorEventDefinition',
      'escalationEventDefinition',
      'terminateEventDefinition',
      'linkEventDefinition',
      'eventDefinitionRef',
      'timeDate',
      'timeDuration',
      'timeCycle',
      'condition',
      'conditionExpression',
      'categoryValue',
      'dataState',
      'source',
      'target',
    ]),
);
const deferredAttributes = new Set([
  'scriptFormat',
  'language',
  'evaluatesToTypeRef',
  'operationRef',
  'itemSubjectRef',
  'structureRef',
  'implementation',
  'processType',
  'isClosed',
  'definitionalCollaborationRef',
  'behavior',
  'oneBehaviorEventRef',
  'noneBehaviorEventRef',
  'loopMaximum',
  'testBefore',
]);
const supportedAttributes = new Set([
  'id',
  'name',
  'targetNamespace',
  'isExecutable',
  'isCollection',
  'isUnlimited',
  'capacity',
  'associationDirection',
  'errorCode',
  'escalationCode',
  'calledElement',
  'sourceRef',
  'targetRef',
  'messageRef',
  'signalRef',
  'errorRef',
  'escalationRef',
  'attachedToRef',
  'cancelActivity',
  'default',
  'dataObjectRef',
  'dataStoreRef',
  'categoryValueRef',
  'processRef',
  'isSequential',
  'testBefore',
  'isForCompensation',
  'triggeredByEvent',
  'eventGatewayType',
  'instantiate',
  'gatewayDirection',
  'textFormat',
  'exporter',
  'exporterVersion',
  'value',
]);

function boundedXml(xml: string): {
  findings: FindingInput[];
  refused: boolean;
  unsupportedVisible: boolean;
  incompleteSemantics: boolean;
} {
  const parser = new Parser({ proxy: true });
  parser.ns(namespace);
  let depth = 0,
    semanticDepth = 0,
    count = 0,
    collaborations = 0;
  let unsafe = false,
    limit = false,
    unsupportedVisible = false,
    extensionDepth = 0,
    incompleteSemantics = false;
  const stack: Array<{ local: string; eventDefinitions: number; inputSets: number; outputSets: number }> = [];
  const findings: FindingInput[] = [];
  const flagged = new Set<string>();
  const profile = (code: string, visual: boolean) => {
    unsupportedVisible ||= visual;
    incompleteSemantics = true;
    if (flagged.has(code)) return;
    flagged.add(code);
    findings.push({
      code,
      category: 'profile',
      message:
        code === 'PROFILE_EXTENSION'
          ? 'The supplied XML includes vendor extension data outside Consulting Core.'
          : 'The supplied XML includes a Deferred BPMN concept outside Consulting Core.',
      remediation: visual
        ? 'Use a consumer supporting the original visible concept; this command will not replace it with another symbol.'
        : 'The content remains in the original XML and is not executed or treated as a verified capability.',
    });
  };
  parser.on('openTag', (element: SaxElement) => {
    depth++;
    const local = element.name.startsWith('bpmn:') ? element.name.slice(5) : '';
    if (local === 'collaboration' && ++collaborations > 1) profile('PROFILE_DEFERRED', false);
    const parent = stack.at(-1);
    if (
      ['optionalInputRefs', 'optionalOutputRefs', 'whileExecutingInputRefs', 'whileExecutingOutputRefs'].includes(local)
    )
      profile('PROFILE_DEFERRED', false);
    if (parent?.local === 'ioSpecification') {
      if (local === 'inputSet' && ++parent.inputSets > 1) profile('PROFILE_DEFERRED', false);
      if (local === 'outputSet' && ++parent.outputSets > 1) profile('PROFILE_DEFERRED', false);
    }
    if (parent?.local.endsWith('Event') && (local.endsWith('EventDefinition') || local === 'eventDefinitionRef')) {
      parent.eventDefinitions++;
      if (parent.eventDefinitions > 1) profile('PROFILE_DEFERRED', true);
    }
    stack.push({ local, eventDefinitions: 0, inputSets: 0, outputSets: 0 });
    if (['subProcess', 'lane'].includes(local)) semanticDepth++;
    if (semanticTags.has(local)) count++;
    if (element.name.startsWith('xi:')) unsafe = true;
    if (depth > 64 || semanticDepth > 16 || count > 2000) limit = true;
    if (element.name === 'bpmn:extensionElements') extensionDepth++;
    const prefix = element.name.split(':')[0]!;
    if (!['bpmn', 'bpmndi', 'dc', 'di', 'xi'].includes(prefix)) profile('PROFILE_EXTENSION', extensionDepth === 0);
    if (
      deferredVisual.has(local) ||
      element.attrs.triggeredByEvent === 'true' ||
      element.attrs.isForCompensation === 'true'
    )
      profile('PROFILE_DEFERRED', true);
    if (local && !supportedTags.has(local)) profile('PROFILE_DEFERRED', deferredVisual.has(local));
    for (const [attribute, value] of Object.entries(element.attrs)) {
      if (attribute === 'xmlns' || attribute.startsWith('xmlns:')) continue;
      if (attribute.includes(':') && !['xsi', 'xml', 'bpmn'].includes(attribute.split(':')[0]!))
        profile('PROFILE_EXTENSION', ['bpmndi', 'dc', 'di'].includes(prefix));
      if (local && !attribute.includes(':') && !supportedAttributes.has(attribute)) profile('PROFILE_DEFERRED', false);
      if (
        (deferredAttributes.has(attribute) &&
          !(attribute === 'testBefore' && local === 'standardLoopCharacteristics')) ||
        (attribute === 'isExecutable' && value === 'true')
      )
        profile('PROFILE_DEFERRED', false);
      if (attribute === 'parallelMultiple' && value === 'true') profile('PROFILE_DEFERRED', true);
    }
  });
  parser.on('closeTag', (element: SaxElement) => {
    depth--;
    stack.pop();
    if (['bpmn:subProcess', 'bpmn:lane'].includes(element.name)) semanticDepth--;
    if (element.name === 'bpmn:extensionElements') extensionDepth--;
  });
  // Well-formedness is independently established by libxml2 before this bounded walk.
  parser.on('error', () => {
    unsafe = true;
  });
  parser.parse(xml);
  if (unsafe)
    return {
      findings: [
        { code: 'XML_UNSAFE', category: 'xml', message: 'External inclusion or unsafe XML content is not accepted.' },
      ],
      refused: true,
      unsupportedVisible: true,
      incompleteSemantics: true,
    };
  if (limit)
    return {
      findings: [
        {
          code: 'INPUT_LIMIT',
          category: 'input',
          message: 'The supplied XML exceeds the semantic element or nesting limit.',
        },
      ],
      refused: true,
      unsupportedVisible: true,
      incompleteSemantics: true,
    };
  return { findings, refused: false, unsupportedVisible, incompleteSemantics };
}

/** Read-only inspection never normalizes, repairs, or returns a replacement for supplied XML. */
export async function inspectBpmn(xml: string, options: { signal?: AbortSignal } = {}): Promise<BpmnInspection> {
  const assessment = await validateXml(xml, options);
  const result: BpmnInspection = {
    ...assessment,
    semantics: 'not_run',
    profile: 'not_run',
    di: 'not_run',
    renderable: false,
  };
  if (!assessment.xmlValid) return result;
  const bounds = boundedXml(xml);
  result.findings.push(...bounds.findings);
  if (bounds.refused) return result;
  let parsed: Awaited<ReturnType<InstanceType<typeof BpmnModdle>['fromXML']>>;
  try {
    parsed = await new BpmnModdle().fromXML(xml);
  } catch {
    result.findings.push({
      code: 'XML_PARSE',
      category: 'xml',
      message: 'The supplied BPMN cannot be inspected safely.',
    });
    result.xmlValid = false;
    return result;
  }
  const root = parsed.rootElement;
  // Resolve standards QNames for inspection only. The source bytes and actual renderer
  // remain unchanged; a consumer's unsupported reference syntax is not a BPMN defect.
  type Reference = { element: ModdleElement; property: string; id: string };
  const references = parsed.references as Reference[];
  const resolvedQNames = references.filter(
    (reference) =>
      reference.id.includes(':') && parsed.elementsById[calledProcess(reference.element, root, reference.id)],
  );
  for (const reference of resolvedQNames) {
    const property = reference.property.split(':').at(-1)!;
    const descriptor = reference.element.$descriptor.properties.find((entry) => entry.name === property);
    const target = parsed.elementsById[calledProcess(reference.element, root, reference.id)]!;
    if (descriptor?.isMany)
      reference.element[property] = references
        .filter((entry) => entry.element === reference.element && entry.property === reference.property)
        .map(
          (entry) => parsed.elementsById[entry.id] ?? parsed.elementsById[calledProcess(entry.element, root, entry.id)],
        )
        .filter(Boolean);
    else reference.element[property] = target;
  }
  if (safeRef(root.id)) result.modelKey = root.id;
  const processes = ((root.rootElements ?? []) as ModdleElement[]).filter(
    (element) => element.$type === 'bpmn:Process',
  );
  const collaboration = ((root.rootElements ?? []) as ModdleElement[]).find(
    (element) => element.$type === 'bpmn:Collaboration',
  );
  const request: ProcessRequest = {
    schemaVersion: '1.0.0',
    profileVersion: '1.0.0',
    model: {
      key: root.id ?? 'definitions',
      name: root.name ?? 'Supplied model',
      primaryRef: collaboration?.id ?? processes[0]?.id ?? '',
      ...(collaboration
        ? {
            collaboration: {
              ...record(collaboration),
              participants: ((collaboration.participants ?? []) as ModdleElement[]).map((participant) => ({
                ...record(participant),
                ...(participant.processRef ? { processRef: participant.processRef.id ?? '' } : {}),
              })),
              messageFlows: ((collaboration.messageFlows ?? []) as ModdleElement[]).map((flow) => ({
                ...record(flow),
                sourceRef: flow.sourceRef?.id ?? '',
                targetRef: flow.targetRef?.id ?? '',
                ...(flow.messageRef ? { messageRef: flow.messageRef.id ?? '' } : {}),
              })),
              artifacts: documentationArtifacts(collaboration),
            },
          }
        : {}),
      declarations: [
        ...((root.rootElements ?? []) as ModdleElement[])
          .filter((element) =>
            ['bpmn:Message', 'bpmn:Signal', 'bpmn:Error', 'bpmn:Escalation', 'bpmn:DataStore'].includes(element.$type),
          )
          .map(
            (element) =>
              ({
                ...record(element),
                type: localType(element),
                ...(element.errorCode !== undefined ? { code: element.errorCode } : {}),
                ...(element.escalationCode !== undefined ? { code: element.escalationCode } : {}),
                ...(element.$type === 'bpmn:DataStore'
                  ? {
                      unlimited: element.isUnlimited !== false,
                      ...(element.capacity !== undefined ? { capacity: element.capacity } : {}),
                    }
                  : {}),
              }) as Declaration,
          ),
        ...((root.rootElements ?? []) as ModdleElement[])
          .filter((element) => element.$type === 'bpmn:Category')
          .flatMap((element) =>
            ((element.categoryValue ?? []) as ModdleElement[]).map((value) => ({
              ...record(value),
              type: 'category' as const,
              value: value.value ?? '',
            })),
          ),
      ],
      processes: processes.map((process) => ({
        key: process.id ?? '',
        name: process.name,
        nodes: flowElements(process)
          .filter((node) => node.$instanceOf?.('bpmn:FlowNode'))
          .map(
            (node) =>
              ({
                key: node.id,
                name: node.name,
                type: localType(node),
                containerRef: node.$parent?.id,
                ...(node.$instanceOf?.('bpmn:Event') ? { event: eventMeaning(node) } : {}),
                ...(node.$type === 'bpmn:BoundaryEvent'
                  ? { attachedToRef: node.attachedToRef?.id ?? '', interrupting: node.cancelActivity !== false }
                  : {}),
                ...(node.messageRef ? { messageRef: node.messageRef.id ?? '' } : {}),
                ...(node.$type === 'bpmn:CallActivity' ? { calledProcessRef: calledProcess(node, root) } : {}),
                ...(node.default ? { defaultFlowRef: node.default.id ?? '' } : {}),
                ...(node.loopCharacteristics?.$type === 'bpmn:StandardLoopCharacteristics'
                  ? {
                      loop: {
                        kind: 'standard',
                        condition: node.loopCharacteristics.loopCondition?.body ?? '',
                        testBefore: node.loopCharacteristics.testBefore === true,
                      },
                    }
                  : {}),
                ...(node.loopCharacteristics?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
                  ? { loop: { kind: 'multiInstance', sequential: node.loopCharacteristics.isSequential === true } }
                  : {}),
                ...(node.$type === 'bpmn:EventBasedGateway'
                  ? { instantiate: node.instantiate === true, eventGatewayType: node.eventGatewayType ?? 'Exclusive' }
                  : {}),
              }) as ProcessNode,
          ),
        lanes: [process, ...flowElements(process).filter((node) => node.$type === 'bpmn:SubProcess')].flatMap((scope) =>
          lanes(scope, result.findings),
        ),
        artifacts: dataArtifacts(process),
        dataAssociations: dataAssociations(process),
        flows: flowElements(process)
          .filter((flow) => flow.$type === 'bpmn:SequenceFlow')
          .map((flow) => ({
            key: flow.id ?? '',
            name: flow.name,
            containerRef: flow.$parent?.id ?? '',
            sourceRef: flow.sourceRef?.id ?? '',
            targetRef: flow.targetRef?.id ?? '',
            ...(flow.conditionExpression ? { condition: flow.conditionExpression.body ?? '' } : {}),
          })),
      })),
    },
  };
  for (const [index, warning] of parsed.warnings.entries()) {
    if (
      resolvedQNames.some(
        (reference) =>
          reference.element === warning.element &&
          reference.property === warning.property &&
          reference.id === warning.value,
      )
    ) {
      result.findings.push({
        code: 'RENDER_UNSUPPORTED',
        category: 'diagram',
        severity: 'warning',
        blocksClean: false,
        instance: `parser:${index}`,
        message: 'A valid same-file QName reference is not supported by the preview consumer.',
        remediation:
          'Validation uses the resolved standards reference; rendering refuses rather than changing the original XML.',
      });
      continue;
    }
    result.findings.push({
      code: /unresolved reference/i.test(warning.message) ? 'REF_MISSING' : 'PROFILE_EXTENSION',
      category: /unresolved reference/i.test(warning.message) ? 'semantic' : 'profile',
      message: /unresolved reference/i.test(warning.message)
        ? 'A supplied XML reference does not resolve.'
        : 'The supplied XML contains content the BPMN consumer cannot fully interpret.',
      instance: `parser:${index}`,
    });
  }
  for (const process of processes) {
    const events = flowElements(process).filter((node) => node.$instanceOf?.('bpmn:Event'));
    const definitions = events.flatMap((event) =>
      [...(event.eventDefinitions ?? []), ...(event.eventDefinitionRef ?? [])].map((definition) => ({
        event,
        definition,
      })),
    );
    for (const { event, definition } of definitions)
      if (definition.$type === 'bpmn:LinkEventDefinition') {
        for (const reference of [
          ...(definition.source ?? []),
          ...(definition.target ? [definition.target] : []),
        ] as ModdleElement[]) {
          const counterparts = definitions.filter((candidate) => candidate.definition === reference);
          if (
            reference.$type !== 'bpmn:LinkEventDefinition' ||
            reference.name !== definition.name ||
            counterparts.length !== 1 ||
            counterparts[0]!.event.$parent !== event.$parent ||
            counterparts[0]!.event.$type === event.$type
          ) {
            result.findings.push({
              code: 'LINK_MATCHING',
              category: 'semantic',
              elementRefs: event.id ? [event.id] : [],
              message:
                'An explicit Link reference does not identify its same-scope, same-name catching or throwing counterpart.',
              remediation:
                'Review the original continuation reference; inspection will not replace it with a name-derived reference.',
            });
          }
        }
      }
  }
  if (!bounds.incompleteSemantics) result.findings.push(...validateModel(request));
  result.semantics = result.findings.some((finding) => finding.category === 'semantic')
    ? 'failed'
    : bounds.incompleteSemantics || result.findings.some((finding) => finding.code === 'CAPABILITY_UNAVAILABLE')
      ? 'not_run'
      : 'passed';
  result.profile = result.findings.some((finding) => finding.category === 'profile') ? 'failed' : 'passed';
  const diagramFindings = assessSuppliedDi(root, parsed.elementsById);
  result.findings.push(...diagramFindings);
  result.di = diagramFindings.length ? 'failed' : 'passed';
  result.renderable =
    result.schemaValid && result.di === 'passed' && !bounds.unsupportedVisible && !parsed.warnings.length;
  const unsafeDisplay = [root, ...Object.values(parsed.elementsById)].some((element) =>
    [element.id, element.name, element.text, element.value].some(
      (value) => typeof value === 'string' && containsCredential(value),
    ),
  );
  if (unsafeDisplay) {
    result.renderable = false;
    result.findings.push({
      code: 'RENDER_UNSUPPORTED',
      category: 'diagram',
      severity: 'warning',
      blocksClean: false,
      message: 'A high-confidence credential in supplied display content or an identity prevents safe rendering.',
      remediation: 'Remove credentials in the source model before rendering; this command never rewrites supplied XML.',
    });
  }
  result.findings = result.findings.map((finding, index) => ({
    ...finding,
    ...(finding.elementRefs ? { elementRefs: finding.elementRefs.filter(safeRef) } : {}),
    ...(finding.evidenceRefs ? { evidenceRefs: finding.evidenceRefs.filter(safeRef) } : {}),
    instance: `external:${index}`,
  }));
  return result;
}
