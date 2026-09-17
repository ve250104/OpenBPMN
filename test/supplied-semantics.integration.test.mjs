import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { xmlForBpmnConsumer } from '../dist/xml-consumer.js';

const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const purchase = await readFile(new URL('../examples/purchase-approval.bpmn', import.meta.url), 'utf8');
function command(args, expected = 0) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, expected, result.stdout + result.stderr);
  assert.equal(result.stderr, '');
  return JSON.parse(result.stdout);
}
async function workspace(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'openbpmn-supplied-semantics-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('all XML Schema true spellings retain executable and compensation profile limitations', async (t) => {
  const directory = await workspace(t);
  for (const value of ['true', '1', ' true ', '&#x9;1&#xA;', 'tr&#117;e']) {
    for (const xml of [
      purchase.replace('isExecutable="false"', `isExecutable="${value}"`),
      purchase.replace('<bpmn:userTask ', `<bpmn:userTask isForCompensation="${value}" `),
    ]) {
      const input = join(directory, 'supplied.bpmn');
      await writeFile(input, xml);
      const result = command(['validate', '--input', input], 2);
      assert.equal(result.report.export.cleanEligible, false);
      assert.equal(result.report.checks.find((check) => check.id === 'xsd').status, 'passed');
      assert.equal(result.report.checks.find((check) => check.id === 'profile').status, 'failed');
      assert.ok(result.report.findings.some((finding) => finding.code === 'PROFILE_DEFERRED'));
      assert.equal(await readFile(input, 'utf8'), xml);
    }
  }
});

const taskDocument = (loop) =>
  `<?xml version="1.0"?>\r\n<b:definitions xmlns:b="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:d="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:c="http://www.omg.org/spec/DD/20100524/DC" id="model" targetNamespace="urn:test"><b:process id="process" isExecutable="false"><b:task id="task" name="Review request">${loop}</b:task></b:process><d:BPMNDiagram id="diagram"><d:BPMNPlane id="plane" bpmnElement="process"><d:BPMNShape id="shape" bpmnElement="task"><c:Bounds x="100" y="100" width="100" height="80"/></d:BPMNShape></d:BPMNPlane></d:BPMNDiagram></b:definitions>`;

test('numeric and escaped XML booleans render the same sequential marker without rewriting the supplied XML', async (t) => {
  const directory = await workspace(t);
  const input = join(directory, 'supplied.bpmn');
  const output = join(directory, 'supplied.svg');
  const canonical = taskDocument(
    '<b:documentation><![CDATA[<b:multiInstanceLoopCharacteristics isSequential="1"/>]]></b:documentation>\r\n' +
      '<!-- <b:multiInstanceLoopCharacteristics isSequential="1"/> -->\r\n' +
      '<b:multiInstanceLoopCharacteristics isSequential="true"/>',
  );
  await writeFile(input, canonical);
  command(['render', '--input', input, '--output', output]);
  const sequential = await readFile(output, 'utf8');
  assert.match(sequential, /data-marker="sequential"/);
  for (const value of ['1', ' true ', '&#x9;tr&#117;e&#xD;']) {
    const xml = canonical.replace('isSequential="true"', `isSequential="${value}"`);
    await writeFile(input, xml);
    const validation = command(['validate', '--input', input]);
    assert.equal(validation.report.export.cleanEligible, true);
    command(['render', '--input', input, '--output', output, '--replace']);
    const actual = await readFile(output, 'utf8');
    assert.match(actual, /data-marker="sequential"/);
    assert.ok(
      actual === sequential,
      'equivalent sequential values produce identical SVG bytes in the same environment',
    );
    assert.equal(await readFile(input, 'utf8'), xml);
  }
  await writeFile(input, canonical.replace('isSequential="true"', 'isSequential="0"'));
  command(['render', '--input', input, '--output', output, '--replace']);
  const parallel = await readFile(output, 'utf8');
  assert.match(parallel, /data-marker="parallel"/);
  assert.doesNotMatch(parallel, /data-marker="sequential"/);
  assert.notEqual(parallel, sequential, 'parallel and sequential multi-instance are distinct');
});

test('the dependency lexical adapter changes only typed standard booleans across namespace aliases and XML line endings', () => {
  for (const prefix of ['b', 'process', '']) {
    const tag = prefix ? `${prefix}:` : '';
    for (const newline of ['\n', '\r\n', '\r']) {
      const fixture = (executable, sequential, expanded) =>
        [
          '<?xml version="1.0"?>',
          `<${tag}definitions xmlns${prefix ? `:${prefix}` : ''}="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:d="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:foreign="urn:foreign" targetNamespace="urn:test">`,
          `<!-- <${tag}process isExecutable='0'/> -->`,
          `  <${tag}process id="process" isExecutable='${executable}' name='isSequential="1"'>`,
          `    <${tag}documentation><![CDATA[<${tag}task isForCompensation="1"/>]]></${tag}documentation>`,
          `    <${tag}extensionElements><foreign:task isForCompensation="1" name=" true "/><bpmn:task xmlns:bpmn="urn:foreign" isSequential="1">isSequential="1"</bpmn:task></${tag}extensionElements>`,
          `    <${tag}task id="task" name=" true "><${tag}multiInstanceLoopCharacteristics isSequential='${sequential}'/></${tag}task>`,
          `  </${tag}process>`,
          `  <d:BPMNDiagram><d:BPMNPlane bpmnElement="process"><d:BPMNShape bpmnElement="task" isExpanded="${expanded}" foreign:isExpanded="1"/></d:BPMNPlane></d:BPMNDiagram>`,
          `</${tag}definitions>`,
        ].join(newline);
      const supplied = fixture('0', '&#x9;tr&#117;e&#xA;', ' 1 ');
      assert.equal(xmlForBpmnConsumer(supplied), fixture('false', 'true', 'true'));
      assert.equal(xmlForBpmnConsumer(fixture('false', 'true', 'true')), fixture('false', 'true', 'true'));
    }
  }
});

