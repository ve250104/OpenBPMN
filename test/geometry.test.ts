import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { BpmnModdle } from 'bpmn-moddle';
import { compileModel, semanticProjection } from '../dist/compiler.js';
import { layoutXml } from '../dist/layout.js';
import { diagramConflicts } from '../dist/geometry.js';
import { renderSvg } from '../dist/renderer.js';

test('purchase-approval routing has no intersecting labels or ambiguous shared segments', async () => {
  const request = JSON.parse(await readFile(new URL('../examples/purchase-approval.json', import.meta.url), 'utf8'));
  const compiled = await compileModel(request);
  const xml = await layoutXml(compiled, request);
  const parsed = await new BpmnModdle().fromXML(xml);
  assert.deepEqual(
    parsed.rootElement.diagrams.flatMap((diagram) => diagramConflicts(diagram.plane)),
    [],
  );
  assert.deepEqual(await semanticProjection(xml), await semanticProjection(compiled));
  assert.equal(xml, await layoutXml(compiled, request));
  const elements = parsed.rootElement.diagrams[0].plane.planeElement;
  for (const key of ['submitted', 'sent']) {
    const shape = elements.find((element) => element.bpmnElement.id === `M_${key}`);
    const lane = elements.find(
      (element) =>
        element.bpmnElement.$type === 'bpmn:Lane' &&
        element.bpmnElement.flowNodeRef.some((node) => node.id === `M_${key}`),
    );
    assert.ok(shape.label.bounds.x >= lane.bounds.x + 30, 'Label must clear the lane header.');
    assert.ok(
      shape.label.bounds.x + shape.label.bounds.width <= lane.bounds.x + lane.bounds.width - 8,
      'Label must clear the pool boundary.',
    );
  }
});

test('readability assessment detects rather than hides shared connector segments and label collisions', () => {
  const plane = {
    planeElement: [
      {
        $type: 'bpmndi:BPMNEdge',
        bpmnElement: { id: 'one' },
        waypoint: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      },
      {
        $type: 'bpmndi:BPMNEdge',
        bpmnElement: { id: 'two' },
        waypoint: [
          { x: 50, y: 0 },
          { x: 150, y: 0 },
        ],
        label: { bounds: { x: 60, y: -10, width: 40, height: 20 } },
      },
    ],
  };
  const conflicts = diagramConflicts(plane);
  assert.ok(conflicts.some((conflict) => conflict.kind === 'shared-segment'));
  assert.ok(conflicts.some((conflict) => conflict.kind === 'label-connector'));
});

test('long task wording receives real internal space without clipping or changing meaning', async () => {
  const request = JSON.parse(await readFile(new URL('../examples/invoice-review.json', import.meta.url), 'utf8'));
  const task = request.model.processes[0].nodes.find((node) => node.type === 'task');
  task.name = 'Review supporting evidence and verify the documented process requirements '.repeat(6);
  const compiled = await compileModel(request);
  const xml = await layoutXml(compiled, request);
  const parsed = await new BpmnModdle().fromXML(xml);
  const shape = parsed.rootElement.diagrams[0].plane.planeElement.find(
    (element) => element.bpmnElement.id === `M_${task.key}`,
  );
  assert.ok(shape.bounds.width >= 200 && shape.bounds.height >= 160);
  assert.deepEqual(await semanticProjection(xml), await semanticProjection(compiled));
  assert.deepEqual(diagramConflicts(parsed.rootElement.diagrams[0].plane), []);
});

for (const originalOrder of [true, false])
  test(`onboarding with three participants and two rework loops remains complete (original order: ${originalOrder})`, async () => {
    const request = JSON.parse(await readFile(new URL('./fixtures/customer-onboarding.json', import.meta.url), 'utf8'));
    if (originalOrder)
      request.presentation.participantOrder = ['customerParticipant', 'companyParticipant', 'verificationProvider'];
    const compiled = await compileModel(request);
    const xml = await layoutXml(compiled, request);
    const parsed = await new BpmnModdle().fromXML(xml);
    assert.deepEqual(
      parsed.rootElement.diagrams.flatMap((diagram) => diagramConflicts(diagram.plane)),
      [],
    );
    assert.deepEqual(await semanticProjection(xml), await semanticProjection(compiled));
    const svg = await renderSvg(xml);
    assert.match(svg, /Approved or rejected/);
    assert.equal((svg.match(/Setup details request/g) ?? []).length, 1);
  });
