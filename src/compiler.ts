import { BpmnModdle, type ModdleElement } from 'bpmn-moddle';
import type { ProcessRequest, SemanticRecord } from './model.js';
import { OperationError } from './diagnostics.js';
import { validateModel } from './semantics.js';

function attributes(record: SemanticRecord): Record<string, unknown> {
  return {
    id: `M_${record.key}`,
    ...(record.name === undefined ? {} : { name: record.name }),
  };
}

/** Compilation creates private serialization objects and never mutates the request. */
export async function compileModel(request: ProcessRequest, options: { allowInvalid?: boolean } = {}): Promise<string> {
  const findings = validateModel(request);
  const serializableScopes = new Set(
    request.model.processes.flatMap((process) => [
      process.key,
      ...(process.nodes ?? []).filter((node) => node.type === 'subProcess').map((node) => node.key),
    ]),
  );
  const unresolvedScope =
    request.model.processes.some((process) =>
      [...(process.nodes ?? []), ...(process.flows ?? []), ...(process.artifacts ?? [])].some(
        (element) => 'containerRef' in element && !serializableScopes.has(element.containerRef),
      ),
    ) ||
    (request.model.collaboration?.artifacts ?? []).some(
      (artifact) => !('containerRef' in artifact) || artifact.containerRef !== request.model.collaboration!.key,
    );
  if (
    unresolvedScope ||
    findings.some(
      (finding) =>
        finding.blocksClean !== false &&
        (!options.allowInvalid ||
          [
            'REF_MISSING',
            'KEY_DUPLICATE',
            'CONTAINMENT_CYCLE',
            'LOOP_PLACEMENT',
            'IO_OWNER',
            'IO_DIRECTION',
            'DATA_ASSOCIATION_OWNER',
            'DATA_ASSOCIATION_DIRECTION',
            'ATTRIBUTE_UNSUPPORTED',
            'CONCEPT_DEFERRED',
            'CAPABILITY_UNAVAILABLE',
          ].includes(finding.code)),
    )
  ) {
    throw new OperationError(
      'MODEL_INVALID',
      'semantic',
      'The selected model cannot be compiled.',
      2,
      'refused',
      findings,
    );
  }
  const moddle = new BpmnModdle();
  const elements = new Map<string, ModdleElement>();
  const create = (type: string, record: SemanticRecord, extra: Record<string, unknown> = {}) => {
    const element = moddle.create(type, { ...attributes(record), ...extra });
    elements.set(record.key, element);
    if (record.documentation !== undefined) {
      const documentation = moddle.create('bpmn:Documentation', { text: record.documentation });
      documentation.$parent = element;
      element.documentation = [documentation];
    }
    return element;
  };
  // Definitions is not a BPMN BaseElement: place model documentation on the primary subject below.
  const { documentation: modelDocumentation, ...definitionRecord } = request.model;
  const definitions = create('bpmn:Definitions', definitionRecord, {
    targetNamespace: `urn:process-model:${request.model.key}`,
    rootElements: [],
  });

  for (const declaration of request.model.declarations ?? []) {
    const element = create(`bpmn:${declaration.type[0]!.toUpperCase()}${declaration.type.slice(1)}`, declaration);
    if (declaration.type === 'error' && declaration.code !== undefined) element.errorCode = declaration.code;
    if (declaration.type === 'escalation' && declaration.code !== undefined) element.escalationCode = declaration.code;
    if (declaration.type === 'dataStore') {
      if (declaration.capacity !== undefined) element.capacity = declaration.capacity;
      if (declaration.unlimited !== undefined) element.isUnlimited = declaration.unlimited;
    }
    if (declaration.type === 'category') {
      const value = moddle.create('bpmn:CategoryValue', {
        id: `G_categoryValue_${declaration.key}`,
        value: declaration.value,
      });
      value.$parent = element;
      element.categoryValue = [value];
    }
    element.$parent = definitions;
    definitions.rootElements.push(element);
  }

  for (const process of request.model.processes) {
    const processElement = create('bpmn:Process', process, { isExecutable: false, flowElements: [] });
    processElement.$parent = definitions;
    definitions.rootElements.push(processElement);
  }
  for (const process of request.model.processes) {
    for (const node of process.nodes ?? []) {
      const element = create(
        `bpmn:${node.type[0]!.toUpperCase()}${node.type.slice(1)}`,
        node,
        node.type === 'subProcess' ? { flowElements: [] } : {},
      );
      if (node.type === 'eventBasedGateway') {
        if (node.instantiate !== undefined) element.instantiate = node.instantiate;
        if (node.eventGatewayType !== undefined) element.eventGatewayType = node.eventGatewayType;
      }
      if ('messageRef' in node && node.messageRef !== undefined) element.messageRef = elements.get(node.messageRef);
      if (
        'event' in node &&
        (node.event.kind === 'message' ||
          node.event.kind === 'signal' ||
          node.event.kind === 'error' ||
          node.event.kind === 'escalation')
      ) {
        const definition = moddle.create(
          `bpmn:${node.event.kind[0]!.toUpperCase()}${node.event.kind.slice(1)}EventDefinition`,
          {
            id: `G_event_${node.key}`,
            ...(node.event.ref === undefined ? {} : { [`${node.event.kind}Ref`]: elements.get(node.event.ref) }),
          },
        );
        definition.$parent = element;
        element.eventDefinitions = [definition];
      }
      if ('event' in node && node.event.kind === 'timer') {
        const definition = moddle.create('bpmn:TimerEventDefinition', { id: `G_event_${node.key}` });
        for (const [field, body] of Object.entries(node.event))
          if (['timeDate', 'timeDuration', 'timeCycle'].includes(field)) {
            definition[field] = moddle.create('bpmn:FormalExpression', { body });
            definition[field].$parent = definition;
          }
        definition.$parent = element;
        element.eventDefinitions = [definition];
      }
      if ('event' in node && node.event.kind === 'conditional') {
        const definition = moddle.create('bpmn:ConditionalEventDefinition', { id: `G_event_${node.key}` });
        definition.condition = moddle.create('bpmn:FormalExpression', { body: node.event.condition });
        definition.condition.$parent = definition;
        definition.$parent = element;
        element.eventDefinitions = [definition];
      }
      if ('event' in node && node.event.kind === 'terminate') {
        const definition = moddle.create('bpmn:TerminateEventDefinition', { id: `G_event_${node.key}` });
        definition.$parent = element;
        element.eventDefinitions = [definition];
      }
      if ('event' in node && node.event.kind === 'link') {
        const definition = moddle.create('bpmn:LinkEventDefinition', {
          id: `G_event_${node.key}`,
          name: node.event.name,
        });
        definition.$parent = element;
        element.eventDefinitions = [definition];
      }
      if (node.type === 'callActivity') {
        definitions.$attrs ??= {};
        definitions.$attrs['xmlns:tns'] = definitions.targetNamespace;
        element.calledElement = `tns:M_${node.calledProcessRef}`;
      }
      if ('loop' in node && node.loop !== undefined) {
        const loop = node.loop;
        element.loopCharacteristics =
          loop.kind === 'standard'
            ? moddle.create('bpmn:StandardLoopCharacteristics', {
                ...(loop.testBefore === undefined ? {} : { testBefore: loop.testBefore }),
              })
            : moddle.create('bpmn:MultiInstanceLoopCharacteristics', { isSequential: loop.sequential });
        element.loopCharacteristics.$parent = element;
        if (loop.kind === 'standard') {
          element.loopCharacteristics.loopCondition = moddle.create('bpmn:FormalExpression', { body: loop.condition });
          element.loopCharacteristics.loopCondition.$parent = element.loopCharacteristics;
        }
      }
    }
  }
  const artifacts = [
    ...request.model.processes.flatMap((process) => process.artifacts ?? []),
    ...(request.model.collaboration?.artifacts ?? []),
  ];
  for (const artifact of artifacts) {
    const element = create(`bpmn:${artifact.type[0]!.toUpperCase()}${artifact.type.slice(1)}`, artifact);
    if ('isCollection' in artifact && artifact.isCollection !== undefined) element.isCollection = artifact.isCollection;
    if ('state' in artifact && artifact.state !== undefined) {
      element.dataState = moddle.create('bpmn:DataState', { id: `G_state_${artifact.key}`, name: artifact.state });
      element.dataState.$parent = element;
    }
  }
  for (const process of request.model.processes) {
    const nodes = new Map((process.nodes ?? []).map((node) => [node.key, elements.get(node.key)!]));
    const flows = new Map<string, ModdleElement>();
    for (const artifact of process.artifacts ?? []) {
      if (artifact.type === 'dataInput' || artifact.type === 'dataOutput') {
        const owner = elements.get(artifact.ownerRef)!;
        if (owner.$type.endsWith('Event')) {
          const input = artifact.type === 'dataInput';
          const element = elements.get(artifact.key)!;
          const setProperty = input ? 'inputSet' : 'outputSet';
          if (!owner[setProperty]) {
            owner[setProperty] = moddle.create(input ? 'bpmn:InputSet' : 'bpmn:OutputSet', {
              id: `G_${setProperty}_${artifact.ownerRef}`,
              [input ? 'dataInputRefs' : 'dataOutputRefs']: [],
            });
            owner[setProperty].$parent = owner;
          }
          element.$parent = owner;
          owner[input ? 'dataInputs' : 'dataOutputs'] ??= [];
          owner[input ? 'dataInputs' : 'dataOutputs'].push(element);
          owner[setProperty][input ? 'dataInputRefs' : 'dataOutputRefs'].push(element);
          continue;
        }
        if (!owner.ioSpecification) {
          const io = moddle.create('bpmn:InputOutputSpecification', {
            id: `G_io_${artifact.ownerRef}`,
            dataInputs: [],
            dataOutputs: [],
          });
          io.$parent = owner;
          const inputSet = moddle.create('bpmn:InputSet', { id: `G_inputSet_${artifact.ownerRef}`, dataInputRefs: [] });
          const outputSet = moddle.create('bpmn:OutputSet', {
            id: `G_outputSet_${artifact.ownerRef}`,
            dataOutputRefs: [],
          });
          inputSet.$parent = io;
          outputSet.$parent = io;
          io.inputSets = [inputSet];
          io.outputSets = [outputSet];
          owner.ioSpecification = io;
        }
        const input = artifact.type === 'dataInput';
        const element = elements.get(artifact.key)!;
        element.$parent = owner.ioSpecification;
        owner.ioSpecification[input ? 'dataInputs' : 'dataOutputs'].push(element);
        owner.ioSpecification[input ? 'inputSets' : 'outputSets'][0][input ? 'dataInputRefs' : 'dataOutputRefs'].push(
          element,
        );
      }
      if (!('containerRef' in artifact) || ['textAnnotation', 'group', 'association'].includes(artifact.type)) continue;
      const element = elements.get(artifact.key)!;
      const parent = elements.get(artifact.containerRef)!;
      element.$parent = parent;
      parent.flowElements.push(element);
      if (artifact.type === 'dataObjectReference') element.dataObjectRef = elements.get(artifact.dataObjectRef);
      if (artifact.type === 'dataStoreReference') element.dataStoreRef = elements.get(artifact.dataStoreRef);
    }
    for (const node of process.nodes ?? []) {
      if (node.type !== 'intermediateThrowEvent' || node.event.kind !== 'link') continue;
      const name = node.event.name;
      const catches = (process.nodes ?? []).filter(
        (candidate) =>
          candidate.type === 'intermediateCatchEvent' &&
          candidate.event.kind === 'link' &&
          candidate.containerRef === node.containerRef &&
          candidate.event.name === name,
      );
      if (catches.length === 1) {
        const source = elements.get(node.key)!.eventDefinitions[0];
        const target = elements.get(catches[0]!.key)!.eventDefinitions[0];
        source.target = target;
        target.source ??= [];
        target.source.push(source);
      }
    }
    for (const node of process.nodes ?? []) {
      const element = nodes.get(node.key)!;
      const parent = elements.get(node.containerRef)!;
      element.$parent = parent;
      parent.flowElements.push(element);
      if (node.type === 'boundaryEvent') {
        element.attachedToRef = elements.get(node.attachedToRef);
        element.cancelActivity = node.interrupting;
      }
    }
    for (const flow of process.flows ?? []) {
      const source = elements.get(flow.sourceRef)!;
      const target = elements.get(flow.targetRef)!;
      const element = create('bpmn:SequenceFlow', flow, { sourceRef: source, targetRef: target });
      if (flow.condition !== undefined) {
        element.conditionExpression = moddle.create('bpmn:FormalExpression', { body: flow.condition });
        element.conditionExpression.$parent = element;
      }
      const parent = elements.get(flow.containerRef)!;
      element.$parent = parent;
      parent.flowElements.push(element);
      source.outgoing ??= [];
      source.outgoing.push(element);
      target.incoming ??= [];
      target.incoming.push(element);
      flows.set(flow.key, element);
    }
    for (const node of process.nodes ?? []) {
      if ('defaultFlowRef' in node && node.defaultFlowRef !== undefined)
        nodes.get(node.key)!.default = flows.get(node.defaultFlowRef);
    }
    for (const association of process.dataAssociations ?? []) {
      const owner = elements.get(association.ownerRef)!;
      const element = create(
        association.direction === 'input' ? 'bpmn:DataInputAssociation' : 'bpmn:DataOutputAssociation',
        association,
        {
          sourceRef: association.sourceRefs.map((ref) => elements.get(ref)),
          targetRef: elements.get(association.targetRef),
        },
      );
      element.$parent = owner;
      owner[association.direction === 'input' ? 'dataInputAssociations' : 'dataOutputAssociations'] ??= [];
      owner[association.direction === 'input' ? 'dataInputAssociations' : 'dataOutputAssociations'].push(element);
    }
    const laneRecords = new Map((process.lanes ?? []).map((lane) => [lane.key, lane]));
    for (const lane of laneRecords.values()) create('bpmn:Lane', lane, { flowNodeRef: [] });
    for (const lane of laneRecords.values()) {
      const parent = elements.get(lane.parentRef)!;
      const laneSetProperty = parent.$type === 'bpmn:Lane' ? 'childLaneSet' : 'laneSets';
      let laneSet = laneSetProperty === 'childLaneSet' ? parent.childLaneSet : parent.laneSets?.[0];
      if (!laneSet) {
        laneSet = moddle.create('bpmn:LaneSet', { id: `G_lanes_${lane.parentRef}`, lanes: [] });
        laneSet.$parent = parent;
        parent[laneSetProperty] = laneSetProperty === 'childLaneSet' ? laneSet : [laneSet];
      }
      const element = elements.get(lane.key)!;
      element.$parent = laneSet;
      laneSet.lanes.push(element);
      const ancestors = new Set<string>();
      let key: string | undefined = lane.key;
      while (key && laneRecords.has(key) && !ancestors.has(key)) {
        ancestors.add(key);
        const ancestor = elements.get(key)!;
        for (const ref of lane.flowNodeRefs ?? []) {
          const node = elements.get(ref)!;
          if (!ancestor.flowNodeRef.includes(node)) ancestor.flowNodeRef.push(node);
        }
        key = laneRecords.get(key)?.parentRef;
      }
    }
  }
  if (request.model.collaboration) {
    const collaboration = request.model.collaboration;
    const element = create('bpmn:Collaboration', collaboration, { participants: [], messageFlows: [] });
    element.$parent = definitions;
    definitions.rootElements.push(element);
    for (const participant of collaboration.participants ?? []) {
      const participantElement = create(
        'bpmn:Participant',
        participant,
        participant.processRef === undefined ? {} : { processRef: elements.get(participant.processRef) },
      );
      participantElement.$parent = element;
      element.participants.push(participantElement);
    }
    for (const messageFlow of collaboration.messageFlows ?? []) {
      const flowElement = create('bpmn:MessageFlow', messageFlow, {
        sourceRef: elements.get(messageFlow.sourceRef),
        targetRef: elements.get(messageFlow.targetRef),
        ...(messageFlow.messageRef === undefined ? {} : { messageRef: elements.get(messageFlow.messageRef) }),
      });
      flowElement.$parent = element;
      element.messageFlows.push(flowElement);
    }
  }
  for (const artifact of artifacts) {
    if (artifact.type !== 'textAnnotation' && artifact.type !== 'group' && artifact.type !== 'association') continue;
    const element = elements.get(artifact.key)!;
    const parent = elements.get(artifact.containerRef)!;
    element.$parent = parent;
    parent.artifacts ??= [];
    parent.artifacts.push(element);
    if (artifact.type === 'textAnnotation') element.text = artifact.text;
    if (artifact.type === 'group') element.categoryValueRef = elements.get(artifact.categoryRef)!.categoryValue[0];
    if (artifact.type === 'association') {
      element.sourceRef = elements.get(artifact.sourceRef);
      element.targetRef = elements.get(artifact.targetRef);
      if (artifact.direction !== undefined)
        element.associationDirection = artifact.direction[0]!.toUpperCase() + artifact.direction.slice(1);
    }
  }
  if (modelDocumentation !== undefined) {
    const primary = elements.get(request.model.primaryRef)!;
    const documentation = moddle.create('bpmn:Documentation', { text: modelDocumentation });
    documentation.$parent = primary;
    primary.documentation = [...(primary.documentation ?? []), documentation];
  }
  return (await moddle.toXML(definitions, { format: true })).xml;
}

