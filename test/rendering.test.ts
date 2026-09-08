import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutXml } from '../dist/layout.js';
import { assessSuppliedDi, browserCapability, renderSvg } from '../dist/renderer.js';
import { compileModel } from '../dist/compiler.js';
import { validateXml } from '../dist/xml.js';
import { BpmnModdle } from 'bpmn-moddle';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="M_example" targetNamespace="urn:process-model:example">
  <bpmn:process id="M_process" name="Invoice review" isExecutable="false">
    <bpmn:startEvent id="M_start" name="Invoice received"/>
    <bpmn:task id="M_review" name="Review invoice"/>
    <bpmn:endEvent id="M_end" name="Invoice reviewed"/>
    <bpmn:sequenceFlow id="M_one" sourceRef="M_start" targetRef="M_review"/>
    <bpmn:sequenceFlow id="M_two" sourceRef="M_review" targetRef="M_end"/>
  </bpmn:process>
</bpmn:definitions>`;
const request = {
  schemaVersion: '1.0.0',
  profileVersion: '1.0.0',
  model: {
    key: 'example',
    name: 'Invoice review',
    primaryRef: 'process',
    processes: [
      {
        key: 'process',
        name: 'Invoice review',
        nodes: [
          {
            key: 'start',
            type: 'startEvent',
            containerRef: 'process',
            name: 'Invoice received',
            event: { kind: 'none' },
          },
          { key: 'review', type: 'task', containerRef: 'process', name: 'Review invoice' },
          { key: 'end', type: 'endEvent', containerRef: 'process', name: 'Invoice reviewed', event: { kind: 'none' } },
        ],
        flows: [
          { key: 'one', containerRef: 'process', sourceRef: 'start', targetRef: 'review' },
          { key: 'two', containerRef: 'process', sourceRef: 'review', targetRef: 'end' },
        ],
      },
    ],
  },
};

test('layout preserves a simple process and gives every visible element stable geometry', async () => {
  const result = await layoutXml(xml, request);
  assert.equal(result, await layoutXml(xml, request));
  assert.equal((result.match(/<bpmndi:BPMNShape\b/g) ?? []).length, 3);
  assert.equal((result.match(/<bpmndi:BPMNEdge\b/g) ?? []).length, 2);
  assert.match(result, /sourceRef="M_start" targetRef="M_review"/);
  assert.match(result, /sourceRef="M_review" targetRef="M_end"/);
  assert.match(result, /name="Review invoice"/);
  assert.match(result, /bpmnElement="M_process"/);
  assert.match(result, /id="D_/);
});

test('an explicit missing browser never falls back to an installed browser', async () => {
  const result = await browserCapability('/missing-bpmn-weave-browser');
  assert.equal(result.available, false);
  assert.equal(result.path, undefined);
  assert.ok(result.reason);
});

test('rendering returns a readable self-contained deterministic SVG of the supplied diagram', async () => {
  const laidOut = await layoutXml(xml, request);
  const first = await renderSvg(laidOut);
  assert.equal(first, await renderSvg(laidOut));
  assert.match(first, /Review invoice/);
  assert.match(first, /data-element-id="M_review"/);
  assert.match(first, /data:font\/woff2;base64,/);
  assert.match(first, /fill="white"/);
  assert.match(first, /https:\/\/bpmn.io/);
  assert.doesNotMatch(first, /<!DOCTYPE|<script\b|<foreignObject\b|onload=/i);
});

test('malformed XML is an input refusal with no source content in the diagnostic', async () => {
  await assert.rejects(
    () => renderSvg('<private-note>confidential-source'),
    (error) => {
      assert.equal(error.code, 'XML_INVALID');
      assert.equal(error.exitCode, 3);
      assert.equal(error.status, 'refused');
      assert.doesNotMatch(error.message, /confidential-source|private-note/);
      return true;
    },
  );
});

test('cancelled diagram operations refuse to launch or return an artifact', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => layoutXml(xml, request, { signal: controller.signal }), /interrupted/);
  await assert.rejects(() => renderSvg(xml, { signal: controller.signal }), /interrupted/);
});

test('supplied negative shape bounds are refused rather than repaired by rendering', async () => {
  const laidOut = await layoutXml(xml, request);
  await assert.rejects(
    () => renderSvg(laidOut.replace('width="100"', 'width="-100"')),
    (error) => {
      assert.equal(error.code, 'DI_INVALID');
      assert.equal(error.exitCode, 2);
      return true;
    },
  );
});

for (const type of ['exclusiveGateway', 'parallelGateway', 'inclusiveGateway']) {
  test(`${type} decisions and joins retain complete labelled geometry`, async () => {
    const branches = structuredClone(request);
    branches.model.processes[0].nodes.push(
      {
        key: 'split',
        type,
        name: 'Invoice valid?',
        containerRef: 'process',
        ...(type === 'parallelGateway' ? {} : { defaultFlowRef: 'alternative' }),
      },
      { key: 'archive', type: 'task', name: 'Clarify invoice', containerRef: 'process' },
      { key: 'join', type, containerRef: 'process' },
    );
    branches.model.processes[0].flows = [
      { key: 'entry', containerRef: 'process', sourceRef: 'start', targetRef: 'split' },
      {
        key: 'valid',
        containerRef: 'process',
        sourceRef: 'split',
        targetRef: 'review',
        name: 'Invoice valid',
        ...(type === 'parallelGateway' ? {} : { condition: 'Invoice valid' }),
      },
      { key: 'alternative', containerRef: 'process', sourceRef: 'split', targetRef: 'archive', name: 'Otherwise' },
      { key: 'doneA', containerRef: 'process', sourceRef: 'review', targetRef: 'join' },
      { key: 'doneB', containerRef: 'process', sourceRef: 'archive', targetRef: 'join' },
      { key: 'exit', containerRef: 'process', sourceRef: 'join', targetRef: 'end' },
    ];
    const laidOut = await layoutXml(await compileModel(branches), branches);
    assert.equal((laidOut.match(/<bpmndi:BPMNShape\b/g) ?? []).length, 6);
    assert.equal((laidOut.match(/<bpmndi:BPMNEdge\b/g) ?? []).length, 6);
    const svg = await renderSvg(laidOut);
    for (const id of ['M_split', 'M_join', 'M_valid', 'M_alternative'])
      assert.ok(svg.includes(`data-element-id="${id}"`));
    assert.match(svg, /Otherwise/);
    assert.match(svg, /Invoice valid/);
    if (type !== 'parallelGateway') {
      assert.match(laidOut, /default="M_alternative"/);
      assert.match(svg, /marker-start:/);
    }
  });
}

test('a black-box-only collaboration has truthful pool and message geometry', async () => {
  const blackBoxes = {
    schemaVersion: '1.0.0',
    profileVersion: '1.0.0',
    model: {
      key: 'handoff',
      name: 'External invoice handoff',
      primaryRef: 'parties',
      processes: [],
      collaboration: {
        key: 'parties',
        name: 'Invoice handoff',
        participants: [
          { key: 'supplier', name: 'Supplier' },
          { key: 'buyer', name: 'Buyer' },
        ],
        messageFlows: [{ key: 'invoice', name: 'Invoice', sourceRef: 'supplier', targetRef: 'buyer' }],
      },
    },
  };
  const result = await layoutXml(await compileModel(blackBoxes), blackBoxes);
  assert.equal((result.match(/<bpmndi:BPMNShape\b/g) ?? []).length, 2);
  assert.equal((result.match(/<bpmndi:BPMNEdge\b/g) ?? []).length, 1);
  assert.doesNotMatch(result, /<bpmn:process\b|processRef=/);
  const svg = await renderSvg(result);
  assert.match(svg, /data-element-id="M_invoice"/);
  assert.match(svg, /Supplier/);
  assert.match(svg, /Buyer/);
});

test('collaboration presentation ordering changes pool placement without changing process meaning', async () => {
  const collaboration = structuredClone(request);
  collaboration.model.primaryRef = 'parties';
  collaboration.model.collaboration = {
    key: 'parties',
    name: 'Invoice handoff',
    participants: [
      { key: 'supplier', name: 'Supplier', processRef: 'process' },
      { key: 'buyer', name: 'Buyer' },
    ],
    messageFlows: [{ key: 'invoice', name: 'Invoice', sourceRef: 'review', targetRef: 'buyer' }],
  };
  collaboration.presentation = { direction: 'leftToRight', participantOrder: ['buyer', 'supplier'] };
  const result = await layoutXml(await compileModel(collaboration), collaboration);
  const parsed = await new BpmnModdle().fromXML(result);
  const shapes = parsed.rootElement.diagrams[0].plane.planeElement;
  const buyer = shapes.find((shape) => shape.bpmnElement.id === 'M_buyer');
  const supplier = shapes.find((shape) => shape.bpmnElement.id === 'M_supplier');
  assert.ok(buyer.bounds.y < supplier.bounds.y);
  const svg = await renderSvg(result);
  assert.match(svg, /data-element-id="M_invoice"/);
  assert.match(svg, /data-element-id="M_review"/);
});

test('nested lanes keep their assigned activities visually contained', async () => {
  const lanes = structuredClone(request);
  lanes.model.processes[0].lanes = [
    { key: 'department', name: 'Finance', parentRef: 'process' },
    { key: 'reviewers', name: 'Invoice review', parentRef: 'department', flowNodeRefs: ['start', 'review'] },
    { key: 'completion', name: 'Recording', parentRef: 'department', flowNodeRefs: ['end'] },
  ];
  const result = await layoutXml(await compileModel(lanes), lanes);
  const parsed = await new BpmnModdle().fromXML(result);
  const shapes = parsed.rootElement.diagrams[0].plane.planeElement;
  const bounds = (id) => shapes.find((shape) => shape.bpmnElement.id === id).bounds;
  for (const [childId, parentId] of [
    ['M_review', 'M_reviewers'],
    ['M_reviewers', 'M_department'],
    ['M_end', 'M_completion'],
  ]) {
    const child = bounds(childId);
    const parent = bounds(parentId);
    assert.ok(
      child.x >= parent.x &&
        child.y >= parent.y &&
        child.x + child.width <= parent.x + parent.width &&
        child.y + child.height <= parent.y + parent.height,
    );
  }
  const svg = await renderSvg(result);
  for (const id of ['M_department', 'M_reviewers', 'M_completion']) assert.ok(svg.includes(`data-element-id="${id}"`));
});

test('two participants sharing one Process remain visible without cloned process meaning', async () => {
  const shared = structuredClone(request);
  shared.model.primaryRef = 'parties';
  shared.model.collaboration = {
    key: 'parties',
    name: 'Shared review process',
    participants: [
      { key: 'supplier', name: 'Supplier', processRef: 'process' },
      { key: 'buyer', name: 'Buyer', processRef: 'process' },
    ],
    messageFlows: [{ key: 'invoice', name: 'Invoice', sourceRef: 'supplier', targetRef: 'buyer' }],
  };
  const result = await layoutXml(await compileModel(shared), shared);
  assert.equal((result.match(/<bpmn:process\b/g) ?? []).length, 1);
  assert.equal((result.match(/processRef="M_process"/g) ?? []).length, 2);
  const parsed = await new BpmnModdle().fromXML(result);
  assert.equal(parsed.rootElement.diagrams.length, 2);
  assert.deepEqual(
    parsed.rootElement.diagrams.map((diagram) => diagram.plane.bpmnElement.id),
    ['M_parties', 'M_process'],
  );
  for (const shape of parsed.rootElement.diagrams[0].plane.planeElement.filter(
    (element) => element.$type === 'bpmndi:BPMNShape',
  ))
    assert.equal(shape.isExpanded, false);
  const svg = await renderSvg(result);
  for (const id of ['M_supplier', 'M_buyer', 'M_review', 'M_invoice'])
    assert.ok(svg.includes(`data-element-id="${id}"`));
});

test('same-file call targets are rendered as complete additional panels', async () => {
  const called = structuredClone(request);
  called.model.processes[0].nodes[1] = {
    key: 'review',
    type: 'callActivity',
    name: 'Review invoice',
    containerRef: 'process',
    calledProcessRef: 'verification',
    loop: { kind: 'multiInstance', sequential: true },
  };
  called.model.processes.push({
    key: 'verification',
    name: 'Invoice verification',
    nodes: [
      { key: 'verifyStart', type: 'startEvent', containerRef: 'verification', event: { kind: 'none' } },
      {
        key: 'verify',
        type: 'userTask',
        containerRef: 'verification',
        name: 'Verify details',
        loop: { kind: 'standard', condition: 'Correction needed', testBefore: true },
      },
      { key: 'verifyEnd', type: 'endEvent', containerRef: 'verification', event: { kind: 'none' } },
    ],
    flows: [
      { key: 'verificationEntry', containerRef: 'verification', sourceRef: 'verifyStart', targetRef: 'verify' },
      { key: 'verificationExit', containerRef: 'verification', sourceRef: 'verify', targetRef: 'verifyEnd' },
    ],
  });
  const result = await layoutXml(await compileModel(called), called);
  assert.match(result, /calledElement="tns:M_verification"/);
  assert.match(result, /<bpmn:multiInstanceLoopCharacteristics isSequential="true"/);
  assert.match(result, /<bpmn:standardLoopCharacteristics testBefore="true"/);
  const parsed = await new BpmnModdle().fromXML(result);
  assert.deepEqual(
    parsed.rootElement.diagrams.map((diagram) => diagram.plane.bpmnElement.id),
    ['M_process', 'M_verification'],
  );
  const svg = await renderSvg(result);
  for (const id of ['M_review', 'M_verify', 'M_verificationEntry', 'M_verificationExit'])
    assert.ok(svg.includes(`data-element-id="${id}"`));
  assert.equal((svg.match(/data-diagram-id=/g) ?? []).length, 2);
});

test('collapsed subprocess contents have a complete separate panel', async () => {
  const nested = structuredClone(request);
  nested.model.processes[0].nodes[1] = {
    key: 'review',
    type: 'subProcess',
    name: 'Review invoice',
    containerRef: 'process',
  };
  nested.model.processes[0].nodes.push(
    { key: 'innerStart', type: 'startEvent', containerRef: 'review', event: { kind: 'none' } },
    { key: 'innerTask', type: 'manualTask', name: 'Check supporting evidence', containerRef: 'review' },
    { key: 'innerEnd', type: 'endEvent', containerRef: 'review', event: { kind: 'none' } },
  );
  nested.model.processes[0].flows.push(
    { key: 'innerEntry', containerRef: 'review', sourceRef: 'innerStart', targetRef: 'innerTask' },
    { key: 'innerExit', containerRef: 'review', sourceRef: 'innerTask', targetRef: 'innerEnd' },
  );
  nested.presentation = { direction: 'leftToRight', subprocesses: [{ elementRef: 'review', expanded: false }] };
  const result = await layoutXml(await compileModel(nested), nested);
  const parsed = await new BpmnModdle().fromXML(result);
  assert.deepEqual(
    parsed.rootElement.diagrams.map((diagram) => diagram.plane.bpmnElement.id),
    ['M_process', 'M_review'],
  );
  assert.ok(
    !parsed.rootElement.diagrams[0].plane.planeElement.find((element) => element.bpmnElement.id === 'M_innerTask'),
  );
  const svg = await renderSvg(result);
  for (const id of ['M_review', 'M_innerTask', 'M_innerEntry', 'M_innerExit'])
    assert.ok(svg.includes(`data-element-id="${id}"`));
});

test('explicitly expanded subprocesses contain their contents on the parent panel', async () => {
  const nested = structuredClone(request);
  nested.model.processes[0].nodes[1] = {
    key: 'review',
    type: 'subProcess',
    name: 'Review invoice',
    containerRef: 'process',
  };
  nested.model.processes[0].nodes.push(
    { key: 'innerStart', type: 'startEvent', containerRef: 'review', event: { kind: 'none' } },
    { key: 'innerTask', type: 'manualTask', name: 'Check supporting evidence', containerRef: 'review' },
    { key: 'innerEnd', type: 'endEvent', containerRef: 'review', event: { kind: 'none' } },
  );
  nested.model.processes[0].flows.push(
    { key: 'innerEntry', containerRef: 'review', sourceRef: 'innerStart', targetRef: 'innerTask' },
    { key: 'innerExit', containerRef: 'review', sourceRef: 'innerTask', targetRef: 'innerEnd' },
  );
  nested.presentation = { direction: 'leftToRight', subprocesses: [{ elementRef: 'review', expanded: true }] };
  const result = await layoutXml(await compileModel(nested), nested);
  const parsed = await new BpmnModdle().fromXML(result);
  assert.equal(parsed.rootElement.diagrams.length, 1);
  const shapes = parsed.rootElement.diagrams[0].plane.planeElement;
  const outer = shapes.find((element) => element.bpmnElement.id === 'M_review');
  const inner = shapes.find((element) => element.bpmnElement.id === 'M_innerTask');
  assert.equal(outer.isExpanded, true);
  assert.ok(
    inner.bounds.x >= outer.bounds.x &&
      inner.bounds.y >= outer.bounds.y &&
      inner.bounds.x + inner.bounds.width <= outer.bounds.x + outer.bounds.width &&
      inner.bounds.y + inner.bounds.height <= outer.bounds.y + outer.bounds.height,
  );
  const svg = await renderSvg(result);
  assert.match(svg, /data-element-id="M_innerTask"/);
});

test('long panel headings enlarge the SVG canvas instead of being cropped', async () => {
  const titled = structuredClone(request);
  titled.model.processes[0].name = 'Invoice review and supporting evidence '.repeat(10).trim();
  const svg = await renderSvg(await layoutXml(await compileModel(titled), titled));
  const width = Number(svg.match(/<svg\b[^>]*\bwidth="([0-9.]+)"/)?.[1]);
  assert.ok(width > 2000, `Expected a canvas wide enough for its full heading, got ${width}`);
  assert.ok(svg.includes(titled.model.processes[0].name));
});

test('an empty called Process stays explicit without inventing process nodes', async () => {
  const empty = structuredClone(request);
  empty.model.processes[0].nodes[1] = {
    key: 'review',
    type: 'callActivity',
    name: 'Review invoice',
    containerRef: 'process',
    calledProcessRef: 'verification',
  };
  empty.model.processes.push({ key: 'verification', name: 'Invoice verification' });
  const result = await layoutXml(await compileModel(empty), empty);
  const parsed = await new BpmnModdle().fromXML(result);
  assert.equal(parsed.rootElement.diagrams.length, 2);
  assert.equal(parsed.rootElement.diagrams[1].plane.bpmnElement.id, 'M_verification');
  assert.equal((parsed.rootElement.diagrams[1].plane.planeElement ?? []).length, 0);
  assert.equal((parsed.elementsById.M_verification.flowElements ?? []).length, 0);
  assert.doesNotMatch(result, /No modeled elements/);
  const svg = await renderSvg(result);
  assert.match(svg, /Invoice verification/);
  assert.match(svg, /No modeled elements/);
});

test('a wholly empty primary Process has no normal preview', async () => {
  const empty = structuredClone(request);
  empty.model.processes[0].nodes = [];
  empty.model.processes[0].flows = [];
  const emptyXml = await compileModel(empty);
  await assert.rejects(
    () => layoutXml(emptyXml, empty),
    (error) => {
      assert.equal(error.code, 'DI_MISSING');
      assert.equal(error.status, 'refused');
      return true;
    },
  );
});

test('message events retain catching, throwing and non-interrupting boundary notation', async () => {
  const events = structuredClone(request);
  events.model.declarations = [{ key: 'message', type: 'message', name: 'Invoice update' }];
  events.model.processes[0].nodes[0].event = { kind: 'message', ref: 'message' };
  events.model.processes[0].nodes[2].event = { kind: 'message', ref: 'message' };
  events.model.processes[0].nodes.push(
    {
      key: 'caught',
      type: 'intermediateCatchEvent',
      name: 'Update received',
      containerRef: 'process',
      event: { kind: 'message', ref: 'message' },
    },
    {
      key: 'thrown',
      type: 'intermediateThrowEvent',
      name: 'Send completion',
      containerRef: 'process',
      event: { kind: 'message', ref: 'message' },
    },
    {
      key: 'boundary',
      type: 'boundaryEvent',
      name: 'Additional update',
      containerRef: 'process',
      event: { kind: 'message', ref: 'message' },
      attachedToRef: 'review',
      interrupting: false,
    },
    { key: 'handler', type: 'task', name: 'Record update', containerRef: 'process' },
  );
  events.model.processes[0].flows = [
    { key: 'received', containerRef: 'process', sourceRef: 'start', targetRef: 'caught' },
    { key: 'reviewEntry', containerRef: 'process', sourceRef: 'caught', targetRef: 'review' },
    { key: 'reviewExit', containerRef: 'process', sourceRef: 'review', targetRef: 'thrown' },
    { key: 'completed', containerRef: 'process', sourceRef: 'thrown', targetRef: 'end' },
    { key: 'updateEntry', containerRef: 'process', sourceRef: 'boundary', targetRef: 'handler' },
    { key: 'updateExit', containerRef: 'process', sourceRef: 'handler', targetRef: 'end' },
  ];
  const result = await layoutXml(await compileModel(events), events);
  assert.equal((result.match(/<bpmn:messageEventDefinition\b/g) ?? []).length, 5);
  assert.match(result, /cancelActivity="false"/);
  const parsed = await new BpmnModdle().fromXML(result);
  const shapes = parsed.rootElement.diagrams[0].plane.planeElement;
  const host = shapes.find((element) => element.bpmnElement.id === 'M_review').bounds;
  const boundary = shapes.find((element) => element.bpmnElement.id === 'M_boundary').bounds;
  const x = boundary.x + boundary.width / 2;
  const y = boundary.y + boundary.height / 2;
  assert.ok(
    ((x === host.x || x === host.x + host.width) && y >= host.y && y <= host.y + host.height) ||
      ((y === host.y || y === host.y + host.height) && x >= host.x && x <= host.x + host.width),
  );
  const svg = await renderSvg(result);
  for (const id of ['M_start', 'M_caught', 'M_thrown', 'M_boundary', 'M_end', 'M_updateEntry'])
    assert.ok(svg.includes(`data-element-id="${id}"`));
  assert.match(svg, /stroke-dasharray/);
});

test('Process-level Data Input and Output receive native visible DI and labels', async () => {
  const data = structuredClone(request);
  data.model.processes[0].artifacts = [
    { key: 'input', type: 'dataInput', ownerRef: 'process', name: 'Invoice details' },
    { key: 'output', type: 'dataOutput', ownerRef: 'process', name: 'Reviewed invoice' },
  ];
  const dataXml = xml.replace(
    '    <bpmn:startEvent',
    `<bpmn:ioSpecification id="G_io_process"><bpmn:dataInput id="M_input" name="Invoice details"/><bpmn:dataOutput id="M_output" name="Reviewed invoice"/><bpmn:inputSet id="G_inputs_process"><bpmn:dataInputRefs>M_input</bpmn:dataInputRefs></bpmn:inputSet><bpmn:outputSet id="G_outputs_process"><bpmn:dataOutputRefs>M_output</bpmn:dataOutputRefs></bpmn:outputSet></bpmn:ioSpecification>\n    <bpmn:startEvent`,
  );
  const result = await layoutXml(dataXml, data);
  assert.equal((await validateXml(result)).schemaValid, true);
  assert.equal((result.match(/<bpmndi:BPMNShape\b/g) ?? []).length, 5);
  assert.match(result, /<bpmn:dataInput id="M_input"/);
  assert.match(result, /<bpmn:dataOutput id="M_output"/);
  assert.doesNotMatch(result, /dataObjectReference|G_layout_/);
  const svg = await renderSvg(result);
  for (const id of ['M_input', 'M_output']) assert.ok(svg.includes(`data-element-id="${id}"`));
  const text = svg
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ');
  assert.match(text, /Invoice details/);
  assert.match(text, /Reviewed invoice/);
});

test('Activity IO stays complete in XML while data associations dock on its visible owner', async () => {
  const data = structuredClone(request);
  data.model.processes[0].artifacts = [
    { key: 'input', type: 'dataInput', ownerRef: 'review', name: 'Invoice input' },
    { key: 'output', type: 'dataOutput', ownerRef: 'review', name: 'Invoice output' },
    { key: 'invoiceData', type: 'dataObject', containerRef: 'process' },
    { key: 'resultData', type: 'dataObject', containerRef: 'process' },
    {
      key: 'invoiceRef',
      type: 'dataObjectReference',
      containerRef: 'process',
      dataObjectRef: 'invoiceData',
      name: 'Invoice',
    },
    {
      key: 'resultRef',
      type: 'dataObjectReference',
      containerRef: 'process',
      dataObjectRef: 'resultData',
      name: 'Review result',
    },
  ];
  data.model.processes[0].dataAssociations = [
    { key: 'readInvoice', direction: 'input', ownerRef: 'review', sourceRefs: ['invoiceRef'], targetRef: 'input' },
    { key: 'writeResult', direction: 'output', ownerRef: 'review', sourceRefs: ['output'], targetRef: 'resultRef' },
  ];
  const dataXml = xml.replace(
    '<bpmn:task id="M_review" name="Review invoice"/>',
    `<bpmn:task id="M_review" name="Review invoice"><bpmn:ioSpecification id="G_io_review"><bpmn:dataInput id="M_input" name="Invoice input"/><bpmn:dataOutput id="M_output" name="Invoice output"/><bpmn:inputSet id="G_inputs_review"><bpmn:dataInputRefs>M_input</bpmn:dataInputRefs></bpmn:inputSet><bpmn:outputSet id="G_outputs_review"><bpmn:dataOutputRefs>M_output</bpmn:dataOutputRefs></bpmn:outputSet></bpmn:ioSpecification><bpmn:dataInputAssociation id="M_readInvoice"><bpmn:sourceRef>M_invoiceRef</bpmn:sourceRef><bpmn:targetRef>M_input</bpmn:targetRef></bpmn:dataInputAssociation><bpmn:dataOutputAssociation id="M_writeResult"><bpmn:sourceRef>M_output</bpmn:sourceRef><bpmn:targetRef>M_resultRef</bpmn:targetRef></bpmn:dataOutputAssociation></bpmn:task><bpmn:dataObject id="M_invoiceData"/><bpmn:dataObject id="M_resultData"/><bpmn:dataObjectReference id="M_invoiceRef" name="Invoice" dataObjectRef="M_invoiceData"/><bpmn:dataObjectReference id="M_resultRef" name="Review result" dataObjectRef="M_resultData"/>`,
  );
  const result = await layoutXml(dataXml, data);
  assert.equal((await validateXml(result)).schemaValid, true);
  const parsed = await new BpmnModdle().fromXML(result);
  assert.equal(parsed.elementsById.M_readInvoice.targetRef.id, 'M_input');
  assert.equal(parsed.elementsById.M_writeResult.sourceRef[0].id, 'M_output');
  const di = parsed.rootElement.diagrams[0].plane.planeElement;
  assert.ok(!di.some((element) => ['M_input', 'M_output'].includes(element.bpmnElement.id)));
  const owner = di.find((element) => element.bpmnElement.id === 'M_review').bounds;
  const onBoundary = (point) =>
    ((point.x === owner.x || point.x === owner.x + owner.width) &&
      point.y >= owner.y &&
      point.y <= owner.y + owner.height) ||
    ((point.y === owner.y || point.y === owner.y + owner.height) &&
      point.x >= owner.x &&
      point.x <= owner.x + owner.width);
  assert.ok(onBoundary(di.find((element) => element.bpmnElement.id === 'M_readInvoice').waypoint.at(-1)));
  assert.ok(onBoundary(di.find((element) => element.bpmnElement.id === 'M_writeResult').waypoint[0]));
  const svg = await renderSvg(result);
  for (const id of ['M_invoiceRef', 'M_resultRef', 'M_readInvoice', 'M_writeResult'])
    assert.ok(svg.includes(`data-element-id="${id}"`));
  for (const id of ['M_input', 'M_output']) assert.ok(!svg.includes(`data-element-id="${id}"`));
});

test('timer forms, conditional waits and signal throws retain native event geometry', async () => {
  const events = structuredClone(request);
  events.model.declarations = [{ key: 'signal', type: 'signal', name: 'Review completed' }];
  events.model.processes[0].nodes[0].event = { kind: 'timer', timeDate: '2026-09-09T08:00:00Z' };
  events.model.processes[0].nodes.push(
    {
      key: 'condition',
      type: 'intermediateCatchEvent',
      name: 'Evidence available',
      containerRef: 'process',
      event: { kind: 'conditional', condition: 'Supporting evidence is available' },
    },
    {
      key: 'broadcast',
      type: 'intermediateThrowEvent',
      name: 'Broadcast completion',
      containerRef: 'process',
      event: { kind: 'signal', ref: 'signal' },
    },
    {
      key: 'timeout',
      type: 'boundaryEvent',
      name: 'Review time elapsed',
      containerRef: 'process',
      event: { kind: 'timer', timeDuration: 'PT2H' },
      attachedToRef: 'review',
      interrupting: true,
    },
    {
      key: 'reminder',
      type: 'boundaryEvent',
      name: 'Daily reminder',
      containerRef: 'process',
      event: { kind: 'timer', timeCycle: 'R/P1D' },
      attachedToRef: 'review',
      interrupting: false,
    },
    { key: 'handler', type: 'task', name: 'Contact reviewer', containerRef: 'process' },
  );
  events.model.processes[0].flows = [
    { key: 'wait', containerRef: 'process', sourceRef: 'start', targetRef: 'condition' },
    { key: 'reviewEntry', containerRef: 'process', sourceRef: 'condition', targetRef: 'review' },
    { key: 'reviewExit', containerRef: 'process', sourceRef: 'review', targetRef: 'broadcast' },
    { key: 'complete', containerRef: 'process', sourceRef: 'broadcast', targetRef: 'end' },
    { key: 'timeoutPath', containerRef: 'process', sourceRef: 'timeout', targetRef: 'handler' },
    { key: 'reminderPath', containerRef: 'process', sourceRef: 'reminder', targetRef: 'handler' },
    { key: 'handled', containerRef: 'process', sourceRef: 'handler', targetRef: 'end' },
  ];
  const result = await layoutXml(await compileModel(events), events);
  assert.equal((await validateXml(result)).schemaValid, true);
  for (const content of ['2026-09-09T08:00:00Z', 'PT2H', 'R/P1D', 'Supporting evidence is available'])
    assert.ok(result.includes(content));
  const svg = await renderSvg(result);
  for (const id of [
    'M_start',
    'M_condition',
    'M_broadcast',
    'M_timeout',
    'M_reminder',
    'M_timeoutPath',
    'M_reminderPath',
  ])
    assert.ok(svg.includes(`data-element-id="${id}"`));
});

test('read-only DI assessment returns geometry failures without requiring a browser', async () => {
  const parsed = await new BpmnModdle().fromXML(await layoutXml(xml, request));
  const di = parsed.rootElement.diagrams[0].plane.planeElement;
  di.find((element) => element.bpmnElement.id === 'M_review').bounds.width = -1;
  di.find((element) => element.bpmnElement.id === 'M_one').waypoint = [];
  const before = JSON.stringify(di.map((element) => element.id));
  const findings = assessSuppliedDi(parsed.rootElement, parsed.elementsById);
  assert.equal(findings.filter((finding) => finding.code === 'DI_INVALID').length, 2);
  assert.equal(JSON.stringify(di.map((element) => element.id)), before);
});

test('one semantic Group has faithful views across collapsed subprocess panels', async () => {
  const nested = structuredClone(request);
  nested.model.declarations = [{ key: 'category', type: 'category', value: 'Evidence review' }];
  nested.model.processes[0].nodes[1] = {
    key: 'review',
    type: 'subProcess',
    name: 'Review invoice',
    containerRef: 'process',
  };
  nested.model.processes[0].nodes.push({
    key: 'innerTask',
    type: 'task',
    name: 'Inspect evidence',
    containerRef: 'review',
  });
  nested.model.processes[0].artifacts = [
    {
      key: 'group',
      type: 'group',
      containerRef: 'process',
      categoryRef: 'category',
      memberRefs: ['review', 'innerTask'],
    },
  ];
  const laidOut = await layoutXml(await compileModel(nested), nested);
  assert.equal((await validateXml(laidOut)).schemaValid, true);
  const parsed = await new BpmnModdle().fromXML(laidOut);
  assert.equal(Object.values(parsed.elementsById).filter((element) => element.$type === 'bpmn:Group').length, 1);
  assert.equal(
    parsed.rootElement.diagrams.filter((diagram) =>
      diagram.plane.planeElement.some((element) => element.bpmnElement.id === 'M_group'),
    ).length,
    2,
  );
  const svg = await renderSvg(laidOut);
  assert.equal((svg.match(/data-element-id="M_group"/g) ?? []).length, 2);
  assert.equal((svg.match(/Evidence review/g) ?? []).length, 2);
});

test('Data State label is complete and native Process IO geometry is nonnegative', async () => {
  const data = structuredClone(request);
  data.model.processes[0].artifacts = [
    { key: 'object', type: 'dataObject', containerRef: 'process' },
    {
      key: 'record',
      type: 'dataObjectReference',
      containerRef: 'process',
      dataObjectRef: 'object',
      name: 'Invoice',
      state: 'received',
    },
    { key: 'input', type: 'dataInput', ownerRef: 'process', name: 'Source' },
  ];
  const laidOut = await layoutXml(await compileModel(data), data);
  const parsed = await new BpmnModdle().fromXML(laidOut);
  const di = parsed.rootElement.diagrams[0].plane.planeElement;
  assert.ok(di.every((element) => !element.bounds || (element.bounds.x >= 0 && element.bounds.y >= 0)));
  assert.match(await renderSvg(laidOut), /\[received\]/);
  di.find((element) => element.bpmnElement.id === 'M_review').bounds.x = -1;
  assert.ok(assessSuppliedDi(parsed.rootElement, parsed.elementsById).some((finding) => finding.code === 'DI_INVALID'));
});

test('mid-render cancellation terminates its launched browser and removes the private profile', {
  skip: process.platform === 'win32',
  timeout: 15_000,
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bpmn-weave-abort-test-'));
  const laidOut = await layoutXml(xml, request);
  const diagram = laidOut.match(/<bpmndi:BPMNDiagram\b[\s\S]*?<\/bpmndi:BPMNDiagram>/)[0];
  const many = laidOut.replace(
    diagram,
    Array.from({ length: 40 }, (_, index) =>
      diagram.replace(/id="(D_[^"]+)"/g, (_match, id) => `id="${id}_${index}"`),
    ).join('\n'),
  );
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { renderSvg } from ${JSON.stringify(new URL('../dist/renderer.js', import.meta.url).href)};
    const controller = new AbortController();
    process.on('message', async message => {
      if (message === 'abort') { controller.abort(); return; }
      try { await renderSvg(message.xml, { signal: controller.signal }); process.send({ completed: true }); }
      catch (error) { process.send({ code: error.code }); }
      process.disconnect();
    });
  `,
    ],
    { env: { ...process.env, TMPDIR: directory }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] },
  );
  const outcome = new Promise((resolve) => child.once('message', resolve));
  const exited = new Promise((resolve) => child.once('exit', resolve));
  let browserPid;
  try {
    child.send({ xml: many });
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline && !browserPid) {
      const profiles = (await readdir(directory)).filter((name) => name.startsWith('bpmn-weave-render-'));
      if (profiles.length) {
        const result = await promisify(execFile)('ps', ['-axo', 'pid=,args=']);
        const row = result.stdout
          .split('\n')
          .find(
            (line) => line.includes(`--user-data-dir=${join(directory, profiles[0])}`) && !line.includes('--type='),
          );
        if (row) browserPid = Number(row.trim().split(/\s+/)[0]);
      }
      if (!browserPid) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(browserPid, 'The owned browser must have actually launched before cancellation.');
    child.send('abort');
    assert.deepEqual(await outcome, { code: 'DEPENDENCY_FAILURE' });
    assert.equal(await exited, 0);
    assert.throws(
      () => process.kill(browserPid, 0),
      (error) => error.code === 'ESRCH',
    );
    assert.deepEqual(await readdir(directory), []);
  } finally {
    if (child.exitCode === null) child.kill('SIGKILL');
    await rm(directory, { recursive: true, force: true });
  }
});
