import { parentPort, workerData } from 'node:worker_threads';
import { BpmnModdle, type ModdleElement } from 'bpmn-moddle';
import { layoutProcess } from 'bpmn-auto-layout';
import { semanticProjection } from './compiler.js';
import { OperationError } from './diagnostics.js';
import { completeGeometry } from './geometry.js';
import type { ProcessRequest } from './model.js';

/** Accept geometry only; the caller's original semantic objects remain authoritative. */
async function computeLayout(xml: string, request: ProcessRequest): Promise<string> {
  try {
    const moddle = new BpmnModdle();
    const source = await moddle.fromXML(xml);
    if (source.warnings.length) throw invalid('DI_INVALID', 'The model could not be prepared for layout.');
    const prepared = await moddle.fromXML(await prepareLayoutInput(xml, request, moddle));
    const collaboration = request.model.collaboration && prepared.elementsById[`M_${request.model.collaboration.key}`];
    // Reusing a Process is legal BPMN. The alpha duplicates its DI in both pools;
    // use an overview and one process panel, without cloning semantic objects.
    const participants = (collaboration?.participants ?? []) as ModdleElement[];
    const references = participants.map((participant) => participant.processRef?.id);
    const sharedProcesses = new Set(
      references.filter((id) => id && references.filter((reference) => reference === id).length > 1),
    );
    for (const participant of participants) {
      if (participant.processRef && sharedProcesses.has(participant.processRef.id)) delete participant.processRef;
    }
    const blackBoxOnly = collaboration && !participants.some((participant) => participant.processRef);
    // Dense Message Flow routing is completed once by the owned adapter. The
    // alpha's handoff routing dominates its flow-node placement time.
    if (!blackBoxOnly && (collaboration?.messageFlows ?? []).length > 10) collaboration!.messageFlows = [];
    const preparedXml = (await moddle.toXML(prepared.rootElement, { format: true })).xml;
    const primaryResult = blackBoxOnly
      ? await layoutBlackBoxes(prepared.rootElement, prepared.elementsById, request, moddle)
      : await layoutProcess(preparedXml);
    const diagrams = await acceptGeometry(preparedXml, primaryResult, moddle);
    // Alpha chooses one root Process/Collaboration. Every remaining process must
    // get a panel too (including same-file call targets and shared processes).
    for (const process of request.model.processes) {
      const visible = new Set(
        diagrams.flatMap((diagram) =>
          (diagram.plane?.planeElement ?? []).map((element: ModdleElement) => element.bpmnElement?.id),
        ),
      );
      if ((process.nodes ?? []).length === 0 && !(process.lanes ?? []).length && !(process.artifacts ?? []).length) {
        if (!diagrams.some((diagram) => diagram.plane?.bpmnElement?.id === `M_${process.key}`))
          diagrams.push(
            moddle.create('bpmndi:BPMNDiagram', {
              plane: moddle.create('bpmndi:BPMNPlane', {
                bpmnElement: source.elementsById[`M_${process.key}`],
                planeElement: [],
              }),
            }),
          );
        continue;
      }
      if ((process.nodes ?? []).length > 0 && (process.nodes ?? []).every((node) => visible.has(`M_${node.key}`)))
        continue;
      const isolated = await moddle.fromXML(
        await prepareLayoutInput(
          xml,
          { ...request, model: { ...request.model, primaryRef: process.key, collaboration: undefined } },
          moddle,
        ),
      );
      isolated.rootElement.rootElements = isolated.rootElement.rootElements.filter(
        (element: ModdleElement) => element.$type !== 'bpmn:Collaboration',
      );
      const processXml = (await moddle.toXML(isolated.rootElement, { format: true })).xml;
      diagrams.push(...(await acceptGeometry(processXml, await layoutProcess(processXml), moddle)));
    }
    const primaryId = `M_${request.model.primaryRef}`;
    diagrams.sort(
      (a, b) => Number(b.plane?.bpmnElement?.id === primaryId) - Number(a.plane?.bpmnElement?.id === primaryId),
    );
    if (!diagrams.length || diagrams[0]?.plane?.bpmnElement?.id !== primaryId) {
      throw invalid('DI_MISSING', 'The requested primary process has no diagram.');
    }
    completeOwnedArtifacts(diagrams, source.elementsById, request, moddle);
    if (!(diagrams[0].plane.planeElement ?? []).length)
      throw invalid('DI_MISSING', 'The primary process has no modeled diagram content.');
    const visible = new Set<string>();
    for (const diagram of diagrams) {
      const plane = diagram.plane as ModdleElement;
      const subjectId = plane.bpmnElement?.id as string;
      diagram.id = `D_diagram_${subjectId}`;
      plane.id = `D_plane_${subjectId}`;
      plane.bpmnElement = source.elementsById[subjectId];
      const groups = [
        ...request.model.processes.flatMap((process) => process.artifacts ?? []),
        ...(request.model.collaboration?.artifacts ?? []),
      ].filter((artifact) => artifact.type === 'group');
      await completeGeometry(
        plane,
        moddle,
        new Map(groups.map((group) => [`M_${group.key}`, group.memberRefs.map((key) => `M_${key}`)])),
      );
      for (const element of (plane.planeElement ?? []) as ModdleElement[]) {
        const semanticId = element.bpmnElement?.id as string;
        const semantic = source.elementsById[semanticId];
        if (!semantic) throw invalid('DI_INVALID', 'Diagram geometry refers to an unknown process element.');
        element.bpmnElement = semantic;
        if (semantic.$type === 'bpmn:MessageFlow') delete element.messageVisibleKind;
        element.id = `D_${element.$type === 'bpmndi:BPMNEdge' ? 'edge' : 'shape'}_${subjectId}_${semanticId}`;
        visible.add(semanticId);
        if (element.$type === 'bpmndi:BPMNShape') {
          if (semantic.$type === 'bpmn:Participant' && sharedProcesses.has(semantic.processRef?.id))
            element.isExpanded = false;
          const bounds = element.bounds;
          if (
            !bounds ||
            ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
            bounds.width <= 0 ||
            bounds.height <= 0
          ) {
            throw invalid('DI_INVALID', 'A diagram shape has invalid bounds.');
          }
        } else if (element.$type === 'bpmndi:BPMNEdge') {
          const points = element.waypoint ?? [];
          if (
            points.length < 2 ||
            points.some((point: ModdleElement) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
          ) {
            throw invalid('DI_INVALID', 'A diagram connection has invalid waypoints.');
          }
        }
        if (element.label) element.label.id = `D_label_${subjectId}_${semanticId}`;
      }
    }
    for (const key of expectedVisibleKeys(request)) {
      if (!visible.has(`M_${key}`))
        throw invalid('DI_MISSING', 'The layout did not cover every requested visible element.');
    }
    source.rootElement.diagrams = diagrams;
    const result = (await moddle.toXML(source.rootElement, { format: true })).xml;
    if (JSON.stringify(await semanticProjection(xml)) !== JSON.stringify(await semanticProjection(result)))
      throw invalid('DI_INVALID', 'The layout changed process meaning and was rejected.');
    return result;
  } catch (error) {
    if (error instanceof OperationError) throw error;
    throw new OperationError(
      'DEPENDENCY_FAILURE',
      'runtime',
      'The local layout dependency could not produce a diagram.',
    );
  }
}

async function acceptGeometry(
  xml: string,
  result: { xml: string; warnings: unknown[] },
  moddle: BpmnModdle,
): Promise<ModdleElement[]> {
  if (result.warnings.length) throw invalid('DI_MISSING', 'The layout could not include every requested element.');
  const geometry = await moddle.fromXML(result.xml);
  if (geometry.warnings.length) throw invalid('DI_INVALID', 'The computed diagram could not be read completely.');
  if (JSON.stringify(await semanticProjection(xml)) !== JSON.stringify(await semanticProjection(result.xml)))
    throw invalid('DI_INVALID', 'The layout changed process meaning and was rejected.');
  return geometry.rootElement.diagrams ?? [];
}

function expectedVisibleKeys(request: ProcessRequest): string[] {
  const keys: string[] = [];
  for (const process of request.model.processes) {
    keys.push(...(process.nodes ?? []).map((element) => element.key));
    keys.push(...(process.flows ?? []).map((element) => element.key));
    keys.push(...(process.lanes ?? []).map((element) => element.key));
    keys.push(
      ...(process.artifacts ?? [])
        .filter(
          (element) => element.type !== 'dataObject' && (!('ownerRef' in element) || element.ownerRef === process.key),
        )
        .map((element) => element.key),
    );
    keys.push(...(process.dataAssociations ?? []).map((element) => element.key));
  }
  const collaboration = request.model.collaboration;
  if (collaboration) {
    keys.push(...(collaboration.participants ?? []).map((element) => element.key));
    keys.push(...(collaboration.messageFlows ?? []).map((element) => element.key));
    keys.push(...(collaboration.artifacts ?? []).map((element) => element.key));
  }
  return keys;
}

function invalid(code: string, message: string): OperationError {
  return new OperationError(code, 'diagram', message, 2, 'refused');
}

async function layoutBlackBoxes(
  root: ModdleElement,
  elements: Record<string, ModdleElement>,
  request: ProcessRequest,
  moddle: BpmnModdle,
): Promise<{ xml: string; warnings: never[] }> {
  const collaboration = request.model.collaboration!;
  const participants = [...(collaboration.participants ?? [])];
  const order = request.presentation?.participantOrder ?? [];
  participants.sort((a, b) => rank(a.key, order) - rank(b.key, order));
  const plane = moddle.create('bpmndi:BPMNPlane', {
    bpmnElement: elements[`M_${collaboration.key}`],
    planeElement: [],
  });
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
  let top = 80;
  for (const participant of participants) {
    const incidence = (collaboration.messageFlows ?? []).filter(
      (flow) => flow.sourceRef === participant.key || flow.targetRef === participant.key,
    ).length;
    const bounds = { x: 80, y: top, width: 500, height: Math.max(100, 40 + incidence * 28) };
    positions.set(participant.key, bounds);
    plane.planeElement.push(
      moddle.create('bpmndi:BPMNShape', {
        bpmnElement: elements[`M_${participant.key}`],
        isHorizontal: true,
        bounds: moddle.create('dc:Bounds', bounds),
      }),
    );
    top += bounds.height + 80;
  }
  const usedPorts = new Map<string, number>();
  for (const [index, flow] of (collaboration.messageFlows ?? []).entries()) {
    const source = positions.get(flow.sourceRef);
    const target = positions.get(flow.targetRef);
    if (!source || !target) throw invalid('DI_INVALID', 'A black-box message has an unresolved participant.');
    const sourcePort = usedPorts.get(flow.sourceRef) ?? 0;
    const targetPort = usedPorts.get(flow.targetRef) ?? 0;
    usedPorts.set(flow.sourceRef, sourcePort + 1);
    usedPorts.set(flow.targetRef, targetPort + 1);
    const sx = source.x + source.width;
    const sy = source.y + 28 + sourcePort * 28;
    const tx = target.x + target.width;
    const ty = target.y + 28 + targetPort * 28;
    const channel = sx + 60 + index * 160;
    const edge = moddle.create('bpmndi:BPMNEdge', {
      bpmnElement: elements[`M_${flow.key}`],
      waypoint: [
        moddle.create('dc:Point', { x: sx, y: sy }),
        moddle.create('dc:Point', { x: channel, y: sy }),
        moddle.create('dc:Point', { x: channel, y: ty }),
        moddle.create('dc:Point', { x: tx, y: ty }),
      ],
    });
    if (flow.name)
      edge.label = moddle.create('bpmndi:BPMNLabel', {
        bounds: moddle.create('dc:Bounds', { x: channel + 8, y: (sy + ty) / 2 - 15, width: 140, height: 30 }),
      });
    plane.planeElement.push(edge);
  }
  root.diagrams = [moddle.create('bpmndi:BPMNDiagram', { plane })];
  return { xml: (await moddle.toXML(root, { format: true })).xml, warnings: [] };
}

function rank(key: string, order: string[]): number {
  const index = order.indexOf(key);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

async function prepareLayoutInput(xml: string, request: ProcessRequest, moddle: BpmnModdle): Promise<string> {
  const prepared = await moddle.fromXML(xml);
  const primary = prepared.elementsById[`M_${request.model.primaryRef}`];
  const owned = new Set(
    Object.values(prepared.elementsById).filter(
      (element) =>
        element.$type === 'bpmn:Group' ||
        (['bpmn:DataInput', 'bpmn:DataOutput'].includes(element.$type) &&
          element.$parent?.$parent?.$type === 'bpmn:Process'),
    ),
  );
  const omitted = new Set<ModdleElement>();
  for (const element of Object.values(prepared.elementsById)) {
    if (element.$type === 'bpmn:Group') omitted.add(element);
    if (
      (element.$instanceOf('bpmn:DataAssociation') || element.$type === 'bpmn:Association') &&
      [...(Array.isArray(element.sourceRef) ? element.sourceRef : [element.sourceRef]), element.targetRef].some((ref) =>
        owned.has(ref),
      )
    )
      omitted.add(element);
  }
  for (const element of Object.values(prepared.elementsById)) {
    for (const property of ['artifacts', 'flowElements', 'dataInputAssociations', 'dataOutputAssociations']) {
      if (Array.isArray(element[property]))
        element[property] = element[property].filter((child: ModdleElement) => !omitted.has(child));
    }
  }
  prepared.rootElement.rootElements.sort(
    (a: ModdleElement, b: ModdleElement) => Number(b === primary) - Number(a === primary),
  );
  const presentation = request.presentation;
  if (request.model.collaboration && presentation?.participantOrder) {
    primary!.participants.sort(
      (a: ModdleElement, b: ModdleElement) =>
        rank(a.id!.slice(2), presentation.participantOrder!) - rank(b.id!.slice(2), presentation.participantOrder!),
    );
  }
  if (presentation?.laneOrder) {
    for (const element of Object.values(prepared.elementsById)) {
      if (element.$type === 'bpmn:LaneSet')
        element.lanes.sort(
          (a: ModdleElement, b: ModdleElement) =>
            rank(a.id!.slice(2), presentation.laneOrder!) - rank(b.id!.slice(2), presentation.laneOrder!),
        );
    }
  }
  if (presentation?.subprocesses?.length) {
    // Alpha reads expansion intent from input DI. These private placeholders
    // express presentation only; every final coordinate comes from layout.
    const plane = moddle.create('bpmndi:BPMNPlane', {
      id: 'G_presentation_plane',
      bpmnElement: primary,
      planeElement: [],
    });
    for (const hint of presentation.subprocesses) {
      plane.planeElement.push(
        moddle.create('bpmndi:BPMNShape', {
          id: `G_presentation_${hint.elementRef}`,
          bpmnElement: prepared.elementsById[`M_${hint.elementRef}`],
          isExpanded: hint.expanded,
          bounds: moddle.create('dc:Bounds', { x: 0, y: 0, width: 100, height: 80 }),
        }),
      );
    }
    prepared.rootElement.diagrams = [moddle.create('bpmndi:BPMNDiagram', { id: 'G_presentation_diagram', plane })];
  }
  return (await moddle.toXML(prepared.rootElement, { format: true })).xml;
}

/** Complete owned handoffs, Process IO and Group DI from original semantic references. */
function completeOwnedArtifacts(
  diagrams: ModdleElement[],
  elements: Record<string, ModdleElement>,
  request: ProcessRequest,
  moddle: BpmnModdle,
): void {
  for (const flow of Object.values(elements).filter((element) => element.$type === 'bpmn:MessageFlow')) {
    const views = diagrams.filter((diagram) =>
      diagram.plane.planeElement.some((element: ModdleElement) => element.bpmnElement.id === flow.id),
    );
    const anchor = (plane: ModdleElement, endpoint: ModdleElement): ModdleElement | undefined => {
      for (let current: ModdleElement | undefined = endpoint; current; current = current.$parent) {
        const shape = plane.planeElement.find(
          (element: ModdleElement) => element.bounds && element.bpmnElement.id === current!.id,
        );
        if (shape) return shape;
      }
      return undefined;
    };
    if (!views.length) {
      const diagram = diagrams.find(
        (diagram) => anchor(diagram.plane, flow.sourceRef) && anchor(diagram.plane, flow.targetRef),
      );
      if (!diagram) throw invalid('DI_MISSING', 'A Message Flow has no complete visible participant scope.');
      views.push(diagram);
    }
    for (const diagram of views) {
      const sourceShape = anchor(diagram.plane, flow.sourceRef);
      const targetShape = anchor(diagram.plane, flow.targetRef);
      if (!sourceShape || !targetShape)
        throw invalid('DI_MISSING', 'A Message Flow has no complete visible participant scope.');
      const existing = diagram.plane.planeElement.find((element: ModdleElement) => element.bpmnElement.id === flow.id);
      if (existing) {
        // Alpha paths need the same explicit collapsed-ancestor docking as owned
        // paths; retaining their geometry must not bypass this completion step.
        if (sourceShape.bpmnElement.id !== flow.sourceRef.id) existing.sourceElement = sourceShape;
        if (targetShape.bpmnElement.id !== flow.targetRef.id) existing.targetElement = targetShape;
        continue;
      }
      const source = sourceShape.bounds;
      const target = targetShape.bounds;
      const first = { x: source.x + source.width / 2, y: source.y + source.height };
      const last = { x: target.x + target.width / 2, y: target.y };
      const y = (first.y + last.y) / 2;
      diagram.plane.planeElement.push(
        moddle.create('bpmndi:BPMNEdge', {
          bpmnElement: flow,
          ...(sourceShape.bpmnElement.id !== flow.sourceRef.id ? { sourceElement: sourceShape } : {}),
          ...(targetShape.bpmnElement.id !== flow.targetRef.id ? { targetElement: targetShape } : {}),
          waypoint: [first, { x: first.x, y }, { x: last.x, y }, last].map((point) => moddle.create('dc:Point', point)),
        }),
      );
    }
  }
  for (const process of request.model.processes) {
    const io = (process.artifacts ?? []).filter(
      (artifact) =>
        ['dataInput', 'dataOutput'].includes(artifact.type) &&
        'ownerRef' in artifact &&
        artifact.ownerRef === process.key,
    );
    if (!io.length) continue;
    const diagram =
      diagrams.find((diagram) => diagram.plane.bpmnElement.id === `M_${process.key}`) ??
      diagrams.find((diagram) =>
        diagram.plane.planeElement.some(
          (shape: ModdleElement) =>
            shape.bpmnElement.$type === 'bpmn:Participant' &&
            shape.bpmnElement.processRef?.id === `M_${process.key}` &&
            shape.isExpanded !== false,
        ),
      );
    if (!diagram) continue;
    const plane = diagram.plane as ModdleElement;
    const pool = plane.planeElement.find(
      (shape: ModdleElement) =>
        shape.bpmnElement.$type === 'bpmn:Participant' && shape.bpmnElement.processRef?.id === `M_${process.key}`,
    );
    const boxes = plane.planeElement
      .filter((shape: ModdleElement) => shape.bounds)
      .map((shape: ModdleElement) => shape.bounds);
    const left = pool ? pool.bounds.x + 50 : Math.min(80, ...boxes.map((box: ModdleElement) => box.x));
    const columns = pool ? Math.max(1, Math.floor((pool.bounds.width - 80) / 220)) : 4;
    const height = Math.ceil(io.length / columns) * 120 + 20;
    let top = Math.min(80, ...boxes.map((box: ModdleElement) => box.y)) - height;
    if (pool) {
      top = pool.bounds.y + 30;
      const threshold = pool.bounds.y;
      for (const item of plane.planeElement as ModdleElement[]) {
        if (item === pool) {
          item.bounds.height += height;
          continue;
        }
        if (item.bounds?.y >= threshold) item.bounds.y += height;
        for (const point of item.waypoint ?? []) if (point.y >= threshold) point.y += height;
        if (item.label?.bounds?.y >= threshold) item.label.bounds.y += height;
      }
    }
    for (const [index, artifact] of io.entries())
      plane.planeElement.push(
        moddle.create('bpmndi:BPMNShape', {
          bpmnElement: elements[`M_${artifact.key}`],
          bounds: moddle.create('dc:Bounds', {
            x: left + (index % columns) * 220,
            y: top + Math.floor(index / columns) * 120,
            width: 36,
            height: 50,
          }),
        }),
      );
  }
  const groups = [
    ...request.model.processes.flatMap((process) => process.artifacts ?? []),
    ...(request.model.collaboration?.artifacts ?? []),
  ].filter((artifact) => artifact.type === 'group');
  for (const group of groups) {
    const ids = new Set(group.memberRefs.map((key) => `M_${key}`));
    const views = diagrams.filter((diagram) =>
      diagram.plane.planeElement.some((element: ModdleElement) => ids.has(element.bpmnElement.id)),
    );
    if (!views.length) throw invalid('DI_MISSING', 'A Group has no diagram containing a declared visible member.');
    for (const diagram of views) {
      const members = diagram.plane.planeElement.filter((element: ModdleElement) => ids.has(element.bpmnElement.id));
      const points = members.flatMap((element: ModdleElement) =>
        element.bounds
          ? [
              { x: element.bounds.x, y: element.bounds.y },
              { x: element.bounds.x + element.bounds.width, y: element.bounds.y + element.bounds.height },
            ]
          : (element.waypoint ?? []),
      );
      const minX = Math.min(...points.map((point: ModdleElement) => point.x));
      const minY = Math.min(...points.map((point: ModdleElement) => point.y));
      const maxX = Math.max(...points.map((point: ModdleElement) => point.x));
      const maxY = Math.max(...points.map((point: ModdleElement) => point.y));
      diagram.plane.planeElement.push(
        moddle.create('bpmndi:BPMNShape', {
          bpmnElement: elements[`M_${group.key}`],
          bounds: moddle.create('dc:Bounds', {
            x: minX - 24,
            y: minY - 44,
            width: maxX - minX + 48,
            height: maxY - minY + 68,
          }),
        }),
      );
    }
  }
  for (const association of Object.values(elements).filter(
    (element) => element.$instanceOf('bpmn:DataAssociation') || element.$type === 'bpmn:Association',
  )) {
    if (
      diagrams.some((diagram) =>
        diagram.plane.planeElement.some((element: ModdleElement) => element.bpmnElement.id === association.id),
      )
    )
      continue;
    const source = Array.isArray(association.sourceRef) ? association.sourceRef[0] : association.sourceRef;
    const target = association.targetRef;
    const owner = (element: ModdleElement): ModdleElement => {
      const parent = element.$parent;
      const scope = parent?.$parent;
      if (parent?.$type === 'bpmn:InputOutputSpecification' && scope && scope.$type !== 'bpmn:Process') return scope;
      if (['bpmn:DataInput', 'bpmn:DataOutput'].includes(element.$type) && parent?.$instanceOf('bpmn:Event'))
        return parent;
      return element;
    };
    const find = (plane: ModdleElement, ref: ModdleElement) =>
      plane.planeElement.find((shape: ModdleElement) => shape.bounds && shape.bpmnElement.id === owner(ref).id);
    const diagram = diagrams.find((diagram) => find(diagram.plane, source) && find(diagram.plane, target));
    if (!diagram) throw invalid('DI_MISSING', 'A data or documentation association has no complete visible scope.');
    const from = find(diagram.plane, source).bounds;
    const to = find(diagram.plane, target).bounds;
    const a = { x: from.x + from.width, y: from.y + from.height / 2 };
    const b = { x: to.x, y: to.y + to.height / 2 };
    diagram.plane.planeElement.push(
      moddle.create('bpmndi:BPMNEdge', {
        bpmnElement: association,
        waypoint: [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b].map((point) =>
          moddle.create('dc:Point', point),
        ),
      }),
    );
  }
}

void computeLayout(workerData.xml, workerData.request).then(
  (xml) => {
    parentPort!.postMessage({ ok: true, xml });
    parentPort!.close();
  },
  (error) => {
    const failure =
      error instanceof OperationError
        ? error
        : new OperationError('DEPENDENCY_FAILURE', 'runtime', 'The local layout dependency failed.');
    parentPort!.postMessage({
      ok: false,
      error: {
        code: failure.code,
        category: failure.category,
        message: failure.message,
        exitCode: failure.exitCode,
        status: failure.status,
        findings: failure.findings,
      },
    });
    parentPort!.close();
  },
);
