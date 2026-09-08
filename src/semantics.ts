import type { FindingInput } from './diagnostics.js';
import type { ProcessRequest } from './model.js';

const activityTypes = new Set([
  'task',
  'sendTask',
  'receiveTask',
  'userTask',
  'manualTask',
  'serviceTask',
  'businessRuleTask',
  'scriptTask',
  'subProcess',
  'callActivity',
]);

/** Semantic rules operate on owned process records, independently of XML objects. */
export function validateModel(request: ProcessRequest): FindingInput[] {
  const findings: FindingInput[] = [];
  const primaryExists = request.model.collaboration
    ? request.model.primaryRef === request.model.collaboration.key
    : request.model.processes.some((process) => process.key === request.model.primaryRef);
  if (!primaryExists)
    findings.push({
      code: 'REF_MISSING',
      category: 'semantic',
      message: 'The primary model does not resolve to the selected Process or Collaboration.',
      remediation: 'Select the collaboration when present, otherwise a contained Process.',
      elementRefs: [request.model.primaryRef],
    });
  const records = [
    request.model,
    ...request.model.processes.flatMap((process) => [
      process,
      ...(process.nodes ?? []),
      ...(process.flows ?? []),
      ...(process.lanes ?? []),
      ...(process.artifacts ?? []),
      ...(process.dataAssociations ?? []),
    ]),
    ...(request.model.declarations ?? []),
  ];
  if (request.model.collaboration)
    records.push(
      request.model.collaboration,
      ...(request.model.collaboration.participants ?? []),
      ...(request.model.collaboration.messageFlows ?? []),
      ...(request.model.collaboration.artifacts ?? []),
    );
  const keys = new Set<string>();
  for (const record of records) {
    if (keys.has(record.key))
      findings.push({
        code: 'KEY_DUPLICATE',
        category: 'semantic',
        message: 'Semantic keys must be unique within the model.',
        remediation: 'Retain one unique stable key for each distinct semantic element.',
        elementRefs: [record.key],
      });
    keys.add(record.key);
  }
  const unavailable = (key: string) =>
    findings.push({
      code: 'CAPABILITY_UNAVAILABLE',
      category: 'profile',
      message: 'This development build does not yet implement the requested semantic feature.',
      remediation: 'Retain the requirement and use a build that implements it; no approximation was generated.',
      elementRefs: [key],
    });
  for (const declaration of request.model.declarations ?? [])
    if (!['message', 'signal', 'error', 'escalation', 'dataStore', 'category'].includes(declaration.type))
      unavailable(declaration.key);
  const declarations = new Map((request.model.declarations ?? []).map((declaration) => [declaration.key, declaration]));
  const nodes = new Map(
    request.model.processes.flatMap((process) => (process.nodes ?? []).map((node) => [node.key, node])),
  );
  const artifacts = new Map(
    [
      ...request.model.processes.flatMap((process) => process.artifacts ?? []),
      ...(request.model.collaboration?.artifacts ?? []),
    ].map((artifact) => [artifact.key, artifact]),
  );
  for (const artifact of request.model.collaboration?.artifacts ?? []) {
    if (!['group', 'association', 'textAnnotation'].includes(artifact.type)) unavailable(artifact.key);
    if (!('containerRef' in artifact) || artifact.containerRef !== request.model.collaboration!.key)
      findings.push({
        code: 'ARTIFACT_SCOPE',
        category: 'semantic',
        message: 'A Collaboration artifact must be contained by that Collaboration.',
        remediation: 'Choose the Collaboration or retain a Process artifact under its actual Process scope.',
        elementRefs: [artifact.key],
      });
  }
  const unnameable = [...artifacts.values()].filter((artifact) =>
    ['group', 'association', 'textAnnotation'].includes(artifact.type),
  );
  for (const record of [...unnameable, ...request.model.processes.flatMap((process) => process.dataAssociations ?? [])])
    if ('name' in record)
      findings.push({
        code: 'ATTRIBUTE_UNSUPPORTED',
        category: 'profile',
        message: 'This BPMN element has no standard name attribute.',
        remediation:
          'Use Category value for Group labels, annotation text for Text Annotations, and only intentional standard documentation.',
        elementRefs: [record.key],
      });
  for (const artifact of artifacts.values()) {
    if (artifact.type === 'group' && declarations.get(artifact.categoryRef)?.type !== 'category')
      findings.push({
        code: 'REF_MISSING',
        category: 'semantic',
        message: 'A Group must reference a declared Category.',
        remediation: 'Choose the actual Category declaration; no label or Category is invented.',
        elementRefs: [artifact.key, artifact.categoryRef],
      });
    const refs =
      artifact.type === 'association'
        ? [artifact.sourceRef, artifact.targetRef]
        : artifact.type === 'group'
          ? artifact.memberRefs
          : [];
    for (const ref of refs)
      if (!keys.has(ref) || ref === request.model.key)
        findings.push({
          code: 'REF_MISSING',
          category: 'semantic',
          message: 'An artifact relationship references a missing BPMN element.',
          remediation: 'Choose an existing semantic element; Group membership affects geometry, not control flow.',
          elementRefs: [artifact.key, ref],
        });
  }
  const accessibleScope = (scope: string, from: string) => {
    const visited = new Set<string>();
    let current = from;
    while (!visited.has(current)) {
      if (current === scope) return true;
      visited.add(current);
      const parent = nodes.get(current);
      if (!parent) return false;
      current = parent.containerRef;
    }
    return false;
  };
  const participants = new Map(
    (request.model.collaboration?.participants ?? []).map((participant) => [participant.key, participant]),
  );
  const nodeProcesses = new Map(
    request.model.processes.flatMap((process) => (process.nodes ?? []).map((node) => [node.key, process.key])),
  );
  const participantsFor = (key: string) =>
    participants.has(key)
      ? [key]
      : nodeProcesses.has(key)
        ? [...participants.values()]
            .filter((participant) => participant.processRef === nodeProcesses.get(key))
            .map((participant) => participant.key)
        : [];
  for (const participant of participants.values()) {
    if (
      participant.processRef !== undefined &&
      !request.model.processes.some((process) => process.key === participant.processRef)
    )
      findings.push({
        code: 'REF_MISSING',
        category: 'semantic',
        message: 'A white-box participant must reference a contained Process.',
        remediation: 'Select a Process in this model or retain a black-box participant without internal work.',
        elementRefs: [participant.key, participant.processRef],
      });
  }
  for (const flow of request.model.collaboration?.messageFlows ?? []) {
    for (const ref of [flow.sourceRef, flow.targetRef]) {
      if (!participants.has(ref) && !nodes.has(ref))
        findings.push({
          code: 'REF_MISSING',
          category: 'semantic',
          message: 'A Message Flow endpoint does not resolve to a Participant or Flow Node.',
          remediation: 'Select a legal interaction endpoint in a declared participant.',
          elementRefs: [flow.key, ref],
        });
      const node = nodes.get(ref);
      const nodeMessage =
        node && 'event' in node && node.event.kind === 'message'
          ? node.event.ref
          : node &&
              ((node.type === 'sendTask' && ref === flow.sourceRef) ||
                (node.type === 'receiveTask' && ref === flow.targetRef))
            ? node.messageRef
            : undefined;
      if (nodeMessage !== undefined && flow.messageRef !== undefined && nodeMessage !== flow.messageRef)
        findings.push({
          code: 'MESSAGE_MISMATCH',
          category: 'semantic',
          message: 'The communication endpoint and Message Flow name different Messages.',
          remediation: 'Retain one consistent stated Message for this communication.',
          elementRefs: [flow.key, ref, nodeMessage, flow.messageRef],
        });
      const candidates = participantsFor(ref);
      if (candidates.length > 1)
        findings.push({
          code: 'MODEL_AMBIGUOUS',
          category: 'semantic',
          message: 'An internal Message Flow endpoint belongs to a Process referenced by multiple Participants.',
          remediation:
            'Identify distinct participant-specific Process records or use an explicit Participant endpoint.',
          elementRefs: [flow.key, ref, ...candidates],
        });
      if (
        node &&
        !activityTypes.has(node.type) &&
        !(
          'event' in node &&
          node.event.kind === 'message' &&
          (ref === flow.sourceRef
            ? ['intermediateThrowEvent', 'endEvent']
            : ['startEvent', 'intermediateCatchEvent', 'boundaryEvent']
          ).includes(node.type)
        )
      )
        findings.push({
          code: 'MESSAGE_ENDPOINT',
          category: 'semantic',
          message: 'A Message Flow endpoint must be an Activity, Participant, or correctly directed Message Event.',
          remediation: 'Select a legal communication endpoint; do not use a Gateway or silently convert a None Event.',
          elementRefs: [flow.key, ref],
        });
    }
    if (flow.messageRef !== undefined && declarations.get(flow.messageRef)?.type !== 'message')
      findings.push({
        code: 'REF_MISSING',
        category: 'semantic',
        message: 'A Message Flow must reference a declared Message.',
        remediation: 'Declare the named Message or choose an existing Message key.',
        elementRefs: [flow.key, flow.messageRef],
      });
    const sources = participantsFor(flow.sourceRef);
    const targets = participantsFor(flow.targetRef);
    if (
      sources.length === 0 ||
      targets.length === 0 ||
      (sources.length === 1 && targets.length === 1 && sources[0] === targets[0])
    )
      findings.push({
        code: 'MESSAGE_SCOPE',
        category: 'semantic',
        message: 'A Message Flow must connect different participants.',
        remediation:
          'Use Sequence Flow for internal control flow and Message Flow only for inter-participant communication.',
        elementRefs: [flow.key, flow.sourceRef, flow.targetRef],
      });
  }
  for (const process of request.model.processes) {
    const flows = new Map((process.flows ?? []).map((flow) => [flow.key, flow]));
    const scopes = new Set([
      process.key,
      ...(process.nodes ?? []).filter((node) => node.type === 'subProcess').map((node) => node.key),
    ]);
    const lanes = new Map((process.lanes ?? []).map((lane) => [lane.key, lane]));
    const leafAssignments = new Map<string, string>();
    for (const lane of lanes.values()) {
      if (!scopes.has(lane.parentRef) && !lanes.has(lane.parentRef))
        findings.push({
          code: 'REF_MISSING',
          category: 'semantic',
          message: 'A Lane parent does not resolve to its Process or a Lane in that Process.',
          remediation: 'Select the containing flow scope or a parent Lane in the same scope.',
          elementRefs: [lane.key, lane.parentRef],
        });
      const ancestors = new Set<string>([lane.key]);
      let parent = lane.parentRef;
      while (lanes.has(parent) && !ancestors.has(parent)) {
        ancestors.add(parent);
        parent = lanes.get(parent)!.parentRef;
      }
      if (ancestors.has(parent))
        findings.push({
          code: 'CONTAINMENT_CYCLE',
          category: 'semantic',
          message: 'Lane containment must be acyclic.',
          remediation: 'Place each Lane under its flow scope or an ancestor that does not contain it.',
          elementRefs: [lane.key, parent],
        });
      const isLeaf = ![...lanes.values()].some((candidate) => candidate.parentRef === lane.key);
      if (!isLeaf && (lane.flowNodeRefs ?? []).length > 0)
        findings.push({
          code: 'LANE_MEMBERSHIP',
          category: 'semantic',
          message: 'Ancestor Lane membership is derived from its leaf Lanes.',
          remediation: 'Assign each Flow Node to a leaf Lane only.',
          elementRefs: [lane.key],
        });
      for (const ref of lane.flowNodeRefs ?? []) {
        const node = nodes.get(ref);
        if (!node)
          findings.push({
            code: 'REF_MISSING',
            category: 'semantic',
            message: 'A Lane references a missing Flow Node.',
            remediation: 'Select a Flow Node in the same flow scope.',
            elementRefs: [lane.key, ref],
          });
        else if (node.containerRef !== parent)
          findings.push({
            code: 'LANE_MEMBERSHIP',
            category: 'semantic',
            message: 'A Lane and its Flow Nodes must belong to the same flow scope.',
            remediation: 'Assign responsibility within the matching Process or Subprocess.',
            elementRefs: [lane.key, ref],
          });
        if (isLeaf) {
          const previous = leafAssignments.get(ref);
          if (previous !== undefined)
            findings.push({
              code: 'LANE_MEMBERSHIP',
              category: 'semantic',
              message: 'A Flow Node can belong to at most one leaf Lane.',
              remediation: 'Choose one responsible leaf Lane for this Flow Node.',
              elementRefs: [lane.key, previous, ref],
            });
          else leafAssignments.set(ref, lane.key);
        }
      }
    }
    for (const record of process.artifacts ?? []) {
      if (
        ![
          'dataObject',
          'dataObjectReference',
          'dataStoreReference',
          'dataInput',
          'dataOutput',
          'textAnnotation',
          'group',
          'association',
        ].includes(record.type)
      )
        unavailable(record.key);
      if (record.type === 'dataInput' || record.type === 'dataOutput') {
        const owner = nodes.get(record.ownerRef);
        const ownerProcess = request.model.processes.find((candidate) => candidate.key === record.ownerRef);
        if (!owner && !ownerProcess)
          findings.push({
            code: 'REF_MISSING',
            category: 'semantic',
            message: 'A data IO declaration must reference an existing Process, Activity, or Event owner.',
            remediation: 'Select the actual IO owner key.',
            elementRefs: [record.key, record.ownerRef],
          });
        else if ((ownerProcess?.key ?? nodeProcesses.get(record.ownerRef)) !== process.key)
          findings.push({
            code: 'DATA_SCOPE',
            category: 'semantic',
            message: 'An IO declaration belongs to the Process containing its owner.',
            remediation: 'Keep the declaration in its owner Process record.',
            elementRefs: [record.key, record.ownerRef],
          });
        if (owner && !activityTypes.has(owner.type) && !('event' in owner))
          findings.push({
            code: 'IO_OWNER',
            category: 'semantic',
            message: 'This Flow Node type cannot own data inputs or outputs.',
            remediation: 'Place the IO on its actual Process, Activity, or Event.',
            elementRefs: [record.key, owner.key],
          });
        if (owner?.type === 'subProcess')
          findings.push({
            code: 'IO_PLACEMENT',
            category: 'semantic',
            message: 'Embedded Subprocesses cannot define direct Data Inputs or Outputs.',
            remediation:
              'Use data accessible from the containing scope or a same-file callable Process; no loop mappings are inferred.',
            elementRefs: [record.key, owner.key],
          });
        if (
          owner &&
          'event' in owner &&
          (record.type === 'dataInput') !== ['intermediateThrowEvent', 'endEvent'].includes(owner.type)
        )
          findings.push({
            code: 'IO_DIRECTION',
            category: 'semantic',
            message: 'Catching Events own Data Outputs; throwing Events own Data Inputs.',
            remediation: 'Preserve the Event direction and select the corresponding IO kind.',
            elementRefs: [record.key, owner.key],
          });
      }
      if ('containerRef' in record && !scopes.has(record.containerRef))
        findings.push({
          code: 'ARTIFACT_SCOPE',
          category: 'semantic',
          message: 'A Process artifact must be contained by its Process or embedded Subprocess.',
          remediation: 'Choose a valid flow scope in the containing Process.',
          elementRefs: [record.key, record.containerRef],
        });
      if (record.type === 'dataObjectReference') {
        const object = artifacts.get(record.dataObjectRef);
        if (object?.type !== 'dataObject')
          findings.push({
            code: 'REF_MISSING',
            category: 'semantic',
            message: 'A Data Object Reference must resolve to a Data Object.',
            remediation: 'Select the underlying Data Object key.',
            elementRefs: [record.key, record.dataObjectRef],
          });
        else if (!accessibleScope(object.containerRef, record.containerRef))
          findings.push({
            code: 'DATA_SCOPE',
            category: 'semantic',
            message: 'A Data Object Reference cannot outlive or cross outside the underlying Data Object scope.',
            remediation:
              'Use data in its defining scope or a descendant scope, not a child or unrelated Process lifetime.',
            elementRefs: [record.key, object.key],
          });
      }
      if (record.type === 'dataStoreReference' && declarations.get(record.dataStoreRef)?.type !== 'dataStore')
        findings.push({
          code: 'REF_MISSING',
          category: 'semantic',
          message: 'A Data Store Reference must resolve to a declared Data Store.',
          remediation: 'Select an existing global Data Store declaration.',
          elementRefs: [record.key, record.dataStoreRef],
        });
    }
    for (const association of process.dataAssociations ?? []) {
      const owner = nodes.get(association.ownerRef);
      if (!owner || (!activityTypes.has(owner.type) && !('event' in owner)))
        findings.push({
          code: 'DATA_ASSOCIATION_OWNER',
          category: 'semantic',
          message: 'A Data Association must be owned by an Activity or Event.',
          remediation: 'Select the Activity or Event that consumes or produces this data.',
          elementRefs: [association.key, association.ownerRef],
        });
      if (
        owner &&
        'event' in owner &&
        (association.direction === 'input') !== ['intermediateThrowEvent', 'endEvent'].includes(owner.type)
      )
        findings.push({
          code: 'DATA_ASSOCIATION_DIRECTION',
          category: 'semantic',
          message: 'Catching Events permit output associations; throwing Events permit input associations.',
          remediation: 'Keep the stated Event direction and use its corresponding Data Association.',
          elementRefs: [association.key, owner.key],
        });
      if (owner && nodeProcesses.get(owner.key) !== process.key)
        findings.push({
          code: 'DATA_SCOPE',
          category: 'semantic',
          message: 'A Data Association belongs to the Process containing its owner.',
          remediation: 'Retain the association under its owner Process.',
          elementRefs: [association.key, owner.key],
        });
      if (association.sourceRefs.length !== 1)
        findings.push({
          code: 'DATA_ASSOCIATION_SOURCE_COUNT',
          category: 'semantic',
          message: 'A Data Association without transformation must have exactly one source.',
          remediation:
            'Identify one actual source; this profile does not infer transformations, assignments, or multiple associations.',
          elementRefs: [association.key, ...association.sourceRefs],
        });
      for (const [ref, ownedSide] of [
        ...association.sourceRefs.map((ref): [string, boolean] => [ref, association.direction === 'output']),
        [association.targetRef, association.direction === 'input'] as [string, boolean],
      ]) {
        const endpoint = artifacts.get(ref);
        if (
          !endpoint ||
          !['dataObject', 'dataObjectReference', 'dataStoreReference', 'dataInput', 'dataOutput'].includes(
            endpoint.type,
          )
        ) {
          findings.push({
            code: 'REF_MISSING',
            category: 'semantic',
            message: 'A Data Association endpoint must resolve to a supported data item.',
            remediation: 'Select a Data Object, data reference, or legal Data Input or Output.',
            elementRefs: [association.key, ref],
          });
          continue;
        }
        const validOwned =
          'ownerRef' in endpoint &&
          endpoint.ownerRef === association.ownerRef &&
          endpoint.type === (association.direction === 'input' ? 'dataInput' : 'dataOutput');
        const endpointScope =
          'containerRef' in endpoint ? endpoint.containerRef : 'ownerRef' in endpoint ? endpoint.ownerRef : '';
        const validExternal =
          owner &&
          accessibleScope(endpointScope, owner.containerRef) &&
          !(association.direction === 'input' ? endpoint.type === 'dataOutput' : endpoint.type === 'dataInput');
        if (ownedSide ? !validOwned : !validExternal)
          findings.push({
            code: 'DATA_RELATION',
            category: 'semantic',
            message: 'A Data Association must connect accessible data with the matching IO of its actual owner.',
            remediation:
              'Use owner Data Inputs as input targets and owner Data Outputs as output sources; keep counterpart data within its accessible scope.',
            elementRefs: [association.key, ref, association.ownerRef],
          });
      }
    }
    for (const node of process.nodes ?? []) {
      const incoming = [...flows.values()].filter((flow) => flow.targetRef === node.key);
      const outgoing = [...flows.values()].filter((flow) => flow.sourceRef === node.key);
      if (
        (node.type === 'sendTask' || node.type === 'receiveTask') &&
        node.messageRef !== undefined &&
        [...artifacts.values()].filter(
          (artifact) =>
            artifact.type === (node.type === 'sendTask' ? 'dataInput' : 'dataOutput') &&
            'ownerRef' in artifact &&
            artifact.ownerRef === node.key,
        ).length > 1
      )
        findings.push({
          code: 'IO_CARDINALITY',
          category: 'semantic',
          message:
            'A named Send Task permits at most one Data Input, and a named Receive Task at most one Data Output.',
          remediation: 'Represent the single stated Message payload without inventing additional mappings.',
          elementRefs: [node.key],
        });
      if (
        'event' in node &&
        node.event.kind === 'message' &&
        ['intermediateCatchEvent', 'intermediateThrowEvent', 'boundaryEvent'].includes(node.type) &&
        (request.model.collaboration?.messageFlows ?? []).filter(
          (flow) => flow.sourceRef === node.key || flow.targetRef === node.key,
        ).length > 1
      )
        findings.push({
          code: 'MESSAGE_CARDINALITY',
          category: 'semantic',
          message: 'An Intermediate Message Event permits one incoming or one outgoing Message Flow, not multiple.',
          remediation: 'Represent each communication explicitly with a legal Event or Task.',
          elementRefs: [node.key],
        });
      if (
        (node.type === 'startEvent' && outgoing.length === 0) ||
        (node.type === 'endEvent' && incoming.length === 0) ||
        (node.type === 'boundaryEvent' && (incoming.length > 0 || outgoing.length === 0)) ||
        (['intermediateCatchEvent', 'intermediateThrowEvent'].includes(node.type) &&
          ('event' in node && node.event.kind === 'link'
            ? node.type === 'intermediateCatchEvent'
              ? incoming.length > 0 || outgoing.length === 0
              : incoming.length === 0 || outgoing.length > 0
            : incoming.length === 0 || outgoing.length === 0))
      )
        findings.push({
          code: 'EVENT_FLOW',
          category: 'semantic',
          message: 'The Event lacks a required Sequence Flow or has an incoming boundary flow.',
          remediation:
            'Connect starts outward, ends inward, normal intermediate Events both ways, and boundary Events outward only.',
          elementRefs: [node.key],
        });
      if (
        node.type === 'startEvent' &&
        !(process.nodes ?? []).some(
          (candidate) => candidate.type === 'endEvent' && candidate.containerRef === node.containerRef,
        )
      )
        findings.push({
          code: 'EVENT_SCOPE',
          category: 'semantic',
          message: 'A flow scope containing a Start Event must also contain an End Event.',
          remediation: 'Represent an explicit completion in the same Process or Subprocess scope.',
          elementRefs: [node.key, node.containerRef],
        });
      if (
        node.type === 'endEvent' &&
        !(process.nodes ?? []).some(
          (candidate) =>
            candidate.containerRef === node.containerRef &&
            (candidate.type === 'startEvent' ||
              (candidate.type === 'eventBasedGateway' && candidate.instantiate === true)),
        )
      )
        findings.push({
          code: 'EVENT_SCOPE',
          category: 'semantic',
          message: 'A flow scope containing an End Event must have an explicit entry.',
          remediation: 'Represent a Start Event or legal instantiating Event-Based Gateway in the same scope.',
          elementRefs: [node.key, node.containerRef],
        });
      if (node.type.endsWith('Gateway') && incoming.length < 2 && outgoing.length < 2)
        findings.push({
          code: 'GATEWAY_FLOW',
          category: 'semantic',
          message: 'A Gateway must merge or split more than one Sequence Flow.',
          remediation:
            'Represent the actual branching or merging paths, or retain an Activity if no routing decision exists.',
          elementRefs: [node.key],
        });
      if (node.type === 'eventBasedGateway') {
        if (
          outgoing.length < 2 ||
          (node.instantiate === true && incoming.length > 0) ||
          (node.eventGatewayType === 'Parallel' && node.instantiate !== true)
        )
          findings.push({
            code: 'EVENT_BASED_FLOW',
            category: 'semantic',
            message: 'An Event-Based Gateway needs at least two alternatives and a legal instantiation configuration.',
            remediation:
              'Keep instantiating gateways without incoming flow; Parallel event gateways must instantiate the Process.',
            elementRefs: [node.key],
          });
        const targets = outgoing.map((flow) => nodes.get(flow.targetRef)).filter((target) => target !== undefined);
        if (
          targets.some((target) => target.type === 'receiveTask') &&
          targets.some((target) => 'event' in target && target.event.kind === 'message')
        )
          findings.push({
            code: 'EVENT_BASED_MIX',
            category: 'semantic',
            message: 'An Event-Based Gateway cannot mix Receive Tasks with Message Catch Events.',
            remediation: 'Choose one stated communication representation for these alternatives.',
            elementRefs: [node.key],
          });
        for (const target of targets) {
          const legalType =
            target.type === 'receiveTask' ||
            (target.type === 'intermediateCatchEvent' &&
              ['message', 'timer', 'signal', 'conditional'].includes(target.event.kind));
          const additionalIncoming = [...flows.values()].some(
            (flow) => flow.targetRef === target.key && flow.sourceRef !== node.key,
          );
          const attachedBoundary =
            target.type === 'receiveTask' &&
            (process.nodes ?? []).some(
              (candidate) => candidate.type === 'boundaryEvent' && candidate.attachedToRef === target.key,
            );
          if (!legalType || additionalIncoming || attachedBoundary)
            findings.push({
              code: 'EVENT_BASED_TARGET',
              category: 'semantic',
              message:
                'An Event-Based Gateway target must be a legal catch or Receive Task without competing incoming flow or an attached Receive Task boundary.',
              remediation:
                'Use Message, Timer, Signal, or Conditional catches, or legal Receive Tasks, as exclusive gateway-owned targets.',
              elementRefs: [node.key, target.key],
            });
        }
      }
      if (
        'event' in node &&
        'ref' in node.event &&
        node.event.ref !== undefined &&
        declarations.get(node.event.ref)?.type !== node.event.kind
      )
        findings.push({
          code: 'REF_MISSING',
          category: 'semantic',
          message: 'An Event reference must resolve to a matching named declaration.',
          remediation: 'Select a declaration of the matching Event kind.',
          elementRefs: [node.key, node.event.ref],
        });
      if (
        'event' in node &&
        (node.event.kind === 'error' || node.event.kind === 'escalation') &&
        node.type !== 'boundaryEvent' &&
        node.event.ref === undefined
      )
        findings.push({
          code: 'REF_MISSING',
          category: 'semantic',
          message: 'An Error or Escalation throw must name its declared result.',
          remediation: 'Select the matching named Error or Escalation declaration.',
          elementRefs: [node.key],
        });
      if (node.type === 'boundaryEvent' && node.event.kind === 'error' && !node.interrupting)
        findings.push({
          code: 'EVENT_INTERRUPTION',
          category: 'semantic',
          message: 'An Error Boundary Event must interrupt its attached Activity.',
          remediation:
            'Represent an interrupting Error catch; do not substitute Escalation without a human semantic decision.',
          elementRefs: [node.key],
        });
      if (node.type === 'boundaryEvent') {
        const activity = nodes.get(node.attachedToRef);
        if (!activity)
          findings.push({
            code: 'REF_MISSING',
            category: 'semantic',
            message: 'A Boundary Event must reference an existing attached Activity.',
            remediation: 'Select the Activity whose boundary catches this Event.',
            elementRefs: [node.key, node.attachedToRef],
          });
        else if (!activityTypes.has(activity.type) || activity.containerRef !== node.containerRef)
          findings.push({
            code: 'BOUNDARY_ATTACHMENT',
            category: 'semantic',
            message: 'A Boundary Event and its attached Activity must share the same flow scope.',
            remediation: 'Attach the Event to an Activity in its containing Process or Subprocess.',
            elementRefs: [node.key, activity.key],
          });
      }
      if (
        'event' in node &&
        ((['timer', 'conditional'].includes(node.event.kind) &&
          !['startEvent', 'intermediateCatchEvent', 'boundaryEvent'].includes(node.type)) ||
          (node.event.kind === 'none' && node.type === 'boundaryEvent') ||
          (node.event.kind === 'error' && !['boundaryEvent', 'endEvent'].includes(node.type)) ||
          (node.event.kind === 'escalation' &&
            !['boundaryEvent', 'intermediateThrowEvent', 'endEvent'].includes(node.type)) ||
          (node.event.kind === 'terminate' && node.type !== 'endEvent') ||
          (node.event.kind === 'link' && !['intermediateCatchEvent', 'intermediateThrowEvent'].includes(node.type)) ||
          (node.type === 'startEvent' && node.containerRef !== process.key && node.event.kind !== 'none'))
      )
        findings.push({
          code: 'EVENT_PLACEMENT',
          category: 'semantic',
          message: 'This Event definition is not legal in the requested position or embedded scope.',
          remediation: 'Choose a legal catching/throwing position; embedded Subprocess starts have no trigger.',
          elementRefs: [node.key],
        });
      if ('event' in node && node.event.kind === 'link') {
        const name = node.event.name;
        const peers = (process.nodes ?? []).filter(
          (candidate) =>
            'event' in candidate &&
            candidate.event.kind === 'link' &&
            candidate.event.name === name &&
            candidate.containerRef === node.containerRef,
        );
        const catches = peers.filter((candidate) => candidate.type === 'intermediateCatchEvent');
        const throws = peers.filter((candidate) => candidate.type === 'intermediateThrowEvent');
        if (catches.length !== 1 || throws.length === 0)
          findings.push({
            code: 'LINK_MATCHING',
            category: 'semantic',
            message:
              'A Link continuation requires exactly one same-name catch and at least one throw in the same flow scope.',
            remediation:
              'Pair the Link names within one Process or Subprocess; do not infer a cross-scope continuation.',
            elementRefs: [node.key],
          });
      }
      if (
        'event' in node &&
        node.event.kind === 'none' &&
        ['intermediateCatchEvent', 'intermediateThrowEvent'].includes(node.type)
      )
        findings.push({
          code: 'CONCEPT_DEFERRED',
          category: 'profile',
          message: 'None Intermediate Events are outside the Consulting Core Profile.',
          remediation: 'Retain the requirement explicitly; do not silently substitute another Event definition.',
          elementRefs: [node.key],
        });
      if (
        node.type === 'callActivity' &&
        !request.model.processes.some((candidate) => candidate.key === node.calledProcessRef)
      )
        findings.push({
          code: 'REF_MISSING',
          category: 'semantic',
          message: 'A Call Activity must reference a Process contained in this file.',
          remediation: 'Include the called Process and select its stable key.',
          elementRefs: [node.key, node.calledProcessRef],
        });
      if ('loop' in node && node.loop !== undefined && !activityTypes.has(node.type))
        findings.push({
          code: 'LOOP_PLACEMENT',
          category: 'semantic',
          message: 'Loop characteristics belong to Activities only.',
          remediation: 'Place repetition on the Activity that repeats, not on a Gateway or Event.',
          elementRefs: [node.key],
        });
      const ancestors = new Set<string>([node.key]);
      let parent = node.containerRef;
      while (nodes.has(parent) && !ancestors.has(parent)) {
        ancestors.add(parent);
        parent = nodes.get(parent)!.containerRef;
      }
      if (ancestors.has(parent))
        findings.push({
          code: 'CONTAINMENT_CYCLE',
          category: 'semantic',
          message: 'Subprocess containment must be acyclic.',
          remediation: 'Keep nested scopes under their containing Process without self-containment.',
          elementRefs: [node.key, parent],
        });
      if (
        'messageRef' in node &&
        node.messageRef !== undefined &&
        declarations.get(node.messageRef)?.type !== 'message'
      )
        findings.push({
          code: 'REF_MISSING',
          category: 'semantic',
          message: 'A communication task must reference a declared Message.',
          remediation: 'Declare the named Message or choose an existing Message key.',
          elementRefs: [node.key, node.messageRef],
        });
      if ('defaultFlowRef' in node && node.defaultFlowRef !== undefined) {
        const flow = flows.get(node.defaultFlowRef);
        if (!flow)
          findings.push({
            code: 'REF_MISSING',
            category: 'semantic',
            message: 'The default Sequence Flow reference does not resolve.',
            remediation: 'Choose an existing outgoing Sequence Flow as the default.',
            elementRefs: [node.key, node.defaultFlowRef],
          });
        else if (flow.sourceRef !== node.key || flow.condition !== undefined)
          findings.push({
            code: 'DEFAULT_FLOW',
            category: 'semantic',
            message: 'A default Sequence Flow must be outgoing from its owner and have no condition.',
            remediation: 'Choose an outgoing flow and remove its competing condition.',
            elementRefs: [node.key, flow.key],
          });
      }
      if (!scopes.has(node.containerRef))
        findings.push({
          code: 'FLOW_SCOPE',
          category: 'semantic',
          message: 'A Flow Node does not belong to its containing Process.',
          remediation: 'Place the node in its declared flow scope.',
          elementRefs: [node.key],
        });
      if (
        ![
          'task',
          'sendTask',
          'receiveTask',
          'userTask',
          'manualTask',
          'serviceTask',
          'businessRuleTask',
          'scriptTask',
          'subProcess',
          'callActivity',
          'startEvent',
          'endEvent',
          'boundaryEvent',
          'intermediateCatchEvent',
          'intermediateThrowEvent',
          'exclusiveGateway',
          'parallelGateway',
          'inclusiveGateway',
          'eventBasedGateway',
        ].includes(node.type) ||
        ('event' in node &&
          !['none', 'message', 'signal', 'timer', 'conditional', 'error', 'escalation', 'terminate', 'link'].includes(
            node.event.kind,
          ))
      )
        unavailable(node.key);
    }
    for (const flow of process.flows ?? []) {
      const source = nodes.get(flow.sourceRef);
      if (
        flow.condition !== undefined &&
        source &&
        ![
          'task',
          'sendTask',
          'receiveTask',
          'userTask',
          'manualTask',
          'serviceTask',
          'businessRuleTask',
          'scriptTask',
          'subProcess',
          'callActivity',
          'exclusiveGateway',
          'inclusiveGateway',
        ].includes(source.type)
      )
        findings.push({
          code: 'FLOW_CONDITION',
          category: 'semantic',
          message: 'This Flow Node type does not permit conditional outgoing Sequence Flows.',
          remediation: 'Use a stated Exclusive/Inclusive decision or an Activity where a condition is legal.',
          elementRefs: [flow.key, source.key],
        });
      if (
        source &&
        (source.type === 'exclusiveGateway' || source.type === 'inclusiveGateway') &&
        (process.flows ?? []).filter((candidate) => candidate.sourceRef === source.key).length > 1 &&
        source.defaultFlowRef !== flow.key &&
        (flow.condition === undefined || flow.condition.trim() === '')
      )
        findings.push({
          code: 'FLOW_CONDITION',
          category: 'profile',
          message: 'Every non-default decision branch needs a stated condition.',
          remediation: 'Supply the branch condition from the evidence or explicitly select a default path.',
          elementRefs: [flow.key, source.key],
        });
      if (
        !scopes.has(flow.containerRef) ||
        (nodes.has(flow.sourceRef) && nodes.get(flow.sourceRef)!.containerRef !== flow.containerRef) ||
        (nodes.has(flow.targetRef) && nodes.get(flow.targetRef)!.containerRef !== flow.containerRef)
      )
        findings.push({
          code: 'FLOW_SCOPE',
          category: 'semantic',
          message: 'A Sequence Flow and both endpoints must share a containing Process or Subprocess.',
          remediation: 'Keep this Sequence Flow inside one flow scope.',
          elementRefs: [flow.key],
        });
      for (const ref of [flow.sourceRef, flow.targetRef]) {
        if (!nodes.has(ref))
          findings.push({
            code: 'REF_MISSING',
            category: 'semantic',
            message: 'A Sequence Flow references a missing Flow Node.',
            remediation: 'Choose an existing source and target in the same flow scope.',
            elementRefs: [flow.key, ref],
          });
      }
      if (nodes.get(flow.sourceRef)?.type === 'endEvent')
        findings.push({
          code: 'EVENT_PLACEMENT',
          category: 'semantic',
          message: 'An End Event cannot have an outgoing Sequence Flow.',
          remediation: 'End this flow at the End Event or select a different source.',
          elementRefs: [flow.key, flow.sourceRef],
        });
      if (nodes.get(flow.targetRef)?.type === 'startEvent')
        findings.push({
          code: 'EVENT_PLACEMENT',
          category: 'semantic',
          message: 'A Start Event cannot have an incoming Sequence Flow.',
          remediation: 'Start this flow at the Start Event or select a different target.',
          elementRefs: [flow.key, flow.targetRef],
        });
    }
  }
  return findings;
}
