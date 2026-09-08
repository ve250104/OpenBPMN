import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { assessCompatibility } from '../dist/compatibility.js';
import { parseInput } from '../dist/input.js';
import { compileModel, semanticProjection } from '../dist/compiler.js';
import { layoutXml } from '../dist/layout.js';

const simple = (type = 'task') =>
  `<b:definitions xmlns:b="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:d="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:c="http://www.omg.org/spec/DD/20100524/DC" id="model" targetNamespace="urn:example"><b:process id="process" isExecutable="false"><b:${type} id="task" name="Review request"/></b:process><d:BPMNDiagram id="diagram"><d:BPMNPlane id="plane" bpmnElement="process"><d:BPMNShape id="shape" bpmnElement="task"><c:Bounds x="100" y="100" width="100" height="80"/></d:BPMNShape></d:BPMNPlane></d:BPMNDiagram></b:definitions>`;

test('named compatibility assessment respects cancellation before and during its local prerequisite validation', async () => {
  const before = new AbortController();
  before.abort();
  await assert.rejects(assessCompatibility(simple(), 'celonis-analysis-conformance', { signal: before.signal }));
  const during = new AbortController();
  const pending = assessCompatibility(simple(), 'sap-signavio-process-manager', { signal: during.signal });
  during.abort();
  await assert.rejects(pending, (error) => error.code === 'DEPENDENCY_FAILURE');
});

test('local rich-product fit never claims a tenant import or round trip occurred', async () => {
  for (const profile of ['sap-signavio-process-manager', 'celonis-process-management']) {
    const result = await assessCompatibility(simple('userTask'), profile);
    assert.equal(result.fit, 'passed');
    assert.equal(result.verification, 'unverified');
    assert.equal(result.ruleVersion, '1.0.0');
    assert.deepEqual(result.tenantChecks, { import: 'not_run', roundTrip: 'not_run' });
    assert.ok(result.findings.every((finding) => finding.blocksClean === false));
    assert.ok(result.findings.some((finding) => finding.code === 'COMPATIBILITY_UNVERIFIED'));
  }
});

test('Celonis Analysis uses its narrow generic-activity envelope without shrinking Consulting Core or the other Celonis profile', async () => {
  assert.equal((await assessCompatibility(simple(), 'celonis-analysis-conformance')).fit, 'passed');
  const analysis = await assessCompatibility(simple('userTask'), 'celonis-analysis-conformance');
  assert.equal(analysis.fit, 'failed');
  assert.ok(
    analysis.findings.some(
      (finding) => finding.code === 'COMPATIBILITY_LIMITATION' && finding.elementRefs.includes('task'),
    ),
  );
  assert.ok(analysis.findings.every((finding) => finding.blocksClean === false));
  assert.equal((await assessCompatibility(simple('userTask'), 'celonis-process-management')).fit, 'passed');
});

test('Analysis activity matching needs supplied names and reports that event-data dictionary alignment was not verified', async () => {
  const unnamed = await assessCompatibility(
    simple().replace(' name="Review request"', ''),
    'celonis-analysis-conformance',
  );
  assert.equal(unnamed.fit, 'failed');
  assert.ok(unnamed.findings.some((finding) => finding.code === 'COMPATIBILITY_ACTIVITY_NAME'));
  const named = await assessCompatibility(simple(), 'celonis-analysis-conformance');
  assert.equal(named.fit, 'passed');
  assert.ok(
    named.findings.some(
      (finding) => finding.code === 'COMPATIBILITY_UNVERIFIED' && finding.message.includes('dictionary'),
    ),
  );
});

test('Analysis qualification is one Process and unavailable structural prerequisites never become a passed target check', async () => {
  const multi = simple().replace('<d:BPMNDiagram', '<b:process id="other"/><d:BPMNDiagram');
  const result = await assessCompatibility(multi, 'celonis-analysis-conformance');
  assert.equal(result.fit, 'failed');
  assert.ok(result.findings.some((finding) => finding.code === 'COMPATIBILITY_LIMITATION'));
  const malformed = await assessCompatibility('<not-xml', 'sap-signavio-process-manager');
  assert.equal(malformed.fit, 'not_run');
  assert.ok(malformed.reason);
});

test('the four synthetic Analysis qualification patterns generate the reviewed control-flow and pass only local fit', async () => {
  const base = new URL('../eval/compatibility/analysis/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', base), 'utf8'));
  for (const fixture of manifest.fixtures) {
    const { request } = parseInput(readFileSync(new URL(fixture.input, base), 'utf8'));
    assert.ok(request);
    const xml = await layoutXml(await compileModel(request), request);
    const result = await assessCompatibility(xml, 'celonis-analysis-conformance');
    assert.equal(result.fit, 'passed', fixture.id);
    assert.equal(result.verification, 'unverified');
    const semantic = await semanticProjection(xml);
    const process = semantic.rootElements.find((element) => element.$type === 'bpmn:Process');
    assert.deepEqual(
      process.flowElements
        .filter((element) => element.$type === 'bpmn:Task')
        .map((element) => element.name)
        .sort(),
      fixture.expectedActivityNames.slice().sort(),
    );
    assert.deepEqual(
      process.flowElements
        .filter((element) => element.$type === 'bpmn:SequenceFlow')
        .map((element) => [element.sourceRef, element.targetRef])
        .sort(),
      fixture.expectedEdges.map(([from, to]) => [`M_${from}`, `M_${to}`]).sort(),
    );
  }
});