test('a supplied converging gateway cannot hide its two outgoing Sequence Flows', async (t) => {
  const directory = await workspace(t);
  const input = join(directory, 'gateway.bpmn');
  const xml = purchase.replace('<bpmn:exclusiveGateway ', '<bpmn:exclusiveGateway gatewayDirection="Converging" ');
  await writeFile(input, xml);
  const result = command(['validate', '--input', input], 2);
  assert.equal(result.report.checks.find((check) => check.id === 'xsd').status, 'passed');
  assert.equal(result.report.checks.find((check) => check.id === 'semantics').status, 'failed');
  assert.equal(result.report.export.cleanEligible, false);
  assert.ok(result.report.findings.some((finding) => finding.code === 'GATEWAY_FLOW'));
  assert.equal(await readFile(input, 'utf8'), xml);
});

test('gateway direction uses actual same-document flow endpoints, including legal zero-sided and mixed gateways', async (t) => {
  const directory = await workspace(t);
  const input = join(directory, 'gateway.bpmn');
  // Independent cardinalities from OMG BPMN 2.0.2 §10.6.1, printed p. 289.
  const cases = [
    ['Converging', 2, 0, true],
    ['Converging', 2, 1, true],
    ['Converging', 2, 2, false],
    ['Converging', 1, 2, false],
    ['Diverging', 0, 2, true],
    ['Diverging', 1, 2, true],
    ['Diverging', 2, 2, false],
    ['Diverging', 2, 1, false],
    ['Mixed', 2, 2, true],
    ['Mixed', 2, 1, false],
    ['Mixed', 1, 2, false],
    ['Unspecified', 2, 2, true],
    ['Unspecified', 0, 2, true],
    ['Unspecified', 2, 0, true],
    ['Unspecified', 1, 1, false],
  ];
  for (const [direction, incoming, outgoing, valid] of cases) {
    const nodes =
      '<b:parallelGateway id="gateway" gatewayDirection="' +
      direction +
      '"/>' +
      ['in0', 'in1', 'out0', 'out1'].map((id) => `<b:task id="${id}"/>`).join('');
    // No incoming/outgoing child lists: the original endpoint references are authoritative.
    const flows =
      Array.from(
        { length: incoming },
        (_, i) => `<b:sequenceFlow id="incoming${i}" sourceRef="in${i}" targetRef="gateway"/>`,
      ).join('') +
      Array.from(
        { length: outgoing },
        (_, i) => `<b:sequenceFlow id="outgoing${i}" sourceRef="gateway" targetRef="out${i}"/>`,
      ).join('');
    for (const nested of [false, true]) {
      const content = nested ? `<b:subProcess id="sub">${nodes}${flows}</b:subProcess>` : nodes + flows;
      const xml = `<b:definitions xmlns:b="http://www.omg.org/spec/BPMN/20100524/MODEL" targetNamespace="urn:test"><b:process id="process" isExecutable="false">${content}</b:process></b:definitions>`;
      await writeFile(input, xml);
      const result = command(['validate', '--input', input], 2); // Deliberately no DI in this semantic-only fixture.
      assert.equal(result.report.checks.find((check) => check.id === 'xsd').status, 'passed');
      assert.equal(result.report.checks.find((check) => check.id === 'profile').status, 'passed');
      assert.equal(
        result.report.checks.find((check) => check.id === 'semantics').status,
        valid ? 'passed' : 'failed',
        `${direction} ${incoming}/${outgoing} nested=${nested}`,
      );
      assert.equal(
        result.report.findings.some((finding) => finding.code === 'GATEWAY_FLOW'),
        !valid,
      );
      assert.equal(await readFile(input, 'utf8'), xml);
    }
  }
});

test('boundary interruption uses the standard boolean value, not the consumer lexical default', async (t) => {
  const directory = await workspace(t);
  const input = join(directory, 'boundary.bpmn');
  for (const [value, valid] of [
    ['true', true],
    ['1', true],
    [' true ', true],
    ['&#x31;', true],
    ['false', false],
    ['0', false],
    [' false ', false],
  ]) {
    const xml = taskDocument('').replace(
      '</b:task>',
      '</b:task>' +
        `<b:boundaryEvent id="boundary" attachedToRef="task" cancelActivity="${value}"><b:errorEventDefinition/></b:boundaryEvent><b:task id="recover"/><b:sequenceFlow id="recovery" sourceRef="boundary" targetRef="recover"/>`,
    );
    await writeFile(input, xml);
    const result = command(['validate', '--input', input], 2); // Only the task has DI in this semantic-only fixture.
    assert.equal(result.report.checks.find((check) => check.id === 'xsd').status, 'passed');
    assert.equal(result.report.checks.find((check) => check.id === 'semantics').status, valid ? 'passed' : 'failed');
    assert.equal(
      result.report.findings.some((finding) => finding.code === 'EVENT_INTERRUPTION'),
      !valid,
    );
    assert.equal(await readFile(input, 'utf8'), xml);
  }
});
