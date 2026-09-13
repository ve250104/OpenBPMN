import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

async function validate(t, xml, expected) {
  const directory = await mkdtemp(join(tmpdir(), 'bpmn-weave-di-safety-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, 'process.bpmn');
  await writeFile(input, xml);
  const result = spawnSync(process.execPath, [cli, 'validate', '--input', input], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, expected, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(await readFile(input, 'utf8'), xml, 'Read-only assessment must preserve the supplied XML.');
  assert.deepEqual(await readdir(directory), ['process.bpmn']);
  return JSON.parse(result.stdout);
}

test('diagram coverage cannot be borrowed from an unrelated process plane', async (t) => {
  const original = await readFile(new URL('../examples/purchase-approval.bpmn', import.meta.url), 'utf8');
  const xml = original
    .replace(/<bpmndi:BPMNDiagram/, '<bpmn:process id="OtherProcess" isExecutable="false"/><bpmndi:BPMNDiagram')
    .replace(/(<bpmndi:BPMNPlane[^>]*bpmnElement=")[^"]+/, '$1OtherProcess');
  const result = await validate(t, xml, 2);
  assert.equal(result.report.checks.find((check) => check.id === 'xsd').status, 'passed');
  assert.equal(result.report.checks.find((check) => check.id === 'di').status, 'failed');
  assert.equal(result.report.export.cleanEligible, false);
  assert.ok(result.report.findings.some((finding) => finding.code === 'DI_INVALID'));
});

test('each declared view has its own complete visible coverage', async (t) => {
  const original = await readFile(new URL('../examples/purchase-approval.bpmn', import.meta.url), 'utf8');
  const diagram = original.match(/<bpmndi:BPMNDiagram\b[\s\S]*?<\/bpmndi:BPMNDiagram>/)[0];
  const other = diagram.replace(/id="([^"]+)"/g, 'id="$1_other"');
  const complete = original.replace(diagram, diagram + other);
  await validate(t, complete, 0);
  const incomplete = complete.replace(/<bpmndi:BPMNShape\b[^>]*bpmnElement="M_check"[\s\S]*?<\/bpmndi:BPMNShape>/, '');
  const result = await validate(t, incomplete, 2);
  assert.ok(
    result.report.findings.some((finding) => finding.code === 'DI_MISSING' && finding.elementRefs.includes('M_check')),
  );
  assert.equal(result.report.export.cleanEligible, false);
});

test('edge DI endpoint references cannot point into another diagram view', async (t) => {
  const original = await readFile(new URL('../examples/purchase-approval.bpmn', import.meta.url), 'utf8');
  const first = original.match(/<bpmndi:BPMNDiagram\b[\s\S]*?<\/bpmndi:BPMNDiagram>/)[0];
  const other = first.replace(/id="([^"]+)"/g, 'id="$1_other"');
  const fromOther = first.match(/<bpmndi:BPMNShape id="([^"]+)"[^>]*bpmnElement="M_submitted"/)[1] + '_other';
  const wrong = first.replace('<bpmndi:BPMNEdge ', `<bpmndi:BPMNEdge sourceElement="${fromOther}" `);
  const result = await validate(t, original.replace(first, wrong + other), 2);
  assert.equal(result.report.checks.find((check) => check.id === 'xsd').status, 'passed');
  assert.ok(result.report.findings.some((finding) => finding.code === 'DI_INVALID'));
});

test('supplied node geometry stays inside its declared lane', async (t) => {
  const original = await readFile(new URL('../examples/purchase-approval.bpmn', import.meta.url), 'utf8');
  const xml = original.replace(
    /(<bpmndi:BPMNShape\b[^>]*bpmnElement="M_check"[^>]*>\s*<dc:Bounds[^>]*y=")[^"]+/,
    '$110000',
  );
  assert.notEqual(xml, original);
  const result = await validate(t, xml, 2);
  assert.equal(result.report.checks.find((check) => check.id === 'xsd').status, 'passed');
  assert.ok(
    result.report.findings.some((finding) => finding.code === 'DI_INVALID' && finding.elementRefs.includes('M_check')),
  );
});

const document = (semantics, diagrams) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" targetNamespace="urn:di-safety">
  ${semantics}${diagrams}
</bpmn:definitions>`;
const shape = (id, semantic, x, y, width = 100, height = 80, attributes = '') =>
  `<bpmndi:BPMNShape id="${id}" bpmnElement="${semantic}" ${attributes}>
    <dc:Bounds x="${x}" y="${y}" width="${width}" height="${height}"/>
  </bpmndi:BPMNShape>`;
const diagram = (id, subject, content) =>
  `<bpmndi:BPMNDiagram id="${id}"><bpmndi:BPMNPlane id="${id}_plane" bpmnElement="${subject}">
    ${content}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`;

test('a collaboration assigns task geometry to its own participant pool', async (t) => {
  const semantics = `<bpmn:process id="Process_A" isExecutable="false"><bpmn:task id="Task_A" name="Review order"/></bpmn:process>
    <bpmn:process id="Process_B" isExecutable="false"><bpmn:task id="Task_B" name="Check stock"/></bpmn:process>
    <bpmn:collaboration id="Parties"><bpmn:participant id="Pool_A" processRef="Process_A"/>
      <bpmn:participant id="Pool_B" processRef="Process_B"/></bpmn:collaboration>`;
  const pools = shape('Pool_A_di', 'Pool_A', 100, 100, 300, 200) + shape('Pool_B_di', 'Pool_B', 100, 400, 300, 200);
  const correct = document(
    semantics,
    diagram(
      'Parties_di',
      'Parties',
      pools + shape('Task_A_di', 'Task_A', 150, 150) + shape('Task_B_di', 'Task_B', 150, 450),
    ),
  );
  await validate(t, correct, 0);
  const wrongPool = correct.replace('x="150" y="150"', 'x="150" y="450"');
  const result = await validate(t, wrongPool, 2);
  assert.ok(
    result.report.findings.some((finding) => finding.code === 'DI_INVALID' && finding.elementRefs.includes('Task_A')),
  );
});

test('collapsed subprocess contents belong in their own panel, not behind the collapsed parent', async (t) => {
  const semantics = `<bpmn:process id="Process" isExecutable="false"><bpmn:subProcess id="Subprocess" name="Review order">
    <bpmn:task id="Child" name="Check request"/></bpmn:subProcess></bpmn:process>`;
  const parent = shape('Subprocess_di', 'Subprocess', 100, 100, 100, 80, 'isExpanded="false"');
  const child = shape('Child_di', 'Child', 100, 100);
  const correct = document(semantics, diagram('Overview', 'Process', parent) + diagram('Detail', 'Subprocess', child));
  await validate(t, correct, 0);
  const hidden = document(
    semantics,
    diagram('Overview', 'Process', parent + child) + diagram('Detail', 'Subprocess', ''),
  );
  const result = await validate(t, hidden, 2);
  assert.ok(
    result.report.findings.some((finding) => finding.code === 'DI_INVALID' && finding.elementRefs.includes('Child')),
  );
  assert.ok(
    result.report.findings.some((finding) => finding.code === 'DI_MISSING' && finding.elementRefs.includes('Child')),
  );
});