type Projection = string | number | boolean | null | Projection[] | { [key: string]: Projection };

/** Projects every populated semantic property; DI and object-parent cycles are excluded. */
export async function semanticProjection(xml: string): Promise<unknown> {
  const { rootElement, warnings } = await new BpmnModdle().fromXML(xml);
  if (warnings.length > 0) throw new Error('Cannot project BPMN that has parser warnings.');

  const project = (element: ModdleElement): Projection => {
    const result: { [key: string]: Projection } = { $type: element.$type };
    for (const property of element.$descriptor.properties) {
      if (property.isVirtual || property.name === 'diagrams' || !Object.hasOwn(element, property.name)) continue;
      const value = element[property.name];
      if (value === undefined || value === null) continue;
      const convert = (item: unknown): Projection => {
        if (property.isReference) return (item as ModdleElement).id ?? '';
        if (property.name === 'calledElement' && typeof item === 'string') {
          const separator = item.indexOf(':');
          const prefix = separator === -1 ? '' : item.slice(0, separator);
          const localName = separator === -1 ? item : item.slice(separator + 1);
          const attribute = prefix ? `xmlns:${prefix}` : 'xmlns';
          let owner: ModdleElement | undefined = element;
          while (owner && !Object.hasOwn(owner.$attrs ?? {}, attribute)) owner = owner.$parent;
          if (prefix && !owner) throw new Error('Cannot project an unresolved QName namespace.');
          return { namespace: owner?.$attrs?.[attribute] ?? '', localName };
        }
        if (typeof item === 'object') return project(item as ModdleElement);
        return item as string | number | boolean;
      };
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        result[property.name] = value.map(convert).sort((left, right) => {
          const stableKey = (entry: Projection) =>
            typeof entry === 'object' && entry !== null && !Array.isArray(entry)
              ? String(entry.id ?? JSON.stringify(entry))
              : String(entry);
          return stableKey(left).localeCompare(stableKey(right), 'en');
        });
      } else result[property.name] = convert(value);
    }
    if (element.$attrs && Object.keys(element.$attrs).length > 0) {
      const attrs = Object.fromEntries(
        Object.entries(element.$attrs)
          .filter(([key]) => key !== 'xmlns' && !key.startsWith('xmlns:') && key !== 'xsi:type')
          .sort(([a], [b]) => a.localeCompare(b, 'en')),
      );
      if (Object.keys(attrs).length > 0) result.$attrs = attrs;
    }
    return result;
  };
  return project(rootElement);
}
